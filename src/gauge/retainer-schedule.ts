import type { Bindings } from '../auth.server'
import { type Actor, Transaction, all, get, finance, fence } from './store'
import { type Value, type Row, type Kind, need, text, date, flag, workDate, sum, Fault } from './model'
import { retainerPeriods } from './retainer-periods'
import { retainerFees } from './retainer-fees'
import { retainerOverage } from './retainer-overages'
import { retainerConsumption } from './retainer-consumption'
import { agency } from './agency'

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
 need(!flag(input.autoIssue),'Automatic invoice issue is disabled; finance must review each draft',403)
 const from=date(input.from),reason=text(input.reason,'Scheduling consent or change reason')
 const runs=await all(env,'retainerRuns')
 need(!old||(!runs.some(r=>r.value.rootId===term.value.rootId)||from===old.value.from),'The first scheduled period cannot move after a run; preserve its history',409)
 const holds=Array.isArray(input.heldPeriodIds)?input.heldPeriodIds.map(id=>text(id,'Disputed period')):String(input.heldPeriodIds??'').split(',').map(s=>s.trim()).filter(Boolean)
 const periods=await all(env,'retainerPeriods')
 for(const id of holds){const period=periods.find(p=>p.id===id&&p.value.rootId===term.value.rootId);need(period,'Choose a period in this retainer family');tx.observe('retainerPeriods',period)}
 tx.guard('(SELECT COUNT(*) FROM g_retainerSchedules)=?',schedules.length)
 const schedule=await tx.record('retainerSchedules',{rootId:term.value.rootId,engagementId:term.value.engagementId,basis,from,enabled:flag(input.enabled),autoIssue:false,heldPeriodIds:[...new Set(holds)],reason,configuredBy:a.session.operator.id,grantVersion:a.grantVersion,configuredAt:Date.now()},old)
 tx.sql('DELETE FROM g_retainer_schedule_authority WHERE schedule_id=?',schedule.id)
 if(schedule.value.enabled)tx.sql('INSERT INTO g_retainer_schedule_authority(schedule_id,revision,operator_id) VALUES(?,?,?)',schedule.id,schedule.revision,a.session.operator.id)
 return schedule
}

