import type { Bindings } from '../auth.server'
import { operatorAuth } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, type Transaction, actor, all, fence, get } from './store'
import { type Row, type Value, Fault, integer, need, text, uuid } from './model'
import { adoptAcceptedChange, assertScenarioBasis } from './project-scenarios'
import { command } from './commands'

async function current(env:Bindings,row:Row,tx?:Transaction,inspect=false) {
 if(inspect&&row.value.changeOrder&&row.value.status==='adopted')return
 need(row.value.changeOrder&&row.value.status==='prepared'&&row.value.reviewStatus==='approved','Choose an internally approved current change request',409)
 const versions=(await all(env,'projectScenarios')).filter(r=>r.value.changeOrder&&r.value.engagementId===row.value.engagementId).sort((x,y)=>x.value.number-y.value.number)
 need(versions.at(-1)?.id===row.id,'A newer change version requires fresh client review',409)
 if(tx){tx.observe('projectScenarios',row);tx.guard("(SELECT COUNT(*) FROM g_projectScenarios WHERE json_extract(data,'$.changeOrder')=1 AND json_extract(data,'$.engagementId')=?)=?",row.value.engagementId,versions.length)}
 await assertScenarioBasis(env,row,tx)
}
/** Navigation uses the same live authority and current-basis checks as review reads. */
export async function canReadClientChange(env:Bindings,a:Actor,row:Row):Promise<boolean> {
 try {
  await fence(env,{...a,clientChange:{id:row.id,reviewId:row.value.clientReview.id,tokenHash:''}})
  await current(env,row,undefined,true)
  await fence(env,{...a,clientChange:{id:row.id,reviewId:row.value.clientReview.id,tokenHash:''}})
  return true
 } catch(error) {
  if(error instanceof Fault&&[403,404,409].includes(error.status))return false
  throw error
 }
}
const pick=(v:Value,keys:string[])=>Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]))
/** The agency releases a closed customer projection, never its private financial comparison. */
export function changeDocument(row:Row):Value {
 const v=row.value,terms=(t:Value|null)=>t?{currency:v.baseline.projects.find((p:Value)=>p.engagementId===v.engagementId)?.currency,...pick(t.value??t,['currency','mode','amountMinor','effortSeconds','roundingSeconds','expenseBudgetMinor','expenseDate','notToExceed']),phases:(t.value??t).phases?.map((p:Value)=>pick(p,['key','name','service','mode','hourBudgetSeconds','feeBudgetMinor','expenseBudgetMinor']))??[]}:null
 const dates=(set:Value)=>set.dates.filter((p:Value)=>p.engagementId===v.engagementId).map((p:Value)=>({finish:p.finish,tasks:p.tasks.map((t:Value)=>({...t,name:v.customerNames?.tasks[t.id]??'Deliverable'})),milestones:p.milestones.map((m:Value)=>({...m,name:v.customerNames?.milestones[m.id]??'Milestone'}))}))
 return {engagementId:v.engagementId,changeId:row.id,version:v.number,fingerprint:v.fingerprint,scope:v.scopeDifference,terms:{before:terms(v.termsDifference.before),after:terms(v.termsDifference.after)},dates:{before:dates(v.baseline),after:dates(v.scenario)}}
}
/** Client consent and native-owner adoption are separate explicit decisions. */
export async function changeReviewCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<(Row&{shownOnceToken?:string})|null> {
 if(!['change:release-review','change:revoke-review','change:respond','change:adopt'].includes(action))return null
 const row=await get(env,'projectScenarios',text(input.id,'Change request'))
 need(row.revision===input.revision,'Change request changed; reload',409)
 if(action==='change:respond'){
  need(a.role==='client'&&a.clientChange?.id===row.id,'Use the invited change review door',403)
  await current(env,row,tx)
  need(!row.value.clientDecision,'This exact version already has a client decision',409)
  need(['accepted','rejected'].includes(input.outcome),'Choose acceptance or rejection')
  const documentDigest=row.value.clientReview.documentDigest
  need(documentDigest===sha256(canonicalJson(changeDocument(row))),'Released terms changed; request fresh review',409)
  let signature:Value|null=null
  if(input.outcome==='accepted'){
   need(input.consent===true,'Explicitly consent to the exact change terms')
   signature={name:text(input.signatureName,'Your full name',200),operatorId:a.session.operator.id,contact:a.session.operator.email,documentDigest,at:Date.now(),method:'native-email-confirmed',consent:true}
  }
  const clientDecision={signature,documentDigest,changeRevision:row.revision,outcome:input.outcome,reason:text(input.reason,'Client decision reason'),reviewId:a.clientChange.reviewId,fingerprint:row.value.fingerprint,operatorId:a.session.operator.id,contact:a.session.operator.email,at:Date.now(),notice:signature?'Identity-bound client acceptance of the exact terms; not adopted. No invoice is authorized.':'Client rejection of the exact terms; not adopted.'}
  return tx.record('projectScenarios',{...row.value,clientDecision,notice:'Internal review remains separate. Client evidence is retained; native-owner adoption is required before the forecast changes. Billing remains separate.'},row,undefined,action)
 }
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner releases review, revokes it or adopts an accepted change',403)
 const reason=text(input.reason,'Review authorization reason')
 if(action==='change:adopt'){
  await current(env,row,tx)
  const decision=row.value.clientDecision,review=row.value.clientReview
  need(decision?.outcome==='accepted'&&decision.signature?.consent===true&&decision.signature?.method==='native-email-confirmed','Exact signed client acceptance is required',409)
  need(decision.signature.documentDigest===decision.documentDigest&&decision.signature.operatorId===decision.operatorId&&decision.reviewId===review?.id&&decision.documentDigest===review?.documentDigest&&review.documentDigest===sha256(canonicalJson(changeDocument(row)))&&decision.fingerprint===row.value.fingerprint,'Client acceptance does not bind these exact terms',409)
  const live="EXISTS(SELECT 1 FROM g_change_review_authority c JOIN oa_operators recipient ON recipient.id=c.recipient_id JOIN oa_operators owner ON owner.id=c.owner_id WHERE c.change_id=? AND c.review_id=? AND c.recipient_id=? AND lower(recipient.email)=c.contact AND recipient.status='active' AND recipient.role='member' AND owner.status='active' AND owner.role='owner' AND owner.version=c.owner_version AND recipient.version=c.recipient_version AND c.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER) AND NOT EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=recipient.id AND g.enabled=1))"
  const params=[row.id,review.id,decision.operatorId]
  need((await env.DB.prepare(`SELECT (${live}) AS ok`).bind(...params).first<{ok:number}>())?.ok===1,'Client acceptance authority stopped; obtain fresh acceptance',403)
  tx.guard(live,...params)
  const effects=await adoptAcceptedChange(env,a,tx,row,reason)
  return tx.record('projectScenarios',{...row.value,status:'adopted',adoptedBy:a.session.operator.id,adoptedAt:Date.now(),adoptionReason:reason,effects,notice:'Exact client-accepted change adopted once. Internal review is not client acceptance. Billing remains separate.'},row,undefined,action)
 }
 if(action==='change:revoke-review'){
  need(row.value.clientReview?.id===input.reviewId,'Choose the current review',409)
  tx.observe('projectScenarios',row)
  tx.sql('DELETE FROM g_change_review_authority WHERE review_id=? AND change_id=?',input.reviewId,row.id)
  tx.audit(action,'projectScenarios',row.id,{reviewId:input.reviewId,reason});return row
 }
 await current(env,row,tx)
 need(!row.value.clientDecision,'A decided change requires a new version',409)
 const contact=text(input.contact,'Confirmed recipient email',254).toLowerCase()
 const recipient=await env.DB.prepare("SELECT id,version FROM oa_operators WHERE lower(email)=? AND status='active' AND role='member'").bind(contact).first<{id:string;version:number}>()
 need(recipient,'Invite the recipient and confirm their native email first',409)
 need(!await env.DB.prepare('SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1').bind(recipient.id).first(),'An internal grant cannot receive client review',409)
 tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND version=? AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,contact,recipient.version,recipient.id)
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),id=uuid(),expiresAt=Date.now()+integer(input.days??7,'Review duration',1,30)*86400000
 const document=changeDocument(row),documentDigest=sha256(canonicalJson(document))
 const clientReview={document,documentDigest,id,contact,recipientId:recipient.id,ownerId:a.session.operator.id,expiresAt,description:text(input.description,'Client change description'),reason,releasedAt:Date.now()}
 tx.sql('DELETE FROM g_change_review_authority WHERE change_id=?',row.id)
 tx.sql('INSERT INTO g_change_review_authority(review_id,change_id,recipient_id,contact,owner_id,expires_at,token_hash,owner_version,recipient_version) VALUES(?,?,?,?,?,?,?,?,?)',id,row.id,recipient.id,contact,a.session.operator.id,expiresAt,sha256(token),a.session.operator.version,recipient.version)
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
  const source=await get(env,'projectScenarios',match[1])
  const portal=!request.headers.has('x-gauge-review-token')?await env.DB.prepare('SELECT id,revision FROM g_client_portal_authority WHERE engagement_id=? AND recipient_id=?').bind(source.value.engagementId,session.operator.id).first<{id:string;revision:string}>():null
  const a:Actor={...await actor(env,session),...(portal?{clientPortal:portal}:{}),role:'client',clientChange:{id:match[1],reviewId:match[2],tokenHash:sha256(request.headers.get('x-gauge-review-token')??'')}}
  await fence(env,a)
  const row=await get(env,'projectScenarios',match[1]);await current(env,row,undefined,request.method==='GET')
  if(request.method==='POST'){
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   need(request.headers.get('content-type')?.includes('application/json'),'Use JSON',415)
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let length=0
   if(reader)for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();need(false,'Response is too large',413)}chunks.push(value)}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
   let input:Value;try{input=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault('Use valid JSON',400)}
   need(input&&typeof input==='object'&&!Array.isArray(input),'Use a response object')
   return Response.json(await command(env,a,'change:respond',{key:input.key,id:row.id,revision:input.revision,outcome:input.outcome,reason:input.reason,signatureName:input.signatureName,consent:input.consent}),{headers})
  }
  await fence(env,a)
  return Response.json({id:row.id,revision:row.revision,reviewId:row.value.clientReview.id,version:row.value.number,description:row.value.clientReview.description,document:row.value.clientReview.document,documentDigest:row.value.clientReview.documentDigest,expiresAt:row.value.clientReview.expiresAt,decision:row.value.clientDecision?{outcome:row.value.clientDecision.outcome,reason:row.value.clientDecision.reason,notice:row.value.clientDecision.notice,signature:row.value.clientDecision.signature}:null},{headers})
 }catch(error){status=error instanceof Fault?error.status:409;return Response.json({error:error instanceof Fault?error.message:'Review unavailable'},{status,headers})}
 finally{if(access)await env.DB.prepare("INSERT INTO g_audit(at,actor,action,kind,record_id,data) SELECT ?,?,'change:review-access','projectScenarios',id,? FROM g_projectScenarios WHERE id=?").bind(Date.now(),access.actor,JSON.stringify({reviewId:access.reviewId,method:request.method,status}),access.id).run()}
}
