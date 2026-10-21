import { Lineage } from './report-lineage-shared'

const formulas: Record<string, [string, string]> = {
 invoicesMinor: ['Expected and issued invoices', 'SUM(issued amounts by actual issue date plus remaining unissued amounts by expected invoice date). Issued invoices through the as-of day replace the corresponding source schedule once: hourly time and expenses leave their source work/date month; fixed milestones leave their milestone schedule. Unissued milestones use their due date; other monthly fees use the 1st of the next month; recorded retainer period fees are assumed in advance on active period start. Pre-tax, source currency.'],
 expectedMinor: ['Expected cash on terms', 'SUM(round-half-up(open amount × client collection probability / 100)) by receipt month. Issued receipt date is the immutable invoice due date; open amount is invoice total less user-recorded receipts dated through the as-of day, without a processor-verification or settlement claim. Unissued receipt = expected invoice date + client payment terms days (Net 30 assumed while unset). Future-dated issues and payments are excluded until their date. A receipt before the as-of day is placed in the as-of month, flagged past due if still open.'],
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
     if (i.promiseSnapshot)c.row(e,'paymentPromises',i.promiseSnapshot.id)
     if (i.invoiceSnapshot) {
      // The cash calculation carries the immutable records it actually used. Include those exact
      // snapshots, rather than reconstructing the invoice or its receipts from mutable sources.
      e.sources.push({ kind: 'invoices', ...i.invoiceSnapshot })
      for (const payment of i.paymentSnapshots) e.sources.push({ kind: 'payments', ...payment })
      c.row(e, 'packets', i.invoiceSnapshot.value.packetId)
      for (const line of i.invoiceSnapshot.value.lines) c.row(e, line.kind, line.sourceId)
     } else {
      const [kind, id] = i.source.split(':')
      if (kind === 'milestones') c.row(e, kind, id)
      else for (const [k, ids] of Object.entries(x.sources as Record<string, string[]>)) if (!['milestones', 'clients', 'payments'].includes(k)) for (const rowId of ids) c.row(e, k, rowId)
     }
    }
    e.unknown.push(...x.incomplete)
   }
   c.add(`cash:${row.currency}:${row.month}:${field}`, `${label}, ${row.month}`, row[field], 'minor', `${formula} As of ${cash.asOf}.`, e, row.currency, row[field])
  }
 }
}
