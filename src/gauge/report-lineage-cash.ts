import { Lineage } from './report-lineage-shared'

const formulas: Record<string, [string, string]> = {
 invoicesMinor: ['Expected and issued invoices', 'SUM(issued amounts by actual issue date plus remaining unissued amounts by expected invoice date). Issued invoices through the as-of day replace the corresponding source schedule once: hourly time and expenses leave their source work/date month; fixed milestones and deposit/progress charges leave their own schedule. Unissued milestones use their due date; other monthly fees use the 1st of the next month; recorded retainer fees use the frozen charge date or contractual advance/arrears policy, with active-start assumption only while unconfigured; disputed overages stay held and issued fee/overage sources leave the schedule once. Pre-tax, source currency.'],
 expectedMinor: ['Expected cash on terms', 'SUM(round-half-up(open amount × applied invoice override or client collection probability / 100)) by receipt month. Issued receipt date is the immutable invoice due date; open amount is invoice total less user-recorded receipts and issued credit notes dated through the as-of day, and less any standing dispute (listed apart, never expected as cash until resolved) (an invoice voided by then is excluded; its reissue is its own invoice), without a processor-verification or settlement claim. Unissued receipt = expected invoice date + client payment terms days (Net 30 assumed while unset). Future-dated issues and payments are excluded until their date. A receipt before the as-of day is placed in the as-of month, flagged past due if still open.'],
 historicalExpectedMinor: ['Expected cash at historical timing', 'As expected cash on terms, with each receipt date moved by the client\'s approved average days late; equal to on-terms where none is approved.'],
}
/** FINANCE-002: each cash month links to its schedule, terms, days-late value, probability and as-of day. */
export function cashLineage(c: Lineage) {
 const cash = c.report.cash
 if (!cash) return
 for (const row of cash.months) {
  for (const [field, [label, formula]] of Object.entries(formulas)) {
   const e = c.evidence()
   for (const x of cash.engagements.filter((x: any) => x.currency === row.currency)) {
    const items = x.items.filter((i: any) => (field === 'invoicesMinor' ? i.invoiceMonth : field === 'expectedMinor' ? i.cashMonth : i.historicalMonth ?? i.cashMonth) === row.month)
    if (!items.length && x.complete) continue
    c.row(e, 'engagements', x.engagementId); c.row(e, 'clients', x.clientId)
    for (const i of items) {
     if (i.assumptionSnapshot) e.sources.push({kind:'cashAssumptions',...i.assumptionSnapshot})
     if (i.decisionSnapshot) e.sources.push({kind:'cashAssumptions',...i.decisionSnapshot})
     if (i.staleAssumption) e.sources.push({kind:'cashAssumptions',...i.staleAssumption})
     if (i.promiseSnapshot)c.row(e,'paymentPromises',i.promiseSnapshot.id)
     if (i.disputeSnapshot) e.sources.push({ kind: 'invoiceDisputes', ...i.disputeSnapshot })
     if (i.invoiceSnapshot) {
      // The cash calculation carries the immutable records it actually used. Include those exact
      // snapshots, rather than reconstructing the invoice or its receipts from mutable sources.
      e.sources.push({ kind: 'invoices', ...i.invoiceSnapshot })
      for (const payment of i.paymentSnapshots) e.sources.push({ kind: 'payments', ...payment })
      for (const credit of i.creditSnapshots ?? []) e.sources.push({ kind: 'invoiceCorrections', ...credit })
      c.row(e, 'packets', i.invoiceSnapshot.value.packetId)
      for (const line of i.invoiceSnapshot.value.lines) c.row(e, line.kind, line.sourceId)
     } else {
      const [kind, id] = i.source.split(':')
      if (kind === 'milestones' || kind === 'fixedCharges') c.row(e, kind, id)
      else for (const [k, ids] of Object.entries(x.sources as Record<string, string[]>)) if (!['milestones', 'clients', 'payments'].includes(k)) for (const rowId of ids) c.row(e, k, rowId)
     }
    }
    e.unknown.push(...x.incomplete)
   }
   c.add(`cash:${row.currency}:${row.month}:${field}`, `${label}, ${row.month}`, row[field], 'minor', `${formula} As of ${cash.asOf}.`, e, row.currency, row[field])
  }
 }
 for (const row of c.report.cashConverted ?? []) {
  const evidence = (historical: boolean) => {
   const e = c.evidence(), curve = historical ? row.historical : row
   for (const placement of curve.placements) {
    const native = c.figures.find(f => f.id === `cash:${placement.currency}:${row.month}:${historical ? 'historicalExpectedMinor' : 'expectedMinor'}`)
    if (native) { e.sources.push(...native.sources); e.unknown.push(...native.unknownSources) }
    c.row(e, 'fxRates', placement.rateId)
    if (placement.convertedMinor === null) e.unknown.push(`${placement.currency}: no approved exchange rate on ${placement.day} for ${placement.source}`)
   }
   for (const currency of curve.unknownCurrencies) e.unknown.push(`${currency}: cash forecast incomplete`)
   return e
  }
  for (const historical of [false, true]) {
   const field = historical ? 'historicalExpectedMinor' : 'expectedMinor', curve = historical ? row.historical : row
   c.add(`cashConverted:${row.reportingCurrency}:${row.month}:${field}`, `Expected cash ${historical ? 'at historical timing' : 'on terms'} in ${row.reportingCurrency}, ${row.month}`, curve.minor, 'minor',
    `SUM(each source expected cash × approved exchange rate effective on its ${historical ? 'historical timing' : 'on-terms'} receipt date, or ${cash.asOf} when past due), round half up to the cent per source. Source currencies, exact receipt dates and rate revisions remain in the report snapshot.`, evidence(historical), row.reportingCurrency, curve.knownMinor)
  }
  for (const field of ['rangeLowMinor', 'rangeHighMinor']) {
   const e = evidence(false), late = evidence(true); e.sources.push(...late.sources); e.unknown.push(...late.unknown)
   c.add(`cashConverted:${row.reportingCurrency}:${row.month}:${field}`, `Expected cash range ${field === 'rangeLowMinor' ? 'lower' : 'upper'} bound, ${row.month}`, row[field], 'minor',
    `${field === 'rangeLowMinor' ? 'MIN' : 'MAX'}(converted on-terms cash, converted historical-timing cash). Convert the two curves on their own dates before comparing; withhold the range when either curve is incomplete.`, e, row.reportingCurrency)
  }
 }
}
