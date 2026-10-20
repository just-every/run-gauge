import { type Kind, type Row, type Value, need } from './model'
import type { Alternative } from './project-scenario-effects'

const before = (day: string) => new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)
export function staffingAlternative(data: Record<Kind, Row[]>, change: Value, asOf: string): Alternative {
 const row = data.staffing.find(s => s.id === change.id)
 need(row && row.revision === change.revision, 'Staffing changed; prepare a new scenario', 409)
 const v = row.value
 need(data.people.some(p => p.id === change.personId), 'Replacement person not found', 404)
 need(change.personId !== v.personId, 'Choose a different replacement person')
 need(change.effectiveFrom > asOf && change.effectiveFrom >= v.from && change.effectiveFrom <= v.to, 'Replace only future dates inside the booking', 409)
 const latest = data.deliveryPlans.filter(p => p.value.engagementId === v.engagementId).at(-1)
 need(!latest?.value.schedule.nodes.some((n: Value) => n.staffingIds.includes(row.id)), 'Booking belongs to an approved delivery baseline; use the delivery schedule door first', 409)
 const future = { ...v, personId: change.personId, from: change.effectiveFrom }
 const values = change.effectiveFrom === v.from ? [future] : [{ ...v, to: before(change.effectiveFrom) }, future]
 return { effects: values.map((value, i) => ({ kind: 'staffing', source: i ? undefined : row, value })), engagementIds: [v.engagementId], peopleIds: [v.personId, change.personId], dates: [change.effectiveFrom, v.to], details: { type: 'staffing', ...change } }
}
