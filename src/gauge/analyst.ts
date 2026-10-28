import type { Bindings } from '../auth.server'
import { need, type Value } from './model'
import { reports } from './reports'
import { fence, finance, type Actor } from './store'
import type { Report } from './ui-describe'
import type { LineageFigure } from './report-lineage'

type Snapshot = { from: string; to: string; asOf: string; forecastAsOf: string | null; fingerprint: string }
export type AnalystFigure = Omit<LineageFigure, 'sources'> & { period: 'current' | 'comparison'; sources: { kind: string; id: string; revision: string }[] }
export interface AnalystAnswer {
 status: 'answered' | 'restricted' | 'unsupported' | 'incomplete'
 subject: 'utilization' | 'margin' | null
 summary: string
 scope: string
 snapshots: Snapshot[]
 figures: AnalystFigure[]
 unknowns: string[]
 observations: string[]
 suggestion: { label: string; href: string; requires: string } | null
}
const snapshot = (r: Report): Snapshot => ({ from: r.from, to: r.to, asOf: r.asOf, forecastAsOf: r.forecast?.asOf ?? null, fingerprint: r.fingerprint })
const cite = (r: Report, id: string, period: AnalystFigure['period']): AnalystFigure | undefined => {
 const f = r.lineage.find(f => f.id === id)
 return f ? { ...f, period, sources: f.sources.map(({ kind, id, revision }) => ({ kind, id, revision })) } : undefined
}
const percent = (n: number) => `${n.toFixed(2)}%`

