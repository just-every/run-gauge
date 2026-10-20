import type { Bindings } from '../auth.server'
import { canonicalJson } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, need, text } from './model'
import { type Actor, type Transaction, finance } from './store'
import { deliveryPreview } from './delivery-schedule'
import type { Alternative, ScenarioEffect } from './project-scenario-effects'

/** Use the native delivery door so scenarios retain its calendar, DAG and source fences. */
export async function deadlineAlternative(env: Bindings, a: Actor, data: Record<Kind, Row[]>, change: Value, asOf: string, tx?: Transaction): Promise<Alternative> {
 need(finance(a), 'Financial scenarios require finance or owner access', 403)
 const id = text(change.id, 'Delivery baseline'), revision = text(change.revision, 'Delivery baseline revision')
 const source = data.deliveryPlans.find(p => p.id === id)
 need(source && source.revision === revision, 'Delivery baseline changed; prepare a new scenario', 409)
 const engagementId = source.value.engagementId
 need(data.deliveryPlans.filter(p => p.value.engagementId === engagementId).at(-1)?.id === id, 'Choose the latest approved delivery baseline', 409)
 const preview = await deliveryPreview(env, a, { engagementId, previousId: id, revision, operation: 'delay', nodeId: change.nodeId, delayBusinessDays: change.delayBusinessDays }, tx)
 const effects: ScenarioEffect[] = []
 const peopleIds = new Set<string>(), dates = new Set<string>()
 for (const plan of [source.value.schedule, preview.schedule]) for (const node of plan.nodes) {
  dates.add(node.start); dates.add(node.end)
 }
 for (const moved of preview.changes) {
  const row = data[moved.kind].find(r => r.id === moved.id)
  need(row && canonicalJson(row.value) === canonicalJson(moved.before), 'Delivery source changed; prepare a new scenario', 409)
  const start = moved.kind === 'milestones' ? row.value.due : row.value.from
  need(typeof start === 'string' && start > asOf, 'Deadline alternatives may move only work starting after the as-of day', 409)
  if (moved.kind === 'staffing') {
   peopleIds.add(row.value.personId)
   for (const value of [row.value, moved.after]) { dates.add(value.from); dates.add(value.to) }
  }
  effects.push({ kind: moved.kind, source: row, value: moved.after })
 }
 effects.push({ kind: 'deliveryPlans', value: { engagementId, previousId: id, number: preview.number, schedule: preview.schedule, reason: 'Scenario deadline alternative', approvedBy: a.session.operator.id, approvedAt: 0 } })
 return { effects, engagementIds: [engagementId], peopleIds: [...peopleIds].sort(), dates: [...dates].sort(), details: { type: 'deadline', id, input: preview.input, schedule: preview.schedule, changes: preview.changes } as Value }
}
