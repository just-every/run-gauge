import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, type Transaction, all, fence } from './store'
import { type Kind, type Value, type Row, need, text, integer, date, workDate } from './model'
import { scoreLearning } from './learning-score'

const sourceKinds: Kind[] = ['clients','people','engagements','estimates','estimateConversions','tasks','staffing','time','expenses','budgets','milestones','rates','rateWithdrawals','retainers','retainerPeriods','retainerCloses','retainerAdjustments','projectScenarios','deliveryPlans']
const owner = (a: Actor) => need(a.role === 'owner' && a.session.kind === 'native' && !a.clientProposal && !a.scheduled, 'Only the native owner selects historical cohorts', 403)
export async function learningPreview(env: Bindings, a: Actor, input: Value, tx?: Transaction) {
 owner(a); await fence(env, a)
 const completedThrough = date(input.completedThrough)
 need(completedThrough <= workDate(Date.now(), a.timezone), 'Completed history cannot be in the future')
 const candidate = {role: text(input.candidate?.role ?? input.candidateRole, 'Candidate role', 200), basisPoints: integer(input.candidate?.basisPoints ?? input.candidateBasisPoints, 'Candidate effort basis points', 1, 100000)}
 need(Array.isArray(input.selections) && input.selections.length > 0 && input.selections.length <= 50, 'Select one to 50 held-out projects')
 const selections = input.selections.map((s: Value) => ({engagementId: text(s.engagementId, 'Project'), engagementRevision: text(s.engagementRevision, 'Project revision'), estimateId: text(s.estimateId, 'Original estimate'), estimateRevision: text(s.estimateRevision, 'Estimate revision')}))
 need(new Set(selections.map((s: Value) => s.engagementId)).size === selections.length, 'Each held-out project appears once')
 const data = Object.fromEntries(await Promise.all(sourceKinds.map(async k => [k, await all(env, k)]))) as Record<Kind, Row[]>
 for (const s of selections) {
  const project = data.engagements.find(p => p.id === s.engagementId), estimate = data.estimates.find(e => e.id === s.estimateId)
  need(project?.revision === s.engagementRevision && estimate?.revision === s.estimateRevision, 'Historical sources changed; select their current revisions again', 409)
  need(project.value.estimateId === estimate.id && project.value.estimateRevision === estimate.revision, 'Select the original converted estimate for this project', 409)
  need(project.value.clientId === estimate.value.clientId && project.value.currency === estimate.value.currency, 'Project and estimate currencies or client differ', 409)
 }
 need(Array.isArray(input.excludedClients ?? []) && (input.excludedClients ?? []).length <= 50, 'Choose at most 50 client exclusions')
 const excludedClients = (input.excludedClients ?? []).map((c: Value) => {
  const client = data.clients.find(row => row.id === c.id)
  need(client && client.revision === c.revision, 'Excluded client changed; select it again', 409)
  return {id: client.id, revision: client.revision, reason: text(c.reason, 'Client exclusion reason')}
 })
 const sourceDigest = sha256(canonicalJson(data))
 if (input.sourceDigest) need(sourceDigest === input.sourceDigest, 'Historical sources changed; preview again before keeping scores', 409)
 if (tx) for (const k of sourceKinds) { for (const row of data[k]) tx.observe(k, row); tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`, data[k].length) }
 const result = {name: text(input.name, 'Comparison name', 200), reason: text(input.reason, 'History selection reason'), completedThrough, candidate, selections, excludedClients, sourceDigest,
  ...scoreLearning(data, selections, completedThrough, candidate, excludedClients)}
 await fence(env, a)
 return result
}
export async function learningCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (!action.startsWith('learning:')) return null
 owner(a)
 need(action === 'learning:save', 'Forecast comparisons are read-only; adoption is unavailable', 409)
 need(input.sourceDigest, 'Preview exact sources before keeping scores', 409)
 const preview = await learningPreview(env, a, input, tx)
 return tx.record('learningCohorts', {...preview, savedBy: a.session.operator.id, savedAt: Date.now()}, undefined, undefined, action)
}
