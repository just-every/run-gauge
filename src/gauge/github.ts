import type { Bindings } from '../auth.server'
import { type Actor, Transaction, get, fence } from './store'
import { type Row, type Value, decode, need, text, workDate, Fault } from './model'
import { dispatchCredential, recordProviderUse, ProviderDispatchError, type ProviderOutcome } from './provider-custody'
import { githubRequest, installationToken, GithubRefusal } from './github-app'
import { pullEvidence, issueEvidence, sameEvidence, repositoryName } from './github-evidence'
import { milestoneDeliveryCommand } from './milestone-delivery'
import { startReadback, finishReadback } from './commercial-readback'
import { githubFollowupCommand } from './github-followups'

/**
 * CONNECT-007 / CONNECT-021: read-only GitHub evidence for owner-selected repositories. Owner-only by default: every record
 * here is private to the native owner, no client, agent, other staff role or archive credential reads it, a
 * commit alone is never billable, and a merged pull request only ever proposes a milestone delivery.
 */
const perPage = 30
export const githubOutcome = (error: unknown): { outcome: ProviderOutcome; exceptionClass: string } => {
 if (error instanceof ProviderDispatchError) return { outcome: error.outcome, exceptionClass: error.outcome }
 if (error instanceof GithubRefusal) return { outcome: error.exceptionClass === 'rate-limited' ? 'rate-limited' : error.exceptionClass === 'unavailable' ? 'uncertain' : 'rejected', exceptionClass: error.exceptionClass }
 throw error
}

export async function githubOwner(env: Bindings, a: Actor) {
 need(a.role === 'owner' && a.session.operator.role === 'owner' && a.session.kind === 'native' && !a.scheduled && !a.clientProposal && !a.appKey, 'Only the owner in a native browser session manages GitHub evidence', 403)
 await fence(env, a)
}
export async function githubConnection(env: Bindings, tx: Transaction, id: unknown): Promise<Row> {
 const connection = await get(env, 'providerConnections', text(id, 'GitHub connection'))
 need(connection.value.provider === 'github' && !connection.value.revokedAt, 'Choose an active GitHub connection', 409)
 tx.observe('providerConnections', connection)
 return connection
}
const rows = async (env: Bindings, kind: 'githubEvidence' | 'githubEffects' | 'milestones', field: string, value: string): Promise<Row[]> =>
 (await env.DB.prepare(`SELECT id,revision,data FROM g_${kind} WHERE json_extract(data,'$.${field}')=? ORDER BY id`).bind(value).all<{ id: string; revision: string; data: string }>()).results.map(decode)

/** A refused or failed read still leaves its metadata-only use and audit, and never an effect. */
export async function failed(env: Bindings, a: Actor, tx: Transaction, connection: Row, operation: 'repo:read' | 'issue:write', jobId: string, error: unknown, recordId: string): Promise<never> {
 const { outcome, exceptionClass } = githubOutcome(error)
 const refusal = new Transaction(env, a); refusal.key = tx.key; refusal.action = tx.action
 refusal.observe('providerConnections', connection)
 await recordProviderUse(refusal, { connectionId: connection.id, credentialVersion: connection.value.version, jobId, operation, outcome })
 refusal.audit('github:refused', 'githubRepos', recordId, { action: tx.action, exceptionClass })
 await refusal.commit()
 throw new Fault((error as Error).message, 409)
}

async function selectRepo(env: Bindings, a: Actor, tx: Transaction, digest: string, input: Value) {
 const connection = await githubConnection(env, tx, input.connectionId)
 const fullName = text(input.fullName, 'Repository', 201); need(repositoryName.test(fullName), 'Write the repository as its owner, a slash and its name')
 const engagement = await get(env, 'engagements', text(input.engagementId, 'Engagement')); tx.observe('engagements', engagement)
 const reason = text(input.reason, 'Selection reason')
 let granted: Value | undefined
 try {
  const credential = await dispatchCredential(env, connection.id, connection.value.version, connection.id, 'repo:read')
  const token = await installationToken(credential, { metadata: 'read' })
  const list = await githubRequest(token, 'GET', '/installation/repositories?per_page=100')
  need(Array.isArray(list.json?.repositories), 'GitHub returned no repository list', 409)
  granted = list.json.repositories.find((r: Value) => String(r.full_name).toLowerCase() === fullName.toLowerCase())
  await dispatchCredential(env, connection.id, connection.value.version, connection.id, 'repo:read')
 } catch (error) { if (error instanceof Fault && !(error instanceof GithubRefusal) && !(error instanceof ProviderDispatchError)) throw error; await failed(env, a, tx, connection, 'repo:read', connection.id, error, connection.id) }
 if (!granted || !repositoryName.test(String(granted.full_name)) || !Number.isSafeInteger(granted.id)) {
  const refusal = new Transaction(env, a); refusal.key = tx.key; refusal.action = tx.action
  refusal.observe('providerConnections', connection)
  await recordProviderUse(refusal, { connectionId: connection.id, credentialVersion: connection.value.version, jobId: connection.id, operation: 'repo:read', outcome: 'accepted' })
  refusal.audit('github:refused', 'githubRepos', connection.id, { action: tx.action, reason: 'repository-not-in-installation' })
  await refusal.commit()
  throw new Fault('This repository is not part of the GitHub App installation; nothing was read', 403)
 }
 const existing = (await env.DB.prepare("SELECT id FROM g_githubRepos WHERE json_extract(data,'$.githubId')=? AND json_extract(data,'$.status')='active'").bind(granted.id).first())
 need(!existing, 'This repository is already selected', 409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_githubRepos WHERE json_extract(data,'$.githubId')=? AND json_extract(data,'$.status')='active')", granted.id)
 const row = await tx.record('githubRepos', { connectionId: connection.id, githubId: granted.id, fullName: String(granted.full_name), private: granted.private !== false, engagementId: engagement.id, clientId: engagement.value.clientId, status: 'active', reason, selectedBy: a.session.operator.id, selectedAt: Date.now(), lastSync: null }, undefined, undefined, tx.action!)
 await recordProviderUse(tx, { connectionId: connection.id, credentialVersion: connection.value.version, jobId: row.id, operation: 'repo:read', outcome: 'accepted' })
 return finishReadback(tx, digest, row)
}

