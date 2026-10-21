import { type Row, sum } from './model'
import { retainerCovers } from './retainer-eligibility'

// REPORT-003's current native slice. WIP is billing preparation, never an issued
// receivable. Fixed fees and retainer allowances cannot be valued as hourly WIP.
export function revenueDashboard(data: Record<string, Row[]>, asOf: string) {
 const invoices = data.invoices.filter(r => r.value.issueDate <= asOf)
 const payments = data.payments.filter(r => r.value.date <= asOf && invoices.some(i => i.id === r.value.invoiceId))
 const issuedSources = new Set(invoices.flatMap(i => i.value.lines.map((l: any) => `${l.kind}:${l.sourceId}`)))
 const currencies = [...new Set([...data.engagements, ...data.opportunities].map(r => r.value.currency))].sort()
 const wip = currencies.map(currency => {
  const engagementIds = new Set(data.engagements.filter(r => r.value.currency === currency && r.value.type !== 'internal').map(r => r.id))
  const time = data.time.filter(r => engagementIds.has(r.value.engagementId) && r.value.status === 'approved' && r.value.workDate <= asOf && r.value.billable && !r.value.source?.billed && !issuedSources.has(`time:${r.id}`) && r.value.economics?.mode === 'hourly' && !retainerCovers(data.retainers, r.value))
  const expenses = data.expenses.filter(r => engagementIds.has(r.value.engagementId) && r.value.status === 'approved' && r.value.date <= asOf && r.value.reimbursable && !r.value.source?.billed && !issuedSources.has(`expenses:${r.id}`))
  const unknownSources = time.filter(r => r.value.economics?.billMinor == null || r.value.economics.currency !== currency).map(r => `time:${r.id}`)
  for (const r of expenses) if(r.value.currency !== currency) unknownSources.push(`expenses:${r.id}`)
  const knownMinor = sum([...time.filter(r => r.value.economics?.billMinor != null && r.value.economics.currency === currency).map(r => r.value.economics.billMinor), ...expenses.filter(r => r.value.currency === currency).map(r => r.value.amountMinor)])
  const issued = invoices.filter(r => r.value.currency === currency), receipts = payments.filter(r => r.value.currency === currency)
  const invoicedMinor = sum(issued.map(r => r.value.totalMinor)), paidMinor = sum(receipts.map(r => r.value.amountMinor))
  return { currency, amountMinor: unknownSources.length ? null : knownMinor, knownMinor, unknownSources, invoicedMinor, paidMinor, openMinor: sum([invoicedMinor, -paidMinor]), invoiceIds: issued.map(r => r.id), paymentIds: receipts.map(r => r.id), sources: [...time.map(r => ({kind:'time',id:r.id})), ...expenses.map(r => ({kind:'expenses',id:r.id}))] }
 })
 return { asOf, wip, connectorState: 'Not connected; accounting freshness unverified', invoiceState: invoices.length ? `${invoices.length} native pre-tax invoices issued; no delivery implied` : 'No invoices issued', collectionState: payments.length ? `${payments.length} user-recorded receipts; provider settlement unverified` : 'No payment records; collections unverified', reconciliation: ['Accounting and processor reconciliation unavailable until their connectors ship; recorded receipts are not provider-verified settlement', 'Other currencies remain separate and unconverted; approved exchange-rate conversion is unavailable'] }
}
