import { sha256 } from '../modules/import-kit/src/d1/index'
import { operatorAuth, type Bindings } from '../auth.server'
import { type Actor, type Transaction, actor, fence, get } from './store'
import { type Value, type Row, need, text, integer, uuid, Fault } from './model'
import { command } from './commands'

/** The owner releases only the client description of one exact delivery. */
export async function milestoneReviewCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<(Row&{shownOnceToken?:string})|null> {
 if(!['milestone:release-review','milestone:revoke-review'].includes(action))return null
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner releases or revokes client delivery review',403)
 const row=await get(env,'milestones',text(input.id,'Milestone'))
 need(row.revision===input.revision,'Milestone changed; reload',409)
 let token:string|undefined
 const reason=text(input.reason,'Client review authorization reason'),d:Value=structuredClone(row.value.delivery??{})
 if(action==='milestone:revoke-review') {
  const review=d.clientReviews?.find((r:Value)=>r.id===input.reviewId)
  need(review&&await env.DB.prepare('SELECT 1 FROM g_milestone_review_authority WHERE review_id=? AND milestone_id=?').bind(review.id,row.id).first(),'Choose an active client review',409)
  tx.observe('milestones',row)
  tx.guard('EXISTS(SELECT 1 FROM g_milestone_review_authority WHERE review_id=? AND milestone_id=?)',review.id,row.id)
  tx.sql('DELETE FROM g_milestone_review_authority WHERE review_id=?',review.id)
  // Access revocation must not rewrite a source already reserved by finance.
  tx.audit(action,'milestones',row.id,{reviewId:review.id,deliveryId:review.deliveryId,reason})
  return row
 } else {
  const delivery=d.deliveries?.at(-1)
  need(delivery&&d.currentDeliveryId===delivery.id,'Deliver the current work before inviting client review',409)
  need(!d.decisions.some((r:Value)=>r.deliveryId===delivery.id),'A decided delivery needs a new delivered snapshot, never relabel its decision',409)
  need((d.clientReviews?.length??0)<100,'At most 100 client reviews per milestone')
  const contact=text(input.contact,'Confirmed recipient email',254).toLowerCase()
  const recipient=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=? AND status='active' AND role='member'").bind(contact).first<{id:string}>()
  need(recipient,'Invite the recipient and have them confirm their native email first',409)
  need(!await env.DB.prepare('SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1').bind(recipient.id).first(),'An internal grant cannot receive client review authority',409)
  tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,contact,recipient.id)
  token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
  const id=uuid(),expiresAt=Date.now()+integer(input.days??7,'Review duration',1,30)*86400000
  const review={id,deliveryId:delivery.id,contact,recipientId:recipient.id,ownerId:a.session.operator.id,releasedAt:Date.now(),expiresAt,reason,description:text(input.description,'Client delivery description'),name:delivery.snapshot.name,date:delivery.date}
  d.clientReviews=[...(d.clientReviews??[]),review]
  tx.sql('INSERT INTO g_milestone_review_authority(review_id,milestone_id,delivery_id,recipient_id,contact,owner_id,expires_at,token_hash) VALUES(?,?,?,?,?,?,?,?)',id,row.id,delivery.id,recipient.id,contact,a.session.operator.id,expiresAt,sha256(token))
 }
 const saved=await tx.record('milestones',{...row.value,delivery:d},row,undefined,action)
 return {...saved,...(token?{shownOnceToken:token}:{})}
}
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex,nofollow'}
export async function milestoneClientResponse(request:Request,env:Bindings):Promise<Response> {
 let access:{id:string;reviewId:string;actor:string}|undefined,status=200
 try {
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/gauge\/client-milestones\/([^/%]+)\/([^/%]+)$/)
  need(match,'Client delivery review not found',404)
  access={id:match[1],reviewId:match[2],actor:'anonymous'}
  need(['GET','POST'].includes(request.method),'Use GET or POST',405)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  const session=await operatorAuth(env).getSession(request)
  if(session)access.actor=session.operator.id
  need(session&&session.kind==='native','Confirm the invited email through native sign-in',401)
  const a:Actor={...await actor(env,session),role:'client',clientMilestone:{id:match[1],reviewId:match[2],tokenHash:sha256(request.headers.get('x-gauge-review-token')??'')}}
  await fence(env,a)
  const row=await get(env,'milestones',match[1]),review=row.value.delivery.clientReviews.find((r:Value)=>r.id===match[2])
  need(review,'Review unavailable',404)
  if(request.method==='POST') {
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   need(request.headers.get('content-type')?.includes('application/json'),'Use a JSON response object',415)
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let length=0
   if(reader)for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();need(false,'Response is too large',413)}chunks.push(value)}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
   let input:Value;try{input=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault('Use valid JSON',400)}
   need(input&&typeof input==='object'&&!Array.isArray(input),'Use a response object')
   return Response.json(await command(env,a,'milestone:respond',{key:input.key,id:row.id,revision:input.revision,deliveryId:review.deliveryId,outcome:input.outcome,reason:input.reason}),{headers})
  }
  const decision=row.value.delivery.decisions.find((r:Value)=>r.deliveryId===review.deliveryId&&r.confirmedByClient&&r.reviewId===review.id&&r.recordedBy===a.session.operator.id)
  await fence(env,a)
  return Response.json({id:row.id,revision:row.revision,deliveryId:review.deliveryId,name:review.name,date:review.date,description:review.description,expiresAt:review.expiresAt,decision:decision?{outcome:decision.outcome,reason:decision.reason,notice:decision.notice}:null},{headers})
 } catch(error) {status=error instanceof Fault?error.status:409;return Response.json({error:error instanceof Fault?error.message:'Client review unavailable; ask the agency owner'},{status,headers})}
 finally {
  // Attempts, including refused access, are history only and confer no recipient authority.
  if(access)await env.DB.prepare("INSERT INTO g_audit(at,actor,action,kind,record_id,data) SELECT ?,?,'milestone:review-access','milestones',m.id,? FROM g_milestones m WHERE m.id=? AND EXISTS(SELECT 1 FROM json_each(json_extract(m.data,'$.delivery.clientReviews')) r WHERE json_extract(r.value,'$.id')=?)").bind(Date.now(),access.actor,JSON.stringify({reviewId:access.reviewId,method:request.method,status,notice:'Recipient delivery review access'}),access.id,access.reviewId).run()
 }
}
