import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { kinds, type Kind, type Row } from './model'
import { all, type Transaction } from './store'
import { capacity } from './reports'
import { financeForecast } from './finance-forecast'
import { cashForecast } from './cash-forecast'
import { retainerStatements } from './retainer-statements'

// Bump this when a calculation or its source coverage ceases to be comparable.
export const observationBasis = 'native-finance-006-cash-007-v1'
export const scenarioKinds: Kind[] = ['clients','people','engagements','budgets','tasks','milestones','rates','rateWithdrawals','calendars','leave','staffing','time','expenses','retainers','retainerPeriods','retainerCloses','retainerAdjustments','deliveryPlans','invoices','payments','paymentPromises','invoiceCorrections','invoiceDisputes','fixedCharges','retainerSchedules','retainerCharges','timeSlices','capWriteDowns','processorPayments','cashAssumptions','estimates','estimateConversions','resourceRequests','packets','vendorCommitments','vendorBills']
export const observationHash = (value: unknown) => sha256(canonicalJson(value))
export async function scenarioData(env: Bindings, tx?: Transaction) {
 const data = Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, scenarioKinds.includes(kind) ? await all(env, kind) : []]))) as Record<Kind, Row[]>
 if (tx) for (const kind of scenarioKinds) {
  for (const row of data[kind]) tx.observe(kind, row)
  tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`, data[kind].length)
 }
 return data
}
// Digests expose which inputs changed without retaining personal notes or credentials.
export const observationSources = (data: Record<Kind, Row[]>) => scenarioKinds.flatMap(kind => data[kind].map(r => ({ kind, id: r.id, revision: r.revision, digest: observationHash(r.value) }))).sort((a,b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
export function scenarioObservation(data: Record<Kind, Row[]>, ids: string[], asOf: string, from: string, to: string) {
 const native = financeForecast(data, asOf, retainerStatements(data, data.time, undefined, data))
 const forecast = { ...native, engagements: native.engagements.filter(p => ids.includes(p.engagementId)), pipeline: [] }
 const cash = cashForecast(data, forecast)
 return {
  projects: forecast.engagements.map(p => ({ ...p, marginMinor: p.complete ? p.marginMinor : null, eacFeesMinor: p.complete ? p.eacFeesMinor : null, eacCostMinor: p.complete ? p.eacCostMinor : null, etcCostMinor: p.complete ? p.etcCostMinor : null })),
  cash: { asOf:cash.asOf, engagements:cash.engagements.map(p => ({engagementId:p.engagementId,currency:p.currency,complete:p.complete,incomplete:p.incomplete,termsLabel:p.termsLabel,collectionPercent:p.collectionPercent,daysLate:p.daysLate,sources:p.sources,items:p.items.map(i => ({source:i.source,invoiceId:i.invoiceId,invoiceDate:i.invoiceDate,receiptDate:i.receiptDate,cashMonth:i.cashMonth,historicalDate:i.historicalDate,historicalMonth:i.historicalMonth,amountMinor:i.amountMinor,openMinor:i.openMinor,paidMinor:i.paidMinor,expectedMinor:i.expectedMinor,collectionPercent:i.collectionPercent,probabilitySource:i.probabilitySource,probabilityRevision:i.probabilityRevision,probabilityApprovedBy:i.probabilityApprovedBy,disputedMinor:i.disputedMinor ?? 0,assumption:i.assumption ?? null,paymentSources:i.paymentSnapshots.map(r=>({id:r.id,revision:r.revision})),invoiceRevision:i.invoiceSnapshot?.revision ?? null}))})), months: cash.months.map(m => ({ ...m, expectedMinor: m.complete ? m.expectedMinor : null, historicalExpectedMinor: m.complete ? m.historicalExpectedMinor : null })) },
  dates: ids.map(engagementId => ({ engagementId,
   finish: data.deliveryPlans.filter(p => p.value.engagementId === engagementId).sort((a,b) => a.value.number - b.value.number).at(-1)?.value.schedule.finish ?? null,
   tasks: data.tasks.filter(r => r.value.engagementId === engagementId).map(r => ({ id:r.id, from:r.value.from ?? null, to:r.value.to ?? null })),
   milestones: data.milestones.filter(r => r.value.engagementId === engagementId).map(r => ({ id:r.id, due:r.value.due })),
   terms: data.budgets.filter(r => r.value.engagementId === engagementId && r.value.status === 'approved').map(r => ({ id:r.id, revision:r.revision, amountMinor:r.value.amountMinor, mode:r.value.mode }))
  })),
  // Each day's committed load includes competing projects, not just the selected set.
  loads: capacity(data, from, to).map(({ name: _name, ...p }) => p)
 }
}