/** One bounded atomic job. The unique period receipt and source reservation make retries safe. */
async function runPeriod(env:Bindings,a:Actor,tx:Transaction,schedule:Row,asOf:string):Promise<Row>{
 need(schedule.value.enabled,'This schedule is disabled',409);tx.observe('retainerSchedules',schedule)
 const kinds:Kind[]=['retainers','retainerPeriods','retainerRuns','retainerAdjustments','retainerCloses']
 const data=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<Kind,Row[]>
 for(const k of kinds){for(const row of data[k])tx.observe(k,row);tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,data[k].length)}
 const versions=data.retainers.filter(t=>t.value.rootId===schedule.value.rootId).sort((a,b)=>a.value.terms.start.localeCompare(b.value.terms.start))
 const latestLifecycle=data.retainerAdjustments.filter(r=>r.value.rootId===schedule.value.rootId&&r.value.status==='approved'&&['cancellation','renewal','pause'].includes(r.value.kind)).at(-1)
 need(!latestLifecycle||latestLifecycle.value.kind==='renewal','Resolve the retainer lifecycle exception before scheduling',409)
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
  if(!balance||balance.overageMinor===0)continue
  if(await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='retainerPeriods' AND source_id=?").bind(previous.id).first())continue
  if(schedule.value.heldPeriodIds.includes(previous.id)){exceptions.push({periodId:previous.id,reason:'Disputed overage held'});continue}
  try{lines.push(await retainerOverage(env,tx,previous))}catch(error){if(!(error instanceof Fault))throw error;exceptions.push({periodId:previous.id,reason:error.message})}
 }
 // Opening follows the ordinary immutable family/calendar entitlement, without replacing saved history.
 if(!data.retainerPeriods.some(p=>p.id===period.id)){
  const previous=data.retainerPeriods.filter(p=>p.value.rootId===schedule.value.rootId).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart)).at(-1)
  need(!previous||next(previous.value.periodEnd)===period.value.periodStart,'Open intervening periods before scheduling this period',409)
  need(!data.retainerCloses.some(c=>c.value.rootId===schedule.value.rootId&&c.value.period.value.periodEnd>=period.value.periodStart),'Cannot open inside closed retainer history',409)
  period=await tx.record('retainerPeriods',period.value,undefined,period.id)
 }
 const fee=retainerFees({retainers:[term],retainerPeriods:[period]},asOf)[0]
 if(fee.totalMinor!==null&&fee.totalMinor>0){
  const charge=await tx.record('retainerCharges',{engagementId:schedule.value.engagementId,rootId:schedule.value.rootId,periodId:period.id,retainerId:term.id,periodSnapshot:period,termsSnapshot:term,amountMinor:fee.totalMinor,currency:term.value.terms.currency,date:issueDate,status:'approved',name:`${term.value.terms.name}: ${period.value.periodStart} period fee`,scheduleId:schedule.id,scheduleRevision:schedule.revision})
  lines.push({kind:'retainerCharges',sourceId:charge.id,sourceRevision:charge.revision,description:charge.value.name,amountMinor:charge.value.amountMinor,currency:charge.value.currency,durationSeconds:null,billRateMinor:null,rateId:term.id,budgetId:null,roundingPolicy:'Immutable working-day period fee; separate from included allowance'})
 }
 let packet:Row|undefined
 if(lines.length){
  need(lines.length<=100,'Review accumulated overages before running this schedule',409)
  packet=await tx.record('packets',{engagementId:schedule.value.engagementId,title:`${term.value.terms.name}: scheduled ${period.value.periodStart}`,status:'draft',currency:term.value.terms.currency,lines,totalMinor:sum(lines.map(l=>l.amountMinor)),createdAt:Date.now(),createdBy:a.session.operator.id,scheduleId:schedule.id,scheduledIssueDate:issueDate})
  for(const line of lines)tx.sql('INSERT INTO g_billing_sources(kind,source_id,packet_id,source_revision) VALUES(?,?,?,?)',line.kind,line.sourceId,packet.id,line.sourceRevision)
 }
 return tx.record('retainerRuns',{engagementId:schedule.value.engagementId,rootId:schedule.value.rootId,periodId:period.id,scheduleSnapshot:schedule,asOf,issueDate,packetId:packet?.id??null,exceptions,autoIssue:false,ranBy:a.session.operator.id,ranAt:Date.now()})
}

/** Cron holds no session or reusable credential. Each committing batch rechecks
 * the installation-only consent and its granting operator's current authority. */
export async function runRetainerSchedules(env:Bindings,asOf?:string){
 const settings=await agency(env),day=asOf??workDate(Date.now(),settings.timezone)
 const grants=(await env.DB.prepare('SELECT schedule_id,revision,operator_id FROM g_retainer_schedule_authority ORDER BY schedule_id LIMIT 100').all<{schedule_id:string;revision:string;operator_id:string}>()).results
 for(const grant of grants){
  const schedule=await get(env,'retainerSchedules',grant.schedule_id)
  const a={...settings,session:{operator:{id:grant.operator_id},id:''},role:'finance',personId:null,grantVersion:schedule.value.grantVersion,scheduled:{id:grant.schedule_id,revision:grant.revision}} as Actor
  try{await fence(env,a);const tx=new Transaction(env,a);tx.action='retainer:scheduled-run';await runPeriod(env,a,tx,schedule,day);await tx.commit()}catch(error){
   // A refused run has made no partial financial writes. Durable owned failures remain FOLLOWUP-004; the manual run returns the refusal.
   if(!(error instanceof Fault))throw error
  }
 }
}
