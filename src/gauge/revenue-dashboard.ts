import { type Row, sum } from './model'
import { retainerCovers } from './retainer-eligibility'
import { invoiceStanding } from './invoice-standing'

// REPORT-003's current native slice. WIP is billing preparation, never an issued
// receivable. Fixed fees and retainer allowances cannot be valued as hourly WIP.
export function revenueDashboard(data: Record<string, Row[]>, asOf: string) {
 // Every invoice issued through the day keeps its sources out of WIP, even once voided: a void never makes work billable
 // again. Receivables count live invoices only, less issued credit notes (INVOICE-004); a reissue is its own invoice.
 const invoices = data.invoices.filter(r => r.value.issueDate <= asOf), standings = invoiceStanding(data, asOf), live = standings.filter(s => !s.voided)
 const payments = data.payments.filter(r => r.value.date <= asOf && live.some(s => s.invoice.id === r.value.invoiceId))
 const issuedSources = new Set(invoices.flatMap(i => i.value.lines.map((l: any) => `${l.kind}:${l.sourceId}`)))
 const currencies = [...new Set([...data.engagements, ...data.opportunities].map(r => r.value.currency))].sort()
 const wip = currencies.map(currency => {
  const engagementIds = new Set(data.engagements.filter(r => r.value.currency === currency && r.value.type !== 'internal').map(r => r.id))
  const time = data.time.filter(r => engagementIds.has(r.value.engagementId) && r.value.status === 'approved' && r.value.workDate <= asOf && r.value.billable && !r.value.source?.billed && !issuedSources.has(`time:${r.id}`) && r.value.economics?.mode === 'hourly' && !retainerCovers(data.retainers, r.value))
  const expenses = data.expenses.filter(r => engagementIds.has(r.value.engagementId) && r.value.status === 'approved' && r.value.date <= asOf && r.value.reimbursable && !r.value.source?.billed && !issuedSources.has(`expenses:${r.id}`))
  const unknownSources = time.filter(r => r.value.economics?.billMinor == null || r.value.economics.currency !== currency).map(r => `time:${r.id}`)
  for (const r of expenses) if(r.value.currency !== currency) unknownSources.push(`expenses:${r.id}`)
  const sliced=new Map<string,number>()
  for(const invoice of invoices.filter(i=>!i.value.reissueOf))for(const l of invoice.value.lines.filter((l:any)=>l.kind==='timeSlices')){const slice=data.timeSlices.find(s=>s.id===l.sourceId);if(slice)sliced.set(slice.value.sourceId,(sliced.get(slice.value.sourceId)??0)+l.amountMinor)}
  const knownMinor = sum([...time.filter(r => r.value.economics?.billMinor != null && r.value.economics.currency === currency).map(r => r.value.economics.billMinor-(sliced.get(r.id)??0)), ...expenses.filter(r => r.value.currency === currency).map(r => r.value.amountMinor)])
  const issued = live.filter(s => s.invoice.value.currency === currency), receipts = payments.filter(r => r.value.currency === currency)
  const invoicedMinor = sum(issued.map(s => s.invoice.value.totalMinor)), creditedMinor = sum(issued.map(s => s.creditedMinor)), paidMinor = sum(receipts.map(r => r.value.amountMinor))
  const voids = standings.filter(s => s.voided && s.invoice.value.currency === currency)
  return { currency, amountMinor: unknownSources.length ? null : knownMinor, knownMinor, unknownSources, invoicedMinor, creditedMinor, paidMinor, openMinor: sum([invoicedMinor, -creditedMinor, -paidMinor]), invoiceIds: issued.map(s => s.invoice.id), creditIds: issued.flatMap(s => s.credits.map(c => c.id)), voidIds: voids.map(s => s.voided!.id), voidedInvoiceIds: voids.map(s => s.invoice.id), paymentIds: receipts.map(r => r.id), sources: [...time.map(r => ({kind:'time',id:r.id})), ...expenses.map(r => ({kind:'expenses',id:r.id}))] }
 })
 return { asOf, wip, connectorState: 'Not connected; accounting freshness unverified', invoiceState: invoices.length ? `${live.length} native pre-tax invoices live${standings.length > live.length ? `, ${standings.length - live.length} void` : ''}; no delivery implied` : 'No invoices issued', collectionState: payments.length ? `${payments.length} user-recorded receipts; provider settlement unverified` : 'No payment records; collections unverified', reconciliation: ['Accounting and processor reconciliation unavailable until their connectors ship; recorded receipts are not provider-verified settlement', 'Other currencies remain separate and unconverted; approved exchange-rate conversion is unavailable'] }
}
