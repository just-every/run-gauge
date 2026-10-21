import { Lineage } from './report-lineage-shared'

export function revenueLineage(c: Lineage) {
 for (const w of c.report.revenueDashboard?.wip ?? []) {
  const evidence = c.evidence()
  for (const source of w.sources) {
   const row = c.row(evidence,source.kind,source.id)
   if(row){c.row(evidence,'engagements',row.value.engagementId);if(source.kind==='time')c.timeEvidence(evidence,row)}
  }
  evidence.unknown.push(...w.unknownSources)
  c.add(`revenue:${w.currency}:wipMinor`,'Hourly WIP and reimbursable expenses',w.amountMinor,'minor',`SUM(frozen approved hourly bill values outside retainers, excluding source-billed work) + SUM(approved reimbursable expenses), work date through ${c.report.revenueDashboard!.asOf}. Billing packets are preparation, not issued invoices; no packet deduction. Fixed fees and retainer allowances excluded. Pre-tax; no implicit FX.`,evidence,w.currency,w.knownMinor)
 }
}
