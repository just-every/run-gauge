import { latestCommercial } from './commercial-proposals'
import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, uuid } from './model'
import { type Actor, Transaction, all, fence, get } from './store'
import { dispatchCredential, ProviderDispatchError, recordProviderUse, type ProviderOperation, type ProviderOutcome } from './provider-custody'
import { crankEndpoint, crankResult } from './provider-job-crank'

export interface ProviderJobSource { kind: 'budgetAlerts' | 'commercialProposals'; id: string; revision: string }
export interface ProviderJobSpec { connectionId: string; operation: ProviderOperation; source: ProviderJobSource; endpoint?: string }
export type ProviderJobException = 'credential-rotated' | 'credential-revoked' | 'credential-disconnected' | 'provider-rejected' | 'uncertain'
export interface ProviderJobResult { status: 'submitted' | 'held' | 'exception' | 'revoked'; exceptionClass?: ProviderJobException; providerMessageId?: string; providerRunId?: string; providerHoldId?: string }
const acknowledgement = (row: Row) => ({id: row.id, revision: row.revision, saved: true})

async function owner(env: Bindings, a: Actor, tx?: Transaction) {
 need(a.role === 'owner' && a.session.operator.role === 'owner' && a.session.kind === 'native' && !a.scheduled && !a.clientProposal, 'Only the owner in a native browser session manages provider jobs', 403)
 await fence(env, a)
 if (tx) {
  need(tx.actor === a && tx.env === env, 'Provider job authority mismatch', 403)
  tx.guard("EXISTS(SELECT 1 FROM oa_sessions WHERE id=? AND operator_id=? AND kind='native')", a.session.id, a.session.operator.id)
 }
}

async function authority(env: Bindings, a: Actor, job: Row, tx?: Transaction) {
 await owner(env, a, tx)
 const operatorId = a.session.operator.id
 need(job.value.ownerId === operatorId, 'Only the original authorizing owner may manage this job', 403)
 need(await env.DB.prepare('SELECT job_id FROM g_provider_job_authority WHERE job_id=? AND operator_id=?').bind(job.id, operatorId).first(), 'Restored job is disconnected and cannot replay; queue new work with fresh authority', 409)
 tx?.guard('EXISTS(SELECT 1 FROM g_provider_job_authority WHERE job_id=? AND operator_id=?)', job.id, operatorId)
}

async function source(env: Bindings, tx: Transaction, value: ProviderJobSource): Promise<Row> {
 need(['budgetAlerts', 'commercialProposals'].includes(value.kind), 'Unsupported provider job source')
 const row = await get(env, value.kind, text(value.id, 'Source record'))
 need(row.revision === value.revision, 'Provider job source changed; prepare new work', 409)
 tx.observe(value.kind, row)
 if(value.kind==='commercialProposals'){
  need(row.value.status==='released','Proposal access was revoked before dispatch',409)
  await latestCommercial(env,tx,row)
  tx.guard("EXISTS(SELECT 1 FROM g_commercial_proposal_authority c JOIN oa_operators o ON o.id=c.recipient_id WHERE c.proposal_id=? AND c.revision=? AND o.status='active' AND o.role='member' AND lower(o.email)=lower(?) AND NOT EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=o.id AND g.enabled=1))",row.id,row.revision,row.value.document.recipient.contact)
 }
 return row
}

async function connection(env: Bindings, tx: Transaction, connectionId: string, operation: ProviderOperation): Promise<Row> {
 const row = await get(env, 'providerConnections', text(connectionId, 'Provider connection'))
 need(!row.value.revokedAt, 'Provider credential revoked; this job cannot be sent', 409)
 need((operation === 'email:send' && row.value.provider === 'resend' || operation === 'trigger:submit' && row.value.provider === 'crank') && row.value.scopes?.includes(operation), 'Provider connection does not permit this operation', 403)
 need(await env.DB.prepare('SELECT connection_id FROM g_provider_credentials WHERE connection_id=? AND version=?').bind(row.id, row.value.version).first(), 'Provider disconnected; enter fresh credentials before queueing', 409)
 tx.observe('providerConnections', row)
 tx.guard('EXISTS(SELECT 1 FROM g_provider_installation_key WHERE id=1) AND EXISTS(SELECT 1 FROM g_provider_credentials WHERE connection_id=? AND version=?)', row.id, row.value.version)
 return row
}