async function removeRepo(env: Bindings, tx: Transaction, digest: string, input: Value) {
 const repo = await get(env, 'githubRepos', text(input.id, 'Repository selection'))
 need(repo.revision === input.revision && repo.value.status === 'active', 'Repository selection changed; refresh', 409)
 return finishReadback(tx, digest, await tx.record('githubRepos', { ...repo.value, status: 'removed', removedAt: Date.now(), removalReason: text(input.reason, 'Removal reason') }, repo, undefined, tx.action!))
}

/** Evidence is upserted by repository, kind and number so a repeated read creates nothing new. */
async function syncRepo(env: Bindings, a: Actor, tx: Transaction, digest: string, input: Value) {
 const repo = await get(env, 'githubRepos', text(input.id, 'Repository selection'))
 need(repo.revision === input.revision && repo.value.status === 'active', 'Repository selection changed; refresh', 409)
 const connection = await githubConnection(env, tx, repo.value.connectionId), engagement = await get(env, 'engagements', repo.value.engagementId)
 tx.observe('githubRepos', repo); tx.observe('engagements', engagement)
 const full: string = repo.value.fullName, now = Date.now()
 let pulls: Value[] = [], issues: Value[] = [], reviews = new Map<number, Value[]>()
 try {
  const credential = await dispatchCredential(env, connection.id, connection.value.version, repo.id, 'repo:read')
  // The token names this one repository; GitHub refuses it when the installation no longer grants it.
  const token = await installationToken(credential, { metadata: 'read', pull_requests: 'read', issues: 'read' }, [full.split('/')[1]])
  const base = `/repos/${full}`
  pulls = (await githubRequest(token, 'GET', `${base}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}`)).json
  issues = (await githubRequest(token, 'GET', `${base}/issues?state=all&sort=updated&direction=desc&per_page=${perPage}`)).json
  need(Array.isArray(pulls) && Array.isArray(issues), 'GitHub returned unreadable lists', 409)
  for (const pull of pulls) reviews.set(pull.number, (await githubRequest(token, 'GET', `${base}/pulls/${pull.number}/reviews?per_page=100`)).json)
  await dispatchCredential(env, connection.id, connection.value.version, repo.id, 'repo:read')
 } catch (error) {
  if (error instanceof Fault && !(error instanceof GithubRefusal) && !(error instanceof ProviderDispatchError)) throw error
  const { outcome, exceptionClass } = githubOutcome(error)
  const saved = await tx.record('githubRepos', { ...repo.value, lastSync: { at: now, status: 'exception', exceptionClass, found: 0 } }, repo, undefined, tx.action!)
  await recordProviderUse(tx, { connectionId: connection.id, credentialVersion: connection.value.version, jobId: repo.id, operation: 'repo:read', outcome })
  return finishReadback(tx, digest, saved, { status: 'exception', exceptionClass })
 }
 const known = new Map((await rows(env, 'githubEvidence', 'repoId', repo.id)).map(r => [r.id, r]))
 const milestones = await rows(env, 'milestones', 'engagementId', engagement.id)
 const effects = new Map((await rows(env, 'githubEffects', 'repoId', repo.id)).map(r => [r.id, r]))
 let changed = 0, proposed = 0
 const items: { id: string; value: Value }[] = []
 for (const pull of pulls) items.push({ id: `${repo.id}-pull-${pull.number}`, value: pullEvidence(repo.id, engagement.id, full, pull, Array.isArray(reviews.get(pull.number)) ? reviews.get(pull.number)! : []) })
 // The issues list also returns pull requests; those are already covered above.
 for (const issue of issues) if (!issue.pull_request) items.push({ id: `${repo.id}-issue-${issue.number}`, value: issueEvidence(repo.id, engagement.id, full, issue) })
 for (const item of items) {
  const prior = known.get(item.id), value: Value = { ...item.value, fetchedAt: now }
  let saved: Row | { id: string; revision: string }
  if (prior && sameEvidence(prior.value, value)) saved = prior
  else { saved = await tx.record('githubEvidence', value, prior, item.id, prior ? 'github:evidence-update' : 'github:evidence'); changed++ }
  if (value.kind !== 'pull' || !value.merged || !value.mergedAt || !value.milestoneHint) continue
  const match = milestones.filter(m => String(m.value.name).trim().toLowerCase() === value.milestoneHint.toLowerCase())
  // A name that matches no milestone or several proposes nothing: the owner links it by hand in Gauge.
  if (match.length !== 1) continue
  const effectId = `${item.id}-${match[0].id}`, effect = effects.get(effectId)
  const fresh = { evidenceId: item.id, evidenceRevision: saved.revision, repoId: repo.id, engagementId: engagement.id, milestoneId: match[0].id, milestoneRevision: match[0].revision, effect: 'deliver', deliveredOn: workDate(value.mergedAt, a.timezone), status: 'proposed', proposedAt: effect?.value.proposedAt ?? now, meaning: 'A merged pull request is evidence that work was delivered. It does not accept, authorize or bill the milestone.' }
  tx.observe('milestones', match[0])
  if (!effect) { await tx.record('githubEffects', fresh, undefined, effectId, 'github:effect-propose'); proposed++ }
  else if (effect.value.status === 'proposed' && (effect.value.evidenceRevision !== fresh.evidenceRevision || effect.value.milestoneRevision !== fresh.milestoneRevision)) await tx.record('githubEffects', { ...effect.value, ...fresh }, effect, undefined, 'github:effect-refresh')
 }
 const saved = await tx.record('githubRepos', { ...repo.value, lastSync: { at: now, status: 'read', exceptionClass: null, found: items.length, changed, proposed, truncated: pulls.length === perPage || issues.length === perPage } }, repo, undefined, tx.action!)
 await recordProviderUse(tx, { connectionId: connection.id, credentialVersion: connection.value.version, jobId: repo.id, operation: 'repo:read', outcome: 'accepted' })
 return finishReadback(tx, digest, saved, { status: 'read', changed, proposed })
}

