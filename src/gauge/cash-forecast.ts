import { projectBillingData } from './consolidated-billing'
import { capBalances } from './budget-caps'
import { retainerConsumption } from './retainer-consumption'
import { retainerIssueDate } from './retainer-schedule'
import { retainerFees } from './retainer-fees'
import { type Row, sum } from './model'
import { liveInvoices } from './invoice-standing'
import type { financeForecast } from './finance-forecast'

// FINANCE-002 / FINANCE-009 / FINANCE-010 revenue and expected cash by month, on the FINANCE-006 / FINANCE-018 / FINANCE-019 revenue basis and the FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022 cash basis for the
// records that exist today. Unissued hourly fees, retainer overages and billable expenses are invoiced monthly in arrears on
// the 1st of the next month; an approved fixed-fee milestone on its due date. Issued invoices replace their source schedule
// once, use their immutable actual issue/due dates, and deduct user-recorded receipts and issued credit notes (INVOICE-004 / INVOICE-013 / INVOICE-014)
// dated through the as-of day. A void dated through the as-of day removes its invoice; its reissue is a separate invoice,
// and the original lines still leave the schedule once, so written-down amounts are never expected again.
// Unissued receipt = invoice date + the client's payment terms (Net N days, "Net 30 assumed" while unset);
// an approved per-client days late adds the "historical timing" date; a date before the as-of day is placed in the as-of month
// and flagged past due, never in a past month. Expected cash = open amount × collection probability, round half up to the cent.
export const cashLabels = { issued: 'None issued', pending: 'No payments recorded', settled: 'No payments recorded', onTerms: 'on terms', historical: 'historical timing', pretax: 'pre-tax', collection: 'collection probability' }
type Forecast = ReturnType<typeof financeForecast>
const DAY = 86400000
const addDays = (day: string, days: number) => new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10)
const nextMonthStart = (month: string) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10) }
type CashMonth = { currency: string, month: string, revenueMinor: number, tentativeMinor: number, pipelineMinor: number, invoicesMinor: number, openMinor: number, expectedMinor: number, historicalOpenMinor: number, historicalExpectedMinor: number, pastDueMinor: number, engagements: string[] }
type ScheduledInvoice = { source: string, revenueMonth: string | null, invoiceDate: string, amountMinor: number, openMinor: number, issued: boolean, invoiceSnapshot: Row | null, promiseSnapshot?: Row, promised?:boolean, paymentSnapshots: Row[], creditSnapshots?: Row[], creditedMinor?: number, disputedMinor?: number, disputeSnapshot?: Row, assumption?: string }
const percentOf = (minor: number, percent: number) => Number((BigInt(minor) * BigInt(percent) + 50n) / 100n)

