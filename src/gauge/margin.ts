import { type Row, type Value, charge, sum } from './model'
import { explain, activeRates } from './rate-cards'
import type { financeForecast } from './finance-forecast'
import { liveInvoices } from './invoice-standing'

// FINANCE-001 actual and forecast margin per engagement, on the FINANCE-006 basis. Integer cents in the engagement currency.
// Earned value is FINANCE-006 actual fees: operational, not recognized revenue. Billed is approved billing packets net of
// approved adjustment packets: billing prepared, not invoiced (INVOICE-001 issues invoices). Credits are the negative
// adjustment deltas. No payments are recorded until INVOICE-006, so paid cash is never shown as zero.
export const marginLabels = { earned: 'Operational value, not recognized revenue', billed: 'Billing prepared, not invoiced', paid: 'No payments recorded' }
const DAY = 86400000
type Forecast = ReturnType<typeof financeForecast>

export function projectMargin(data: Record<string, Row[]>, forecast: Forecast) {
 const rates = activeRates(data.rates ?? [], data.rateWithdrawals ?? []), people = new Map((data.people ?? []).map(p => [p.id, p]))
 return forecast.engagements.map(f => {
  const e = data.engagements.find(r => r.id === f.engagementId)!, mine = (k: string) => (data[k] ?? []).filter(r => r.value.engagementId === e.id)
  const time = mine('time'), approvedTime = time.filter(r => r.value.status === 'approved'), approvedExpenses = mine('expenses').filter(r => r.value.status === 'approved')
  // A missing or other-currency cost and, on hourly terms, a missing bill amount make the actual figures unknown, naming the source.
  const costUnknown: string[] = [], feesUnknown: string[] = []
  for (const t of approvedTime) {
   const x = t.value.economics ?? {}
   if (x.costMinor == null) costUnknown.push(`time:${t.id}: frozen costMinor unknown`)
   else if ((x.costCurrency ?? x.currency) !== f.currency) costUnknown.push(`time:${t.id}: cost declared in ${x.costCurrency}; SETUP-003 exchange rates convert it`)
   if (f.basis === 'hourly' && t.value.billable && x.billMinor == null) feesUnknown.push(`time:${t.id}: frozen billMinor unknown`)
  }
  if (f.basis === 'retainer') feesUnknown.push(...f.incomplete.filter(s=>s.includes('period fee')))
  // Provisional cost: submitted, not yet approved, time at the cost rate effective on its work date, plus submitted expenses.
  const provisionalUnknown: string[] = [], provisionalSources: string[] = []
  let provisionalLaborMinor = 0, provisionalExpenseMinor = 0
  for (const t of time.filter(r => r.value.status === 'submitted')) {
   provisionalSources.push(`time:${t.id}`)
   const person = people.get(t.value.personId), x = person ? explain(rates, person, e, t.value.service ?? 'Unspecified', t.value.workDate) : undefined, cost = x?.cost?.chosen
   if (cost) provisionalSources.push(`rates:${cost.id}`)
   if (cost?.value.costMinor == null) provisionalUnknown.push(`time:${t.id}: no effective cost rate on ${t.value.workDate}`)
   else if ((cost.value.costCurrency ?? cost.value.currency) !== f.currency) provisionalUnknown.push(`time:${t.id}: cost declared in ${cost.value.costCurrency}; SETUP-003 exchange rates convert it`)
   else provisionalLaborMinor += charge(t.value.durationSeconds, cost.value.costMinor)
  }
  for (const x of mine('expenses').filter(r => r.value.status === 'submitted')) { provisionalSources.push(`expenses:${x.id}`); provisionalExpenseMinor += x.value.amountMinor }
  // Live invoices only: a void removes its original, and issued credit notes (INVOICE-004) are netted out of billed.
  const standings = liveInvoices(data, forecast.asOf).filter(s => s.invoice.value.engagementId === e.id), invoices = standings.map(s => s.invoice), invoiceCredits = standings.flatMap(s => s.credits), payments=mine('payments').filter(p=>p.value.date<=forecast.asOf&&invoices.some(i=>i.id===p.value.invoiceId))
  const packets = mine('packets').filter(p => p.value.status === 'approved'), credits = packets.filter(p => p.value.correctsPacketId && p.value.totalMinor < 0)
  const approvedExpenseMinor = sum(approvedExpenses.map(x => x.value.amountMinor)), knownApprovedCostMinor = f.actualCostMinor
  const actualUnknown = [...costUnknown, ...feesUnknown], knownActualMarginMinor = f.actualFeesMinor - knownApprovedCostMinor
  // Remaining effort: open task estimates, and committed allocation seconds after the as-of day.
  const committedFutureSeconds = sum(mine('staffing').filter(s => s.value.commitment === 'committed').map(s => {
   const from = Math.max(Date.parse(s.value.from), Date.parse(forecast.asOf) + DAY), to = Date.parse(s.value.to)
   return to < from ? 0 : ((to - from) / DAY + 1) * s.value.dailySeconds
  }))
  return {
   engagementId: e.id, name: e.value.name, currency: f.currency, basis: f.basis,
   approvedCostMinor: costUnknown.length ? null : knownApprovedCostMinor, knownApprovedCostMinor, approvedLaborCostMinor: knownApprovedCostMinor - approvedExpenseMinor, approvedExpenseCostMinor: approvedExpenseMinor, costUnknown,
   provisionalCostMinor: provisionalUnknown.length ? null : provisionalLaborMinor + provisionalExpenseMinor, knownProvisionalCostMinor: provisionalLaborMinor + provisionalExpenseMinor, provisionalLaborCostMinor: provisionalLaborMinor, provisionalExpenseCostMinor: provisionalExpenseMinor, provisionalUnknown, provisionalSources,
   earnedValueMinor: feesUnknown.length ? null : f.actualFeesMinor, knownEarnedValueMinor: f.actualFeesMinor, feesUnknown, earnedLabel: marginLabels.earned,
   billedMinor: invoices.length ? sum(standings.map(s => s.netMinor)) : sum(packets.map(p => p.value.totalMinor)), creditsMinor: sum(credits.map(p => p.value.totalMinor)), billedLabel: invoices.length ? (invoiceCredits.length ? 'Invoiced, pre-tax, net of credit notes' : 'Invoiced, pre-tax') : marginLabels.billed, invoiceCreditSources: invoiceCredits.map(c => c.id), packetSources: packets.map(p => p.id), creditSources: credits.map(p => p.id),
   invoiceSources: invoices.map(i=>i.id), paymentSources: payments.map(p=>p.id), paidCashMinor: payments.length ? sum(payments.map(p=>p.value.amountMinor)) : null, paidCashLabel: payments.length ? 'User-recorded receipts, not provider verified' : marginLabels.paid,
   remainingTaskSeconds: sum(mine('tasks').map(t => t.value.remainingSeconds ?? 0)), committedFutureSeconds,
   etcFeesMinor: f.etcFeesMinor, eacFeesMinor: f.eacFeesMinor, etcCostMinor: f.etcCostMinor, eacCostMinor: f.eacCostMinor,
   actualMarginMinor: actualUnknown.length ? null : knownActualMarginMinor, knownActualMarginMinor, actualUnknown,
   forecastMarginMinor: f.complete ? f.marginMinor : null, knownForecastMarginMinor: f.marginMinor, forecastUnknown: f.incomplete,
   complete: actualUnknown.length === 0 && f.complete,
  } satisfies Value
 })
}
