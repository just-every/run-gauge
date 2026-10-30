import { type Row, sum } from './model'
import { convertDated, rateOn } from './fx-rates'
import type { cashForecast } from './cash-forecast'

/** FINANCE-007 and SETUP-005: convert each curve on its own receipt dates before
 * computing the range. A missing rate or incomplete forecast withholds the total. */
export function convertedCash(rates: Row[], cash: ReturnType<typeof cashForecast>, reporting: string) {
 const items = cash.engagements.flatMap(e => e.items.map(x => ({ source: x.source, engagementId: e.engagementId, currency: e.currency, receiptDate: x.receiptDate, historicalDate: x.historicalDate ?? x.receiptDate, minor: x.expectedMinor })))
 const unknownCurrencies = [...new Set(cash.engagements.filter(e => !e.complete).map(e => e.currency))].sort()
 const curve = (month: string, historical: boolean) => {
  const mine = items.map(i => {
   const receiptDate = historical ? i.historicalDate : i.receiptDate
   const day = receiptDate < cash.asOf ? cash.asOf : receiptDate
   return {...i, receiptDate, day}
  }).filter(i => i.day.slice(0, 7) === month && i.minor !== 0)
  const buckets = [...new Set(mine.map(i => i.currency))].sort().map(currency => {
   const dated = mine.filter(i => i.currency === currency), amountMinor = sum(dated.map(i => i.minor)), unknown = unknownCurrencies.includes(currency)
   return { currency, amountMinor, unknown, ...(currency === reporting ? { convertedMinor: amountMinor, unconvertedMinor: 0, conversions: [] } : convertDated(rates, currency, dated)) }
  })
  const placements = mine.map(i => {
   const rate = i.currency === reporting ? undefined : rateOn(rates, i.currency, i.day)
   const convertedMinor = i.currency === reporting ? i.minor : convertDated(rates, i.currency, [i]).convertedMinor
   return {source: i.source, engagementId: i.engagementId, currency: i.currency, receiptDate: i.receiptDate, day: i.day, amountMinor: i.minor, convertedMinor, rateId: rate?.id ?? null, rateRevision: rate?.revision ?? null}
  })
  const knownMinor = sum(buckets.map(b => b.convertedMinor ?? 0)), complete = unknownCurrencies.length === 0 && buckets.every(b => b.unconvertedMinor === 0)
  return { buckets, placements, knownMinor, minor: complete ? knownMinor : null, missingRates: buckets.filter(b => b.unconvertedMinor !== 0).map(b => b.currency), unknownCurrencies }
 }
 const months = items.filter(i => i.minor !== 0).flatMap(i => [i.receiptDate, i.historicalDate].map(d => (d < cash.asOf ? cash.asOf : d).slice(0, 7)))
 return [...new Set(months)].sort().map(month => {
  const onTerms = curve(month, false), historical = curve(month, true)
  const complete = onTerms.minor !== null && historical.minor !== null
  return { month, reportingCurrency: reporting, ...onTerms, historical,
   rangeLowMinor: complete ? Math.min(onTerms.minor!, historical.minor!) : null,
   rangeHighMinor: complete ? Math.max(onTerms.minor!, historical.minor!) : null }
 })
}
