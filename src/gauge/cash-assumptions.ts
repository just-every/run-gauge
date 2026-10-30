import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Row, type Value, type Kind, need, text, date, integer } from './model'
import { type Actor, type Transaction, finance, authority, all } from './store'

export type CashReference = {kind: Kind; id: string; revision: string}
export type CashBasis = {key: string; fingerprint: string; references: CashReference[]}
export const cashReference = (kind: Kind, row: Row): CashReference => ({kind, id: row.id, revision: row.revision})
/** Identity excludes payments and disputes: those reduce collectible open cash,
 * while an approval remains bound to its original invoice or scheduled inputs. */
export function cashBasis(key: string, engagementId: string, clientId: string, currency: string, invoiceDate: string, amountMinor: number, terms: number, references: CashReference[]): CashBasis {
 return {key, references, fingerprint: sha256(canonicalJson({key, engagementId, clientId, currency, invoiceDate, amountMinor, terms, references}))}
}
export function cashProbability(data: Record<string, Row[]>, engagementId: string, basis: CashBasis, client?: Row) {
 const saved = (data.cashAssumptions ?? []).find(r => r.value.engagementId === engagementId && r.value.sourceKey === basis.key)
 const applied = saved?.value.fingerprint === basis.fingerprint && saved.value.collectionPercent !== null ? saved : null
 return {collectionPercent: applied?.value.collectionPercent ?? client?.value.collectionPercent ?? 100,
  probabilitySource: applied ? 'invoice override' : client?.value.collectionPercent != null ? 'client fallback' : '100% default',
  probabilityApprovedBy: applied?.value.approvedBy ?? client?.value.collectionApprovedBy ?? null,
  probabilityApprovedByName: applied?.value.approvedByName ?? client?.value.collectionApprovedByName ?? null,
  probabilityRevision: applied?.revision ?? (client?.value.collectionPercent != null ? client.revision : null),
  assumptionSnapshot: applied, decisionSnapshot: saved?.value.fingerprint === basis.fingerprint ? saved : null, staleAssumption: saved && saved.value.collectionPercent !== null && !applied ? saved : null}
}

export async function cashAssumptionCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action !== 'cash:approve') return null
 need(finance(a) && a.session.kind === 'native', 'Native finance access required', 403)
 const privileged = authority(a, true); tx.guard(privileged.sql, ...privileged.params)
 const from = date(input.from), to = date(input.to), asOf = date(input.asOf)
 const {reports} = await import('./reports')
 const report = await reports(env, a, from, to, undefined, asOf)
 const project = report.cash?.engagements.find(e => e.engagementId === input.engagementId)
 const item = project?.items.find(i => i.probabilityBasis.key === input.sourceKey)
 need(item && item.probabilityBasis.fingerprint === input.fingerprint, 'Cash source changed; refresh and approve its current inputs', 409)
 const saved = (await all(env, 'cashAssumptions')).find(r => r.value.engagementId === input.engagementId && r.value.sourceKey === input.sourceKey)
 need(saved ? saved.id === input.id && saved.revision === input.revision : !input.id && !input.revision, 'Cash assumption changed; reload', 409)
 const collectionPercent = input.collectionPercent === '' || input.collectionPercent === null ? null : integer(input.collectionPercent, 'Collection percentage', 0, 100)
 const reason = text(input.reason, 'Approval reason')
 // Fence every input of the public forecast. In particular a concurrent issuance
 // must not approve a schedule which has just been replaced by a real invoice.
 for (const kind of ['clients','engagements','budgets','tasks','milestones','rates','staffing','time','expenses','retainers','retainerPeriods','retainerCloses','retainerAdjustments','retainerSchedules','retainerCharges','fixedCharges','invoices','payments','invoiceCorrections','paymentPromises','invoiceDisputes','timeSlices','capWriteDowns'] as Kind[]) {
  const rows = report.data[kind]
  tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`, rows.length)
  for (const row of rows) tx.observe(kind, row)
 }
 if (!saved) tx.guard("NOT EXISTS(SELECT 1 FROM g_cashAssumptions WHERE json_extract(data,'$.engagementId')=? AND json_extract(data,'$.sourceKey')=?)", input.engagementId, input.sourceKey)
 return tx.record('cashAssumptions', {engagementId: project!.engagementId, sourceKey: item.probabilityBasis.key,
  fingerprint: item.probabilityBasis.fingerprint, references: item.probabilityBasis.references,
  invoiceDate: item.invoiceDate, amountMinor: item.amountMinor, currency: project!.currency, collectionPercent, reason,
  approvedBy: a.session.operator.id, approvedByName: a.session.operator.displayName, approvedAt: Date.now()}, saved, undefined, action)
}