/** Native read-only analysis. Text selects a bounded calculation; it never becomes a command. */
export async function analystAnswer(env: Bindings, a: Actor, input: Value, current?: Report): Promise<AnalystAnswer> {
 need(a.session.kind === 'native' && (finance(a) || a.role === 'lead'), 'Analyst requires a native lead or finance session', 403)
 await fence(env, a)
 const question = String(input.question ?? '').trim()
 need(question.length > 0 && question.length <= 500, 'Ask a question of at most 500 characters')
 const r = current ?? await reports(env, a, String(input.from ?? ''), String(input.to ?? ''), undefined, input.asOf || input.to)
 if (input.fingerprint) need(input.fingerprint === r.fingerprint, 'Report inputs changed; refresh before asking again', 409)
 const project = r.data.engagements.find(p => p.id === input.engagementId)
 need(project, 'Project unavailable to this session', 403)
 const answer: AnalystAnswer = { status: 'unsupported', subject: null, summary: 'I can compare recorded billable utilization between two periods or reconcile current project margin. This question is outside those supported calculations.', scope: `${project.value.name}: only records permitted to this session.`, snapshots: [snapshot(r)], figures: [], unknowns: [], observations: [], suggestion: null }
 const utilization = /\b(utili[sz]ation|billable capacity)\b/i.test(question)
 const margin = /\b(margin|profit|profitability)\b/i.test(question)
 // No billing, policy, outbound or execution promises are inferred from a question.
 const outside = /\b(send|email|delete|approve|execute|pay|refund|invoice|billing|policy|policies)\b/i.test(question)
 if (outside || utilization === margin) { await fence(env, a); return answer }
 if (margin) {
  answer.subject = 'margin'
  if (!finance(a)) {
   answer.status = 'restricted'; answer.summary = 'Project margin and private costs require finance authority. Ask finance to review this project in its own native session.'
   answer.figures = ['approvedSeconds', 'remainingSeconds', 'budgetMinor'].map(field => cite(r, `economics:${project.id}:${field}`, 'current')).filter((f): f is AnalystFigure => !!f)
   answer.observations = ['These permitted project totals provide review context; they cannot establish profit without the private financial calculation.']
   answer.unknowns = [...new Set(answer.figures.flatMap(f => f.unknownSources)), 'Private costs and margin are unavailable to this role.']
   await fence(env, a); return answer
  }
  const fields = ['earnedValueMinor', 'approvedCostMinor', 'provisionalCostMinor', 'actualMarginMinor', 'forecastMarginMinor']
  answer.figures = fields.map(field => cite(r, `margin:${project.id}:${field}`, 'current')).filter((f): f is AnalystFigure => !!f)
  const value = (field: string) => answer.figures.find(f => f.id.endsWith(':' + field))?.value ?? null
  const actual = value('actualMarginMinor'), forecast = value('forecastMarginMinor')
  answer.unknowns = [...new Set(answer.figures.flatMap(f => f.unknownSources))]
  if (answer.figures.length !== fields.length) answer.unknowns.push('Current margin calculation is unavailable.')
  answer.status = answer.unknowns.length || actual === null || forecast === null ? 'incomplete' : 'answered'
  answer.summary = actual === null ? 'Actual project margin is unknown; missing inputs must be reviewed before drawing a conclusion.' : actual < 0 ? 'Approved costs exceed earned operational value; the project currently has negative actual margin.' : 'Earned operational value covers approved costs; current actual margin is nonnegative.'
  answer.observations = ['Actual margin = earned operational value − approved cost. Submitted provisional cost is shown separately and is not deducted from actual margin.', 'Forecast margin = committed EAC fees − committed cost EAC. These are whole-project calculations, not totals limited to the report period. Earned operational value is not recognized accounting revenue.']
  if (actual !== null && forecast !== null) answer.observations.push(`Forecast margin − actual margin = ${forecast - actual} integer minor units of ${project.value.currency}; this compares remaining-work expectations with approved actuals, not two historical snapshots.`)
  answer.unknowns.push('No historical margin snapshot or causal evidence is retained by this answer; it cannot establish when or why margin fell. No provider settlement is inferred.')
  answer.suggestion = { label: 'Review project sources', href: `/app/engagements?edit=${encodeURIComponent(project.id)}`, requires: 'Finance must inspect the exact sources and use the ordinary authorized correction or approval. This answer writes nothing and grants no authority.' }
 } else {
  answer.subject = 'utilization'
  const previous = await reports(env, a, String(input.compareFrom ?? ''), String(input.compareTo ?? ''), undefined, r.forecast?.asOf ?? r.to)
  need(previous.to < r.from, 'Choose a comparison period ending before the current period')
  need(previous.data.engagements.some(p => p.id === project.id), 'Project unavailable to this session', 403)
  // Both periods must use the same authorized source revisions, never a mixture of changing inputs.
  need(JSON.stringify(r.data) === JSON.stringify(previous.data), 'Report inputs changed during comparison; refresh and ask again', 409)
  answer.snapshots.push(snapshot(previous))
  const prefix = `utilization:byProject:${encodeURIComponent(project.id)}:`
  for (const [report, period] of [[r, 'current'], [previous, 'comparison']] as const) {
   for (const field of ['recordedBillableSeconds', 'availableSeconds', 'recordedBillableCapacity']) {
    const f = cite(report, prefix + field, period); if (f) answer.figures.push(f)
   }
  }
  answer.unknowns = [...new Set(answer.figures.flatMap(f => f.unknownSources))]
  const ratio = (period: AnalystFigure['period']) => answer.figures.find(f => f.period === period && f.id.endsWith(':recordedBillableCapacity'))?.value ?? null
  const now = ratio('current'), before = ratio('comparison')
  answer.status = now === null || before === null ? 'incomplete' : 'answered'
  answer.summary = now === null || before === null ? 'Utilization change is unknown because a period has no project activity, missing capacity or a zero denominator.' : `Recorded billable utilization ${now < before ? 'fell' : now > before ? 'rose' : 'was unchanged'} from ${percent(before)} to ${percent(now)} (${(now - before).toFixed(2)} percentage points).`
  if (now === null || before === null) answer.unknowns.push('Both periods need project activity and a known, nonzero capacity denominator; absent activity is not a zero utilization observation.')
  answer.observations = ['Recorded billable utilization = recorded billable seconds ÷ available seconds × 100. Recorded time includes stopped drafts; it is not approved billable revenue.', 'Capacity counts each participating person once per period, subtracting holidays and approved leave. Participants can differ between periods. This is project utilization within your permitted work, not firm-wide utilization.', 'The figures explain the arithmetic change in billable time and available capacity. They do not establish the business cause or imply that unrecorded work did not happen.']
  const value = (period: AnalystFigure['period'], field: string) => answer.figures.find(f => f.period === period && f.id.endsWith(':' + field))?.value ?? null
  const previousTime = value('comparison', 'recordedBillableSeconds'), currentTime = value('current', 'recordedBillableSeconds'), previousCapacity = value('comparison', 'availableSeconds'), currentCapacity = value('current', 'availableSeconds')
  if (previousTime !== null && currentTime !== null) answer.observations.push(`Recorded billable time changed by ${currentTime - previousTime} seconds.`)
  if (previousCapacity !== null && currentCapacity !== null) answer.observations.push(`Available capacity changed by ${currentCapacity - previousCapacity} seconds.`)
  answer.suggestion = { label: 'Review recorded time', href: '/app/time', requires: 'The time owner or authorized reviewer must inspect and correct exact records through the ordinary time workflow. This answer makes no changes.' }
 }
 await fence(env, a)
 return answer
}
