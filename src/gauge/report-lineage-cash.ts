import { Lineage } from './report-lineage-shared'

const formulas: Record<string, [string, string]> = {
 invoicesMinor: ['Expected invoices', 'SUM(unissued amounts by expected invoice date): approved fixed-fee milestones on their due date; every other FINANCE-006 committed fee of a month on the 1st of the next month (monthly in arrears). Pre-tax.'],
 expectedMinor: ['Expected cash on terms', 'SUM(round-half-up(open amount × client collection probability / 100)) by receipt month; receipt = expected invoice date + client payment terms days (Net 30 assumed while unset); a receipt before the as-of day is placed in the as-of month, flagged past due.'],
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
    for (const i of items) { const [kind, id] = i.source.split(':'); if (kind === 'milestones') c.row(e, kind, id); else for (const [k, ids] of Object.entries(x.sources as Record<string, string[]>)) if (k !== 'milestones' && k !== 'clients') for (const rowId of ids) c.row(e, k, rowId) }
    e.unknown.push(...x.incomplete)
   }
   c.add(`cash:${row.currency}:${row.month}:${field}`, `${label}, ${row.month}`, row[field], 'minor', `${formula} As of ${cash.asOf}.`, e, row.currency, row[field])
  }
 }
}
