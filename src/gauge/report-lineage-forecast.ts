import { Lineage } from './report-lineage-shared'

const formulas: Record<string, [string, string]> = {
 actualFeesMinor: ['Actual fees', 'Hourly: SUM(approved billable time.economics.billMinor, frozen at approval) + SUM(approved reimbursable expenses). Fixed fee: approved milestones due on or before the as-of date. Retainer: recorded period fee earned ratably through the as-of day on its immutable working-day basis, plus realised billable overage.'],
 etcFeesMinor: ['Committed ETC fees', 'SUM over future committed allocation days priced under RATE-002 precedence: raw allocation seconds, with daily overtime bill premium first, then write-down. The daily threshold counts approved raw time first, then all committed bookings in lexical engagement ID / staffing ID order, then tentative bookings; internal, nonbillable and unpriced work also count. The premium rate, each ordinary/overtime charge segment and the write-down round half up to cents. Fixed fee: approved milestones due after the as-of date. Retainer: unearned remainder of recorded opened-period fees plus committed eligible demand beyond the remaining allowance × agreed overage rate; value demand uses net priced fees, hours demand uses raw seconds.'],
 eacFeesMinor: ['Committed EAC fees', 'actual fees + committed ETC fees + remaining billable expense budget (budget minus approved reimbursable expenses).'],
 eacFeesWithTentativeMinor: ['EAC fees + tentative', 'committed EAC fees + tentative allocation days priced with overtime bill premium then write-down, after every committed booking in the daily threshold order; tentative bookings use lexical engagement ID / staffing ID order and never change committed pricing. Rates, ordinary/overtime charge segments and write-downs round half up; allocation seconds retain their original quantity.'],
 eacCostMinor: ['Committed cost EAC', 'SUM(frozen approved time costMinor) + approved expenses + future committed allocation days × cost rate effective that day + remaining expense budget at cost. Overtime bill premiums and write-downs do not change labor cost.'],
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
