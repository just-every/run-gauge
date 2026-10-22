import type { Bindings } from '../auth.server'
import { type Actor, Transaction, all, get, finance, fence } from './store'
import { type Value, type Row, type Kind, need, text, date, flag, workDate, sum, Fault } from './model'
import { retainerPeriods } from './retainer-periods'
import { retainerFees } from './retainer-fees'
import { retainerOverage } from './retainer-overages'
import { retainerConsumption } from './retainer-consumption'
import { agency } from './agency'
import { packetArtifact } from './billing-artifact'
import { scheduledCreditConsent, scheduledCreditLines } from './retainer-schedule-credits'
import { autoIssueConsent, autoIssueCheck, scheduleAuthority, scheduleLocks, issueScheduledInvoice } from './retainer-auto-issue'

const next=(day:string)=>new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10)
export function retainerIssueDate(period:Row,basis:string){return basis==='arrears'?next(period.value.activeEnd):period.value.activeStart}
export async function scheduleCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(!['retainer:schedule','retainer:run'].includes(action))return null
 need(finance(a),'Finance access required',403)
 if(action==='retainer:run'){
  const schedule=await get(env,'retainerSchedules',text(input.id,'Schedule'))
  need(schedule.revision===input.revision,'Schedule changed; reload',409)
  // The public clock selects due work; it never changes the agency clock or earned history.
  return runPeriod(env,a,tx,schedule,date(input.asOf))
 }
 const term=await get(env,'retainers',text(input.retainerId,'Retainer version'))
 tx.observe('retainers',term)
 const schedules=await all(env,'retainerSchedules'),old=schedules.find(s=>s.value.rootId===term.value.rootId)
 need(!old||(old.id===input.id&&old.revision===input.revision),'Schedule changed; reload',409)
 const basis=text(input.basis,'Billing basis');need(['advance','arrears'].includes(basis),'Choose advance or arrears')
 const autoIssue=flag(input.autoIssue)&&flag(input.enabled),consent=autoIssue?await autoIssueConsent(env,tx,input,term.value.terms.currency):{}
 const billTo=String(input.billTo??'').trim(),remitTo=String(input.remitTo??'').trim(),reference=String(input.reference??'').trim()
 const creditAdjustments=flag(input.enabled)?await scheduledCreditConsent(env,tx,input,term):[]
 const from=date(input.from),reason=text(input.reason,'Scheduling consent or change reason')
 const runs=await all(env,'retainerRuns')
 need(!old||(!runs.some(r=>r.value.rootId===term.value.rootId)||from===old.value.from),'The first scheduled period cannot move after a run; preserve its history',409)
 const holds=Array.isArray(input.heldPeriodIds)?input.heldPeriodIds.map(id=>text(id,'Disputed period')):String(input.heldPeriodIds??'').split(',').map(s=>s.trim()).filter(Boolean)
 const periods=await all(env,'retainerPeriods')
 for(const id of holds){const period=periods.find(p=>p.id===id&&p.value.rootId===term.value.rootId);need(period,'Choose a period in this retainer family');tx.observe('retainerPeriods',period)}
 tx.guard('(SELECT COUNT(*) FROM g_retainerSchedules)=?',schedules.length)
 const schedule=await tx.record('retainerSchedules',{rootId:term.value.rootId,engagementId:term.value.engagementId,basis,from,enabled:flag(input.enabled),autoIssue,...consent,billTo,remitTo,reference,creditAdjustments,number:(old?.value.number??0)+1,consentTermsNumber:term.value.number,consentTermsRevision:term.revision,heldPeriodIds:[...new Set(holds)],reason,configuredBy:a.session.operator.id,configuredByName:a.session.operator.displayName,grantVersion:a.grantVersion,configuredAt:Date.now()},old)
 tx.sql('DELETE FROM g_retainer_schedule_authority WHERE schedule_id=?',schedule.id)
 if(!schedule.value.enabled){const monitor=(await all(env,'retainerJobs')).find(r=>r.id==='job-'+schedule.id);if(monitor)await tx.record('retainerJobs',{...monitor.value,status:'cancelled',leaseUntil:null,nextAttemptAt:null,completedAt:Date.now()},monitor,undefined,'retainer:job-cancel')}
 if(schedule.value.enabled)tx.sql('INSERT INTO g_retainer_schedule_authority(schedule_id,revision,operator_id) VALUES(?,?,?)',schedule.id,schedule.revision,a.session.operator.id)
 return schedule
}