export function cashForecast(data: Record<string, Row[]>, forecast: Forecast) {
 const caps=capBalances(data)
 const balances=retainerConsumption({retainers:data.retainers??[],retainerPeriods:data.retainerPeriods??[],time:data.time??[],retainerCloses:data.retainerCloses??[],retainerAdjustments:data.retainerAdjustments??[]})
 const asOf = forecast.asOf, clients = new Map((data.clients ?? []).map(c => [c.id, c]))

 const place = (day: string) => (day < asOf ? asOf : day).slice(0, 7)
 const engagements = forecast.engagements.map(f => {
  // The client's finance-set Net N is used when set; "Net 30 assumed" appears only while it is unset (SETUP-002 / SETUP-007 / SETUP-008).
  const e = data.engagements.find(r => r.id === f.engagementId)!, client = clients.get(e.value.clientId), set = client?.value.paymentTermsDays ?? null, terms: number = set ?? 30
  const daysLate = client?.value.daysLate ?? null, percent = client?.value.collectionPercent ?? 100
  const incomplete = [...f.incomplete], sources = { ...f.sources, clients: client ? [client.id] : [], milestones: [...(f.sources.milestones ?? [])], invoices: [] as string[], payments: [] as string[], invoiceCorrections: [] as string[], fixedCharges: [] as string[],timeSlices:(data.timeSlices??[]).filter(s=>s.value.engagementId===e.id).map(s=>s.id),capWriteDowns:(data.capWriteDowns??[]).filter(s=>s.value.engagementId===e.id).map(s=>s.id),retainerSchedules:[] as string[],retainerCharges:[] as string[] }
  const billing=projectBillingData(data,e.id,asOf),actualInvoices=billing.invoices.filter(i=>i.value.issueDate<=asOf),receipts=billing.payments.filter(p=>p.value.date<=asOf),live=new Map(liveInvoices(billing,asOf).map(s=>[s.invoice.id,s]))
  const issuedMilestones = new Set<string>(), billedByMonth = new Map<string, number>()
  for (const invoice of actualInvoices.filter(i => !i.value.reissueOf)) for (const line of invoice.value.lines) {
   if(line.kind==='timeSlices'){const slice=(data.timeSlices??[]).find(s=>s.id===line.sourceId);const sourceDate=line.sourceDate??slice?.value.date;if(sourceDate){const month=sourceDate.slice(0,7);billedByMonth.set(month,sum([billedByMonth.get(month)??0,line.amountMinor]))}continue}
   if (line.kind === 'milestones' || line.kind === 'fixedCharges' || line.kind === 'retainerCharges' || line.kind === 'retainerPeriods') { issuedMilestones.add(line.sourceId); continue }
   // The issue command supports only hourly time, reimbursable expenses and fixed-fee milestones.
   // Prefer the frozen source date on the invoice over the current source revision.
   const source = (data[line.kind] ?? []).find(r => r.id === line.sourceId)
   const sourceDate = line.sourceDate ?? (line.kind === 'time' ? source?.value.workDate : line.kind === 'expenses' ? source?.value.date : null)
   if (!['time', 'expenses'].includes(line.kind) || !sourceDate) {
    incomplete.push(`invoices:${invoice.id}: source date unavailable for ${line.kind}:${line.sourceId}`)
    continue
   }
   if(line.kind==='time' && !['hourly','mixed'].includes(f.basis)) continue
   const month = sourceDate.slice(0, 7)
   billedByMonth.set(month, sum([billedByMonth.get(month) ?? 0, line.amountMinor]))
  }
  // Expected invoices: milestones on their due dates; every other committed fee of a month on the 1st of the next month.
  const invoices: ScheduledInvoice[] = []
  const schedule = (source: string, revenueMonth: string, invoiceDate: string, amountMinor: number, assumption?: string) => invoices.push({ source, revenueMonth, invoiceDate, amountMinor, openMinor: amountMinor, issued: false, invoiceSnapshot: null, paymentSnapshots: [], ...(assumption ? { assumption } : {}) })
  const milestones = ['fixed','mixed'].includes(f.basis) ? (data.milestones ?? []).filter(m => m.value.engagementId === e.id && m.value.status === 'approved') : []
  for (const m of milestones) { if (!sources.milestones.includes(m.id)) sources.milestones.push(m.id); if (!issuedMilestones.has(m.id)) schedule(`milestones:${m.id}`, m.value.due.slice(0, 7), m.value.due, m.value.amountMinor) }
  for (const charge of (data.fixedCharges??[]).filter(c=>c.value.engagementId===e.id&&c.value.status==='approved')) {
   (sources.fixedCharges??=[]).push(charge.id)
   if (!issuedMilestones.has(charge.id)) schedule(`fixedCharges:${charge.id}`,charge.value.date.slice(0,7),charge.value.date,charge.value.amountMinor)
  }
  if(f.basis==='retainer')for(const fee of retainerFees(data,asOf).filter(p=>p.engagementId===e.id&&p.totalMinor!==null)){
   const period=data.retainerPeriods.find(p=>p.id===fee.periodId)!,configured=(data.retainerSchedules??[]).find(s=>s.value.rootId===period.value.rootId&&period.value.activeStart>=s.value.from)
   const charge=(data.retainerCharges??[]).find(c=>c.value.periodId===fee.periodId)
   if(configured)sources.retainerSchedules.push(configured.id);if(charge)sources.retainerCharges.push(charge.id)
   if(!charge||!issuedMilestones.has(charge.id))schedule(`retainerPeriods:${fee.periodId}`,fee.periodStart.slice(0,7),charge?.value.date??(configured?retainerIssueDate(period,configured.value.basis):fee.activeStart),fee.totalMinor!,configured?'Contractual retainer schedule; not issued':'Assumed in advance on active period start, not issued; RETAINER-005 sets the schedule')
  }
  const periodOverages=f.basis==='retainer'?balances.filter(b=>b.engagementId===e.id&&b.overageMinor>0):[]
  for(const balance of periodOverages){
   const period=data.retainerPeriods.find(p=>p.id===balance.periodId)!,policy=(data.retainerSchedules??[]).find(s=>s.value.rootId===period.value.rootId)
   if(policy&&!sources.retainerSchedules.includes(policy.id))sources.retainerSchedules.push(policy.id)
   if(issuedMilestones.has(period.id))continue
   const held=policy?.value.heldPeriodIds.includes(period.id)
   invoices.push({source:`retainerPeriods:${period.id}:overage`,revenueMonth:period.value.periodEnd.slice(0,7),invoiceDate:addDays(period.value.periodEnd,1),amountMinor:balance.overageMinor,openMinor:held?0:balance.overageMinor,issued:false,invoiceSnapshot:null,paymentSnapshots:[],...(held?{disputedMinor:balance.overageMinor,assumption:'Disputed retainer overage held; not expected as cash'}:{})})
  }
  for (const month of f.months) {
   const cap=caps.find(c=>c.engagementId===e.id),held=cap?sum(cap.rows.filter(r=>r.workDate.slice(0,7)===month.month).map(r=>r.heldMinor??0)):0,written=sum((data.capWriteDowns??[]).filter(w=>w.value.engagementId===e.id&&w.value.status==='approved'&&w.value.sourceSnapshot.value.workDate.slice(0,7)===month.month).map(w=>w.value.amountMinor))
   const cycle = month.committedFeesMinor - held - written - month.periodFeesMinor - sum(periodOverages.filter(b=>data.retainerPeriods.find(p=>p.id===b.periodId)!.value.periodEnd.slice(0,7)===month.month).map(b=>b.overageMinor)) - sum(milestones.filter(m => m.value.due.slice(0, 7) === month.month).map(m => m.value.amountMinor)) - (billedByMonth.get(month.month) ?? 0)
   if (cycle) schedule(`cycle:${month.month}`, month.month, nextMonthStart(month.month), cycle)
  }
  for (const invoice of actualInvoices) {
   const standing = live.get(invoice.id)
   if (!standing) { sources.invoiceCorrections.push(...(data.invoiceCorrections ?? []).filter(c => c.value.invoiceId === invoice.id && c.value.type === 'void' && c.value.status === 'issued').map(c => c.id)); continue }
   const payments = receipts.filter(p => p.value.invoiceId === invoice.id)
   sources.invoices.push(invoice.id); sources.payments.push(...payments.map(p => p.id)); sources.invoiceCorrections.push(...standing.credits.map(c => c.id))
   const paidMinor = sum(payments.map(p => p.value.amountMinor))
   const openMinor=invoice.value.totalMinor-paidMinor-standing.creditedMinor
   const promise=(billing.paymentPromises??[]).filter(p=>p.value.invoiceId===invoice.id).at(-1)
   // INVOICE-006 / INVOICE-015 / INVOICE-016 / INVOICE-017/FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022: a standing dispute is listed apart and never expected as cash until it is resolved.
   const dispute=(billing.invoiceDisputes??[]).filter(x=>x.value.invoiceId===invoice.id&&x.value.openedDate<=asOf&&(x.value.status==='open'||x.value.resolvedDate>asOf)).at(-1)
   const disputed=dispute?Math.min(openMinor,dispute.value.amountMinor):0
   const promised=promise?Math.min(openMinor-disputed,promise.value.amountMinor):0
   if(promised)invoices.push({source:`invoices:${invoice.id}:promise`,revenueMonth:null,invoiceDate:invoice.value.issueDate,amountMinor:0,openMinor:promised,issued:true,invoiceSnapshot:invoice,promiseSnapshot:promise,promised:true,paymentSnapshots:[]})
   invoices.push({ source: `invoices:${invoice.id}`, revenueMonth: null, invoiceDate: invoice.value.issueDate, amountMinor: invoice.value.totalMinor,
    openMinor: openMinor-promised-disputed, issued: true, invoiceSnapshot: invoice, paymentSnapshots: payments, creditSnapshots: standing.credits, creditedMinor: standing.creditedMinor, disputedMinor: disputed, ...(disputed?{disputeSnapshot:dispute}:{}) })
  }
  const items = invoices.map(x => {
   const receiptDate = x.promiseSnapshot?.value.date ?? x.invoiceSnapshot?.value.dueDate ?? addDays(x.invoiceDate, terms), historicalDate = x.promised ? receiptDate : daysLate === null ? null : addDays(receiptDate, daysLate)
   return { ...x, invoiceId: x.invoiceSnapshot?.id ?? null, paidMinor: x.promised?0:sum(x.paymentSnapshots.map(p=>p.value.amountMinor)), invoiceMonth: x.invoiceDate.slice(0, 7), receiptDate, cashMonth: place(receiptDate), pastDue: x.openMinor > 0 && receiptDate < asOf, historicalDate, historicalMonth: historicalDate && place(historicalDate), collectionPercent: percent, expectedMinor: percentOf(x.openMinor, percent) }
  }).sort((x, y) => x.invoiceDate.localeCompare(y.invoiceDate) || x.source.localeCompare(y.source))
  return { engagementId: e.id, name: e.value.name, clientId: e.value.clientId, currency: f.currency, basis: f.basis, paymentTermsDays: terms, termsLabel: set === null ? 'Net 30 assumed' : `Net ${terms}`, daysLate, daysLateApprovedBy: client?.value.daysLateApprovedBy ?? null, collectionPercent: percent,
   bookedRevenueMinor: f.actualFeesMinor, backlogMinor: f.eacFeesMinor - f.actualFeesMinor, items, complete: incomplete.length === 0, incomplete: [...new Set(incomplete)], sources }
 })
 // Per currency and month: committed revenue (FINANCE-006 / FINANCE-018 / FINANCE-019), expected invoices, and cash on terms and at historical timing.
 const months: Record<string, Record<string, CashMonth>> = {}
 const at = (currency: string, month: string) => (months[currency] ??= {})[month] ??= { currency, month, revenueMinor: 0, tentativeMinor: 0, pipelineMinor: 0, invoicesMinor: 0, openMinor: 0, expectedMinor: 0, historicalOpenMinor: 0, historicalExpectedMinor: 0, pastDueMinor: 0, engagements: [] }
 for (const f of forecast.engagements) for (const m of f.months) { const row = at(f.currency, m.month); row.revenueMinor += m.committedFeesMinor; row.tentativeMinor += m.tentativeFeesMinor }
 for (const p of forecast.pipeline) for (const m of p.months) at(p.currency, m.month).pipelineMinor += m.weightedMinor
 for (const e of engagements) for (const x of e.items) {
  at(e.currency, x.invoiceMonth).invoicesMinor += x.amountMinor
  const cash = at(e.currency, x.cashMonth); cash.openMinor += x.openMinor; cash.expectedMinor += x.expectedMinor; if (x.pastDue) cash.pastDueMinor += x.openMinor
  const late = at(e.currency, x.historicalMonth ?? x.cashMonth); late.historicalOpenMinor += x.openMinor; late.historicalExpectedMinor += x.expectedMinor
  for (const row of [cash, late]) if (!row.engagements.includes(e.engagementId)) row.engagements.push(e.engagementId)
 }
 // A month is incomplete when any engagement in its currency has an incomplete FINANCE-006 / FINANCE-018 / FINANCE-019 forecast.
 const unplaced = engagements.filter(e => !e.complete)
 const list = Object.values(months).flatMap(byMonth => Object.values(byMonth)).sort((x, y) => x.currency.localeCompare(y.currency) || x.month.localeCompare(y.month)).map(row => {
  const complete = !unplaced.some(e => e.currency === row.currency)
  return { ...row, complete, rangeLowMinor: Math.min(row.expectedMinor, row.historicalExpectedMinor), rangeHighMinor: Math.max(row.expectedMinor, row.historicalExpectedMinor) }
 })
 const issuedItems = engagements.flatMap(e => e.items.filter(i => i.issued).map(i => ({ currency: e.currency, ...i })))
 const issuedTotals = [...new Set(issuedItems.map(i => i.currency))].sort().map(currency => {
  const items = issuedItems.filter(i => i.currency === currency)
  return { currency, invoicedMinor: sum(items.map(i => i.amountMinor)), creditedMinor: sum(items.map(i => i.creditedMinor ?? 0)), paidMinor: sum(items.map(i => i.paidMinor)), disputedMinor: sum(items.map(i => i.disputedMinor ?? 0)), openMinor: sum(items.map(i => i.openMinor + (i.disputedMinor ?? 0))) }
 })
 const paymentTotals = issuedTotals.filter(t => issuedItems.some(i => i.currency === t.currency && i.paymentSnapshots.length)).map(t => ({ currency: t.currency, amountMinor: t.paidMinor }))
 const processor=(data.processorPayments??[]).filter(p=>new Date(p.value.lastReadAt??p.value.recordedAt??0).toISOString().slice(0,10)<=asOf)
 const pending=[...new Set(processor.map(p=>p.value.currency))].map(currency=>({currency,amountMinor:sum(processor.filter(p=>p.value.currency===currency).map(p=>p.value.pendingMinor??0))})).filter(p=>p.amountMinor>0)
 const settled=[...new Set(processor.map(p=>p.value.currency))].map(currency=>({currency,amountMinor:sum(processor.filter(p=>p.value.currency===currency).map(p=>(p.value.allocatedMinor??0)+(p.value.unappliedMinor??0)))})).filter(p=>p.amountMinor>0)
 const manualTotals=issuedTotals.map(t=>({currency:t.currency,amountMinor:sum((data.payments??[]).filter(p=>p.value.currency===t.currency&&p.value.source!=='stripe'&&p.value.date<=asOf).map(p=>p.value.amountMinor))})).filter(t=>t.amountMinor>0)
 const format = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`
 return { asOf, labels: cashLabels, processorPendingTotals:pending, processorSettledTotals:settled, engagements, months: list, issuedTotals, paymentTotals,
  issuedReceivables: issuedTotals.length ? issuedTotals.map(t => `${format(t.openMinor, t.currency)} open${t.disputedMinor ? ` (${format(t.disputedMinor, t.currency)} disputed, not expected as cash)` : ''}`).join('; ') : cashLabels.issued,
  recordedCash: manualTotals.length ? `${manualTotals.map(t => format(t.amountMinor, t.currency)).join('; ')} user-recorded receipts; not processor-verified or settled` : cashLabels.pending,
  pendingCash: pending.length ? pending.map(p=>format(p.amountMinor,p.currency)+' processor pending').join('; ') : paymentTotals.length ? 'No processor-pending cash recorded; manual receipts are user-recorded' : cashLabels.pending,
  settledCash: settled.length ? settled.map(p=>format(p.amountMinor,p.currency)+' processor settled').join('; ') : paymentTotals.length ? 'No processor-verified settlement; manual receipts are user-recorded' : cashLabels.settled }
}
