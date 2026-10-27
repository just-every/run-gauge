import type { Bindings } from '../auth.server'
import { type Actor, Transaction, get } from './store'
import { type Value, need, text, Fault } from './model'
import { dispatchCredential, recordProviderUse, ProviderDispatchError, type ProviderOutcome } from './provider-custody'
import { githubRequest, installationToken, GithubRefusal } from './github-app'
import { githubConnection, githubOutcome } from './github'
import { finishReadback } from './commercial-readback'

/**
 * The owner drafts the exact issue text, reviews it, then sends it once. The claim commits before the network call,
 * so a restart or timeout never resends: an unresolved send stays visible as uncertain for the owner to check on GitHub.
 */
export async function githubFollowupCommand(env: Bindings, a: Actor, tx: Transaction, digest: string, action: string, input: Value) {
 if (action === 'github:followup-draft') {
  const repo = await get(env, 'githubRepos', text(input.repoId, 'Repository selection'))
  need(repo.value.status === 'active', 'Select the repository before drafting an issue', 409); tx.observe('githubRepos', repo)
  return finishReadback(tx, digest, await tx.record('githubFollowups', { repoId: repo.id, connectionId: repo.value.connectionId, engagementId: repo.value.engagementId, title: text(input.title, 'Issue title', 256), body: text(input.body, 'Issue text', 4000), reason: text(input.reason, 'Follow-up reason'), status: 'drafted', draftedBy: a.session.operator.id, draftedAt: Date.now() }, undefined, undefined, action))
 }
 const followup = await get(env, 'githubFollowups', text(input.id, 'Issue follow-up'))
 need(followup.revision === input.revision && followup.value.status === 'drafted', 'Follow-up changed or already decided; refresh', 409)
 if (action === 'github:followup-cancel') return finishReadback(tx, digest, await tx.record('githubFollowups', { ...followup.value, status: 'cancelled', cancelledAt: Date.now(), cancelReason: text(input.reason, 'Cancellation reason') }, followup, undefined, action))
 const repo = await get(env, 'githubRepos', followup.value.repoId), connection = await githubConnection(env, tx, repo.value.connectionId)
 need(repo.value.status === 'active', 'The repository is no longer selected', 409)
 // Claim first: an in-flight or crashed send is never offered again.
 const claim = new Transaction(env, a); claim.key = tx.key; claim.action = 'github:followup-claim'
 claim.observe('githubRepos', repo); claim.observe('providerConnections', connection)
 const claimed = await claim.record('githubFollowups', { ...followup.value, status: 'sending', approvedBy: a.session.operator.id, approvedAt: Date.now(), attempts: 1 }, followup, undefined, claim.action)
 await claim.commit()
 const result: Value = { status: 'sending' }
 let outcome: ProviderOutcome = 'uncertain'
 try {
  const credential = await dispatchCredential(env, connection.id, connection.value.version, claimed.id, 'issue:write')
  const full: string = repo.value.fullName
  const token = await installationToken(credential, { metadata: 'read', issues: 'write' }, [full.split('/')[1]])
  const created = (await githubRequest(token, 'POST', `/repos/${full}/issues`, { title: followup.value.title, body: followup.value.body })).json
  need(Number.isSafeInteger(created?.number) && String(created?.html_url).startsWith(`https://github.com/${full}/issues/`), 'GitHub did not confirm the issue; check the repository before drafting again', 409)
  Object.assign(result, { status: 'created', issueNumber: created.number, issueUrl: created.html_url }); outcome = 'accepted'
 } catch (error) {
  if (error instanceof Fault && !(error instanceof GithubRefusal) && !(error instanceof ProviderDispatchError)) Object.assign(result, { status: 'uncertain', exceptionClass: 'unconfirmed' })
  else {
   const { outcome: o, exceptionClass } = githubOutcome(error)
   // Unavailable or timed out sends may have reached GitHub; every other refusal definitely created nothing.
   Object.assign(result, { status: exceptionClass === 'unavailable' ? 'uncertain' : 'refused', exceptionClass }); outcome = o
  }
 }
 const done = new Transaction(env, a); done.key = tx.key; done.action = action
 const current = await get(env, 'githubFollowups', claimed.id)
 const saved = await done.record('githubFollowups', { ...current.value, ...result, completedAt: Date.now() }, current, undefined, action)
 await recordProviderUse(done, { connectionId: connection.id, credentialVersion: connection.value.version, jobId: claimed.id, operation: 'issue:write', outcome })
 return finishReadback(done, digest, saved, { status: result.status })
}
