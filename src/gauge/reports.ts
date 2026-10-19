import type { Bindings } from '../auth.server'
import { type Row, type Kind, type Value, need, date, sum, kinds } from './model'
import { pipeline } from './pipeline'
import { buildLineage } from './report-lineage'
import { reportFingerprint } from './report-export'
import { type Actor, finance, all, fence } from './store'
import { correctionReviews } from './billing-corrections'
import { canDecide } from './proposals'
import { utilization } from './utilization'
import { resourceDemand } from './resource-demand'
// What one record's value shows this actor: costs and rates stay with finance, other people's leave reasons stay private,
// and an agent never sees an amount. The state read and the revision history both pass every value through here.
const amounts = ['amountMinor','budgetMinor','totalMinor','costMinor','billMinor']
export function redact(a: Actor, k: Kind, value: Value): Value {
 if (finance(a)) return value
 const v: Value = { ...value }
 delete v.economics; if (v.source) { v.source = { ...v.source }; delete v.source.costMinor; delete v.source.billMinor }
 if (k === 'leave' && v.personId !== a.personId) v.note = 'Private leave'
 if (a.role === 'agent' && k !== 'proposals') for (const key of amounts) delete v[key]
 return v
}
export async function visible(env: Bindings,a: Actor) {
 const data = Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<Kind,Row[]>
 data.opportunities = data.opportunities.filter(r => finance(a) || (a.role === 'lead' && r.value.ownerId === a.personId))
 // An agent reads every engagement it may prepare for, approved work only, and no amounts.
 const agent = a.role==='agent', ids = new Set(data.engagements.filter(e=>agent || finance(a) || (a.role==='lead' && e.value.leadId===a.personId) || e.value.members?.includes(a.personId)).map(e=>e.id))
 data.engagements=data.engagements.filter(e=>ids.has(e.id))
 for (const k of ['budgets','tasks','milestones','staffing','time','expenses','packets','proposals','resourceRequests'] as Kind[]) data[k]=data[k].filter(r=>ids.has(r.value.engagementId))
 if (!finance(a)) {
  data.rates=[]; data.packets=[]; data.archives=[]
  const leadIds=new Set(data.engagements.filter(e=>agent || (a.role==='lead' && e.value.leadId===a.personId)).map(e=>e.id))
  // Agents see what they prepared; leads see staffing, time and change orders on their engagements; everyone sees time drafted for them. Billing proposals are finance's.
  data.proposals=data.proposals.filter(r=>agent ? r.value.preparedBy===a.session.operator.id : (leadIds.has(r.value.engagementId) && r.value.kind!=='billing') || (r.value.kind==='time' && r.value.plan.personId===a.personId))
  for (const k of ['time','expenses'] as Kind[]) data[k]=data[k].filter(r=>agent ? r.value.status==='approved' : r.value.personId===a.personId || leadIds.has(r.value.engagementId))
  data.budgets=data.budgets.filter(r=>leadIds.has(r.value.engagementId)); data.milestones=data.milestones.filter(r=>leadIds.has(r.value.engagementId))
  data.resourceRequests=data.resourceRequests.filter(r=>a.role==='lead'&&leadIds.has(r.value.engagementId))
  // People staffed or proposed for staffing on visible engagements are visible too, so a lead can weigh their capacity.
  const staffed=new Set([...data.staffing.map(r=>r.value.personId),...data.proposals.flatMap(r=>r.value.kind==='staffing'?r.value.plan.alternatives.map((x:any)=>x.personId):[])])
  data.people=data.people.filter(r=>r.id===a.personId || staffed.has(r.id) || data.engagements.some(e=>e.value.leadId===r.id || e.value.members?.includes(r.id)))
  const personIds=new Set(data.people.map(r=>r.id)); data.calendars=data.calendars.filter(r=>personIds.has(r.value.personId)); data.leave=data.leave.filter(r=>personIds.has(r.value.personId))
  for (const k of Object.keys(data) as Kind[]) data[k]=data[k].map(r=>({...r,value:redact(a,k,r.value)}))
 }
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
   const workingDay=c?c.value.weekdays.split(',').includes(weekday):null
   const holiday=!!c?.value.holidays?.includes(day)
   const base=c?(workingDay?c.value.dailySeconds:0):null
   const holidaySeconds=holiday?(base??0):0
   const leave=data.leave.filter(r=>r.value.personId===person.id && r.value.from<=day && r.value.to>=day)
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
  const knownCostMinor=sum([...time.map(r=>r.value.economics?.costMinor??0),...expenses.map(r=>r.value.amountMinor)]),knownBillableMinor=sum(time.filter(r=>r.value.billable).map(r=>r.value.economics?.billMinor??0))
  const missingCostSources=time.filter(r=>r.value.economics?.costMinor==null).map(r=>r.id),missingBillRateSources=time.filter(r=>r.value.billable && r.value.economics?.billMinor==null).map(r=>r.id)
  return {...base,costMinor:missingCostSources.length?null:knownCostMinor,knownCostMinor,missingCostSources,billableMinor:missingBillRateSources.length?null:knownBillableMinor,knownBillableMinor,missingBillRateSources}
 })
}
export async function reports(env: Bindings,a: Actor,from: string,to: string) {
 const asOf=new Date().toISOString()
 const data=await visible(env,a),cap=capacity(data,from,to),econ=economics(data,a),exceptions:any[]=[]
 for(const c of cap){ for(const conflict of c.conflicts)exceptions.push({type:'capacity conflict',personId:c.personId,...conflict});if(c.missingCalendarDays)exceptions.push({type:'availability missing',personId:c.personId,days:c.missingCalendarDays,demand:c.days.filter(d=>d.calendarId===null&&(d.committedSeconds>0||d.tentativeSeconds>0))}) }
 for(const e of econ) { if('costMinor' in e && e.budgetMinor!==null && e.knownCostMinor>e.budgetMinor)exceptions.push({type:'overspend',source:`engagements:${e.engagementId}`,amountMinor:e.knownCostMinor-e.budgetMinor,currency:e.currency,incomplete:e.missingCostSources.length>0}); }
 // Recorded time is a per-person total over every entry, not just those this viewer may open, so every viewer reads the same number; no record is exposed.
 const allTime=await all(env,'time')
 for(const p of data.people){const expected=cap.find(c=>c.personId===p.id)?.knownAvailableSeconds ?? 0;const recorded=allTime.filter(r=>r.value.personId===p.id && r.value.workDate>=from && r.value.workDate<=to).reduce((n,r)=>n+(r.value.durationSeconds??0),0);if(recorded<expected)exceptions.push({type:'missing time',personId:p.id,expectedSeconds:expected,recordedSeconds:recorded,sources:data.calendars.filter(r=>r.value.personId===p.id).map(r=>r.id)})}
 for(const r of data.proposals)if(r.value.status==='proposed'&&await canDecide(env,a,r))exceptions.push({type:'decision due',source:`proposals:${r.id}`,kind:r.value.kind})
 const reservations=(await env.DB.prepare('SELECT kind,source_id FROM g_billing_sources').all<{kind:string;source_id:string}>()).results
 for(const k of ['time','expenses','milestones','budgets'] as Kind[])for(const r of data[k]){
  if(r.value.status==='submitted'||((k==='milestones'||k==='budgets')&&r.value.status==='draft'))exceptions.push({type:'decision due',source:`${k}:${r.id}`})
  if(finance(a)&&r.value.status==='approved'&&((k==='time'&&r.value.billable&&!r.value.source?.billed&&r.value.economics?.mode==='hourly')||(k==='expenses'&&r.value.reimbursable)||k==='milestones')&&!reservations.some(b=>b.kind===k&&b.source_id===r.id))exceptions.push({type:k==='time'&&r.value.economics?.billMinor==null?'unbilled work missing bill rate':'unbilled approved work',source:`${k}:${r.id}`})
 }
 const report={agency:{currency:a.currency,timezone:a.timezone},data,capacity:cap,resourceDemand:finance(a)||a.role==='lead'?resourceDemand(data,from,to):[],utilization:utilization(data,cap,from,to),economics:econ,pipeline:finance(a)||a.role==='lead'?pipeline(data):[],exceptions,correctionReviews:finance(a)?correctionReviews(data.packets):[],from,to,asOf}
 await fence(env,a);return {...report,fingerprint:reportFingerprint(report),lineage:buildLineage(report)}
}
