import { type Row, sum } from './model'
import { retainerCovers } from './retainer-eligibility'

// REPORT-003's current native slice. WIP is billing preparation, never an issued
// receivable. Fixed fees and retainer allowances cannot be valued as hourly WIP.
export function revenueDashboard(data: Record<string, Row[]>, asOf: string) {
 const currencies = [...new Set([...data.engagements, ...data.opportunities].map(r => r.value.currency))].sort()
 const wip = currencies.map(currency => {
  const engagementIds = new Set(data.engagements.filter(r => r.value.currency === currency && r.value.type !== 'internal').map(r => r.id))
  const time = data.time.filter(r => engagementIds.has(r.value.engagementId) && r.value.status === 'approved' && r.value.workDate <= asOf && r.value.billable && !r.value.source?.billed && r.value.economics?.mode === 'hourly' && !retainerCovers(data.retainers, r.value))
  const expenses = data.expenses.filter(r => engagementIds.has(r.value.engagementId) && r.value.status === 'approved' && r.value.date <= asOf && r.value.reimbursable && !r.value.source?.billed)
  const unknownSources = time.filter(r => r.value.economics?.billMinor == null || r.value.economics.currency !== currency).map(r => `time:${r.id}`)
  for (const r of expenses) if(r.value.currency !== currency) unknownSources.push(`expenses:${r.id}`)
  const knownMinor = sum([...time.filter(r => r.value.economics?.billMinor != null && r.value.economics.currency === currency).map(r => r.value.economics.billMinor), ...expenses.filter(r => r.value.currency === currency).map(r => r.value.amountMinor)])
  return { currency, amountMinor: unknownSources.length ? null : knownMinor, knownMinor, unknownSources, sources: [...time.map(r => ({kind:'time',id:r.id})), ...expenses.map(r => ({kind:'expenses',id:r.id}))] }
 })
 return { asOf, wip, connectorState: 'Not connected; accounting freshness unverified', invoiceState: 'Invoice issuance unavailable', collectionState: 'No payment records; collections unverified', reconciliation: ['Invoice and payment reconciliation unavailable until accounting and payment connectors ship', 'Other currencies remain separate and unconverted until approved SETUP-003 exchange rates exist'] }
}
