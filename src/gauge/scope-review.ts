import type { Bindings } from '../auth.server'
import { operatorAuth } from '../auth.server'
import { sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, type Transaction, actor, all, fence, get } from './store'
import { type Row, type Value, Fault, integer, need, text, uuid } from './model'
import { assertScenarioBasis } from './project-scenarios'
import { command } from './commands'

async function current(env:Bindings,row:Row,tx?:Transaction) {
 need(row.value.changeOrder&&row.value.status==='prepared'&&row.value.reviewStatus==='approved','Choose an internally approved current change request',409)
 const versions=(await all(env,'projectScenarios')).filter(r=>r.value.changeOrder&&r.value.engagementId===row.value.engagementId).sort((x,y)=>x.value.number-y.value.number)
 need(versions.at(-1)?.id===row.id,'A newer change version requires fresh client review',409)
 if(tx){tx.observe('projectScenarios',row);tx.guard("(SELECT COUNT(*) FROM g_projectScenarios WHERE json_extract(data,'$.changeOrder')=1 AND json_extract(data,'$.engagementId')=?)=?",row.value.engagementId,versions.length)}
 await assertScenarioBasis(env,row,tx)
}
/** A direct response records evidence only. Signing and business adoption remain separate obligations. */
export async function changeReviewCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<(Row&{shownOnceToken?:string})|null> {
 if(!['change:release-review','change:revoke-review','change:respond'].includes(action))return null
 const row=await get(env,'projectScenarios',text(input.id,'Change request'))
 need(row.revision===input.revision,'Change request changed; reload',409)
 if(action==='change:respond'){
  need(a.role==='client'&&a.clientChange?.id===row.id,'Use the invited change review door',403)
  await current(env,row,tx)
  need(!row.value.clientDecision,'This exact version already has a client decision',409)
  need(['accepted','rejected'].includes(input.outcome),'Choose acceptance or rejection')
  const clientDecision={outcome:input.outcome,reason:text(input.reason,'Client decision reason'),reviewId:a.clientChange.reviewId,fingerprint:row.value.fingerprint,operatorId:a.session.operator.id,contact:a.session.operator.email,at:Date.now(),notice:'Direct client response only; unsigned and not adopted. No budget, date, forecast or billing authority.'}
  return tx.record('projectScenarios',{...row.value,clientDecision,notice:'Internal review remains separate. Direct client response is unsigned and not adopted; signed evidence pending. No approved budget, date, forecast or billing authority.'},row,undefined,action)
 }
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner releases or revokes client change review',403)
 const reason=text(input.reason,'Review authorization reason')
 if(action==='change:revoke-review'){
  need(row.value.clientReview?.id===input.reviewId,'Choose the current review',409)
  tx.observe('projectScenarios',row)
  tx.sql('DELETE FROM g_change_review_authority WHERE review_id=? AND change_id=?',input.reviewId,row.id)
  tx.audit(action,'projectScenarios',row.id,{reviewId:input.reviewId,reason});return row
 }
 await current(env,row,tx)
 need(!row.value.clientDecision,'A decided change requires a new version',409)
 const contact=text(input.contact,'Confirmed recipient email',254).toLowerCase()
 const recipient=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=? AND status='active' AND role='member'").bind(contact).first<{id:string}>()
 need(recipient,'Invite the recipient and confirm their native email first',409)
 need(!await env.DB.prepare('SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1').bind(recipient.id).first(),'An internal grant cannot receive client review',409)
 tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,contact,recipient.id)
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),id=uuid(),expiresAt=Date.now()+integer(input.days??7,'Review duration',1,30)*86400000
 const clientReview={id,contact,recipientId:recipient.id,ownerId:a.session.operator.id,expiresAt,description:text(input.description,'Client change description'),reason,releasedAt:Date.now()}
 tx.sql('DELETE FROM g_change_review_authority WHERE change_id=?',row.id)
 tx.sql('INSERT INTO g_change_review_authority(review_id,change_id,recipient_id,contact,owner_id,expires_at,token_hash) VALUES(?,?,?,?,?,?,?)',id,row.id,recipient.id,contact,a.session.operator.id,expiresAt,sha256(token))
 const saved=await tx.record('projectScenarios',{...row.value,clientReview},row,undefined,action)
 return {...saved,shownOnceToken:token}
}
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}
export async function changeClientResponse(request:Request,env:Bindings):Promise<Response> {
 let access:{id:string;reviewId:string;actor:string}|undefined,status=200
 try{
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/gauge\/client-changes\/([^/%]+)\/([^/%]+)$/)
  need(match,'Review not found',404);access={id:match[1],reviewId:match[2],actor:'anonymous'}
  need(['GET','POST'].includes(request.method),'Use GET or POST',405)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  const session=await operatorAuth(env).getSession(request);if(session)access.actor=session.operator.id
  need(session&&session.kind==='native','Confirm the invited email through native sign-in',401)
  const a:Actor={...await actor(env,session),role:'client',clientChange:{id:match[1],reviewId:match[2],tokenHash:sha256(request.headers.get('x-gauge-review-token')??'')}}
  await fence(env,a)
  const row=await get(env,'projectScenarios',match[1]);await current(env,row)
  if(request.method==='POST'){
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   need(request.headers.get('content-type')?.includes('application/json'),'Use JSON',415)
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let length=0
   if(reader)for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();need(false,'Response is too large',413)}chunks.push(value)}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
   let input:Value;try{input=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault('Use valid JSON',400)}
   need(input&&typeof input==='object'&&!Array.isArray(input),'Use a response object')
   return Response.json(await command(env,a,'change:respond',{key:input.key,id:row.id,revision:input.revision,outcome:input.outcome,reason:input.reason}),{headers})
  }
  await fence(env,a)
  return Response.json({id:row.id,revision:row.revision,reviewId:row.value.clientReview.id,version:row.value.number,description:row.value.clientReview.description,expiresAt:row.value.clientReview.expiresAt,decision:row.value.clientDecision?{outcome:row.value.clientDecision.outcome,reason:row.value.clientDecision.reason,notice:row.value.clientDecision.notice}:null},{headers})
 }catch(error){status=error instanceof Fault?error.status:409;return Response.json({error:error instanceof Fault?error.message:'Review unavailable'},{status,headers})}
 finally{if(access)await env.DB.prepare("INSERT INTO g_audit(at,actor,action,kind,record_id,data) SELECT ?,?,'change:review-access','projectScenarios',id,? FROM g_projectScenarios WHERE id=?").bind(Date.now(),access.actor,JSON.stringify({reviewId:access.reviewId,method:request.method,status}),access.id).run()}
}