/** One bounded atomic job. The unique period receipt and source reservation make retries safe. */
async function runPeriod(env:Bindings,a:Actor,tx:Transaction,schedule:Row,asOf:string):Promise<Row>{
 need(schedule.value.enabled,'This schedule is disabled',409);tx.observe('retainerSchedules',schedule)
 await scheduleAuthority(env,tx,schedule)
 const kinds:Kind[]=['retainers','retainerPeriods','retainerRuns','retainerAdjustments','retainerCloses','invoices','invoiceDisputes']
 const data=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<Kind,Row[]>
 for(const k of kinds){for(const row of data[k])tx.observe(k,row);tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,data[k].length)}
 const versions=data.retainers.filter(t=>t.value.rootId===schedule.value.rootId).sort((a,b)=>a.value.terms.start.localeCompare(b.value.terms.start))
 const latestLifecycle=data.retainerAdjustments.filter(r=>r.value.rootId===schedule.value.rootId&&r.value.status==='approved'&&['cancellation','renewal','pause'].includes(r.value.kind)).sort((a,b)=>a.value.approvedAt-b.value.approvedAt).at(-1)

 let selected:{period:Row;term:Row}|undefined
 for(const term of versions){
  let cursor=term.value.terms.start<schedule.value.from?schedule.value.from:term.value.terms.start
  const successor=versions.find(t=>t.value.number===term.value.number+1)
  // Work in one-day windows so even an old schedule remains bounded and can resume.
  for(let count=0;cursor<=asOf&&count<120;count++){
   const calculated=retainerPeriods(term.value.terms,cursor,cursor,term.value.calendar)[0]
   if(!calculated||successor&&calculated.activeEnd>=successor.value.terms.start)break
   const existing=data.retainerPeriods.find(p=>p.value.rootId===schedule.value.rootId&&p.value.periodStart===calculated.periodStart)
   const period=existing??{id:crypto.randomUUID(),revision:crypto.randomUUID(),value:{...calculated,engagementId:schedule.value.engagementId,rootId:schedule.value.rootId,retainerId:term.id,unit:term.value.terms.unit,currency:term.value.terms.currency,reason:schedule.value.reason,openedBy:a.session.operator.id,openedAt:Date.now()}}
   if(!data.retainerRuns.some(r=>r.value.periodId===period.id)&&retainerIssueDate(period,schedule.value.basis)<=asOf){selected={period,term};break}
   cursor=next(calculated.periodEnd)
  }
  if(selected)break
 }
 if(!selected)return schedule
 let {period}=selected;const {term}=selected
 const issueDate=retainerIssueDate(period,schedule.value.basis),lines:Value[]=[],exceptions:Value[]=[]
 // Only ended periods contribute overages. Disputes/ambiguity remain explicit exceptions, never guessed.
 const work=await all(env,'time'),balances=retainerConsumption({...data,time:work})
 for(const previous of data.retainerPeriods.filter(p=>p.value.rootId===schedule.value.rootId&&p.value.periodEnd<issueDate)){
  const balance=balances.find(b=>b.periodId===previous.id)
  if(schedule.value.heldPeriodIds.includes(previous.id)){exceptions.push({periodId:previous.id,reason:'Disputed overage held'});continue}
  if(!balance||balance.overageMinor===0)continue
  if(await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='retainerPeriods' AND source_id=?").bind(previous.id).first())continue
  if(schedule.value.autoIssue&&!schedule.value.includeOverages){exceptions.push({periodId:previous.id,reason:'Overage inclusion is outside the automatic issue consent'});continue}
  try{lines.push(await retainerOverage(env,tx,previous))}catch(error){if(!(error instanceof Fault))throw error;exceptions.push({periodId:previous.id,reason:error.message})}
 }
 for(const adjustment of data.retainerAdjustments.filter(r=>r.value.rootId===schedule.value.rootId&&r.value.status==='prepared'))exceptions.push({periodId:adjustment.value.periodId,reason:'Pending retainer adjustment needs finance review'})
 for(const dispute of data.invoiceDisputes.filter(r=>r.value.status==='open')){
  const invoice=data.invoices.find(i=>i.id===dispute.value.invoiceId)
  if(invoice?.value.autoIssue?.scheduleId===schedule.id||invoice?.value.lines.some((l:Value)=>l.sourceSnapshot?.value.rootId===schedule.value.rootId))exceptions.push({periodId:period.id,reason:'An invoice for this retainer has an unresolved dispute'})
 }
 if(schedule.value.heldPeriodIds.includes(period.id))exceptions.push({periodId:period.id,reason:'Scheduled period is held or disputed'})
 if(latestLifecycle&&latestLifecycle.value.kind!=='renewal')exceptions.push({periodId:period.id,reason:'Retainer lifecycle exception: '+latestLifecycle.value.kind})
 const credits=await scheduledCreditLines(env,tx,schedule,data.retainerAdjustments,period,issueDate)
 lines.push(...credits.lines);exceptions.push(...credits.exceptions)
 const ranges=[{from:period.value.activeStart,to:period.value.activeEnd},{from:issueDate,to:issueDate},...lines.filter(l=>l.kind==='retainerPeriods').map(l=>{const p=data.retainerPeriods.find(p=>p.id===l.sourceId)!;return {from:p.value.activeStart,to:p.value.activeEnd}})]
 const locks=await scheduleLocks(env,tx,ranges)
 if(schedule.value.autoIssue&&locks.time)exceptions.push({periodId:period.id,reason:'TIME-003 locked period through '+locks.time.value.lockThrough})
 if(locks.close)exceptions.push({periodId:period.id,reason:'FINANCE-004 closed period '+locks.close.value.month})
 const deferred=(await all(env,'packets')).find(p=>p.value.scheduleId===schedule.id&&p.value.scheduledPeriodStart===period.value.periodStart&&p.value.deferredSources&&p.value.status==='draft')
 if(locks.close||latestLifecycle&&latestLifecycle.value.kind!=='renewal'){
  if(deferred)return deferred
  tx.guard("NOT EXISTS(SELECT 1 FROM g_packets WHERE json_extract(data,'$.scheduleId')=? AND json_extract(data,'$.scheduledPeriodStart')=? AND json_extract(data,'$.deferredSources')=1 AND status='draft')",schedule.id,period.value.periodStart)
  return tx.record('packets',{engagementId:schedule.value.engagementId,title:term.value.terms.name+': scheduling exception',status:'draft',currency:term.value.terms.currency,lines:[],totalMinor:0,createdAt:Date.now(),createdBy:a.session.operator.id,scheduleId:schedule.id,scheduledPeriodStart:period.value.periodStart,scheduledIssueDate:issueDate,deferredSources:true,exceptions,proposedPeriod:period,proposedFeeMinor:retainerFees({retainers:[term],retainerPeriods:[period]},asOf)[0].totalMinor})
 }
 if(deferred)await tx.record('packets',{...deferred.value,status:'cancelled'},deferred,undefined,'retainer:exception-resolved')
 // Opening follows the ordinary immutable family/calendar entitlement, without replacing saved history.
 if(!data.retainerPeriods.some(p=>p.id===period.id)){
  const previous=data.retainerPeriods.filter(p=>p.value.rootId===schedule.value.rootId).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart)).at(-1)
  need(!previous||next(previous.value.periodEnd)===period.value.periodStart,'Open intervening periods before scheduling this period',409)
  need(!data.retainerCloses.some(c=>c.value.rootId===schedule.value.rootId&&c.value.period.value.periodEnd>=period.value.periodStart),'Cannot open inside closed retainer history',409)
  period=await tx.record('retainerPeriods',period.value,undefined,period.id)
 }
 const sources:Row[]=[...data.retainerPeriods,...data.retainerAdjustments]
 const fee=retainerFees({retainers:[term],retainerPeriods:[period]},asOf)[0]
 if(fee.totalMinor!==null&&fee.totalMinor>0){
  const charge=await tx.record('retainerCharges',{engagementId:schedule.value.engagementId,rootId:schedule.value.rootId,periodId:period.id,retainerId:term.id,periodSnapshot:period,termsSnapshot:term,amountMinor:fee.totalMinor,currency:term.value.terms.currency,date:issueDate,status:'approved',name:`${term.value.terms.name}: ${period.value.periodStart} period fee`,scheduleId:schedule.id,scheduleRevision:schedule.revision})
  sources.push(charge)
  lines.push({kind:'retainerCharges',sourceId:charge.id,sourceRevision:charge.revision,description:charge.value.name,amountMinor:charge.value.amountMinor,currency:charge.value.currency,durationSeconds:null,billRateMinor:null,rateId:term.id,budgetId:null,roundingPolicy:'Immutable working-day period fee; separate from included allowance'})
 }
 let packet:Row|undefined,invoice:Row|undefined
 const checked=schedule.value.autoIssue?await autoIssueCheck(env,tx,schedule,term,sum(lines.map(l=>l.amountMinor))):null
 if(checked)exceptions.push(...checked.reasons.map(reason=>({periodId:period.id,reason})))
 const autoIssue=!!checked&&!exceptions.length
 if(lines.length||exceptions.length){
  need(lines.length<=100,'Review accumulated overages before running this schedule',409)
  packet=await tx.record('packets',{engagementId:schedule.value.engagementId,title:`${term.value.terms.name}: scheduled ${period.value.periodStart}`,status:autoIssue?'approved':'draft',...(autoIssue?{approvedBy:schedule.value.configuredBy,approvedAt:Date.now(),artifact:packetArtifact({currency:term.value.terms.currency,lines,totalMinor:sum(lines.map(l=>l.amountMinor))})}:{}),currency:term.value.terms.currency,lines,totalMinor:sum(lines.map(l=>l.amountMinor)),createdAt:Date.now(),createdBy:a.session.operator.id,scheduleId:schedule.id,scheduledIssueDate:issueDate,exceptions})
  for(const line of lines)tx.sql('INSERT INTO g_billing_sources(kind,source_id,packet_id,source_revision) VALUES(?,?,?,?)',line.kind,line.sourceId,packet.id,line.sourceRevision)
  if(autoIssue&&checked){const balance=balances.find(b=>b.periodId===period.id);invoice=await issueScheduledInvoice(env,tx,schedule,period,term,packet,sources,checked.engagement,checked.client,sum((balance?.allocation??[]).filter((x:Value)=>x.allowancePeriodId).map((x:Value)=>x.quantity)))}
 }
 return tx.record('retainerRuns',{engagementId:schedule.value.engagementId,rootId:schedule.value.rootId,periodId:period.id,scheduleSnapshot:schedule,asOf,issueDate,packetId:packet?.id??null,exceptions,autoIssue,invoiceId:invoice?.id??null,ranBy:a.session.operator.id,ranAt:Date.now()})
}

