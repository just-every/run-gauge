import type { Bindings } from '../auth.server'
import { operatorAuth } from '../auth.server'
import { sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, type Transaction, actor, fence, get } from './store'
import { type Value, type Row, need, text, integer, uuid, Fault } from './model'
import { scenarioBasisCurrent } from './project-scenarios'
import { command } from './commands'

export const unsignedChangeNotice='Gauge records an unsigned response. This supplies no signature evidence or budget, staffing, date, forecast, billing or adoption authority.'
export async function currentScopeReview(env:Bindings,a:Actor,tx?:Transaction) {
 const row=await get(env,'projectScenarios',a.clientScope!.id)
 need(await scenarioBasisCurrent(env,row.value.basisDigest,tx),'Change baseline changed; request a new version',409)
 if(tx)tx.observe('projectScenarios',row)
 await fence(env,a)
 return row
}
export async function scopeReviewCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<(Row&{shownOnceToken?:string})|null> {
 if(!['change:release-review','change:revoke-review','change:respond'].includes(action))return null
 if(action==='change:respond') {
  need(a.clientScope,'Use the released recipient review door',403)
  const row=await currentScopeReview(env,a,tx),review=row.value.clientReviews.find((r:Value)=>r.id===a.clientScope!.reviewId)
  need(row.revision===input.revision,'Change revision changed; reload',409)
  need(['accepted','rejected'].includes(input.outcome),'Choose accept or reject')
  need(!(row.value.clientResponses??[]).some((r:Value)=>r.reviewId===review.id),'This release already has a response',409)
  const response={reviewId:review.id,recipientId:a.session.operator.id,contact:review.contact,fingerprint:row.value.fingerprint,outcome:input.outcome,reason:text(input.reason,'Response reason'),key:tx.key,at:Date.now(),notice:unsignedChangeNotice}
  return tx.record('projectScenarios',{...row.value,clientResponses:[...(row.value.clientResponses??[]),response]},row,undefined,action)
 }
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner releases or revokes change review',403)
 const row=await get(env,'projectScenarios',text(input.id,'Change request'))
 need(row.value.changeOrder&&row.revision===input.revision,'Change request changed; reload',409)
 const reason=text(input.reason,'Review authorization reason')
 tx.observe('projectScenarios',row)
 if(action==='change:revoke-review') {
  tx.guard('EXISTS(SELECT 1 FROM g_scope_review_authority WHERE change_id=? AND review_id=?)',row.id,text(input.reviewId,'Review'))
  tx.sql('DELETE FROM g_scope_review_authority WHERE change_id=? AND review_id=?',row.id,input.reviewId)
  tx.audit(action,'projectScenarios',row.id,{reviewId:input.reviewId,reason})
  return row
 }
 need(row.value.status==='prepared'&&row.value.reviewStatus==='approved','Independent internal approval is required',409)
 need(await scenarioBasisCurrent(env,row.value.basisDigest,tx),'Change baseline changed; prepare a new version',409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_projectScenarios WHERE json_extract(data,'$.changeOrder')=1 AND json_extract(data,'$.engagementId')=? AND CAST(json_extract(data,'$.number') AS INTEGER)>?)",row.value.engagementId,row.value.number)
 const contact=text(input.contact,'Confirmed recipient email',254).toLowerCase()
 const recipient=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=? AND status='active' AND role='member'").bind(contact).first<{id:string}>()
 need(recipient,'Invite the recipient and confirm their native email first',409)
 need(!await env.DB.prepare('SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1').bind(recipient.id).first(),'Internal grants cannot receive client change reviews',409)
 tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,contact,recipient.id)
 const id=uuid(),token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),releasedAt=Date.now(),expiresAt=releasedAt+integer(input.days??7,'Review duration',1,30)*86400000
 need((row.value.clientReviews?.length??0)<100,'At most 100 releases per change')
 const review={id,contact,recipientId:recipient.id,ownerId:a.session.operator.id,reason,expiresAt,releasedAt,fingerprint:row.value.fingerprint,description:text(input.description,'Client description'),notice:unsignedChangeNotice}
 tx.sql('DELETE FROM g_scope_review_authority WHERE change_id=?',row.id)
 tx.sql('INSERT INTO g_scope_review_authority(review_id,change_id,recipient_id,contact,owner_id,expires_at,token_hash,fingerprint) VALUES(?,?,?,?,?,?,?,?)',id,row.id,recipient.id,contact,a.session.operator.id,expiresAt,sha256(token),row.value.fingerprint)
 const saved=await tx.record('projectScenarios',{...row.value,clientReviews:[...(row.value.clientReviews??[]),review]},row,undefined,action)
 return {...saved,shownOnceToken:token}
}
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex,nofollow'}
export async function scopeClientResponse(request:Request,env:Bindings):Promise<Response> {
 let access:{id:string;reviewId:string;actor:string}|undefined,status=200
 try {
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/gauge\/client-changes\/([^/%]+)\/([^/%]+)$/)
  need(match,'Client change review not found',404)
  access={id:match[1],reviewId:match[2],actor:'anonymous'}
  need(['GET','POST'].includes(request.method),'Use GET or POST',405)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  const session=await operatorAuth(env).getSession(request)
  if(session)access.actor=session.operator.id
  need(session&&session.kind==='native','Confirm the invited email through native sign-in',401)
  const a:Actor={...await actor(env,session),role:'client',clientScope:{id:match[1],reviewId:match[2],tokenHash:sha256(request.headers.get('x-gauge-review-token')??'')}}
  await fence(env,a)
  const row=await currentScopeReview(env,a),review=row.value.clientReviews.find((r:Value)=>r.id===match[2])
  if(request.method==='POST') {
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   need(request.headers.get('content-type')?.includes('application/json'),'Use a JSON response object',415)
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let length=0
   if(reader)for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();need(false,'Response is too large',413)}chunks.push(value)}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
   let input:Value;try{input=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault('Use valid JSON',400)}
   need(input&&typeof input==='object'&&!Array.isArray(input),'Use a response object')
   const result=await command(env,a,'change:respond',{key:input.key,revision:input.revision,outcome:input.outcome,reason:input.reason})
   return Response.json(result,{headers})
  }
  const response=(row.value.clientResponses??[]).find((r:Value)=>r.reviewId===review.id&&r.recipientId===session.operator.id)
  await fence(env,a)
  return Response.json({id:row.id,revision:row.revision,name:row.value.name,fingerprint:review.fingerprint,description:review.description,expiresAt:review.expiresAt,notice:unsignedChangeNotice,response:response?{outcome:response.outcome,reason:response.reason,notice:response.notice}:null},{headers})
 }catch(error){status=error instanceof Fault?error.status:409;return Response.json({error:error instanceof Fault?error.message:'Client change review unavailable; ask the owner'},{status,headers})}
 finally {
  if(access)await env.DB.prepare("INSERT INTO g_audit(at,actor,action,kind,record_id,data) SELECT ?,?,'change:review-access','projectScenarios',p.id,? FROM g_projectScenarios p WHERE p.id=? AND EXISTS(SELECT 1 FROM json_each(json_extract(p.data,'$.clientReviews')) r WHERE json_extract(r.value,'$.id')=?)").bind(Date.now(),access.actor,JSON.stringify({reviewId:access.reviewId,method:request.method,status,notice:'Recipient change review access'}),access.id,access.reviewId).run()
 }
}
