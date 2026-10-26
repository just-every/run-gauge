import { resourceData } from './resource-manager'
import type { Bindings } from '../auth.server'
import { type Row, type Kind, type Value, need, date, sum, kinds } from './model'
import { activeDelegation, reviewQueue } from './time-review'
import { workDate } from './model'
import { pipeline } from './pipeline'
import { buildLineage } from './report-lineage'
import { reportFingerprint } from './report-export'
import { type Actor, finance, all, fence } from './store'
import { correctionReviews } from './billing-corrections'
import { canDecide } from './proposals'
import { utilization } from './utilization'
import { targetPerformance } from './billability'
import { retainerCovers } from './retainer-eligibility'
import { correctionValue, correctionBalance } from './retainer-privacy'
import { retainerStatements } from './retainer-statements'
import { resourceDemand } from './resource-demand'
import { financeForecast } from './finance-forecast'
import { demandForecast } from './demand-forecast'
import { projectMargin } from './margin'
import { cashForecast } from './cash-forecast'
import { portfolio } from './portfolio'
import { convertedCash } from './cash-conversion'
import { phaseViews } from './budget-phases'
import { financeForecastBase } from './finance-forecast'
import { capBalances } from './budget-caps'
import { revenueDashboard } from './revenue-dashboard'
import { agentData, agentValue } from './agent-data'
import { proposalAvailability } from './proposal-sources'
import { filters,visibleCustom,canField } from './custom-values'
import { customPerformance } from './custom-report'
import { estimatePublic } from './estimates'
import { savedVisible } from './custom-fields'
import { privateClientKeys } from './clients'
// What one record's value shows this actor: costs and rates stay with finance, other people's leave reasons stay private,
// and an agent never sees an amount. The state read and the revision history both pass every value through here.
export function redact(a: Actor, k: Kind, value: Value): Value {
 if (a.role==='agent') return agentValue(a,k,value)
 if(['providerConnections','providerUses','providerJobs','providerSyncs','providerFollowups','githubRepos','githubEvidence','githubEffects','githubFollowups','paymentLinks','processorPayments','processorEvents','stripeAccounts'].includes(k)&&a.role!=='owner')return {}
 if(['retentionPolicies','privacyExits','privacyErasures','operationalCases','caseEvents','kantataAdoptions','floatAdoptions'].includes(k)&&a.role!=='owner')return {}
 if(k==='kantataRecords'&&!finance(a))return {}
 if(['revenueSchedules','revenueRecognitions'].includes(k)&&!finance(a))return {}
 if(['fxRates','invoiceSettings','invoiceAccess','invoiceViews'].includes(k)&&!finance(a))return {}
 if(k==='agencyProfiles'){if(a.role==='owner')return value;if(!finance(a))return {};const {einReference,...profile}=value;return profile}
 if(k==='commercialEvents'&&a.role!=='owner'&&String(value.type).startsWith('signature-'))return {}
 if(k==='estimates')return estimatePublic(a,value)
 if(k==='customFields'&&!canField(a,{id:'',revision:'',value}))return {}
 value=visibleCustom(a,k,value)
 if(k==='deliveryTemplates')value={...value,items:value.items.map((item:Value)=>visibleCustom(a,'tasks',item))}
 if(k==='savedReports'&&!savedVisible(a,value))return {}
 if (k === 'leave') value = {...value, note: value.personId === a.personId ? value.note : 'Private leave', conflicts: (value.conflicts ?? []).filter((c:Value) => finance(a) || c.leadId === a.personId)}
 if(k==='milestones'&&value.delivery&&a.role!=='owner'){const {clientReviews,...delivery}=value.delivery;value={...value,delivery}}
 if (finance(a)) return value
 if(k==='budgetAlerts'){const {actual,budget,...alert}=value;return alert}
 if(k==='retainerCloses'||k==='retainerAdjustments')return correctionValue(a,k,value)
 if(a.role==='staff'&&k==='retainers'){const t=value.terms,r=t.rules??{};return {engagementId:value.engagementId,rootId:value.rootId,number:value.number,previousId:value.previousId,terms:{name:t.name,frequency:t.frequency,unit:t.unit,allowance:t.allowance,services:t.services,consumes:t.consumes,proration:t.proration,start:t.start,end:t.end,renewal:t.renewal,noticeDays:t.noticeDays,currency:t.currency,rules:{carryCap:r.carryCap??0,carryPeriods:r.carryPeriods??0,deficit:r.deficit??false}}}}
 if(a.role==='staff'&&k==='retainerPeriods'){const {reason,openedBy,openedAt,...period}=value;return period}
 // Cash assumptions (FINANCE-002/FINANCE-007) and the SETUP-002 client workspace are finance's: others see the client's name.
 if(k==='clients')return Object.fromEntries(Object.entries(value).filter(([key])=>!privateClientKeys.includes(key)))
 const v: Value = { ...value }
 if(k==='expenses'){delete v.financeReviewNote;delete v.markupBasisPoints;delete v.clientRecoveryMinor;delete v.fx;delete v.unitRate;if(v.personId!==a.personId){delete v.policyException;delete v.attachmentIds}}
 if(k==='retainers')v.terms=Object.fromEntries(Object.entries(value.terms).filter(([key])=>!['feeMinor','feeBasis'].includes(key)))
 if(a.role==='staff'&&k==='time'){delete v.retainerRootId;delete v.retainerAllocation}
 delete v.economics; delete v.rateOverride; if (v.source) { v.source = { ...v.source }; delete v.source.costMinor; delete v.source.billMinor }
 if (k === 'leave' && v.personId !== a.personId) v.note = 'Private leave'
 return v
}
export async function visible(env: Bindings,a: Actor,favoritePersonId?:string) {
 if(a.role==='resource-manager')return resourceData(env,a)
 const data = Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<Kind,Row[]>
 data.customFields=data.customFields.filter(f=>canField(a,f));data.customImports=finance(a)?data.customImports:[];data.savedReports=data.savedReports.filter(r=>savedVisible(a,r.value))
 for(const k of ['retentionPolicies','privacyExits','privacyErasures','operationalCases','caseEvents','kantataAdoptions','floatAdoptions'] as const)data[k]=a.role==='owner'?data[k]:[]
 data.kantataRecords=finance(a)?data.kantataRecords:[]
 data.expenseRates=finance(a)?data.expenseRates:[]
 data.leave=data.leave.map(r=>({...r,value:redact(a,'leave',r.value)}))
 data.revenueSchedules=finance(a)?data.revenueSchedules:[];data.revenueRecognitions=finance(a)?data.revenueRecognitions:[];
 data.invoiceAccess=finance(a)?data.invoiceAccess:[];data.invoiceViews=finance(a)?data.invoiceViews:[];
 data.invoiceSettings=finance(a)?data.invoiceSettings:[];data.fxRates=finance(a)?data.fxRates:[];data.agencyProfiles=finance(a)?data.agencyProfiles.map(r=>({...r,value:redact(a,'agencyProfiles',r.value)})):[]
 data.opportunities = data.opportunities.filter(r => finance(a) || (a.role === 'lead' && r.value.ownerId === a.personId))
 for(const k of ['providerConnections','providerUses','providerJobs','providerSyncs','providerFollowups','githubRepos','githubEvidence','githubEffects','githubFollowups','paymentLinks','processorPayments','processorEvents','stripeAccounts'] as const)data[k]=a.role==='owner'?data[k]:[]
 data.commercialProposals=finance(a)?data.commercialProposals:[];data.commercialEvents=finance(a)?data.commercialEvents.filter(r=>a.role==='owner'||!String(r.value.type).startsWith('signature-')):[]
 const opportunityIds=new Set(data.opportunities.map(r=>r.id));data.estimates=data.estimates.filter(r=>finance(a)||opportunityIds.has(r.value.opportunityId));data.estimateApprovals=finance(a)?data.estimateApprovals:[];data.estimateConversions=data.estimateConversions.filter(r=>finance(a)||opportunityIds.has(r.value.opportunityId))
 // Agents use their own closed purpose projection; ordinary visibility follows person and finance rights.
 if(a.role==='agent'){const scoped=agentData(a,data);await fence(env,a);return scoped}
 const today=workDate(Date.now(),a.timezone),delegatedIds=new Set(data.engagements.filter(e=>data.timeDelegations.some(d=>activeDelegation(d,e,a,today))).map(e=>e.id))
 data.timeDelegations=data.timeDelegations.filter(d=>finance(a)||d.value.leadId===a.personId||d.value.delegateId===a.personId)
 const ordinaryIds = new Set(data.engagements.filter(e=>finance(a) || (a.role==='lead' && e.value.leadId===a.personId) || e.value.members?.includes(a.personId)).map(e=>e.id))
 const ids=new Set([...ordinaryIds,...delegatedIds])
 data.timeFavorites=data.timeFavorites.filter(r=>ids.has(r.value.engagementId)&&r.value.personId===(a.role==='owner'&&favoritePersonId?favoritePersonId:a.personId))
 data.engagements=data.engagements.filter(e=>ids.has(e.id))
 for (const k of ['budgets','tasks','milestones','staffing','time','expenses','packets','proposals','resourceRequests','deliveryPlans','retainers','retainerPeriods','retainerCloses','retainerAdjustments','budgetAlertPolicies','budgetAlerts'] as Kind[]) data[k]=data[k].filter(r=>ids.has(r.value.engagementId))
 if (!finance(a)) {
  data.budgetAlertPolicies=[];data.budgetAlerts=data.budgetAlerts.filter(r=>a.role==='lead'&&r.value.leadId===a.personId);data.periodMatches=[];data.periodCloseDrafts=[];data.periodCloses=[];data.periodReopenRequests=[];data.periodReopens=[];data.timeSlices=[]; data.capWriteDowns=[]; data.retainerJobs=[];data.retainerSchedules=[]; data.retainerCharges=[]; data.retainerRuns=[]; data.fixedCharges=[]; data.rates=[]; data.rateWithdrawals=[]; data.demandScenarios=[]; data.projectScenarios=[]; data.paymentPromises=[]; data.invoices=[]; data.payments=[]; data.invoiceCorrections=[]; data.clientReceipts=[]; data.invoiceDisputes=[]; data.packets=[]; data.archives=[]; data.specialistHandoffs=[]; data.approvalPolicies=[]
  // Agency delivery templates are planning configuration for those who start projects.
  if(a.role!=='lead')data.deliveryTemplates=[]
  const leadIds=new Set(data.engagements.filter(e=>(a.role==='lead' && e.value.leadId===a.personId)).map(e=>e.id))
  // Leads see staffing, time and change orders on their engagements; everyone sees time drafted for them. Billing proposals are finance's.
  data.proposals=data.proposals.filter(r=>(leadIds.has(r.value.engagementId) && r.value.kind!=='billing') || (r.value.kind==='time' && r.value.plan.personId===a.personId))
  for (const k of ['time','expenses'] as Kind[]) data[k]=data[k].filter(r=>r.value.personId===a.personId || leadIds.has(r.value.engagementId) || (k==='time'&&delegatedIds.has(r.value.engagementId)&&data.timeDelegations.some(d=>activeDelegation(d,data.engagements.find(e=>e.id===r.value.engagementId)!,a,today,r.value.workDate))))
  // Time delegation supplies review context, never project planning authority.
  for(const k of ['staffing','deliveryPlans'] as const)data[k]=data[k].filter(r=>ordinaryIds.has(r.value.engagementId))
  data.tasks=data.tasks.filter(r=>ordinaryIds.has(r.value.engagementId)||data.time.some(t=>t.value.taskId===r.id))
  data.agencyCalendars=[];data.retainers=data.retainers.filter(r=>leadIds.has(r.value.engagementId)||(a.role==='staff'&&r.value.terms.unit==='hours'));data.retainerPeriods=data.retainerPeriods.filter(r=>data.retainers.some(t=>t.id===r.value.retainerId))
  const hourPeriods=new Set(data.retainerPeriods.filter(p=>p.value.unit==='hours').map(p=>p.id))
  data.retainerCloses=data.retainerCloses.filter(r=>hourPeriods.has(r.value.periodId));data.retainerAdjustments=data.retainerAdjustments.filter(r=>hourPeriods.has(r.value.periodId))
  data.budgets=data.budgets.filter(r=>leadIds.has(r.value.engagementId)); data.milestones=data.milestones.filter(r=>leadIds.has(r.value.engagementId))
  data.resourceRequests=data.resourceRequests.filter(r=>Object.keys(r.value.customFilters??{}).every(id=>data.customFields.some(f=>f.id===id))&&a.role==='lead'&&leadIds.has(r.value.engagementId))
  // People staffed or proposed for staffing on visible engagements are visible too, so a lead can weigh their capacity.
  const staffed=new Set([...data.staffing.map(r=>r.value.personId),...data.proposals.flatMap(r=>r.value.kind==='staffing'?r.value.plan.alternatives.map((x:any)=>x.personId):[])])
  data.people=data.people.filter(r=>r.id===a.personId || staffed.has(r.id) || data.engagements.some(e=>e.value.leadId===r.id || e.value.members?.includes(r.id)))
  const personIds=new Set(data.people.map(r=>r.id)); data.calendars=data.calendars.filter(r=>personIds.has(r.value.personId)); data.leave=data.leave.filter(r=>personIds.has(r.value.personId))
  // Billability targets are planning goals, not pay: a viewer sees those for the people and roles they can already see.
  data.billabilityTargets=data.billabilityTargets.filter(r=>r.value.scope==='person'?personIds.has(r.value.personId):data.people.some(p=>String(p.value.role??'').trim()===r.value.role))
  for (const k of Object.keys(data) as Kind[]) data[k]=data[k].map(r=>({...r,value:redact(a,k,r.value)}))
 }
 if(!finance(a)) data.expenseRates=finance(a)?data.expenseRates:[]
 data.leave=data.leave.map(r=>({...r,value:{...r.value,conflicts:(r.value.conflicts??[]).filter((c:Value)=>data.engagements.some(e=>e.id===c.engagementId&&e.value.leadId===a.personId))}}))
 const clientIds=new Set([...data.engagements,...data.opportunities].map(r=>r.value.clientId)); if(!finance(a))data.clients=data.clients.filter(r=>clientIds.has(r.id))
 await fence(env,a); return data
}
export function capacity(data: Pick<Awaited<ReturnType<typeof visible>>,'people'|'calendars'|'leave'|'staffing'>,from: string,to: string) {
 date(from);date(to);need(to>=from && Date.parse(to)-Date.parse(from)<=366*86400000,'Choose a capacity window of up to one year')
 return data.people.map(person=>{
  let available=0,committed=0,tentative=0,knownCommitted=0; const conflicts:any[]=[],days=[]; let missingCalendarDays=0
  for (let ms=Date.parse(from);ms<=Date.parse(to);ms+=86400000) {
   const day=new Date(ms).toISOString().slice(0,10),weekday=String(new Date(ms).getUTCDay())
   const c=data.calendars.find(r=>r.value.personId===person.id && r.value.from<=day && r.value.to>=day)
   const workingDay=c?(c.value.weekdaySeconds ? c.value.weekdaySeconds[weekday] > 0 : c.value.weekdays.split(',').includes(weekday)):null
   const holiday=!!c?.value.holidays?.includes(day)
   const base=c?(c.value.weekdaySeconds ? c.value.weekdaySeconds[weekday] : workingDay?c.value.dailySeconds:0):null
   const holidaySeconds=holiday?(base??0):0
   const leave=data.leave.filter(r=>(!r.value.status || r.value.status==='approved') && r.value.personId===person.id && r.value.from<=day && r.value.to>=day)
   const leaveSeconds=leave.reduce((n,r)=>n+r.value.dailySeconds,0),free=base===null?null:Math.max(0,base-holidaySeconds-leaveSeconds)
   const allocations=data.staffing.filter(r=>r.value.personId===person.id && r.value.from<=day && r.value.to>=day)
   const confirmed=allocations.filter(r=>r.value.commitment==='committed'),pending=allocations.filter(r=>r.value.commitment==='tentative')
   const confirmedSeconds=sum(confirmed.map(r=>r.value.dailySeconds)),pendingSeconds=sum(pending.map(r=>r.value.dailySeconds))
   committed+=confirmedSeconds;tentative+=pendingSeconds
   if(free===null)missingCalendarDays++;else{available+=free;knownCommitted+=confirmedSeconds;if(confirmedSeconds>free)conflicts.push({date:day,seconds:confirmedSeconds-free,sources:confirmed.map(r=>r.id)})}
   days.push({date:day,calendarId:c?.id??null,timezone:c?.value.timezone??person.value.timezone,workingDay,holiday,holidaySeconds,baseSeconds:base,leaveSeconds,leaveSources:leave.map(r=>r.id),availableSeconds:free,committedSeconds:confirmedSeconds,tentativeSeconds:pendingSeconds,remainingSeconds:free===null?null:free-confirmedSeconds,committedSources:confirmed.map(r=>r.id),tentativeSources:pending.map(r=>r.id)})
  }
  return {personId:person.id,name:person.value.name,contractor:!!person.value.contractor,availableSeconds:missingCalendarDays?null:available,knownAvailableSeconds:available,committedSeconds:committed,tentativeSeconds:tentative,remainingSeconds:missingCalendarDays?null:available-committed,knownRemainingSeconds:available-knownCommitted,missingCalendarDays,days,conflicts}
 })
}
export function economics(data: Awaited<ReturnType<typeof visible>>,a: Actor) {
 return data.engagements.map(e=>{
  const time=data.time.filter(r=>r.value.engagementId===e.id && r.value.status==='approved'),expenses=data.expenses.filter(r=>r.value.engagementId===e.id && r.value.status==='approved')
  const terms=data.budgets.filter(r=>r.value.engagementId===e.id && r.value.status==='approved').sort((x,y)=>y.value.approvedAt-x.value.approvedAt)[0]
  need(!terms || terms.value.currency===e.value.currency, 'Report terms currency differs from engagement; no implicit FX')
  const base={engagementId:e.id,name:e.value.name,currency:e.value.currency,budgetId:terms?.id ?? null,budgetMinor:terms?.value.amountMinor ?? null,approvedSeconds:sum(time.map(r=>r.value.durationSeconds)),remainingSeconds:sum(data.tasks.filter(r=>r.value.engagementId===e.id).map(r=>r.value.remainingSeconds))}
  if(!finance(a)){const view:Record<string,unknown>={...base,privateCosts:'Restricted to finance'};if(a.role==='agent')delete view.budgetMinor;return view as typeof base & {privateCosts:string}}
  need(time.every(r=>!r.value.economics || r.value.economics.currency===e.value.currency) && expenses.every(r=>r.value.currency===e.value.currency), 'Report source currencies differ from engagement; no implicit FX')
  // Declared costs keep their own currency (RATE-002): each currency is its own bucket and a total across currencies is refused without SETUP-003 rates.
  const costs=time.filter(r=>r.value.economics?.costMinor!=null),costCurrency=(r:Row)=>r.value.economics.costCurrency??r.value.economics.currency
  const costByCurrency:Record<string,number>={};for(const [currency,minor] of [...costs.map(r=>[costCurrency(r),r.value.economics.costMinor]),...expenses.map(r=>[r.value.currency,r.value.amountMinor])] as [string,number][])costByCurrency[currency]=sum([costByCurrency[currency]??0,minor])
  const otherCostCurrencies=Object.keys(costByCurrency).filter(c=>c!==e.value.currency).sort(),knownCostMinor=costByCurrency[e.value.currency]??0,knownBillableMinor=sum(time.filter(r=>r.value.billable).map(r=>r.value.economics?.billMinor??0))
  const missingCostSources=time.filter(r=>r.value.economics?.costMinor==null).map(r=>r.id),missingBillRateSources=time.filter(r=>r.value.billable && r.value.economics?.billMinor==null).map(r=>r.id)
  return {...base,costMinor:missingCostSources.length||otherCostCurrencies.length?null:knownCostMinor,knownCostMinor,missingCostSources,costByCurrency,otherCostCurrencies,billableMinor:missingBillRateSources.length?null:knownBillableMinor,knownBillableMinor,missingBillRateSources}
 })
}
export async function reports(env: Bindings,a: Actor,from: string,to: string,favoritePersonId?:string,forecastAsOf?:string|null,portfolioOptions:Value={}) {
 const asOf=new Date().toISOString(),forecastDay=forecastAsOf?date(forecastAsOf):workDate(Date.now(),a.timezone)
 const data=await visible(env,a,favoritePersonId),cap=a.role==='resource-manager'?capacity({people:data.people,calendars:await all(env,'calendars'),leave:await all(env,'leave'),staffing:await all(env,'staffing')},from,to).map(c=>({...c,conflicts:c.conflicts.map(x=>({...x,sources:[]})),days:c.days.map(d=>({...d,calendarId:null,leaveSources:[],committedSources:[],tentativeSources:[]}))})):capacity(data,from,to),econ=economics(data,a),exceptions:any[]=[]
 for(const c of cap){ for(const conflict of c.conflicts)exceptions.push({type:'capacity conflict',personId:c.personId,...conflict});if(c.missingCalendarDays)exceptions.push({type:'availability missing',personId:c.personId,days:c.missingCalendarDays,demand:c.days.filter(d=>d.calendarId===null&&(d.committedSeconds>0||d.tentativeSeconds>0))}) }
 for(const e of econ) { if('costMinor' in e && e.budgetMinor!==null && e.knownCostMinor>e.budgetMinor)exceptions.push({type:'overspend',source:`engagements:${e.engagementId}`,amountMinor:e.knownCostMinor-e.budgetMinor,currency:e.currency,incomplete:e.missingCostSources.length>0||e.otherCostCurrencies.length>0}); }
 // Recorded time is a per-person total over every entry, not just those this viewer may open, so every viewer reads the same number; no record is exposed.
 const allTime=['agent','resource-manager'].includes(a.role)?data.time:await all(env,'time')
 for(const p of (a.role==='agent'&&a.agentScope?.purpose!=='time'?[]:data.people)){const expected=cap.find(c=>c.personId===p.id)?.knownAvailableSeconds ?? 0;const recorded=allTime.filter(r=>r.value.personId===p.id && r.value.workDate>=from && r.value.workDate<=to).reduce((n,r)=>n+(r.value.durationSeconds??0),0);if(recorded<expected)exceptions.push({type:'missing time',personId:p.id,expectedSeconds:expected,recordedSeconds:recorded,sources:data.calendars.filter(r=>r.value.personId===p.id).map(r=>r.id)})}
 for(const p of data.proposals)if(p.value.status==='proposed')p.value.availability=await proposalAvailability(env,p)
 for(const r of data.proposals)if(r.value.status==='proposed'&&!r.value.availability&&await canDecide(env,a,r))exceptions.push({type:'decision due',source:`proposals:${r.id}`,kind:r.value.kind})
 const reservations=(await env.DB.prepare('SELECT kind,source_id FROM g_billing_sources').all<{kind:string;source_id:string}>()).results
 const partialSources=new Set(data.timeSlices.filter(s=>reservations.some(r=>r.kind==='timeSlices'&&r.source_id===s.id)).map(s=>s.value.sourceId))
 for(const k of ['time','expenses','milestones','budgets','fixedCharges'] as Kind[])for(const r of data[k]){
  if(r.value.status==='submitted'||((k==='milestones'||k==='budgets')&&r.value.status==='draft'))exceptions.push({type:'decision due',source:`${k}:${r.id}`})
  if(finance(a)&&r.value.status==='approved'&&((k==='time'&&r.value.billable&&!r.value.source?.billed&&r.value.economics?.mode==='hourly')||(k==='expenses'&&(r.value.clientBillable??r.value.reimbursable))||k==='milestones'||k==='fixedCharges')&&!(k==='time'&&partialSources.has(r.id))&&!reservations.some(b=>b.kind===k&&b.source_id===r.id))exceptions.push({type:k==='time'&&retainerCovers(data.retainers,r.value)?'retainer billing held':k==='time'&&r.value.economics?.billMinor==null?'unbilled work missing bill rate':'unbilled approved work',source:`${k}:${r.id}`})
 }
 const retainerEligibility=a.role==='staff'?Object.fromEntries(await Promise.all((['retainers','retainerPeriods'] as const).map(async kind=>[kind,await all(env,kind)]))) as Pick<typeof data,'retainers'|'retainerPeriods'>:data
 const correctionData=['agent','resource-manager'].includes(a.role)?{retainerCloses:[],retainerAdjustments:[]}:{retainerCloses:await all(env,'retainerCloses'),retainerAdjustments:await all(env,'retainerAdjustments')}
 const retainerBalances=a.role==='agent'?[]:retainerStatements(data,allTime,a.role==='staff'?a.personId??undefined:undefined,{...retainerEligibility,...correctionData,time:allTime}).map(b=>a.role==='lead'&&b.unit==='value'?{...correctionBalance(a,b,new Set(data.time.map(t=>t.id))),restrictedEconomics:true}:correctionBalance(a,b,new Set(data.time.map(t=>t.id))))
 const timeReview=reviewQueue(data,a.timezone,allTime)
 const reviewerIds=a.role==='lead'?(await env.DB.prepare("SELECT DISTINCT g.person_id FROM g_grants g JOIN oa_operators o ON o.id=g.operator_id WHERE g.enabled=1 AND g.role IN ('lead','finance') AND o.status='active'").all<{person_id:string}>()).results.map(r=>r.person_id):[]
 const timeReviewers=(await all(env,'people')).filter(p=>reviewerIds.includes(p.id)).map(p=>({...p,value:{name:p.value.name}}))
 const forecast=finance(a)?financeForecast(data,forecastDay,retainerBalances):null
 // RESOURCE-005 capacity runs from the day after the forecast day for a year, whatever window the state read shows.
 const forecastCapacity=forecast?capacity(data,new Date(Date.parse(forecastDay)+86400000).toISOString().slice(0,10),new Date(Date.parse(forecastDay)+366*86400000).toISOString().slice(0,10)):[]
 portfolioOptions={...portfolioOptions,customFilters:filters(a,portfolioOptions.customFilters)};if(portfolioOptions.customGroup)need(data.customFields.some(f=>f.id===portfolioOptions.customGroup),'Custom group unavailable',403);need(Array.isArray(portfolioOptions.customMeasures??[])&&(portfolioOptions.customMeasures??[]).length<=100,'Choose at most 100 custom measures');for(const id of portfolioOptions.customMeasures??[])need(data.customFields.some(f=>f.id===id&&['number','currency'].includes(f.value.type)),'Custom measure unavailable',403)
 const customPerformanceReport=customPerformance(data,cap,from,to,finance(a),portfolioOptions)
 const phaseMargins=forecast?phaseViews(data).map(p=>{const f=financeForecastBase(p.data,forecastDay,[],data);return {phase:p.phase,...(projectMargin(p.data,{...f,phaseForecasts:[]}).find(m=>m.engagementId===p.engagementId)!)}}):[]
 const scheduleAuthorities=finance(a)?(await env.DB.prepare("SELECT c.schedule_id,c.revision,c.operator_id,o.role,o.status,g.role AS grant_role,g.enabled,g.version FROM g_retainer_schedule_authority c JOIN oa_operators o ON o.id=c.operator_id LEFT JOIN g_grants g ON g.operator_id=o.id").all<any>()).results:[]
 const retainerScheduleHealth=finance(a)?data.retainerSchedules.map(s=>{const grant=scheduleAuthorities.find(g=>g.schedule_id===s.id),live=grant&&grant.revision===s.revision&&grant.operator_id===s.value.configuredBy&&grant.status==='active'&&(grant.role==='owner'||grant.grant_role==='finance'&&grant.enabled===1&&grant.version===s.value.grantVersion);return {id:s.id,ownerId:s.value.configuredBy,status:!s.value.enabled?'disabled':!grant?'authority-disconnected':live?'authorized':'authority-expired'}}):[]
 const cash=forecast?cashForecast(data,forecast):null
 const report={retainerScheduleHealth,customOptions:portfolioOptions,customPerformance:customPerformanceReport,phaseMargins,capBalances:finance(a)?capBalances(data):[],revenueDashboard:finance(a)?revenueDashboard(data,forecastDay):null,portfolio:forecast?portfolio(data,forecast,retainerBalances,from,to,portfolioOptions,a.currency):null,timeReviewers,timeReview,retainerBalances,agency:{currency:a.currency,timezone:a.timezone},data,capacity:cap,resourceDemand:finance(a)||['lead','resource-manager'].includes(a.role)?resourceDemand(data,from,to):[],utilization:utilization(data,cap,from,to),performance:targetPerformance(data,cap,from,to,finance(a)),economics:econ,margin:forecast?projectMargin(data,forecast):null,cash,cashConverted:cash?convertedCash(data.fxRates??[],cash,a.currency):null,pipeline:finance(a)||a.role==='lead'?pipeline(data,finance(a)?forecastDay:null):[],exceptions,correctionReviews:finance(a)?correctionReviews(data.packets):[],forecast,demandForecast:forecast?demandForecast(data,forecastDay,a.currency,forecast,forecastCapacity):null,from,to,asOf}
 await fence(env,a);return {...report,fingerprint:reportFingerprint(report),lineage:buildLineage(report)}
}
