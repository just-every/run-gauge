import { type Row, type Value, charge, need, sum } from './model'
import { financeForecast } from './finance-forecast'
import { retainerStatements } from './retainer-statements'

export const learningFormulas = {
 effort: 'Mean across held-out project and role observations of abs(estimated seconds - approved actual seconds) / approved actual seconds * 100; baseline and candidate use identical observations.',
 margin: 'Mean across the same held-out projects of abs(estimated margin percent - final FINANCE-006 margin percent), in percentage points. Margin percent = (fees - cost) / fees * 100; currencies are never pooled.',
 payment: 'Mean absolute forecast versus settled-cash days. Not scored: verified held-out settlement observations are unavailable; manual receipts are user-recorded only.'
}
const mean = (xs: (number | null)[]) => xs.length && xs.every(x => x !== null) ? xs.reduce<number>((n, x) => n + x!, 0) / xs.length : null
export function scoreLearning(data: Record<string, Row[]>, selections: Value[], completedThrough: string, candidate: Value, excludedClients: Value[]) {
 // Calculate before selecting projects: FINANCE-006 pricing may use other projects' overtime evidence.
 const forecast = financeForecast(data, completedThrough, retainerStatements(data as any, data.time, undefined, data as any))
 const exclusions: Value[] = [], samples: Value[] = []
 for (const selection of selections) {
  const e = data.engagements.find(e => e.id === selection.engagementId)!, estimate = data.estimates.find(e => e.id === selection.estimateId)!
  const excluded = excludedClients.find(c => c.id === e.value.clientId)
  if (excluded) { exclusions.push({engagementId: e.id, reason: excluded.reason}); continue }
  const mine = (kind: string) => data[kind].filter(r => r.value.engagementId === e.id)
  const tasks = mine('tasks'), time = mine('time'), staffing = mine('staffing'), final = forecast.engagements.find(f => f.engagementId === e.id)!
  const reasons: string[] = []
  if (!tasks.length || tasks.some(t => t.value.status !== 'done' || t.value.remainingSeconds !== 0)) reasons.push('Project has unfinished tasks')
  if (!time.some(t => t.value.status === 'approved')) reasons.push('No approved actual work')
  if (time.some(t => t.value.status !== 'approved' || t.value.workDate > completedThrough) || mine('expenses').some(t => t.value.status !== 'approved' || t.value.date > completedThrough)) reasons.push('Unapproved or later actual work remains')
  if (staffing.some(s => s.value.commitment === 'committed' && s.value.to > completedThrough)) reasons.push('Future committed work remains')
  if (!estimate.value.phases.every((p: Value) => p.mode === 'fixed') || final.basis !== 'fixed') reasons.push('This comparison supports completed fixed-fee projects only')
  if (mine('milestones').some(m => m.value.status !== 'approved' || m.value.due > completedThrough)) reasons.push('Unapproved or later fixed fees remain')
  if (reasons.length) { exclusions.push({engagementId: e.id, reason: reasons.join('; ')}); continue }
  const lines = estimate.value.lines as Value[], roles = [...new Set(lines.filter(l => l.kind !== 'expense').map(l => l.role))]
  const unknowns: string[] = [...final.incomplete]
  const foreignExpenses = mine('expenses').filter(x => x.value.currency !== e.value.currency)
  for (const x of foreignExpenses) unknowns.push(`expenses:${x.id}: cost declared in ${x.value.currency}; no implicit currency conversion`)
  const roleFor = (t: Row) => lines.find(l => l.key === tasks.find(task => task.id === t.value.taskId)?.value.estimateLineKey)?.role
  if (time.some(t => !roleFor(t))) unknowns.push('Approved work has no original estimate role mapping')
  const observations = roles.map(role => {
   const estimatedSeconds = sum(lines.filter(l => l.role === role).map(l => l.effortSeconds))
   const candidateSeconds = sum(lines.filter(l => l.role === role).map(l => adjustedSeconds(l, candidate)))
   const actualSeconds = sum(time.filter(t => roleFor(t) === role).map(t => t.value.durationSeconds))
   if (!actualSeconds) unknowns.push(`Role ${role}: no positive approved actual effort`)
   return {role, estimatedSeconds, candidateSeconds, actualSeconds, baselineApe: actualSeconds ? Math.abs(estimatedSeconds - actualSeconds) / actualSeconds * 100 : null, candidateApe: actualSeconds ? Math.abs(candidateSeconds - actualSeconds) / actualSeconds * 100 : null}
  })
  const v = estimate.value, currency = e.value.currency
  const baselineCost = v.costComplete && lines.every(l => l.costMinor !== null && l.costCurrency === currency) ? v.costMinor : null
  if (baselineCost === null) unknowns.push('Original estimated costs are unknown or in another currency')
  const candidateLineCosts = lines.map(l => {
   if (l.role !== candidate.role || l.kind === 'expense') return l.costMinor
   if (l.costRateMinor == null || l.costCurrency !== currency) return null
   return charge(adjustedSeconds(l, candidate), l.costRateMinor)
  })
  const candidateCost = candidateLineCosts.every(c => c !== null) && baselineCost !== null ? sum(candidateLineCosts as number[]) : null
  // Estimates retain a separately rounded contingency on cost; preserve it in each comparison.
  const withContingency = (cost: number) => sum([cost, Number((BigInt(cost) * BigInt(v.contingencyBasisPoints) + 5000n) / 10000n)])
  const baselineMarginPercent = baselineCost !== null && v.totalMinor > 0 ? (v.totalMinor - baselineCost) / v.totalMinor * 100 : null
  const candidateMarginPercent = candidateCost !== null && v.totalMinor > 0 ? (v.totalMinor - withContingency(candidateCost)) / v.totalMinor * 100 : null
  const finalMarginPercent = final.complete && !foreignExpenses.length && final.eacFeesMinor > 0 ? final.marginMinor / final.eacFeesMinor * 100 : null
  if (finalMarginPercent === null) unknowns.push('Final FINANCE-006 margin is incomplete or has zero fees')
  const refs = new Map<string, Value>()
  const cite = (kind: string, row: Row) => refs.set(`${kind}:${row.id}`, {kind, id: row.id, revision: row.revision})
  cite('engagements', e); cite('estimates', estimate)
  for (const k of ['tasks','staffing','time','expenses','budgets','milestones','estimateConversions','projectScenarios','deliveryPlans']) for (const row of mine(k)) cite(k, row)
  for (const [kind, ids] of Object.entries(final.sources)) for (const row of data[kind] ?? []) if (ids.includes(row.id)) cite(kind, row)
  samples.push({engagementId: e.id, currency, estimateId: estimate.id, estimateRevision: estimate.revision, roles: observations, baselineMarginPercent, candidateMarginPercent, finalMarginPercent,
   baselineMarginError: baselineMarginPercent === null || finalMarginPercent === null ? null : Math.abs(baselineMarginPercent - finalMarginPercent),
   candidateMarginError: candidateMarginPercent === null || finalMarginPercent === null ? null : Math.abs(candidateMarginPercent - finalMarginPercent),
   finalFeesMinor: final.complete && !foreignExpenses.length ? final.eacFeesMinor : null, finalCostMinor: final.complete && !foreignExpenses.length ? final.eacCostMinor : null,
   knownFinalCostMinor: final.eacCostMinor, unknowns, sources: [...refs.values()]})
 }
 const enough = samples.length >= 5
 const baseline = {effortMape: enough && !samples.some(s => s.unknowns.includes('Approved work has no original estimate role mapping')) ? mean(samples.flatMap(s => s.roles.map((r: Value) => r.baselineApe))) : null, marginError: enough ? mean(samples.map(s => s.baselineMarginError)) : null, paymentTimingError: null}
 const candidateScore = {effortMape: enough && !samples.some(s => s.unknowns.includes('Approved work has no original estimate role mapping')) ? mean(samples.flatMap(s => s.roles.map((r: Value) => r.candidateApe))) : null, marginError: enough ? mean(samples.map(s => s.candidateMarginError)) : null, paymentTimingError: null}
 const difference = Object.fromEntries(Object.keys(baseline).map(k => [k, (baseline as Value)[k] === null || (candidateScore as Value)[k] === null ? null : (candidateScore as Value)[k] - (baseline as Value)[k]]))
 return {status: enough ? 'incomplete evidence' : 'insufficient history', eligibleProjects: samples.length, exclusions, samples, baseline, candidateScore, difference, formulas: learningFormulas,
  adoption: {offered: false, reason: enough ? 'Incomplete three-metric evidence: held-out settled-payment timing is unavailable. Manual receipts are user-recorded, never settlement observations. No assumption is offered for adoption.' : 'Insufficient history: at least five eligible completed projects are required. Nothing is offered for adoption.'}}
}
function adjustedSeconds(line: Value, candidate: Value) {
 const seconds = line.role === candidate.role ? Math.round(line.effortSeconds * candidate.basisPoints / 10000) : line.effortSeconds
 need(Number.isSafeInteger(seconds), 'Candidate effort exceeds exact range')
 return seconds
}
