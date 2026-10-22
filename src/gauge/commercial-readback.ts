import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Row, type Value, Fault, need, text } from './model'
import { latestCommercial } from './commercial-proposals'
import { dispatchCredential, recordProviderUse, ProviderDispatchError } from './provider-custody'
import { providerBytes, providerJson } from './provider-readback'

const ack = (row: Row) => ({id: row.id, revision: row.revision, saved: true})
async function start(env: Bindings, a: Actor, input: Value, action: string) {
 need(a.role === 'owner' && a.session.kind === 'native' && !a.scheduled && !a.clientProposal, 'Only the native owner reads commercial provider evidence', 403)
 await fence(env, a)
 const key = text(input.key, 'Unique request key', 200), digest = sha256(canonicalJson({action, ...input}))
 const previous = await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>()
 if (previous) { need(previous.actor === a.session.operator.id && previous.digest === digest, 'Request key already used for different work', 409); return {previous: JSON.parse(previous.result)} }
 const tx = new Transaction(env, a); tx.key = key; tx.action = action
 return {tx, digest}
}
async function finish(tx: Transaction, digest: string, row: Row) {
 const result = ack(row)
 tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)', tx.key, tx.actor.session.operator.id, digest, JSON.stringify(result))
 await tx.commit(); return result
}