/** Queues only: no network calls, including during setup or restore. Jobs retain source references rather than request bodies. */
export async function queueProviderJob(tx: Transaction, spec: ProviderJobSpec, sourceRow?: Row): Promise<Row> {
 const {env, actor: a} = tx
 await owner(env, a, tx)
 need(spec.operation === 'trigger:submit' && spec.source.kind === 'budgetAlerts' || spec.operation === 'email:send' && spec.source.kind === 'commercialProposals', 'Provider operation does not match its source')
 // A source updated earlier by this same transaction is not visible to a separate D1 read yet.
 // That caller supplies the tx.record result, whose previous revision is already observed.
 if (sourceRow) need(sourceRow.id === spec.source.id && sourceRow.revision === spec.source.revision, 'Provider job source does not match the transaction result', 409)
 else await source(env, tx, spec.source)
 const connected = await connection(env, tx, spec.connectionId, spec.operation), id = uuid()
 const endpoint = spec.operation === 'trigger:submit' ? crankEndpoint(spec.endpoint) : null
 const job = await tx.record('providerJobs', {
  provider: connected.value.provider, operation: spec.operation, connectionId: connected.id, credentialVersion: connected.value.version,
  ownerId: a.session.operator.id, source: {kind: spec.source.kind, id: spec.source.id, revision: spec.source.revision},
  endpoint, eventId: id, status: 'queued', exceptionClass: null, attempts: 0,
  createdAt: Date.now(), leaseUntil: null, completedAt: null,
 }, undefined, id, 'providerJob:queue')
 tx.sql('INSERT INTO g_provider_job_authority(job_id,operator_id) VALUES(?,?)', id, a.session.operator.id)
 return job
}

/** Generic command transaction owns request receipts; this handler returns no credential. */
export async function jobCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (!['providerJob:queue-crank', 'providerJob:requeue'].includes(action)) return null
 await owner(env, a, tx)
 if (action === 'providerJob:queue-crank') {
  const alert = await source(env, tx, {kind: 'budgetAlerts', id: input.alertId, revision: input.alertRevision})
  return queueProviderJob(tx, {connectionId: input.connectionId, operation: 'trigger:submit', endpoint: input.endpoint, source: {kind: 'budgetAlerts', id: alert.id, revision: alert.revision}})
 }
 const job = await get(env, 'providerJobs', text(input.id, 'Provider job'))
 await authority(env, a, job, tx)
 need(job.revision === input.revision, 'Provider job changed; refresh before re-queueing', 409)
 need(job.value.status === 'exception' && job.value.exceptionClass === 'credential-rotated', 'Only work refused after credential rotation can be re-queued', 409)
 await source(env, tx, job.value.source)
 const connected = await connection(env, tx, job.value.connectionId, job.value.operation)
 return tx.record('providerJobs', {...job.value, credentialVersion: connected.value.version, status: 'queued', exceptionClass: null, leaseUntil: null, completedAt: null, requeuedAt: Date.now()}, job, undefined, action)
}

/** A compare-and-swap claim is durable before any decryption/network activity. */
export async function claimProviderJob(env: Bindings, a: Actor, job: Row, requestKey: string): Promise<Row | null> {
 const tx = new Transaction(env, a); tx.key = text(requestKey, 'Unique request key', 200); tx.action = 'providerJob:dispatch'
 await authority(env, a, job, tx)
 if (job.value.status !== 'queued') return null
 await source(env, tx, job.value.source)
 const claimed = await tx.record('providerJobs', {...job.value, status: 'dispatching', attempts: job.value.attempts + 1, attemptedAt: Date.now(), leaseUntil: Date.now() + 60000}, job, undefined, tx.action)
 try { await tx.commit(); return claimed }
 catch (error) {
  const current = await get(env, 'providerJobs', job.id)
  if (current.value.status !== 'queued') { await authority(env, a, current); return null }
  throw error
 }
}

