import { sum } from './model'
import { type Evidence, Lineage } from './report-lineage-shared'

// REPORT-005 for RESOURCE-005: every monthly demand, capacity, fee, cost and margin figure and every approved-scenario
// delta names its source rows and formula. Month figures reuse the source rows the forecast itself recorded.
const measures: Record<string, [string, 'seconds' | 'minor', string]> = {
 committedSeconds: ['Committed allocated demand', 'seconds', 'SUM(dailySeconds of committed allocations over each day of the month after the as-of day).'],
 unfilledSeconds: ['Unfilled role demand', 'seconds', 'SUM(dailySeconds of open resource requests over each day of the month after the as-of day); filled requests count through their allocation.'],
 wonSeconds: ['Won demand not yet converted', 'seconds', 'Each won, unconverted opportunity: demandSeconds split evenly over the inclusive days of its proposed dates (leftover seconds to the earliest days), days after the as-of day only; conversion moves it to unfilled roles once.'],
 tentativeSeconds: ['+ tentative demand', 'seconds', 'SUM(dailySeconds of tentative allocations over each day of the month after the as-of day); never inside committed demand.'],
 weightedPipelineSeconds: ['+ weighted pipeline demand', 'seconds', 'Each open opportunity: round half up(demandSeconds × probability ÷ 100) split evenly over its proposed days after the as-of day; never inside committed demand.'],
 employeeCapacitySeconds: ['Employee capacity', 'seconds', 'SUM(available seconds of each employee-profile person per day after the as-of day: calendar hours less holidays and leave); days without a calendar are excluded and named in the forecast notes.'],
 contractorCapacitySeconds: ['Contractor capacity', 'seconds', 'Same as employee capacity for contractor-profile people.'],
 committedFeesMinor: ['Committed fees', 'minor', 'SUM over engagements in the agency currency of the FINANCE-006 committed fees of the month (actual fees + committed ETC fees).'],
 committedCostMinor: ['Committed cost', 'minor', 'SUM over engagements in the agency currency of the FINANCE-006 committed cost of the month.'],
 weightedPipelineFeesMinor: ['+ weighted pipeline fees', 'minor', 'FINANCE-006 weighted pipeline: each open opportunity round half up(amountMinor × probability ÷ 100) spread evenly over the months of its proposed dates; never inside committed fees.'],
}
const derived: Record<string, [string, string[], string]> = {
 committedDemandSeconds: ['Committed demand', ['committedSeconds', 'unfilledSeconds', 'wonSeconds'], 'Committed allocated demand + unfilled role demand + won demand not yet converted; tentative and weighted pipeline are separate additions.'],
 marginMinor: ['Committed margin', ['committedFeesMinor', 'committedCostMinor'], 'Committed fees − committed cost of the month (FINANCE-006 forecast margin basis).'],
}

export function demandLineage(c: Lineage) {
 const f = c.report.demandForecast
 if (!f) return
 const include = (target: Evidence, source: Evidence) => { for (const s of source.sources) c.row(target, s.kind, s.id); target.unknown.push(...source.unknown) }
 const evidenceOf = (month: string, measure: string) => {
  const e = c.evidence()
  for (const ref of f.sourcesByMonth[month]?.[measure] ?? []) { const [kind, id] = ref.split(':'); c.row(e, kind!, id) }
  // An incomplete FINANCE-006 forecast makes the priced figures unknown, naming each engagement.
  if (['committedFeesMinor', 'committedCostMinor'].includes(measure)) e.unknown.push(...f.incomplete.filter((x: string) => x.startsWith('engagements:')))
  return e
 }
 for (const m of f.baseline.months) {
  const prefix = `demand:${m.month}:`, known = (measure: string) => m[measure] as number
  for (const [measure, [label, unit, formula]] of Object.entries(measures)) {
   const e = evidenceOf(m.month, measure)
   c.add(prefix + measure, `${m.month} ${label}`, m[measure], unit, formula, e, unit === 'minor' ? f.currency : null, known(measure))
  }
  for (const [measure, [label, parts, formula]] of Object.entries(derived)) {
   const e = c.evidence()
   for (const part of parts) include(e, evidenceOf(m.month, part))
   c.add(prefix + measure, `${m.month} ${label}`, m[measure], measure === 'marginMinor' ? 'minor' : 'seconds', formula, e, measure === 'marginMinor' ? f.currency : null, known(measure))
  }
 }
 for (const s of f.scenarios.filter((s: any) => s.compared)) {
  const e = c.evidence()
  c.row(e, 'demandScenarios', s.id); c.row(e, 'opportunities', s.opportunityId)
  for (const m of f.baseline.months) for (const measure of ['committedSeconds', 'unfilledSeconds', 'wonSeconds', 'employeeCapacitySeconds', 'contractorCapacitySeconds', 'committedFeesMinor', 'committedCostMinor']) include(e, evidenceOf(m.month, measure))
  const fields: [string, string, 'seconds' | 'minor', string][] = [
   ['capacitySeconds', 'Capacity vs baseline', 'seconds', 'Scenario total capacity − baseline total capacity (existing capacity + planned hire or contractor weekday seconds after the as-of day).'],
   ['demandSeconds', 'Demand vs baseline', 'seconds', 'Scenario total committed demand − baseline total committed demand (the deal added as won, shifted by the scenario delay).'],
   ['feesMinor', 'Fees vs baseline', 'minor', 'Scenario committed fees − baseline committed fees (the deal amount spread evenly over the months of its shifted dates, earliest months taking leftover cents).'],
   ['costMinor', 'Cost vs baseline', 'minor', 'Scenario cost − baseline cost: the scenario cost per hour × deal hours worked, or × every planned-hire capacity hour.'],
   ['marginMinor', 'Margin vs baseline', 'minor', 'Scenario fees − scenario cost − (baseline fees − baseline cost).'],
  ]
  for (const [field, label, unit, formula] of fields) c.add(`demand:scenario:${s.id}:${field}`, `${s.name}: ${label}`, s.delta[field], unit, formula, e, unit === 'minor' ? f.currency : null)
 }
}
