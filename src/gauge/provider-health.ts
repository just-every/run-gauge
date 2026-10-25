import { readInvoiceDelivery } from './invoice-delivery-readback'
import type { Bindings } from '../auth.server'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Row, type Value, Fault, need, text, uuid, sum } from './model'
import { readCommercialDelivery, readCommercialSignature, startReadback, finishReadback } from './commercial-readback'

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
 need(['sendgrid','resend','inkwell'].includes(connection.value.provider) && !connection.value.revokedAt, 'Choose an active SendGrid, Resend or Inkwell readback connection', 409)
 const jobs = (await all(env, 'providerJobs')).filter(j => j.value.connectionId === connection.id && j.value.operation === 'email:send' && j.value.ownerId === a.session.operator.id)
 need(jobs.length <= 500, 'Reconcile at most 500 current source jobs per snapshot', 409)
 const proposals = await all(env, 'commercialProposals'), deliveries = await all(env, 'commercialEvents'), items: Value[] = []
 const signature=connection.value.provider==='inkwell'
 for (const job of signature?[]:jobs) {
  if(job.value.source.kind==='invoiceAccess'){
   const delivery=deliveries.find(d=>d.value.jobId===job.id&&d.value.type==='invoice-delivery')
   need(delivery,'An invoice job is missing its delivery event',409)
   const invoice=await get(env,'invoices',delivery.value.invoiceId)
   tx.observe('providerJobs',job);tx.observe('invoices',invoice)
   items.push({kind:'invoice',jobId:job.id,deliveryId:delivery.id,invoiceId:invoice.id,fingerprint:delivery.value.pdfSha256,currency:invoice.value.currency,amountMinor:invoice.value.totalMinor})
   continue
  }
  const delivery = deliveries.find(d => d.value.jobId === job.id && d.value.type === 'delivery'), proposal = proposals.find(p => p.id === job.value.source.id)
  need(delivery && proposal, 'A source job is missing its commercial document or delivery event', 409)
  tx.observe('providerJobs', job); tx.observe('commercialProposals', proposal)
  items.push({jobId: job.id, deliveryId: delivery.id, proposalId: proposal.id, fingerprint: proposal.value.fingerprint, currency: proposal.value.document.currency, amountMinor: proposal.value.document.totalMinor})
 }
 if(signature){
  const bindings=deliveries.filter(d=>d.value.type==='signature-binding'),latest=new Map<string,Row>();for(const binding of bindings)latest.set(binding.value.proposalId,binding)
  for(const binding of latest.values()){
   if(binding.value.connectionId!==connection.id)continue
   const proposal=proposals.find(p=>p.id===binding.value.proposalId);need(proposal,'Signature source proposal is missing',409)
   if(proposal.value.status!=='released')continue
   tx.observe('commercialEvents',binding);tx.observe('commercialProposals',proposal)
   items.push({jobId:binding.id,bindingId:binding.id,bindingRevision:binding.revision,proposalId:proposal.id,proposalRevision:proposal.revision,fingerprint:proposal.value.fingerprint,currency:proposal.value.document.currency,amountMinor:proposal.value.document.totalMinor})
  }
  need(items.length<=500,'Reconcile at most 500 current signature sources per snapshot',409)
  tx.guard("(SELECT COUNT(*) FROM g_commercialEvents WHERE json_extract(data,'$.type')='signature-binding')=?",bindings.length)
 }
 items.sort((a, b) => a.jobId.localeCompare(b.jobId))
 tx.guard("(SELECT COUNT(*) FROM g_providerJobs WHERE json_extract(data,'$.connectionId')=? AND json_extract(data,'$.operation')='email:send' AND json_extract(data,'$.ownerId')=?)=?", connection.id, a.session.operator.id, jobs.length)
 const totals: Record<string, number> = {}
 for (const item of items) totals[item.currency] = sum([totals[item.currency] ?? 0,item.amountMinor])
 const row = await tx.record('providerSyncs', {connectionId: connection.id, provider:connection.value.provider, ownerId: a.session.operator.id, sourceOfTruth: signature?'Gauge immutable proposal amounts; Inkwell original, signed and certificate digests':'Gauge immutable document amounts; exact provider messages and delivery state', mapping: signature?'binding → exact proposal, original digest, recipient signature and artifacts':'job → exact recipient, document version, amount and delivery reference', scopes: [signature?'signature:read':'email:read'], items, cursor: 0, sourceCount: items.length, sourceTotals: totals, reconciledCount: 0, reconciledTotals: {}, outcomes: [], status: items.length ? 'ready' : 'completed', exceptionClass: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: items.length ? null : Date.now()}, undefined, undefined, action)
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
 const item = sync.value.items[sync.value.cursor],signature=sync.value.provider==='inkwell'
 let ok=false,outcome:Value={},exceptionClass='readback-unavailable'
 if(signature){
  const binding=await get(env,'commercialEvents',item.bindingId),proposal=await get(env,'commercialProposals',item.proposalId)
  const bindings=(await all(env,'commercialEvents')).filter(r=>r.value.type==='signature-binding'&&r.value.proposalId===proposal.id),latest=bindings.at(-1)
  if(binding.revision===item.bindingRevision&&proposal.revision===item.proposalRevision&&proposal.value.fingerprint===item.fingerprint&&latest?.id===binding.id){
   try{
    const checked=await readCommercialSignature(env,a,{id:proposal.id,revision:proposal.revision,key:uuid()})
    ok=checked.readbackStatus==='verified';exceptionClass=checked.exceptionClass??exceptionClass
    outcome={jobId:item.jobId,evidenceId:checked.id,state:checked.readbackStatus}
    const evidence=await get(env,'commercialEvents',checked.id);tx.observe('commercialEvents',evidence)
   }catch(error){if(!(error instanceof Fault))throw error;exceptionClass='source-unavailable'}
  }else exceptionClass='source-changed'
  tx.observe('commercialEvents',binding);tx.observe('commercialProposals',proposal)
  tx.guard("(SELECT COUNT(*) FROM g_commercialEvents WHERE json_extract(data,'$.type')='signature-binding' AND json_extract(data,'$.proposalId')=?)=?",proposal.id,bindings.length)
 }else{
  const delivery=await get(env,'commercialEvents',item.deliveryId)
  if(delivery.value.providerMessageId)await (item.kind==='invoice'?readInvoiceDelivery:readCommercialDelivery)(env,a,{id:delivery.id,revision:delivery.revision,key:uuid()})
  const reconciled=await get(env,'commercialEvents',item.deliveryId);tx.observe('commercialEvents',reconciled)
  ok=!!delivery.value.providerMessageId&&!!reconciled.value.mailboxState&&!['unknown','unconfirmed','uncertain'].includes(reconciled.value.mailboxState)
  exceptionClass=reconciled.value.readbackException??exceptionClass
  outcome={jobId:item.jobId,messageId:reconciled.value.providerMessageId,state:reconciled.value.mailboxState}
 }
 const connection=await get(env,'providerConnections',sync.value.connectionId)
 tx.observe('providerSyncs',sync);tx.observe('providerConnections',connection)
 tx.guard('EXISTS(SELECT 1 FROM g_provider_sync_authority WHERE sync_id=? AND operator_id=?)', sync.id, a.session.operator.id)
 const totals = {...sync.value.reconciledTotals}, cursor = sync.value.cursor + (ok ? 1 : 0), at = Date.now()
 if (ok) totals[item.currency] = sum([totals[item.currency] ?? 0,item.amountMinor])
 const row = await tx.record('providerSyncs', {...sync.value, cursor, reconciledCount: cursor, reconciledTotals: totals, outcomes: ok ? [...sync.value.outcomes, outcome] : sync.value.outcomes, status: !ok ? 'exception' : cursor === sync.value.items.length ? 'completed' : 'ready', exceptionClass: ok ? null : exceptionClass, updatedAt: at, completedAt: ok && cursor === sync.value.items.length ? at : null}, sync, undefined, tx.action!)
 return finishReadback(tx,digest,row)
}
