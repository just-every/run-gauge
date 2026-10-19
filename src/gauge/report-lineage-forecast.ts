import { Lineage } from './report-lineage-shared'

const formulas: Record<string, [string, string]> = {
 actualFeesMinor: ['Actual fees', 'Hourly: SUM(approved billable time.economics.billMinor, frozen at approval) + SUM(approved reimbursable expenses). Fixed fee: approved milestones due on or before the as-of date. Retainer: realised billable overage.'],
 etcFeesMinor: ['Committed ETC fees', 'SUM over future committed allocation days of round-half-up(dailySeconds × bill rate effective that day under RATE-002 precedence / 3600); fixed fee: approved milestones due after the as-of date; retainer: committed eligible demand beyond the remaining allowance × the agreed overage rate.'],
 eacFeesMinor: ['Committed EAC fees', 'actual fees + committed ETC fees + remaining billable expense budget (budget minus approved reimbursable expenses).'],
 eacFeesWithTentativeMinor: ['EAC fees + tentative', 'committed EAC fees + tentative allocation days priced the same way; never inside the committed figure.'],
 eacCostMinor: ['Committed cost EAC', 'SUM(frozen approved time costMinor) + approved expenses + future committed allocation days × cost rate effective that day + remaining expense budget at cost.'],
 marginMinor: ['Committed forecast margin', 'committed EAC fees − committed cost EAC.'],
}
/** FINANCE-006: each forecast figure links to its formula and the rows it was computed from. */
export function forecastLineage(c: Lineage) {
 for (const f of c.report.forecast?.engagements ?? []) {
  for (const [field, [label, formula]] of Object.entries(formulas)) {
   const e = c.evidence(); c.row(e, 'engagements', f.engagementId)
   for (const [kind, ids] of Object.entries(f.sources as Record<string, string[]>)) for (const id of ids) c.row(e, kind, id)
   e.unknown.push(...f.incomplete)
   c.add(`forecast:${f.engagementId}:${field}`, label, f[field], 'minor', `${formula} Basis: ${f.basis}; as of ${c.report.forecast!.asOf}.`, e, f.currency, f[field])
  }
 }
}
