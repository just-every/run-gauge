import { retainerFees } from './retainer-fees'
import { type Row, sum } from './model'
import type { financeForecast } from './finance-forecast'

// FINANCE-002 revenue and expected cash by month, on the FINANCE-006 revenue basis and the FINANCE-007 cash basis for the
// records that exist today. Nothing is issued (INVOICE-001) and no payment is recorded (INVOICE-006, PAYMENT-001/002), so every
// amount is unissued: hourly fees, retainer overages and billable expenses are invoiced monthly in arrears on the 1st of the
// next month; an approved fixed-fee milestone on its due date. Receipt = invoice date + the client's payment terms (Net N days, "Net 30
// assumed" while unset);
// an approved per-client days late adds the "historical timing" date; a date before the as-of day is placed in the as-of month
// and flagged past due, never in a past month. Expected cash = open amount × collection probability, round half up to the cent.
export const cashLabels = { issued: 'None issued', pending: 'No payments recorded', settled: 'No payments recorded', onTerms: 'on terms', historical: 'historical timing', pretax: 'pre-tax', collection: 'collection probability' }
type Forecast = ReturnType<typeof financeForecast>
const DAY = 86400000
const addDays = (day: string, days: number) => new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10)
const nextMonthStart = (month: string) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10) }
type CashMonth = { currency: string, month: string, revenueMinor: number, tentativeMinor: number, pipelineMinor: number, invoicesMinor: number, openMinor: number, expectedMinor: number, historicalOpenMinor: number, historicalExpectedMinor: number, pastDueMinor: number, engagements: string[] }
const percentOf = (minor: number, percent: number) => Number((BigInt(minor) * BigInt(percent) + 50n) / 100n)

export function cashForecast(data: Record<string, Row[]>, forecast: Forecast) {
 const asOf = forecast.asOf, clients = new Map((data.clients ?? []).map(c => [c.id, c]))
 const place = (day: string) => (day < asOf ? asOf : day).slice(0, 7)
 const engagements = forecast.engagements.map(f => {
  // The client's finance-set Net N is used when set; "Net 30 assumed" appears only while it is unset (SETUP-002).
  const e = data.engagements.find(r => r.id === f.engagementId)!, client = clients.get(e.value.clientId), set = client?.value.paymentTermsDays ?? null, terms: number = set ?? 30
  const daysLate = client?.value.daysLate ?? null, percent = client?.value.collectionPercent ?? 100
  const incomplete = [...f.incomplete], sources = { clients: client ? [client.id] : [], milestones: [] as string[], ...f.sources }
  // Expected invoices: milestones on their due dates; every other committed fee of a month on the 1st of the next month.
  const invoices: { source: string, revenueMonth: string, invoiceDate: string, amountMinor: number, assumption?:string }[] = []
  const milestones = f.basis === 'fixed' ? (data.milestones ?? []).filter(m => m.value.engagementId === e.id && m.value.status === 'approved') : []
  for (const m of milestones) { sources.milestones.push(m.id); invoices.push({ source: `milestones:${m.id}`, revenueMonth: m.value.due.slice(0, 7), invoiceDate: m.value.due, amountMinor: m.value.amountMinor }) }
  if(f.basis==='retainer')for(const fee of retainerFees(data,asOf).filter(p=>p.engagementId===e.id&&p.totalMinor!==null)){
   invoices.push({source:`retainerPeriods:${fee.periodId}`,revenueMonth:fee.periodStart.slice(0,7),invoiceDate:fee.activeStart,amountMinor:fee.totalMinor!,assumption:'Assumed in advance on active period start, not issued; RETAINER-005 sets the schedule'})
  }
  for (const month of f.months) {
   const cycle = month.committedFeesMinor - month.periodFeesMinor - sum(milestones.filter(m => m.value.due.slice(0, 7) === month.month).map(m => m.value.amountMinor))
   if (cycle) invoices.push({ source: `cycle:${month.month}`, revenueMonth: month.month, invoiceDate: nextMonthStart(month.month), amountMinor: cycle })
  }
  const items = invoices.map(x => {
   const receiptDate = addDays(x.invoiceDate, terms), historicalDate = daysLate === null ? null : addDays(receiptDate, daysLate)
   return { ...x, invoiceMonth: x.invoiceDate.slice(0, 7), receiptDate, cashMonth: place(receiptDate), pastDue: receiptDate < asOf, historicalDate, historicalMonth: historicalDate && place(historicalDate), collectionPercent: percent, expectedMinor: percentOf(x.amountMinor, percent) }
  }).sort((x, y) => x.invoiceDate.localeCompare(y.invoiceDate) || x.source.localeCompare(y.source))
  return { engagementId: e.id, name: e.value.name, clientId: e.value.clientId, currency: f.currency, basis: f.basis, paymentTermsDays: terms, termsLabel: set === null ? 'Net 30 assumed' : `Net ${terms}`, daysLate, daysLateApprovedBy: client?.value.daysLateApprovedBy ?? null, collectionPercent: percent,
   bookedRevenueMinor: f.actualFeesMinor, backlogMinor: f.eacFeesMinor - f.actualFeesMinor, items, complete: incomplete.length === 0, incomplete: [...new Set(incomplete)], sources }
 })
 // Per currency and month: committed revenue (FINANCE-006), expected invoices, and cash on terms and at historical timing.
 const months: Record<string, Record<string, CashMonth>> = {}
 const at = (currency: string, month: string) => (months[currency] ??= {})[month] ??= { currency, month, revenueMinor: 0, tentativeMinor: 0, pipelineMinor: 0, invoicesMinor: 0, openMinor: 0, expectedMinor: 0, historicalOpenMinor: 0, historicalExpectedMinor: 0, pastDueMinor: 0, engagements: [] }
 for (const f of forecast.engagements) for (const m of f.months) { const row = at(f.currency, m.month); row.revenueMinor += m.committedFeesMinor; row.tentativeMinor += m.tentativeFeesMinor }
 for (const p of forecast.pipeline) for (const m of p.months) at(p.currency, m.month).pipelineMinor += m.weightedMinor
 for (const e of engagements) for (const x of e.items) {
  at(e.currency, x.invoiceMonth).invoicesMinor += x.amountMinor
  const cash = at(e.currency, x.cashMonth); cash.openMinor += x.amountMinor; cash.expectedMinor += x.expectedMinor; if (x.pastDue) cash.pastDueMinor += x.amountMinor
  const late = at(e.currency, x.historicalMonth ?? x.cashMonth); late.historicalOpenMinor += x.amountMinor; late.historicalExpectedMinor += x.expectedMinor
  for (const row of [cash, late]) if (!row.engagements.includes(e.engagementId)) row.engagements.push(e.engagementId)
 }
 // A month is incomplete when any engagement in its currency has an incomplete FINANCE-006 forecast.
 const unplaced = engagements.filter(e => !e.complete)
 const list = Object.values(months).flatMap(byMonth => Object.values(byMonth)).sort((x, y) => x.currency.localeCompare(y.currency) || x.month.localeCompare(y.month)).map(row => {
  const complete = !unplaced.some(e => e.currency === row.currency)
  return { ...row, complete, rangeLowMinor: Math.min(row.expectedMinor, row.historicalExpectedMinor), rangeHighMinor: Math.max(row.expectedMinor, row.historicalExpectedMinor) }
 })
 return { asOf, labels: cashLabels, engagements, months: list, issuedReceivables: cashLabels.issued, pendingCash: cashLabels.pending, settledCash: cashLabels.settled }
}
