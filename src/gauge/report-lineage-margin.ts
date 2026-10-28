import { Lineage, type Evidence } from './report-lineage-shared'

/** FINANCE-001 / FINANCE-008: each margin figure links to its formula, its source rows and every source that makes it unknown. */
export function marginLineage(c: Lineage) {
 const asOf = c.report.forecast?.asOf
 for (const m of [...(c.report.margin??[]),...(c.report.phaseMargins??[])]) {
  const id = String(m.engagementId), prefix = m.phase?`phase-margin:${id}:${m.phase.key}:`:`margin:${id}:`, f = m.phase?(c.report.forecast?.phaseForecasts??[]).find((x:any)=>x.engagementId===id&&x.phaseKey===m.phase.key)?.forecast:(c.report.forecast?.engagements ?? []).find((x: any) => x.engagementId === id)
  const base = () => { const e = c.evidence(); c.row(e, 'engagements', id); return e }
  const approved = (e: Evidence) => { c.rows('time').filter(r => r.value.engagementId === id && r.value.status === 'approved'&&(!m.phase||r.value.phaseKey===m.phase.key)).forEach(r => c.timeEvidence(e, r)); c.rows('expenses').filter(r => r.value.engagementId === id && r.value.status === 'approved'&&(!m.phase||r.value.phaseKey===m.phase.key)).forEach(r => c.row(e, 'expenses', r.id)) }
  const refs = (e: Evidence, sources: string[]) => { for (const s of sources) { const [kind, rowId] = s.split(':'); c.row(e, kind, rowId) } }
  const forecastRows = (e: Evidence) => { for (const [kind, ids] of Object.entries((f?.sources ?? {}) as Record<string, string[]>)) for (const rowId of ids) c.row(e, kind, rowId) }
  const cost = base(); approved(cost); cost.unknown.push(...m.costUnknown)
  c.add(prefix + 'approvedCostMinor', 'Approved cost', m.approvedCostMinor, 'minor', 'SUM(approved time.economics.costMinor, frozen at approval, in the engagement currency) + SUM(approved expenses.amountMinor). A missing or other-currency cost makes the total unknown and names its source.', cost, m.currency, m.knownApprovedCostMinor)
  const provisional = base(); refs(provisional, m.provisionalSources); provisional.unknown.push(...m.provisionalUnknown)
  c.add(prefix + 'provisionalCostMinor', 'Provisional cost', m.provisionalCostMinor, 'minor', 'SUM over submitted, not yet approved, time of round-half-up(durationSeconds × the cost rate effective on its work date under RATE-002 precedence / 3600) + SUM(submitted expenses.amountMinor). Not inside approved cost or actual margin.', provisional, m.currency, m.knownProvisionalCostMinor)
  const earned = base(); approved(earned); forecastRows(earned); earned.unknown.push(...m.feesUnknown)
  c.add(prefix + 'earnedValueMinor', 'Earned operational value', m.earnedValueMinor, 'minor', `FINANCE-006 actual fees. ${m.earnedLabel}: revenue recognition is the accountant's (FINANCE-005).`, earned, m.currency, m.knownEarnedValueMinor)
  const billed = base(); m.invoiceSources.forEach((id:string)=>c.row(billed,'invoices',id)); (m.invoiceCreditSources ?? []).forEach((id:string)=>c.row(billed,'invoiceCorrections',id)); m.packetSources.forEach((p: string) => c.row(billed, 'packets', p))
  c.add(prefix + 'billedMinor', 'Billed', m.billedMinor, 'minor', `Native invoice totals less their issued credit notes (voided invoices excluded; a reissue counts once) when invoices exist, otherwise approved billing packet totals including signed adjustment deltas. ${m.billedLabel}.`, billed, m.currency)
  const paid=base();m.paymentSources.forEach((id:string)=>c.row(paid,'payments',id));m.invoiceSources.forEach((id:string)=>c.row(paid,'invoices',id));c.add(prefix+'paidCashMinor','Recorded receipts',m.paidCashMinor,'minor',m.paidCashLabel,paid,m.currency)
  const credits = base(); m.creditSources.forEach((p: string) => c.row(credits, 'packets', p))
  c.add(prefix + 'creditsMinor', 'Credits', m.creditsMinor, 'minor', 'SUM(approved adjustment packet totalMinor where the delta is negative); already netted inside Billed.', credits, m.currency)
  const actual = base(); approved(actual); forecastRows(actual); actual.unknown.push(...m.actualUnknown)
  c.add(prefix + 'actualMarginMinor', 'Actual margin', m.actualMarginMinor, 'minor', `earned operational value − approved cost, as of ${asOf}. Provisional cost is shown apart, not deducted.`, actual, m.currency, m.knownActualMarginMinor)
  const forecast = base(); forecastRows(forecast); forecast.unknown.push(...m.forecastUnknown)
  c.add(prefix + 'forecastMarginMinor', 'Forecast margin', m.forecastMarginMinor, 'minor', `FINANCE-006 committed EAC fees − committed cost EAC, as of ${asOf}.`, forecast, m.currency, m.knownForecastMarginMinor)
 }
}
