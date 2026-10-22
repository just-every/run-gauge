import type { Bindings } from '../auth.server'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Row, type Value, need, text, uuid } from './model'
import { readCommercialDelivery, startReadback, finishReadback } from './commercial-readback'

async function owner(env: Bindings, a: Actor) {
 need(a.role === 'owner' && a.session.kind === 'native' && !a.scheduled && !a.clientProposal, 'Only the native owner reconciles provider data', 403)
 await fence(env, a)
}
const ack = (row: Row) => ({id: row.id, revision: row.revision, saved: true})

/** Capture a bounded immutable source manifest; no provider request happens here. */
export async function syncCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action !== 'providerSync:start') return null
 await owner(env, a)
 const connection = await get(env, 'providerConnections', text(input.connectionId, 'Provider connection')); tx.observe('providerConnections', connection)
 need(connection.value.provider === 'resend' && !connection.value.revokedAt, 'Choose an active Resend connection; other providers expose no supported reconciliation door yet', 409)
 const jobs = (await all(env, 'providerJobs')).filter(j => j.value.connectionId === connection.id && j.value.operation === 'email:send' && j.value.ownerId === a.session.operator.id)
 need(jobs.length <= 500, 'Reconcile at most 500 current source jobs per snapshot', 409)
 const proposals = await all(env, 'commercialProposals'), deliveries = await all(env, 'commercialEvents'), items: Value[] = []
 for (const job of jobs) {
  const delivery = deliveries.find(d => d.value.jobId === job.id && d.value.type === 'delivery'), proposal = proposals.find(p => p.id === job.value.source.id)
  need(delivery && proposal, 'A source job is missing its commercial document or delivery event', 409)
  tx.observe('providerJobs', job); tx.observe('commercialProposals', proposal)
  items.push({jobId: job.id, deliveryId: delivery.id, proposalId: proposal.id, fingerprint: proposal.value.fingerprint, currency: proposal.value.document.currency, amountMinor: proposal.value.document.totalMinor})
 }
 items.sort((a, b) => a.jobId.localeCompare(b.jobId))
 tx.guard("(SELECT COUNT(*) FROM g_providerJobs WHERE json_extract(data,'$.connectionId')=? AND json_extract(data,'$.operation')='email:send' AND json_extract(data,'$.ownerId')=?)=?", connection.id, a.session.operator.id, jobs.length)
 const totals: Record<string, number> = {}
 for (const item of items) totals[item.currency] = (totals[item.currency] ?? 0) + item.amountMinor
 const row = await tx.record('providerSyncs', {connectionId: connection.id, ownerId: a.session.operator.id, sourceOfTruth: 'Gauge immutable proposal amounts; Resend message content and delivery state', mapping: 'job → exact recipient, proposal version, price and delivery reference', scopes: ['email:readback'], items, cursor: 0, sourceCount: items.length, sourceTotals: totals, reconciledCount: 0, reconciledTotals: {}, outcomes: [], status: items.length ? 'ready' : 'completed', exceptionClass: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: items.length ? null : Date.now()}, undefined, undefined, action)
 tx.sql('INSERT INTO g_provider_sync_authority(sync_id,operator_id) VALUES(?,?)', row.id, a.session.operator.id)
 return row
}

/** Each page commits one checkpoint. Failed reads leave that exact source pending. */
export async function advanceProviderSync(env: Bindings, a: Actor, input: Value): Promise<Value> {
 const work=await startReadback(env,a,input,'providerSync:advance');if(work.previous)return work.previous
 const {tx,digest}=work as {tx:Transaction;digest:string}
 const sync = await get(env, 'providerSyncs', text(input.id, 'Provider reconciliation'))
 need(sync.value.ownerId === a.session.operator.id, 'Only the original owner resumes this reconciliation', 403)
 need(await env.DB.prepare('SELECT 1 FROM g_provider_sync_authority WHERE sync_id=? AND operator_id=?').bind(sync.id, a.session.operator.id).first(), 'Restored reconciliation is disconnected; start a new snapshot', 409)
 if (sync.value.status === 'completed') return finishReadback(tx,digest,sync)
 need(sync.revision === input.revision, 'Reconciliation cursor changed; refresh before resuming', 409)
 const item = sync.value.items[sync.value.cursor], delivery = await get(env, 'commercialEvents', item.deliveryId)
 if(delivery.value.providerMessageId)await readCommercialDelivery(env, a, {id: delivery.id, revision: delivery.revision, key: uuid()})
 const reconciled = await get(env, 'commercialEvents', item.deliveryId), connection = await get(env, 'providerConnections', sync.value.connectionId)
 tx.observe('providerSyncs', sync); tx.observe('providerConnections', connection); tx.observe('commercialEvents', reconciled)
 tx.guard('EXISTS(SELECT 1 FROM g_provider_sync_authority WHERE sync_id=? AND operator_id=?)', sync.id, a.session.operator.id)
 const ok = !!delivery.value.providerMessageId && reconciled.value.mailboxState && reconciled.value.mailboxState !== 'uncertain'
 const totals = {...sync.value.reconciledTotals}, cursor = sync.value.cursor + (ok ? 1 : 0), at = Date.now()
 if (ok) totals[item.currency] = (totals[item.currency] ?? 0) + item.amountMinor
 const row = await tx.record('providerSyncs', {...sync.value, cursor, reconciledCount: cursor, reconciledTotals: totals, outcomes: ok ? [...sync.value.outcomes, {jobId: item.jobId, messageId: reconciled.value.providerMessageId, state: reconciled.value.mailboxState}] : sync.value.outcomes, status: !ok ? 'exception' : cursor === sync.value.items.length ? 'completed' : 'ready', exceptionClass: ok ? null : reconciled.value.readbackException ?? 'readback-unavailable', updatedAt: at, completedAt: ok && cursor === sync.value.items.length ? at : null}, sync, undefined, tx.action!)
 return finishReadback(tx,digest,row)
}