/** Read-only provider reconciliation never submits or retries a message. */
export async function readCommercialDelivery(env: Bindings, a: Actor, input: Value): Promise<Value> {
 const work = await start(env, a, input, 'commercial:delivery-readback'); if (work.previous) return work.previous
 const {tx, digest} = work as {tx:Transaction;digest:string}
 const delivery = await get(env, 'commercialEvents', text(input.id, 'Delivery event'))
 need(delivery.revision === input.revision && delivery.value.type === 'delivery', 'Refresh the exact delivery event', 409)
 const job = await get(env, 'providerJobs', delivery.value.jobId), proposal = await get(env, 'commercialProposals', delivery.value.proposalId)
 need(job.value.ownerId === a.session.operator.id && job.value.provider === 'resend', 'Only the original owner reconciles this Resend job', 403)
 need(await env.DB.prepare('SELECT 1 FROM g_provider_job_authority WHERE job_id=? AND operator_id=?').bind(job.id, a.session.operator.id).first(), 'Restored delivery history has no readback authority', 409)
 tx.guard('EXISTS(SELECT 1 FROM g_provider_job_authority WHERE job_id=? AND operator_id=?)', job.id, a.session.operator.id)
 tx.observe('providerJobs', job); tx.observe('commercialEvents', delivery)
 const connection = await get(env, 'providerConnections', job.value.connectionId); tx.observe('providerConnections', connection)
 const messageId = job.value.providerMessageId ?? text(input.providerMessageId, 'Provider message id', 128)
 need(/^[A-Za-z0-9_-]{1,128}$/.test(messageId), 'Use an opaque provider message id')
 if (!job.value.providerMessageId) text(input.reason, 'Owner reconciliation reason')
 let status = 'uncertain', exception: string | null = null
 try {
  const credential = await dispatchCredential(env, connection.id, connection.value.version, job.id, 'email:send')
  const result = await providerJson('https://api.resend.com/emails/' + encodeURIComponent(messageId), credential)
  need(result?.id === messageId && Array.isArray(result.to) && result.to.length === 1 && result.to[0].toLowerCase() === delivery.value.contact.toLowerCase(), 'Provider message does not match the exact recipient', 409)
  need(result.subject === `${proposal.value.document.title} · proposal version ${proposal.value.number}`, 'Provider message does not match this proposal version', 409)
  if (!job.value.providerMessageId) need(typeof result.text === 'string' && result.text.includes(`Delivery reference: ${job.value.eventId}`), 'Provider message does not prove this exact send claim', 409)
  need(['sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'opened', 'clicked'].includes(result.last_event), 'Provider has not supplied a recognized delivery state', 409)
  status = result.last_event
  // Re-read after the last network response; the committing batch also fences rotation.
  await dispatchCredential(env, connection.id, connection.value.version, job.id, 'email:send')
 } catch (error) {
  exception = error instanceof ProviderDispatchError ? error.outcome : error instanceof Fault && /authorization expired/.test(error.message) ? 'authorization-expired' : 'readback-unavailable'
 }
 const at = Date.now()
 const savedJob = await tx.record('providerJobs', {...job.value, ...(status !== 'uncertain' ? {providerMessageId: messageId, status: 'submitted', exceptionClass: null, leaseUntil: null} : {}), readbackAt: at, providerState: status, readbackException: exception}, job, undefined, tx.action!)
 const saved = await tx.record('commercialEvents', {...delivery.value, providerMessageId: status === 'uncertain' ? delivery.value.providerMessageId ?? null : messageId, mailboxState: status, readbackAt: at, readbackException: exception, ...(input.reason ? {reconciliationReason: text(input.reason, 'Owner reconciliation reason')} : {}), meaning: status === 'delivered' ? 'Provider confirms mailbox delivery' : status === 'uncertain' ? 'Readback unresolved; owner must reconcile. No message was retried.' : `Provider reports ${status}; this does not prove mailbox delivery`}, delivery, undefined, tx.action!)
 await recordProviderUse(tx, {connectionId: connection.id, credentialVersion: connection.value.version, jobId: savedJob.id, operation: 'email:send', outcome: status === 'uncertain' ? 'uncertain' : 'accepted'})
 return finish(tx, digest, saved)
}

/** Inkwell's published read API supplies signed PDF and certificate, never an automatic acceptance. */
export async function readCommercialSignature(env: Bindings, a: Actor, input: Value): Promise<Value> {
 const work = await start(env, a, input, 'commercial:signature-readback'); if (work.previous) return work.previous
 const {tx, digest} = work as {tx:Transaction;digest:string}
 const proposal = await get(env, 'commercialProposals', text(input.id, 'Proposal'))
 need(proposal.revision === input.revision && proposal.value.status === 'released' && proposal.value.document.signatureRequired, 'Choose an unchanged released signature-required proposal', 409)
 await latestCommercial(env, tx, proposal)
 const binding = (await all(env, 'commercialEvents')).filter(r => r.value.proposalId === proposal.id && r.value.type === 'signature-binding').at(-1)
 need(binding, 'First bind the owner-reviewed original PDF to this exact proposal', 409); tx.observe('commercialEvents', binding)
 const connection = await get(env, 'providerConnections', binding.value.connectionId); tx.observe('providerConnections', connection)
 let evidence: Value
 try {
  const credential = await dispatchCredential(env, connection.id, binding.value.credentialVersion, binding.id, 'signature:read')
  const root = connection.value.origin + '/api/v1/envelopes/' + encodeURIComponent(binding.value.envelopeId)
  const {envelope} = await providerJson(root, credential)
  need(envelope?.id === binding.value.envelopeId && envelope.status === 'completed' && !envelope.imported, 'Inkwell has no native completed signature for this envelope', 409)
  need(envelope.originalSha256 === binding.value.originalSha256, 'Signed envelope original differs from the owner-reviewed proposal PDF', 409)
  const signer = envelope.signers?.find((s:Value) => typeof s.email === 'string' && s.email.toLowerCase() === proposal.value.document.recipient.contact.toLowerCase() && !s.removedAt && !s.declinedAt && !s.consentWithdrawn && !s.inPerson && !s.linkOnly && !s.group && s.signedAt)
  need(signer && Number.isFinite(Date.parse(signer.signedAt)), 'The exact recipient has no completed verified signing event', 409)
  const artifacts: Value = {}
  for (const kind of ['original', 'signed', 'certificate']) {
   const bytes = await providerBytes(root + '/artifacts/' + kind, credential, 262144)
   need(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'Inkwell returned a non-PDF artifact', 409)
   const hash = sha256(bytes), expected = kind === 'original' ? binding.value.originalSha256 : kind === 'signed' ? envelope.signedSha256 : envelope.certificateSha256
   need(hash === expected, 'Inkwell evidence failed its artifact digest', 409)
   if (kind !== 'original') { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); artifacts[kind] = {sha256: hash, base64: btoa(binary), mediaType: 'application/pdf'} }
  }
  await dispatchCredential(env, connection.id, binding.value.credentialVersion, binding.id, 'signature:read')
  evidence = {status: 'verified', artifacts, signedAt: signer.signedAt, contact: proposal.value.document.recipient.contact, meaning: 'Inkwell completed signature and artifact digests verified; owner confirmed original PDF matches this proposal. Client acceptance still requires the client response.'}
 } catch (error) {
  evidence = {status: 'exception', exceptionClass: error instanceof ProviderDispatchError ? error.outcome : 'signature-evidence-unavailable', meaning: 'Signature evidence is unresolved; acceptance remains unavailable. Owner must inspect Inkwell and resume readback.'}
 }
 const previous = (await all(env, 'commercialEvents')).find(r => r.value.proposalId === proposal.id && r.value.type === 'signature-evidence' && r.value.bindingId === binding.id)
 if (previous?.value.status === 'verified') return finish(tx, digest, previous)
 const saved = await tx.record('commercialEvents', {proposalId: proposal.id, proposalRevision: proposal.revision, fingerprint: proposal.value.fingerprint, type: 'signature-evidence', bindingId: binding.id, envelopeId: binding.value.envelopeId, connectionId: connection.id, originalSha256: binding.value.originalSha256, ...evidence, at: Date.now()}, previous, undefined, tx.action!)
 await recordProviderUse(tx, {connectionId: connection.id, credentialVersion: binding.value.credentialVersion, jobId: binding.id, operation: 'signature:read', outcome: evidence.status === 'verified' ? 'accepted' : 'uncertain'})
 return finish(tx, digest, saved)
}
