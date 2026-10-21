import { Lineage } from './report-lineage-shared'

export function revenueLineage(c: Lineage) {
 for (const w of c.report.revenueDashboard?.wip ?? []) {
  const evidence = c.evidence()
  for (const source of w.sources) {
   const row = c.row(evidence,source.kind,source.id)
   if(row){c.row(evidence,'engagements',row.value.engagementId);if(source.kind==='time')c.timeEvidence(evidence,row)}
  }
  evidence.unknown.push(...w.unknownSources)
  c.add(`revenue:${w.currency}:wipMinor`,'Hourly WIP and reimbursable expenses',w.amountMinor,'minor',`SUM(frozen approved hourly bill values outside retainers, excluding source-billed and natively issued work) + SUM(approved reimbursable expenses), work date through ${c.report.revenueDashboard!.asOf}. Billing packets are preparation, not issued invoices; no packet deduction. Issued invoice sources are deducted once. Fixed fees and retainer allowances excluded. Pre-tax; no implicit FX.`,evidence,w.currency,w.knownMinor)
  const issued = c.evidence()
  for (const id of w.invoiceIds) { const invoice=c.row(issued,'invoices',id);if(invoice){c.row(issued,'packets',invoice.value.packetId);c.row(issued,'clients',invoice.value.clientId);for(const line of invoice.value.lines)c.row(issued,line.kind,line.sourceId)} }
  for (const id of w.paymentIds) c.row(issued,'payments',id)
  const credited = c.evidence()
  for (const id of w.creditIds ?? []) { const credit=c.row(credited,'invoiceCorrections',id);if(credit){c.row(issued,'invoiceCorrections',id);c.row(credited,'invoices',credit.value.invoiceId);for(const line of credit.value.lines)c.row(credited,line.kind,line.sourceId)} }
  for (const id of w.voidIds ?? []) { c.row(issued,'invoiceCorrections',id); c.row(credited,'invoiceCorrections',id) }
  c.add(`revenue:${w.currency}:openMinor`,'Issued open receivables',w.openMinor,'minor',`SUM(live native invoices issued through ${c.report.revenueDashboard!.asOf}) − SUM(their credit notes issued through that day) − SUM(user-recorded receipts dated through that day). An invoice voided by then is excluded and its reissue counts once. Pre-tax, no provider reconciliation or FX conversion.`,issued,w.currency)
  c.add(`revenue:${w.currency}:creditedMinor`,'Issued credit notes',w.creditedMinor,'minor',`SUM(immutable credit notes, approved discounts and write-offs issued through ${c.report.revenueDashboard!.asOf} against live native invoices). Each names its invoice lines and sources; voids are listed as sources, not credits. Pre-tax: no tax reversal.`,credited,w.currency)
  c.add(`revenue:${w.currency}:paidMinor`,'Recorded invoice receipts',w.paidMinor,'minor',`SUM(immutable manual receipts dated through ${c.report.revenueDashboard!.asOf}, allocated once to native issued invoices). User-recorded, not provider-verified settlement.`,issued,w.currency)
 }
}
