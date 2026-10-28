import { type Row, sum } from './model'
import { convertDated } from './fx-rates'
import type { cashForecast } from './cash-forecast'

/** SETUP-005 / SETUP-011 / SETUP-012: expected cash on terms by month in the reporting currency. Each expected amount converts at the
 * owner-approved rate effective on the day it is expected (its receipt date, or the as-of day once past due); an
 * amount with no rate stays unconverted, and a month whose forecast is incomplete in any currency stays incomplete. */
export function convertedCash(rates: Row[], cash: ReturnType<typeof cashForecast>, reporting: string) {
 const items = cash.engagements.flatMap(e => e.items.filter(x => x.expectedMinor).map(x => ({ month: x.cashMonth, currency: e.currency, day: x.receiptDate < cash.asOf ? cash.asOf : x.receiptDate, minor: x.expectedMinor })))
 return [...new Set(items.map(i => i.month))].sort().map(month => {
  const mine = items.filter(i => i.month === month)
  const buckets = [...new Set(mine.map(i => i.currency))].sort().map(currency => {
   const dated = mine.filter(i => i.currency === currency), amountMinor = sum(dated.map(i => i.minor)), unknown = !cash.months.find(m => m.currency === currency && m.month === month)?.complete
   return { currency, amountMinor, unknown, ...(currency === reporting ? { convertedMinor: amountMinor, unconvertedMinor: 0, conversions: [] } : convertDated(rates, currency, dated)) }
  })
  const knownMinor = sum(buckets.map(b => b.convertedMinor ?? 0)), complete = buckets.every(b => !b.unknown && b.unconvertedMinor === 0)
  return { month, reportingCurrency: reporting, buckets, knownMinor, minor: complete ? knownMinor : null, missingRates: buckets.filter(b => b.unconvertedMinor > 0).map(b => b.currency) }
 })
}
