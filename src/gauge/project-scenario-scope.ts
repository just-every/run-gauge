import { normalizePhases } from './budget-phases'
import { estimateLineage } from './estimate-attestation'
import { type Kind, type Row, type Value, need, text, integer, money, date } from './model'
import type { Actor } from './store'
import type { Alternative, ScenarioEffect } from './project-scenario-effects'

/** Scope is a reviewed native scope/terms version plus explicit remaining work,
 * never an inferred percentage cut or a rewrite of approved actuals. */
export function scopeAlternative(data: Record<Kind, Row[]>, change: Value, asOf: string, actor: Actor): Alternative {
 const source = data.engagements.find(e => e.id === change.id)
 need(source && source.revision === change.revision, 'Engagement changed; prepare a new scenario', 409)
 const scope = text(change.scope, 'Revised scope'), effects: ScenarioEffect[] = [{kind:'engagements',source,value:{...source.value,scope}}]
 const people = new Set<string>(), dates = new Set<string>()
 const allocations = change.allocations ?? [], tasks = change.tasks ?? []
 need(Array.isArray(allocations) && allocations.length <= 50 && Array.isArray(tasks) && tasks.length <= 50, 'Use at most 50 explicit bookings and tasks')
 need(new Set(allocations.map(x => x.id)).size === allocations.length && new Set(tasks.map(x => x.id)).size === tasks.length, 'Choose each scope source once')
 const latest = data.deliveryPlans.filter(p => p.value.engagementId === source.id).at(-1)
 for (const input of allocations) {
  const row = data.staffing.find(s => s.id === input.id)
  need(row && row.revision === input.revision && row.value.engagementId === source.id, 'Scope booking changed or belongs to another engagement', 409)
  const from = date(input.effectiveFrom)
  need(from > asOf && from >= row.value.from && from <= row.value.to, 'Change only future dates inside the scope booking', 409)
  // Splitting a linked booking would invalidate its baseline source identity.
  need(from === row.value.from || !latest?.value.schedule.nodes.some((n: Value) => n.staffingIds.includes(row.id)), 'Split delivery-baseline work through its schedule door first', 409)
  const value: Value = {...row.value,from,dailySeconds:integer(input.dailySeconds,'Scope allocation seconds per day',0,86400)}
  if (input.service !== undefined) value.service = text(input.service,'Scope service',200)
  if (input.billable !== undefined) { need(typeof input.billable === 'boolean','Scope billability must be true or false'); value.billable = input.billable }
  need(source.value.type !== 'internal' || !value.billable,'Internal allocations cannot be billable')
  if(from === row.value.from) effects.push({kind:'staffing',source:row,value})
  else {
   effects.push({kind:'staffing',source:row,value:{...row.value,to:new Date(Date.parse(from)-86400000).toISOString().slice(0,10)}})
   effects.push({kind:'staffing',value})
  }
  people.add(row.value.personId); dates.add(from); dates.add(row.value.to)
 }
 for (const input of tasks) {
  const row = data.tasks.find(t => t.id === input.id)
  need(row && row.revision === input.revision && row.value.engagementId === source.id, 'Scope task changed or belongs to another engagement', 409)
  need(row.value.status !== 'done' && row.value.from > asOf, 'Change remaining effort only on future open tasks', 409)
  effects.push({kind:'tasks',source:row,value:{...row.value,remainingSeconds:integer(input.remainingSeconds,'Remaining scope seconds')}})
  dates.add(row.value.from); if(row.value.to)dates.add(row.value.to)
 }
 if(change.terms !== undefined) {
  const t = change.terms
  need(t && typeof t === 'object' && !Array.isArray(t),'Provide replacement terms')
  need(source.value.type !== 'internal' && ['hourly','fixed'].includes(t.mode),'Choose hourly or fixed client terms')
  need(t.currency === undefined || t.currency === source.value.currency,'Terms currency differs; no implicit FX')
  const value: Value = {engagementId:source.id,currency:source.value.currency,mode:t.mode,amountMinor:money(t.amountMinor),effortSeconds:integer(t.effortSeconds,'Estimated effort seconds'),roundingSeconds:integer(t.roundingSeconds,'Billing rounding seconds',1,3600),reason:text(t.reason,'Scope terms reason'),status:'approved',createdAt:0,approvedAt:Math.max(0,...data.budgets.map(b=>b.value.approvedAt ?? 0))+1,approvedBy:actor.session.operator.id}
  const prior = data.budgets.filter(b=>b.value.engagementId===source.id&&b.value.status==='approved').sort((a,b)=>b.value.approvedAt-a.value.approvedAt)[0]
  Object.assign(value,estimateLineage(prior?.value),{notToExceed:prior?.value.notToExceed??false,phases:normalizePhases(t.phases??prior?.value.phases,value)})
  need(!value.notToExceed||t.mode==='hourly','A change order must preserve the hourly not-to-exceed policy',409)
  need(!prior || prior.value.mode===t.mode || !data.time.some(r=>r.value.engagementId===source.id&&r.value.status==='approved'),'Replacement terms cannot reclassify approved actuals into a different billing mode',409)
  const milestones = data.milestones.filter(m=>m.value.engagementId===source.id&&m.value.status==='approved')
  need(!milestones.length || (t.mode==='fixed' && value.amountMinor >= milestones.reduce((n,m)=>n+m.value.amountMinor,0)),'Replacement terms must preserve approved milestone commitments',409)
  if(t.expenseBudgetMinor !== undefined && t.expenseBudgetMinor !== '') {value.expenseBudgetMinor=money(t.expenseBudgetMinor);if(t.expenseDate)value.expenseDate=date(t.expenseDate)} else need(!t.expenseDate,'An expense date needs an expense budget')
  effects.push({kind:'budgets',value})
 }
 // Include unchanged bookings too: descriptive/terms-only changes still show
 // the project's dated capacity and pricing without inventing allocations.
 for(const row of data.staffing.filter(s=>s.value.engagementId===source.id&&s.value.to>asOf)) {
  people.add(row.value.personId);dates.add(row.value.from>asOf?row.value.from:new Date(Date.parse(asOf)+86400000).toISOString().slice(0,10));dates.add(row.value.to)
 }
 return {effects,engagementIds:[source.id],peopleIds:[...people],dates:[...dates],details:{type:'scope',...change}}
}
