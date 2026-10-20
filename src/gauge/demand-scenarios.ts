import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, integer, money, date } from './model'
import { type Actor, Transaction, finance, get } from './store'

/**
 * RESOURCE-005 scenarios: finance prepares a what-if for one open opportunity (a delayed start, a planned hire or a
 * contractor); the owner approves the exact revision before it is compared. A scenario never writes staffing, people,
 * rates or terms, so the baseline forecast is unchanged by preparing or approving it. Approved scenarios are immutable.
 */
export async function demandScenarioCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action === 'demandScenario:approve') {
  need(a.role === 'owner', 'Only the owner approves a demand scenario', 403)
  const row = await get(env, 'demandScenarios', text(input.id, 'Scenario'))
  need(row.revision === input.revision, 'Scenario changed; reload before approving', 409)
  need(row.value.status === 'draft', 'This scenario is already approved', 409)
  return tx.record('demandScenarios', { ...row.value, status: 'approved', approvedBy: a.session.operator.id, approvedAt: Date.now() }, row, undefined, action)
 }
 if (action !== 'save:demandScenarios') return null
 need(finance(a), 'Finance prepares demand scenarios', 403)
 const previous = input.id ? await get(env, 'demandScenarios', text(input.id, 'Scenario')) : undefined
 if (previous) { need(previous.revision === input.revision, 'Scenario changed; reload before saving', 409); need(previous.value.status === 'draft', 'An approved scenario is immutable; prepare a new one', 409) }
 const opportunity = await get(env, 'opportunities', text(input.opportunityId, 'Opportunity'))
 need(!['won', 'lost'].includes(opportunity.value.stage), 'Scenarios compare open pipeline deals only', 409)
 tx.observe('opportunities', opportunity)
 const raw = input.supply, type = raw?.type ?? ''
 need(['', 'hire', 'contractor'].includes(type), 'Choose a planned hire, a contractor or no added capacity')
 const supply = type ? { type, label: text(raw.label, type === 'hire' ? 'Planned hire role' : 'Contractor', 200), from: date(raw.from), to: type === 'contractor' || raw.to ? date(raw.to) : null, dailySeconds: integer(raw.dailySeconds, 'Added capacity seconds per weekday', 1, 86400) } : null
 if (supply?.to) need(supply.to >= supply.from, 'Added capacity ends before it starts')
 return tx.record('demandScenarios', {
  opportunityId: opportunity.id, name: text(input.name, 'Scenario name', 200), delayDays: integer(input.delayDays ?? 0, 'Delay in days', 0, 366),
  costPerHourMinor: money(input.costPerHourMinor), supply, reason: text(input.reason, 'Scenario reason'), status: 'draft',
  preparedBy: a.session.operator.id, preparedAt: Date.now(),
 }, previous, undefined, previous ? 'update' : 'create')
}
