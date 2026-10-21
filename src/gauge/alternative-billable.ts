import { type Row, type Value, sum } from './model'
import { activeRates, explain } from './rate-cards'
import { allocationPricing } from './forecast-allocation-pricing'

const DAY = 86400000

/** AGENT-002: the estimated billable value finance sees for one staffing alternative. Every day of the alternative's
 * inclusive window is priced like a FINANCE-006 allocation day (bill rate effective that day under RATE-002 precedence,
 * withdrawn cards excluded, overtime premium then write-down, round half up per day), after every other booking the
 * person already has. Internal work has no billable value; a day without a bill rate, or a rate in a currency other
 * than the engagement's, makes the figure unknown rather than zero. */
export function alternativeBillable(data: Record<string, Row[]>, engagement: Row, alternative: Value) {
 if (engagement.value.type === 'internal') return { internal: true, minor: null, currency: null, unknown: null }
 const person = data.people.find(p => p.id === alternative.personId)
 if (!person) return { internal: false, minor: null, currency: null, unknown: 'person unavailable' }
 const rates = activeRates(data.rates ?? [], data.rateWithdrawals ?? [])
 const proposed: Row = { id: 'proposed', revision: '', value: { ...alternative, engagementId: engagement.id, commitment: 'tentative' } }
 const price = allocationPricing({ ...data, staffing: [...data.staffing, proposed] }, new Date(Date.parse(alternative.from) - DAY).toISOString().slice(0, 10))
 const amounts: number[] = []
 for (let ms = Date.parse(alternative.from); ms <= Date.parse(alternative.to); ms += DAY) {
  const day = new Date(ms).toISOString().slice(0, 10), card = explain(rates, person, engagement, 'Unspecified', day).bill?.chosen
  if (card?.value.billMinor == null) return { internal: false, minor: null, currency: null, unknown: `no bill rate on ${day}` }
  if (card.value.currency !== engagement.value.currency) return { internal: false, minor: null, currency: null, unknown: `bill rate in ${card.value.currency}; SETUP-003 exchange rates convert it` }
  amounts.push(price(proposed, day, card).billMinor)
 }
 return { internal: false, minor: sum(amounts), currency: engagement.value.currency as string, unknown: null }
}
