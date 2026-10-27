import type { Bindings } from '../auth.server'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Kind, type Value, type Row, need, text, instant, workDate } from './model'
import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { reports } from './reports'
import { latestCommercial } from './commercial-proposals'
const owner=(a:Actor)=>need(a.role==='owner'&&a.session.kind==='native'&&!a.scheduled&&!a.clientProposal,'Only the native owner manages operational cases under the current policy',403)
const sourceKinds:Kind[]=['opportunities','engagements','milestones','resourceRequests','budgetAlerts','packets']
async function source(env:Bindings,ref:unknown,tx?:Transaction){
 const m=text(ref,'Exact source reference',300).match(/^([a-zA-Z]+):([^:@]+)@([^@]+)$/)
 need(m&&sourceKinds.includes(m[1] as Kind),'Choose an exact current risk, input, staffing or billing source')
 const kind=m[1] as Kind,row=await get(env,kind,m[2]);need(row.revision===m[3],'Case source changed; review it again',409);tx?.observe(kind,row)
 return {kind,row}
}
// The native owner is the default responsible person (null). Reassignment names an
// existing active member and grants that person no case access (ct, 22 Oct).
async function responsible(env:Bindings,tx:Transaction,id:unknown){
 if(id===undefined||id===null||id==='')return null
 const row=await get(env,'people',text(id,'Responsible person'));need(!(await all(env,'privacyExits')).some(r=>r.value.personId===row.id),'An exited worker cannot own a case',409);tx.observe('people',row);tx.guard("NOT EXISTS(SELECT 1 FROM g_privacyExits WHERE json_extract(data,'$.personId')=?)",row.id);return row.id
}
async function context(env:Bindings,row:Value){
 const current=await get(env,row.source.kind,row.source.id)
 const engagementId=row.source.kind==='engagements'?current.id:current.value.engagementId??null
 const engagement=engagementId?await get(env,'engagements',engagementId):null
 const opportunityId=row.source.kind==='opportunities'?current.id:engagement?.value.opportunityId??null
 const opportunity=opportunityId?await get(env,'opportunities',opportunityId):null
 return {current,engagement,opportunity,engagementId:engagementId??opportunity?.value.engagementId??null,opportunityId}
}
// One agency-date baseline and candidate projection; case text and history never
// enter the economic hash, so an attempt or rewording cannot manufacture recovery.
export async function caseForecast(env:Bindings,a:Actor,value:Value,tx?:Transaction){
 owner(a);await fence(env,a)
 const ctx=await context(env,value),day=value.asOf??workDate(Date.now(),a.timezone),r=await reports(env,a,day,day,undefined,day)
 const projection={asOf:day,forecast:r.forecast?.engagements.find(e=>e.engagementId===ctx.engagementId)??null,cash:r.cash?.engagements.find(e=>e.engagementId===ctx.engagementId)??null,pipeline:r.pipeline.flatMap(p=>[...p.weighted,...p.booked].filter((x:any)=>x.id===ctx.opportunityId||x.source===`opportunities:${ctx.opportunityId}`||x.engagementId===ctx.engagementId))}
 const inputs:Value[]=[]
 for(const k of ['engagements','opportunities','budgets','milestones','time','expenses','staffing','rates','rateWithdrawals','people','calendars','leave','retainers','retainerPeriods','retainerCloses','retainerAdjustments','invoices','invoiceCorrections','payments','paymentPromises','clients','agencyCalendars','retainerSchedules','retainerCharges','retainerRuns','fixedCharges','timeSlices','capWriteDowns'] as Kind[]){
  // Every actual input is fenced, including rate/calendar additions. Use the
  // ordinary report's permitted full input set, never a caller's forecast value.
  // Transaction guards bind stored rows, including private fields hidden by the report.
  const rows=await all(env,k);inputs.push({kind:k,rows:rows.map(x=>({id:x.id,revision:x.revision}))})
  if(tx){for(const row of rows)tx.observe(k,row);tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,rows.length)}
 }
 const economicHash=sha256(canonicalJson(projection)),fingerprint=sha256(canonicalJson({projection,inputs}))
 return {projection,economicHash,fingerprint,engagementId:ctx.engagementId,opportunityId:ctx.opportunityId,changed:economicHash!==value.baseline?.economicHash}
}
async function event(tx:Transaction,row:Row,type:string,reason:string,details:Value={}){return tx.record('caseEvents',{caseId:row.id,type,reason,...details,by:tx.actor.session.operator.id,at:Date.now()},undefined,undefined,'case:'+type)}
export async function caseClosePreview(env:Bindings,a:Actor,input:Value){owner(a);const row=await get(env,'operationalCases',text(input.id,'Case'));need(row.revision===input.revision&&row.value.status!=='closed','Case changed or closed',409);return {id:row.id,revision:row.revision,...await caseForecast(env,a,row.value)}}
export async function caseCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value){
 if(!action.startsWith('case:'))return null
 owner(a);const reason=text(input.reason,'Case decision reason')
 if(action==='case:open'){
  need(['scope-risk','blocked-input','staffing-gap','billing-exception','client-decision'].includes(input.type),'Choose an operational case type')
  const src=await source(env,input.sourceRef,tx),v:Value={type:input.type,title:text(input.title,'Case title',200),source:{kind:src.kind,id:src.row.id,revision:src.row.revision},ownerId:await responsible(env,tx,input.ownerId),nextAction:text(input.nextAction,'Next action'),dueAt:instant(input.dueAt),asOf:workDate(Date.now(),a.timezone),status:'open',replyState:'awaiting',openedAt:Date.now(),openedBy:a.session.operator.id}
  const baseline=await caseForecast(env,a,v,tx);v.baseline={economicHash:baseline.economicHash,projection:baseline.projection,fingerprint:baseline.fingerprint}
  const row=await tx.record('operationalCases',v,undefined,undefined,action);await event(tx,row,'opened',reason);return row
 }
 const row=await get(env,'operationalCases',text(input.id,'Case'));need(row.revision===input.revision,'Case changed; reload',409);need(row.value.status!=='closed','A verified closed case is immutable; open a new case',409);tx.observe('operationalCases',row)
 const v={...row.value}
 if(!['case:reassign','case:escalate'].includes(action))await responsible(env,tx,v.ownerId)
 if(action==='case:edit'){v.nextAction=text(input.nextAction,'Next action');v.dueAt=instant(input.dueAt);await event(tx,row,'edited',reason)}
 else if(action==='case:snooze'){v.snoozeUntil=instant(input.until);need(v.snoozeUntil>Date.now(),'Snooze must end in the future');v.status='snoozed';await event(tx,row,'snoozed',reason,{until:v.snoozeUntil})}
 else if(action==='case:reassign'||action==='case:escalate'){
  const previousOwnerId=v.ownerId;v.ownerId=await responsible(env,tx,input.ownerId);v.nextAction=text(input.nextAction,'Next action');v.dueAt=instant(input.dueAt);v.snoozeUntil=null;v.status=action==='case:escalate'?'escalated':'open';await event(tx,row,action.slice(5),reason,{previousOwnerId,ownerId:v.ownerId,nextAction:v.nextAction,dueAt:v.dueAt})
 }
 else if(action==='case:reply'){
  need(['ambiguous','answered','unverified'].includes(input.replyState),'Choose ambiguous, answered or unverified; a recorded reply is not verified acceptance')
  v.replyState=input.replyState;v.snoozeUntil=null;v.status='open'
  await event(tx,row,'reply',reason,{replyState:v.replyState,externalReference:text(input.externalReference,'External reply reference',500),quotedReply:text(input.quotedReply,'Quoted reply',4000),meaning:'Owner-recorded reply, client identity unverified; quoted text is inert and never completes the case.'})
 }
 else if(action==='case:attempt'){
  const job=await get(env,'providerJobs',text(input.jobId,'Approved request job'));tx.observe('providerJobs',job)
  need(job.value.operation==='email:send'&&job.value.source.kind==='commercialProposals'&&job.value.ownerId===a.session.operator.id&&job.value.attempts>0,'Link an actually attempted owner-approved customer proposal request',409)
  const proposal=await get(env,'commercialProposals',job.value.source.id);tx.observe('commercialProposals',proposal)
  const ctx=await context(env,v);need(ctx.opportunityId&&proposal.value.opportunityId===ctx.opportunityId,'Request belongs to another case source',409)
  const events=(await all(env,'caseEvents')).filter(e=>e.value.caseId===row.id)
  need(!events.some(e=>e.value.jobId===job.id),'This request attempt is already recorded',409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_caseEvents WHERE json_extract(data,'$.caseId')=? AND json_extract(data,'$.jobId')=?)",row.id,job.id)
  await event(tx,row,'attempt',reason,{jobId:job.id,jobRevision:job.revision,source:job.value.source,status:job.value.status,externalReference:job.value.providerMessageId??null,meaning:'Provider invocation/submission only; delivery, reply and completion remain independent.'})
  v.replyState='awaiting';v.status='open';v.snoozeUntil=null
 }
 else if(action==='case:close'){
  need(input.confirm==='close-verified-case','Confirm verified closure')
  const accepted=await get(env,'commercialEvents',text(input.acceptanceId,'Verified client acceptance'));tx.observe('commercialEvents',accepted)
  need(accepted.value.type==='accepted'&&accepted.value.at>=v.openedAt,'A current client acceptance after case opening is required',409)
  const proposal=await get(env,'commercialProposals',accepted.value.proposalId);await latestCommercial(env,tx,proposal)
  const ctx=await context(env,v);need(ctx.opportunityId&&proposal.value.opportunityId===ctx.opportunityId&&ctx.engagementId,'Client acceptance must be reflected in this case source and its converted engagement',409)
  need(accepted.value.fingerprint===proposal.value.fingerprint&&accepted.value.proposalRevision===proposal.revision&&proposal.value.status==='released','Acceptance belongs to stale or revoked commercial terms',409)
  const authority="EXISTS(SELECT 1 FROM g_commercial_proposal_authority c JOIN oa_operators recipient ON recipient.id=c.recipient_id JOIN oa_operators owner ON owner.id=c.owner_id WHERE c.proposal_id=? AND c.revision=? AND recipient.id=? AND recipient.status='active' AND recipient.role='member' AND lower(recipient.email)=lower(?) AND owner.status='active' AND owner.role='owner' AND NOT EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=recipient.id AND g.enabled=1))"
  const params=[proposal.id,proposal.revision,accepted.value.operatorId,proposal.value.document.recipient.contact]
  need((await env.DB.prepare(`SELECT (${authority}) ok`).bind(...params).first<any>())?.ok===1,'Client acceptance authority is disconnected or revoked; reconnect and review',409);tx.guard(authority,...params)
  const attempts=(await all(env,'caseEvents')).filter(e=>e.value.caseId===row.id&&e.value.type==='attempt'&&e.value.source.id===proposal.id)
  need(attempts.length,'Record the approved request attempt for this exact accepted proposal',409);for(const e of attempts)tx.observe('caseEvents',e)
  const proof=await caseForecast(env,a,v,tx);need(proof.changed,'The native forecast has not changed from the opening baseline',409);need(input.fingerprint===proof.fingerprint,'Forecast changed; review closure again',409)
  v.status='closed';v.replyState='verified-acceptance';v.closedBy=a.session.operator.id;v.closedAt=Date.now();v.snoozeUntil=null;v.completion={acceptanceId:accepted.id,proposalId:proposal.id,fingerprint:proof.fingerprint,economicHash:proof.economicHash,projection:proof.projection,engagementId:proof.engagementId,reason}
  await event(tx,row,'closed',reason,{completion:v.completion})
 }
 else return null
 return tx.record('operationalCases',v,row,undefined,action)
}