async function decideEffect(env: Bindings, a: Actor, tx: Transaction, digest: string, action: string, input: Value) {
 const effect = await get(env, 'githubEffects', text(input.id, 'Milestone effect'))
 need(effect.revision === input.revision && effect.value.status === 'proposed', 'Milestone effect changed or already decided; refresh', 409)
 const reason = text(input.reason, 'Decision reason'), decided = { decidedBy: a.session.operator.id, decidedAt: Date.now(), decisionReason: reason }
 if (action === 'github:effect-decline') return finishReadback(tx, digest, await tx.record('githubEffects', { ...effect.value, ...decided, status: 'declined' }, effect, undefined, action))
 const evidence = await get(env, 'githubEvidence', effect.value.evidenceId), milestone = await get(env, 'milestones', effect.value.milestoneId), repo = await get(env, 'githubRepos', effect.value.repoId)
 need(repo.value.status === 'active', 'The repository is no longer selected', 409)
 need(evidence.revision === effect.value.evidenceRevision && milestone.revision === effect.value.milestoneRevision, 'Evidence or milestone changed; read the repository again and review the refreshed effect', 409)
 tx.observe('githubEvidence', evidence); tx.observe('githubRepos', repo)
 // The reason carries the evidence identity only: no repository name, title or link reaches milestone or client views.
 const delivered = await milestoneDeliveryCommand(env, a, tx, 'milestone:deliver', { id: milestone.id, revision: milestone.revision, date: effect.value.deliveredOn, reason: `Merged pull request evidence ${evidence.id}` })
 return finishReadback(tx, digest, await tx.record('githubEffects', { ...effect.value, ...decided, status: 'approved', result: { kind: 'milestones', id: delivered!.id, revision: delivered!.revision } }, effect, undefined, action))
}

export async function githubCommand(env: Bindings, a: Actor, action: string, input: Value): Promise<Value> {
 await githubOwner(env, a)
 need(['github:select-repo', 'github:remove-repo', 'github:sync', 'github:effect-approve', 'github:effect-decline', 'github:followup-draft', 'github:followup-send', 'github:followup-cancel'].includes(action), 'Unknown GitHub action')
 const work = await startReadback(env, a, input, action); if (work.previous) return work.previous
 const { tx, digest } = work as { tx: Transaction; digest: string }
 if (action === 'github:select-repo') return selectRepo(env, a, tx, digest, input)
 if (action === 'github:remove-repo') return removeRepo(env, tx, digest, input)
 if (action === 'github:sync') return syncRepo(env, a, tx, digest, input)
 if (action.startsWith('github:effect-')) return decideEffect(env, a, tx, digest, action, input)
 return githubFollowupCommand(env, a, tx, digest, action, input)
}
