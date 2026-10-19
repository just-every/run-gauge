import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, instant, zone, flag, workDate, charge, integer, date } from './model'
import { assertTimeUnlocked } from './time-policy'
import { type Actor, Transaction, finance, access, get, all } from './store'
export async function snapshotRates(env: Bindings,tx: Transaction,row: Row) {
 const engagement = await get(env,'engagements',row.value.engagementId); tx.observe('engagements',engagement)
 const v = row.value, observedRates = await all(env,'rates'), rates = observedRates.filter(r => (r.value.personId === v.personId || (!r.value.personId && r.value.service === v.service)) && (r.value.service === '*' || r.value.service === v.service) && r.value.effective <= v.workDate).sort((x,y) => (Number(y.value.personId !== null)*2+Number(y.value.service===v.service))-(Number(x.value.personId !== null)*2+Number(x.value.service===v.service)) || y.value.effective.localeCompare(x.value.effective))
 const rate = rates[0]; if (rate) tx.observe('rates',rate)
 // Internal approvals freeze declared labor cost without inventing client terms.
 if (engagement.value.type === 'internal') {
  need(!v.billable,'Internal time cannot be billable')
  need(!rate || rate.value.currency === engagement.value.currency,'Cost currency differs; no implicit FX')
  for (const observed of observedRates) tx.observe('rates',observed)
  tx.guard('(SELECT COUNT(*) FROM g_rates)=?',observedRates.length)
  return {rateId:rate?.id??null,budgetId:null,mode:'internal',roundingSeconds:1,costMinor:rate?.value.costMinor==null?null:charge(v.durationSeconds,rate.value.costMinor),billRateMinor:0,roundedBillingSeconds:v.durationSeconds,billMinor:0,currency:engagement.value.currency}
 }
 const budgets = (await all(env,'budgets')).filter(b=> b.value.engagementId === v.engagementId && b.value.status === 'approved').sort((x,y)=>y.value.approvedAt-x.value.approvedAt)
 need(budgets[0],'Approve engagement terms first'); tx.observe('budgets',budgets[0]);tx.guard("(SELECT COUNT(*) FROM g_budgets WHERE engagement_id=? AND status='approved')=?",v.engagementId,budgets.length)
 need(budgets[0].value.currency === engagement.value.currency, 'Terms currency differs from engagement; no implicit FX')
 need(!rate || rate.value.currency === engagement.value.currency, 'Rate currency differs from engagement; no implicit FX')
 // Fence all candidate rates and terms: insertion during review cannot silently select a different version.
 for (const observed of observedRates) tx.observe('rates', observed)
 tx.guard('(SELECT COUNT(*) FROM g_rates)=?', observedRates.length)
 const seconds = v.durationSeconds ?? Math.round((v.end-v.start)/1000)
 return { rateId: rate?.id ?? null, budgetId: budgets[0].id, mode: budgets[0].value.mode, roundingSeconds:budgets[0].value.roundingSeconds, costMinor:rate?.value.costMinor == null ? null : charge(seconds,rate.value.costMinor), billRateMinor:rate?.value.billMinor??null,roundedBillingSeconds:Math.ceil(seconds/budgets[0].value.roundingSeconds)*budgets[0].value.roundingSeconds,billMinor:rate ? charge(seconds,rate.value.billMinor,budgets[0].value.roundingSeconds) : null, currency:engagement.value.currency }
}
export async function timeCommand(env: Bindings,a: Actor,tx: Transaction,action: string,input: Value): Promise<Row | null> {
 if (!['time:save','timer:start','timer:stop','time:submit','time:return','time:approve','time:correct'].includes(action)) return null
 if (action === 'time:save' || action === 'timer:start') {
  const old = input.id ? await get(env,'time',input.id) : undefined
  if (old) { need(finance(a) || a.personId === old.value.personId, 'Only your own entry', 403); const original = await access(env,a,old.value.engagementId); tx.observe('engagements',original); need(old.value.personId === input.personId && old.value.engagementId === input.engagementId,'Cannot move an existing entry'); need(old.revision === input.revision,'Entry changed; reload',409); need(['draft','returned'].includes(old.value.status),'Submitted or approved entries require return/correction',409) }
  if(old)await assertTimeUnlocked(env,tx,[old.value.workDate])
  const person = await get(env,'people',text(input.personId,'Person')); need(finance(a) || a.personId === person.id,'You can only record your own time',403); tx.observe('people',person)
  const e = await access(env,a,text(input.engagementId,'Engagement')); tx.observe('engagements',e)
  need(e.value.type !== 'internal' || !flag(input.billable),'Internal time cannot be billable')
  const task = await get(env,'tasks',text(input.taskId,'Task')); need(task.value.engagementId === e.id,'Task belongs to another engagement'); tx.observe('tasks',task); need(task.value.billable!==false||!flag(input.billable),'This task is nonbillable')
  const dateOnly=old?.value.source?.clockInstants==='not-supplied'; const start = dateOnly ? null : action === 'timer:start' ? Date.now() : instant(input.start), end = dateOnly ? null : action === 'timer:start' ? null : instant(input.end)
  need(end === null || end > start!,'End must follow start'); need(end === null || end <= Date.now()+60000,'Time cannot end in the future')
  const timezone = zone(input.timezone)
  await assertTimeUnlocked(env,tx,[dateOnly?date(input.workDate):workDate(start!,timezone)])
  return tx.record('time',{engagementId:e.id,personId:person.id,taskId:task.id,service:text(input.service,'Service'),notes:String(input.notes ?? '').slice(0,4000),billable:flag(input.billable),start,end,durationSeconds:dateOnly ? integer(input.durationSeconds,'Actual duration seconds',1,86400) : end === null ? null : Math.round((end-start!)/1000),timezone,workDate:dateOnly ? date(input.workDate) : workDate(start!,timezone),status:'draft',source:old?.value.source ?? null},old)
 }
 const row = await get(env,'time',text(input.id,'Entry')); need(row.revision === input.revision,'Entry changed; reload',409)
 await assertTimeUnlocked(env,tx,[row.value.workDate])
 const v = {...row.value}; const manage = ['time:approve','time:return','time:correct'].includes(action)
 const e = await access(env,a,v.engagementId,manage); tx.observe('engagements',e)
 if (!manage) need(finance(a) || a.personId === v.personId,'Only your own entry',403)
 if (action === 'timer:stop') { need(v.start !== null && v.end === null,'Timer already stopped',409); v.end=Date.now(); v.durationSeconds=Math.round((v.end-v.start)/1000); need(v.end>v.start,'Timer has no elapsed duration') }
 if (action === 'time:submit') { need(v.durationSeconds > 0 && ['draft','returned'].includes(v.status),'Stop the timer and save a draft first'); v.status='submitted' }
 if (action === 'time:return') { need(v.status === 'submitted','Only submitted time can be returned'); v.status='returned'; v.reviewNote=text(input.reason,'Return reason') }
 if (action === 'time:approve') { need(v.status === 'submitted','Approve the exact submitted revision'); v.economics=await snapshotRates(env,tx,row); v.status='approved'; v.approvedBy=a.session.operator.id; v.approvedAt=Date.now() }
 if (action === 'time:correct') { need(v.status === 'approved','Only approved entries need audited correction'); v.status='returned'; v.reviewNote=text(input.reason,'Correction reason'); delete v.economics; delete v.approvedBy; delete v.approvedAt }
 return tx.record('time',v,row,undefined,action)
}
