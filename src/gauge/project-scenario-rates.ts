import type { Bindings } from '../auth.server'
import { type Kind, type Row, type Value, date, need } from './model'
import { type Actor, Transaction } from './store'
import { activeRates, rateCard } from './rate-cards'
import type { Alternative } from './project-scenario-effects'

// Reuse the native rate-card validator and uniqueness guard. Scenario cards are
// append-only future versions; frozen approvals are never repriced.
export async function rateAlternative(env: Bindings, a: Actor, data: Record<Kind, Row[]>, change: Value, asOf: string, tx?: Transaction): Promise<Alternative> {
 need(change.card && typeof change.card === 'object' && !Array.isArray(change.card), 'Provide a rate card')
 const card = await rateCard(env, a, tx ?? new Transaction(env, a), change.card)
 need(card.effective > asOf, 'Scenario rates must start after the as-of day', 409)
 need(change.card.currency === undefined || change.card.currency === card.currency, 'Rate currency differs; no implicit FX')
 const keys = ['personId', 'role', 'clientId', 'engagementId', 'service', 'effective']
 need(!activeRates(data.rates, data.rateWithdrawals).some(r => keys.every(k => (r.value[k] ?? null) === (card[k] ?? null))), 'A rate already exists for that scope and date', 409)
 const people = data.people.filter(p => (!card.personId || p.id === card.personId) && (!card.role || p.value.role === card.role))
 const peopleIds = new Set(people.map(p => p.id))
 const bookings = data.staffing.filter(s => peopleIds.has(s.value.personId) && (card.service === '*' || s.value.service === card.service))
 const engagements = data.engagements.filter(e => e.value.type !== 'internal' && (!card.engagementId || e.id === card.engagementId) && (!card.clientId || e.value.clientId === card.clientId) && bookings.some(s => s.value.engagementId === e.id && s.value.to >= card.effective))
 need(engagements.every(e => e.value.currency === card.currency), 'Rate currency differs from an affected engagement; no implicit FX')
 need(engagements.length > 0, 'This rate has no matching future allocation to compare')
 const engagementIds = engagements.map(e => e.id), affected = bookings.filter(s => engagementIds.includes(s.value.engagementId) && s.value.to >= card.effective)
 return { effects: [{ kind: 'rates', value: card }], engagementIds, peopleIds: [...new Set(affected.map(s => s.value.personId))], dates: affected.flatMap(s => [s.value.from > asOf ? s.value.from : date(new Date(Date.parse(asOf) + 86400000).toISOString().slice(0, 10)), s.value.to]), details: { type: 'rate', id: change.id, card } }
}
