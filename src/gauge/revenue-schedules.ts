import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Row, type Value, date, integer, need, sum, text } from './model'
import { type Actor, type Transaction, access, all, finance, get } from './store'
import { assertIndependentReview } from './approval-policy'
import { authorizedDelivery } from './milestone-delivery'

export const recognitionNotice = 'Operational revenue inputs under a user-recorded accountant policy. Manual export only; not provider-verified recognition, ASC 606 certification or posted accounting.'

async function observed(env:Bindings,tx:Transaction,kind:'invoices'|'invoiceCorrections'|'revenueRecognitions') {
 const rows=await all(env,kind)
 tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,rows.length)
 for(const row of rows)tx.observe(kind,row)
 return rows
}
async function snapshot(env:Bindings,tx:Transaction,schedule:Row,input:Value,excludeId?:string) {
 const s=schedule.value,day=date(input.date),engagement=await get(env,'engagements',s.engagementId)
 tx.observe('revenueSchedules',schedule);tx.observe('engagements',engagement)
 need(engagement.value.currency===s.currency,'Schedule currency changed; no implicit conversion',409)
 const budget=await get(env,'budgets',s.budgetId);tx.observe('budgets',budget)
 need(budget.revision===s.budgetRevision&&budget.value.status==='approved','Schedule terms changed; review the accountant policy again',409)
 const journalType=input.journalType??'delivery'
 need(['delivery','reconciliation','correction'].includes(journalType),'Choose delivery, reconciliation or correction')
 let amountMinor:number,source:Row|undefined,sourceKind:'milestones'|'time'|'revenueRecognitions'|null=null,sourceKey:string
 const evidence=text(input.evidence,'Approved delivery evidence or source review')
 if(journalType==='reconciliation'){
  amountMinor=0
  sourceKey=`reconciliation:${schedule.id}:${day}`
 }else if(journalType==='correction'){
  sourceKind='revenueRecognitions'
  source=await get(env,sourceKind,text(input.sourceId,'Approved delivery journal'))
  need(source.revision===input.sourceRevision&&source.value.status==='approved'&&source.value.scheduleId===schedule.id&&(source.value.journalType??'delivery')==='delivery','Review an exact approved delivery journal from this schedule',409)
  need(s.mode==='service-delivery','Source-based delivery corrections need a new approved source; only service-delivery corrections are supported')
  need(day>=source.value.date,'Correction date precedes the approved delivery')
  tx.observe(sourceKind,source)
  const correctedAmountMinor=integer(input.correctedAmountMinor,'Corrected delivery amount',0)
  amountMinor=correctedAmountMinor-source.value.amountMinor
  need(amountMinor!==0,'The correction must change the delivery amount')
  sourceKey=`correction:${source.id}`
 }else if(s.mode==='service-delivery'){
  amountMinor=integer(input.amountMinor,'Approved monthly delivery amount',1)
  sourceKey=`delivery:${schedule.id}:${day.slice(0,7)}`
 }else{
  sourceKind=s.mode==='milestone'?'milestones':'time'
  source=await get(env,sourceKind,text(input.sourceId,'Approved source'))
  need(source.revision===input.sourceRevision&&source.value.status==='approved'&&source.value.engagementId===s.engagementId,'Review the exact approved source revision',409)
  tx.observe(sourceKind,source)
  if(sourceKind==='milestones'){
   need(authorizedDelivery(source.value),'Milestone needs recorded acceptance and finance authorization',409)
   need(day>=source.value.due,'Recognition date precedes the milestone date')
   need(source.value.currency===s.currency,'Source currency differs from schedule')
   amountMinor=integer(source.value.amountMinor,'Approved milestone amount',1)
  }else{
   need(source.value.billable&&source.value.economics?.mode==='hourly'&&source.value.economics?.currency===s.currency,'Time needs approved billable hourly economics in the schedule currency')
   need(day>=source.value.workDate,'Recognition date precedes approved work')
   amountMinor=integer(source.value.economics.billMinor,'Frozen approved time value',1)
  }
  sourceKey=`${sourceKind}:${source.id}`
 }
 const entries=await observed(env,tx,'revenueRecognitions')
 need(!entries.some(r=>r.id!==excludeId&&r.value.status!=='withdrawn'&&r.value.sourceKey===sourceKey),'This delivery month or source is already reserved or recognized',409)
 const prior=entries.filter(r=>r.value.scheduleId===schedule.id&&r.value.status==='approved').sort((a,b)=>a.value.sequence-b.value.sequence)
 need(prior.every(r=>r.value.date<=day),'Recognition cannot precede an already approved journal',409)
 const previous=prior.at(-1)?.value.balances??{billedMinor:0,recognizedMinor:0,deferredMinor:0,unbilledMinor:0}
 const recognizedMinor=sum([previous.recognizedMinor,amountMinor])
 need(recognizedMinor>=0,'Operational recognition cannot be negative',409)
 need(recognizedMinor<=s.amountMinor,'Operational recognition exceeds approved schedule value',409)
 const invoices=await observed(env,tx,'invoices'),corrections=await observed(env,tx,'invoiceCorrections')
 const projectInvoices=invoices.filter(i=>(i.value.engagementIds??[i.value.engagementId]).includes(s.engagementId)&&i.value.issueDate<=day)
 need(projectInvoices.every(i=>i.value.currency===s.currency),'Invoice currency differs from schedule')
 // Consolidated documents contribute only the lines belonging to this engagement.
 const issued=sum(projectInvoices.flatMap(i=>i.value.lines.filter((l:Value)=>(l.engagementId??i.value.engagementId)===s.engagementId).map((l:Value)=>integer(l.amountMinor,'Invoice line amount',-1e12))))
 const relevant=corrections.filter(c=>c.value.status==='issued'&&c.value.date<=day&&projectInvoices.some(i=>i.id===c.value.invoiceId))
 // A consolidated correction needs a line attribution before this schedule can safely consume it.
 need(relevant.every(c=>!projectInvoices.find(i=>i.id===c.value.invoiceId)?.value.engagementIds?.some((id:string)=>id!==s.engagementId)),'Consolidated invoice correction needs accountant reconciliation before recognition',409)
 const billedMinor=sum([issued,-sum(relevant.map(c=>integer(c.value.amountMinor,'Issued correction amount')))])
 need(billedMinor>=0,'Net issued value cannot be negative',409)
 if(journalType==='reconciliation')need(prior.length>0&&billedMinor!==previous.billedMinor,'Reconciliation needs an approved journal and changed net issued invoices',409)
 const balances={billedMinor,recognizedMinor,deferredMinor:Math.max(0,billedMinor-recognizedMinor),unbilledMinor:Math.max(0,recognizedMinor-billedMinor)}
 const movements=[['receivable',billedMinor-previous.billedMinor],['unbilled',balances.unbilledMinor-previous.unbilledMinor],['deferred',previous.deferredMinor-balances.deferredMinor],['revenue',-amountMinor]] as const
 const journal=movements.filter(([,n])=>n!==0).map(([account,n])=>({account:s.accounts[account],debitMinor:Math.max(n,0),creditMinor:Math.max(-n,0),currency:s.currency}))
 need(sum(journal.map(l=>l.debitMinor))===sum(journal.map(l=>l.creditMinor)),'Journal does not balance',409)
 const sources=[...(source?[{kind:sourceKind,id:source.id,revision:source.revision}]:[]),...projectInvoices.map(i=>({kind:'invoices',id:i.id,revision:i.revision})),...relevant.map(c=>({kind:'invoiceCorrections',id:c.id,revision:c.revision}))]
 return {...(input.journalType!==undefined?{journalType}:{}),...(journalType==='correction'?{correctedAmountMinor:input.correctedAmountMinor}:{}),scheduleId:schedule.id,engagementId:s.engagementId,scheduleRevision:schedule.revision,currency:s.currency,mode:s.mode,policy:s.policy,accountant:s.accountant,accounts:s.accounts,date:day,amountMinor,evidence,sourceKey,sourceId:source?.id??null,sourceRevision:source?.revision??null,sources,sequence:prior.length+1,previous,balances,journal,notice:recognitionNotice}
}
export async function revenueCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(!['revenue:schedule','revenue:prepare','revenue:approve','revenue:withdraw'].includes(action))return null
 need(finance(a),'Finance access required',403)
 if(action==='revenue:schedule'){
  need(a.role==='owner','Only the owner records the accountant policy',403)
  const engagement=await access(env,a,text(input.engagementId,'Engagement'),true);tx.observe('engagements',engagement)
  need(engagement.value.type!=='internal','Internal work has no revenue schedule')
  const budget=await get(env,'budgets',text(input.budgetId,'Approved budget'));tx.observe('budgets',budget)
  need(budget.revision===input.budgetRevision&&budget.value.status==='approved'&&budget.value.engagementId===engagement.id&&budget.value.currency===engagement.value.currency,'Review the exact approved engagement budget',409)
  need(['service-delivery','milestone','time'].includes(input.mode),'Choose service-delivery, milestone or time')
  need(budget.value.mode===(input.mode==='time'?'hourly':'fixed')&&!budget.value.phases?.length,'Choose unphased fixed or hourly terms matching the schedule policy')
  const accounts=Object.fromEntries(['receivable','deferred','unbilled','revenue'].map(k=>[k,text(input.accounts?.[k],`${k} account`,200)]))
  need(new Set(Object.values(accounts)).size===4,'Journal accounts must be distinct')
  return tx.record('revenueSchedules',{engagementId:engagement.id,budgetId:budget.id,budgetRevision:budget.revision,amountMinor:budget.value.amountMinor,currency:engagement.value.currency,mode:input.mode,policy:text(input.policy,'Accountant policy reference'),accountant:text(input.accountant,'Appointed accountant'),accounts,reason:text(input.reason,'Policy recording reason'),recordedBy:a.session.operator.id,recordedAt:Date.now(),notice:recognitionNotice},undefined,undefined,action)
 }
 if(action==='revenue:prepare'){
  const schedule=await get(env,'revenueSchedules',text(input.scheduleId,'Revenue schedule'))
  need(schedule.revision===input.scheduleRevision,'Schedule changed; reload',409)
  const value=await snapshot(env,tx,schedule,input)
  return tx.record('revenueRecognitions',{...value,status:'draft',fingerprint:sha256(canonicalJson(value)),createdBy:a.session.operator.id,createdAt:Date.now()},undefined,undefined,action)
 }
 const row=await get(env,'revenueRecognitions',text(input.id,'Revenue journal'))
 need(row.revision===input.revision&&row.value.status==='draft','Review the current draft journal',409)
 if(action==='revenue:withdraw')return tx.record('revenueRecognitions',{...row.value,status:'withdrawn',withdrawnBy:a.session.operator.id,withdrawnAt:Date.now(),reason:text(input.reason,'Withdrawal reason')},row,undefined,action)
 const schedule=await get(env,'revenueSchedules',row.value.scheduleId),value=await snapshot(env,tx,schedule,row.value,row.id)
 need(sha256(canonicalJson(value))===row.value.fingerprint,'Revenue inputs changed; withdraw and prepare a fresh journal',409)
 if(value.journalType==='correction'){
  need(row.value.createdBy!==a.session.operator.id,'Revenue corrections require another active owner or finance reviewer',403)
  await assertIndependentReview(env,a,tx,{amountMinor:value.amountMinor,currency:value.currency,createdBy:row.value.createdBy})
 }
 return tx.record('revenueRecognitions',{...row.value,status:'approved',approvedBy:a.session.operator.id,approvedAt:Date.now(),approvalReason:text(input.reason,'Journal review reason')},row,undefined,action)
}