/** Cron holds no session or reusable credential. Each committing batch rechecks
 * the installation-only consent and its granting operator's current authority. */
export async function runRetainerSchedules(env:Bindings,asOf?:string,at=Date.now()){
 const settings=await agency(env),day=asOf??workDate(at,settings.timezone)
 const grants=(await env.DB.prepare('SELECT schedule_id,revision,operator_id FROM g_retainer_schedule_authority ORDER BY schedule_id LIMIT 100').all<{schedule_id:string;revision:string;operator_id:string}>()).results
 for(const grant of grants){
  const schedule=await get(env,'retainerSchedules',grant.schedule_id)
  const a={...settings,session:{operator:{id:grant.operator_id},id:''},role:'finance',personId:null,grantVersion:schedule.value.grantVersion,scheduled:{id:grant.schedule_id,revision:grant.revision}} as Actor
  // Authority itself is durable. A lost grant is an owned exception for finance;
  // an expired principal never receives a write capability.
  try{await fence(env,a)}catch(error){if(error instanceof Fault)continue;throw error}
  const id='job-'+schedule.id,stored=(await all(env,'retainerJobs')).find(r=>r.id===id)
  const same=stored?.value.scheduleRevision===schedule.revision
  if(same&&(stored.value.status==='exhausted'||stored.value.nextAttemptAt>at||stored.value.status==='running'&&stored.value.leaseUntil>at))continue
  const attempts=same?stored!.value.attempts:0
  const tx=new Transaction(env,a);tx.action='retainer:job-claim';tx.observe('retainerSchedules',schedule)
  if(!stored)tx.guard('NOT EXISTS(SELECT 1 FROM g_retainerJobs WHERE id=?)',id)
  const value={engagementId:schedule.value.engagementId,rootId:schedule.value.rootId,scheduleId:schedule.id,scheduleRevision:schedule.revision,monitor:true,ownerId:grant.operator_id,status:'running',attempts:attempts+1,attemptedAt:at,leaseUntil:at+60000,nextAttemptAt:null,exceptions:[],periodId:null,issueDate:day,packetId:null,invoiceId:null,completedAt:null}
  let claimed:Row
  try{claimed=await tx.record('retainerJobs',value,stored,id,tx.action);await tx.commit()}catch(error){if(error instanceof Fault||error instanceof Error&&/constraint|D1_ERROR/.test(error.message))continue;throw error}
  try{
   const run=new Transaction(env,a);run.action='retainer:scheduled-run'
   await runPeriod(env,a,run,schedule,day)
   await run.record('retainerJobs',{...claimed.value,status:'idle',attempts:0,leaseUntil:null,completedAt:at},claimed,undefined,'retainer:job-complete')
   await run.commit()
  }catch(error){
   // Atomic source/number/run writes either all committed or none did. Retry only
   // a native ledger transaction; external mail is never scheduled here.
   const failed=new Transaction(env,a);failed.action='retainer:job-exception'
   const exhausted=claimed.value.attempts>=3
   const state={...claimed.value,status:exhausted?'exhausted':'retry-wait',leaseUntil:null,nextAttemptAt:exhausted?null:at+Math.min(900000,60000*2**(claimed.value.attempts-1)),exceptions:[{reason:exhausted?'Native retainer retry limit exhausted; finance must review and renew schedule consent':'Native retainer transaction did not commit; bounded retry pending'}],completedAt:at}
   try{await fence(env,a);await failed.record('retainerJobs',state,claimed,undefined,failed.action);await failed.commit()}catch(failure){if(!(failure instanceof Fault))throw failure}
  }
 }
}
