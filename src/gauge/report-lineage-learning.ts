import type { Lineage } from './report-lineage-shared'
import type { Value } from './model'

/** Retained comparisons are their own immutable numeric evidence; current source
 * revisions never replace the revisions on which a historical score was kept. */
export function learningLineage(c: Lineage) {
 for (const cohort of c.rows('learningCohorts')) {
  const v = cohort.value
  const add = (suffix: string, label: string, value: number | null, formula: string, unknown: string[] = []) => {
   const evidence = c.evidence(); c.row(evidence, 'learningCohorts', cohort.id); evidence.unknown.push(...unknown)
   c.add(`learning:${cohort.id}:${suffix}`, label, value, 'percent', formula, evidence)
   c.figures[c.figures.length - 1].asOf = v.savedAt
  }
  for (const score of ['baseline','candidateScore','difference']) for (const field of ['effortMape','marginError','paymentTimingError']) {
   add(`${score}:${field}`, `${v.name}: ${score} ${field}`, v[score][field], v.formulas[field === 'effortMape' ? 'effort' : field === 'marginError' ? 'margin' : 'payment'], v[score][field] === null ? [v.adoption.reason] : [])
  }
  for (const sample of v.samples) {
   for (const field of ['baselineMarginPercent','candidateMarginPercent','finalMarginPercent','baselineMarginError','candidateMarginError']) add(`${sample.engagementId}:${field}`, `${v.name}: ${sample.engagementId} ${field}`, sample[field], v.formulas.margin, sample[field] === null ? sample.unknowns : [])
   for (const role of sample.roles as Value[]) for (const field of ['baselineApe','candidateApe']) add(`${sample.engagementId}:${encodeURIComponent(role.role)}:${field}`, `${v.name}: ${role.role} ${field}`, role[field], v.formulas.effort, role[field] === null ? sample.unknowns : [])
  }
 }
}