/** Atomically records a safe provider outcome and its metadata-only custody use. */
export async function finishProviderJob(env: Bindings, a: Actor, job: Row, requestKey: string, result: ProviderJobResult, useOutcome: ProviderOutcome): Promise<Row> {
 const tx = new Transaction(env, a); tx.key = text(requestKey, 'Unique request key', 200); tx.action = 'providerJob:result'
 await authority(env, a, job, tx)
 need(job.value.status === 'dispatching', 'Provider job is not dispatched', 409)
 need(['submitted', 'held', 'exception', 'revoked'].includes(result.status), 'Unknown provider job outcome')
 need(!result.exceptionClass || ['credential-rotated', 'credential-revoked', 'credential-disconnected', 'provider-rejected', 'uncertain'].includes(result.exceptionClass), 'Unknown provider exception class')
 for (const reference of [result.providerMessageId, result.providerRunId, result.providerHoldId]) need(reference === undefined || /^[A-Za-z0-9_-]{1,200}$/.test(reference), 'Invalid provider outcome reference')
 const saved = await tx.record('providerJobs', {
  ...job.value, status: result.status, exceptionClass: result.exceptionClass ?? null, completedAt: Date.now(), leaseUntil: null,
  providerMessageId: result.providerMessageId ?? null, providerRunId: result.providerRunId ?? null, providerHoldId: result.providerHoldId ?? null,
 }, job, undefined, tx.action)
 await recordProviderUse(tx, {connectionId: job.value.connectionId, credentialVersion: job.value.credentialVersion, jobId: job.id, operation: job.value.operation, outcome: useOutcome})
 await tx.commit()
 return saved
}

/** Explicit native-owner dispatch. Repeated/restarted calls never resend a claimed job. */
export async function dispatchProviderJob(env: Bindings, a: Actor, input: Value) {
 await owner(env, a)
 const job = await get(env, 'providerJobs', text(input.id, 'Provider job'))
 await authority(env, a, job)
 need(job.value.operation === 'trigger:submit' && job.value.provider === 'crank', 'This door dispatches Crank budget exception jobs only')
 if (job.value.status !== 'queued') return acknowledgement(job)
 need(job.revision === input.revision, 'Provider job changed; refresh before dispatch', 409)
 const key = text(input.key, 'Unique request key', 200), endpoint = crankEndpoint(job.value.endpoint)
 const claimed = await claimProviderJob(env, a, job, key)
 if (!claimed) return acknowledgement(await get(env, 'providerJobs', job.id))
 let result: ProviderJobResult, outcome: ProviderOutcome
 try {
  // The claim already binds source authority; recheck the native session immediately at dispatch.
  await authority(env, a, claimed)
  const alert=await get(env,'budgetAlerts',claimed.value.source.id);need(alert.revision===claimed.value.source.revision,'Budget exception source changed',409)
  const v=alert.value,event={type:'gauge.budget-exception',alertId:alert.id,alertRevision:alert.revision,engagementId:v.engagementId,phaseKey:v.phaseKey,metric:v.metric,threshold:v.threshold,actual:v.actual,budget:v.budget,raisedAt:v.raisedAt}
  const credential = await dispatchCredential(env, claimed.value.connectionId, claimed.value.credentialVersion, claimed.id, 'trigger:submit')
  const response = await fetch(endpoint, {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {'Authorization': `Bearer ${credential}`, 'Content-Type': 'application/json'}, body: JSON.stringify({event_id: claimed.value.eventId, input: event})})
  result = await crankResult(response, credential)
  outcome = result.status === 'submitted' || result.status === 'held' ? 'accepted' : result.exceptionClass === 'provider-rejected' ? 'rejected' : 'uncertain'
 } catch (error) {
  if (error instanceof ProviderDispatchError) {
   result = {status: error.outcome === 'credential-revoked' ? 'revoked' : 'exception', exceptionClass: error.outcome}; outcome = error.outcome
  } else { result = {status: 'exception', exceptionClass: 'uncertain'}; outcome = 'uncertain' }
 }
 return acknowledgement(await finishProviderJob(env, a, claimed, key, result, outcome))
}

/** Restored jobs and abandoned claims are visible exceptions, never replay instructions. */
export async function providerJobsRegister(env: Bindings, a: Actor): Promise<Row[]> {
 await owner(env, a)
 const live = new Set((await env.DB.prepare('SELECT job_id FROM g_provider_job_authority').all<{job_id: string}>()).results.map(r => r.job_id))
 const rows = (await all(env, 'providerJobs')).map(row => ({...row, value: {
  ...row.value, status: !live.has(row.id) ? 'disconnected' : row.value.status === 'dispatching' && row.value.leaseUntil <= Date.now() ? 'exception' : row.value.status,
  exceptionClass: !live.has(row.id) ? 'authority-disconnected' : row.value.status === 'dispatching' && row.value.leaseUntil <= Date.now() ? 'uncertain' : row.value.exceptionClass,
 }}))
 await owner(env, a)
 return rows
}
