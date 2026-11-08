import { vendorCosts } from './vendor-commitments'
import { sum } from './model'
import { Lineage } from './report-lineage-shared'

export function economicLineage(c: Lineage) {
 for (const figure of c.report.economics) {
  const id = String(figure.engagementId), prefix = `economics:${id}:`
  const time = c.rows('time').filter(r => r.value.engagementId === id && r.value.status === 'approved')
  const expenses = c.rows('expenses').filter(r => r.value.engagementId === id && r.value.status === 'approved')
  const vendors=vendorCosts(c.report.data).filter(v=>v.commitment.value.engagementId===id),vendorSources=(e:ReturnType<Lineage['evidence']>)=>{for(const v of vendors){c.row(e,'vendorCommitments',v.commitment.id);for(const b of v.bills)c.row(e,'vendorBills',b.id)}}
  const tasks = c.rows('tasks').filter(r => r.value.engagementId === id)
  const base = () => { const e = c.evidence(); c.row(e, 'engagements', id); return e }
  if ('budgetMinor' in figure) {
   const e = base(); const budget = c.row(e, 'budgets', figure.budgetId)
   if (!budget) e.unknown.push(`engagements:${id}: no visible approved budget`)
   c.add(prefix + 'budgetMinor', 'Approved budget', figure.budgetMinor, 'minor', 'Latest approved budget by approvedAt: amountMinor; no currency conversion.', e, figure.currency)
  }
  const hours = base(); time.forEach(r => c.row(hours, 'time', r.id))
  c.add(prefix + 'approvedSeconds', 'Approved actual time', figure.approvedSeconds, 'seconds', 'SUM(approved time.durationSeconds) for this engagement; all work dates, actual seconds without billing rounding.', hours)
  const remaining = base(); tasks.forEach(r => c.row(remaining, 'tasks', r.id))
  c.add(prefix + 'remainingSeconds', 'Remaining task effort', figure.remainingSeconds, 'seconds', 'SUM(tasks.remainingSeconds) for this engagement.', remaining)
  if ('costMinor' in figure) {
   // Declared costs keep their own currency: only the engagement-currency bucket is summed here; other buckets are reported apart.
   const own = (r: any) => (r.value.economics.costCurrency ?? r.value.economics.currency) === figure.currency
   const known = time.filter(r => r.value.economics?.costMinor != null), same = known.filter(own), other = known.filter(r => !own(r))
   const e = base(); time.forEach(r => c.timeEvidence(e, r)); expenses.forEach(r => c.row(e, 'expenses', r.id)); vendorSources(e)
   time.filter(r => r.value.economics?.costMinor == null).forEach(r => e.unknown.push(`time:${r.id}: frozen costMinor unknown`))
   for (const id of figure.missingCostSources ?? []) { c.row(e, 'time', id); e.unknown.push(`time:${id}: frozen costMinor unknown`) }
   other.forEach(r => e.unknown.push(`time:${r.id}: cost declared in ${r.value.economics.costCurrency}; not summed with ${figure.currency} without SETUP-003 exchange rates`))
   const total = sum([...same.map(r => r.value.economics.costMinor), ...expenses.map(r => r.value.amountMinor),...vendors.map(v=>v.actualMinor)])
   c.add(prefix + 'costMinor', 'Approved actual cost', total, 'minor', 'SUM(approved time.economics.costMinor in the engagement currency) + SUM(approved expenses.amountMinor) + approved user-recorded vendor bills with linked signed corrections. Time cost is frozen at approval: round-half-up(durationSeconds × the declared cost rate chosen by RATE-002 precedence / 3600), per entry; no billing increment. Costs declared in another currency stay in their own bucket and make the total unknown; unknown cost is excluded from knownValue only.', e, figure.currency, total)
   if ('knownCostMinor' in figure) {
    const subtotal = base(); same.forEach(r => c.timeEvidence(subtotal, r)); expenses.forEach(r => c.row(subtotal, 'expenses', r.id)); vendorSources(subtotal)
    c.add(prefix + 'knownCostMinor', 'Known approved cost subtotal', total, 'minor', 'SUM(known frozen time costMinor in the engagement currency) + SUM(approved expense amounts) + approved vendor bills with linked signed corrections; excludes unknown and other-currency costs and does not establish total cost.', subtotal, figure.currency, total)
   }
   for (const currency of figure.otherCostCurrencies ?? []) {
    const bucket = base(), rows = other.filter(r => r.value.economics.costCurrency === currency); rows.forEach(r => c.timeEvidence(bucket, r))
    c.add(prefix + `costByCurrency:${currency}`, `Approved declared cost in ${currency}`, sum(rows.map(r => r.value.economics.costMinor)), 'minor', `SUM(approved time.economics.costMinor declared in ${currency}); a separate bucket, never converted.`, bucket, currency)
   }
   const missing = base(); time.filter(r => r.value.economics?.costMinor == null).forEach(r => c.row(missing, 'time', r.id))
   c.add(prefix + 'missingCostSources', 'Approved time entries with unknown cost', time.filter(r => r.value.economics?.costMinor == null).length, 'count', 'COUNT(approved time where frozen economics.costMinor is null or absent).', missing)
  }
  if ('billableMinor' in figure) {
   const billable = time.filter(r => r.value.billable), e = base()
   billable.forEach(r => c.timeEvidence(e, r))
   billable.filter(r => r.value.economics?.billMinor == null).forEach(r => e.unknown.push(`time:${r.id}: frozen billMinor unknown`))
   for (const id of figure.missingBillRateSources ?? []) { c.row(e, 'time', id); e.unknown.push(`time:${id}: frozen billMinor unknown`) }
   const known = sum(billable.filter(r => r.value.economics?.billMinor != null).map(r => r.value.economics.billMinor))
   c.add(prefix + 'billableMinor', 'Approved billable value', known, 'minor', 'SUM(approved billable time.economics.billMinor). Each frozen amount = round-half-up(ceil(durationSeconds / roundingSeconds) × roundingSeconds × billRateMinor / 3600); frozen rateId, budgetId and roundingSeconds apply, never current rates. Unknown amounts are excluded from knownValue only.', e, figure.currency, known)
   if ('knownBillableMinor' in figure) {
    const subtotal = base(); billable.filter(r => r.value.economics?.billMinor != null).forEach(r => c.timeEvidence(subtotal, r))
    c.add(prefix + 'knownBillableMinor', 'Known approved billable subtotal', known, 'minor', 'SUM(known frozen billMinor on approved billable time); excludes unpriced entries and does not establish total billable value.', subtotal, figure.currency, known)
   }
   const missing = base(); billable.filter(r => r.value.economics?.billMinor == null).forEach(r => c.row(missing, 'time', r.id))
   c.add(prefix + 'missingBillRateSources', 'Approved billable entries with unknown bill rate', billable.filter(r => r.value.economics?.billMinor == null).length, 'count', 'COUNT(approved billable time where frozen economics.billMinor is null or absent).', missing)
  }
 }
}
