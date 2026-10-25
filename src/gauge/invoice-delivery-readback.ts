import type { Bindings } from '../auth.server'
import { type Actor, Transaction, get } from './store'
import { type Value, need, text } from './model'
import { startReadback,finishReadback } from './commercial-readback'
import { dispatchCredential,recordProviderUse,ProviderDispatchError } from './provider-custody'
import { readInvoiceMail } from './invoice-mail-provider.mjs'

/** Read-only exact-message reconciliation. Provider failures never authorize a resend. */
export async function readInvoiceDelivery(env:Bindings,a:Actor,input:Value):Promise<Value>{
 const work=await startReadback(env,a,input,'invoice:delivery-readback');if(work.previous)return work.previous
 const {tx,digest}=work as {tx:Transaction;digest:string}
 const delivery=await get(env,'commercialEvents',text(input.id,'Invoice delivery'))
 need(delivery.revision===input.revision&&delivery.value.type==='invoice-delivery','Refresh the exact invoice delivery',409)
 const job=await get(env,'providerJobs',delivery.value.jobId)
 need(job.value.source.kind==='invoiceAccess'&&job.value.ownerId===a.session.operator.id,'Only the original owner reconciles this invoice job',403)
 need(await env.DB.prepare('SELECT 1 FROM g_provider_job_authority WHERE job_id=? AND operator_id=?').bind(job.id,a.session.operator.id).first(),'Restored mail history has no provider authority; reconnect and review',409)
 tx.guard('EXISTS(SELECT 1 FROM g_provider_job_authority WHERE job_id=? AND operator_id=?)',job.id,a.session.operator.id)
 tx.observe('providerJobs',job);tx.observe('commercialEvents',delivery)
 const connection=await get(env,'providerConnections',job.value.connectionId);tx.observe('providerConnections',connection)
 // An unknown SendGrid admission cannot be inferred from subject or recipient search.
 const messageId=job.value.providerMessageId
 need(typeof messageId==='string'&&/^[A-Za-z0-9_.-]{1,200}$/.test(messageId),'No accepted message id; owner must reconcile uncertain submission with the provider before any fresh send',409)
 let state='unknown',exception:string|null=null,providerEvidenceMessageId:string|null=null
 try{
  const credential=await dispatchCredential(env,connection.id,connection.value.version,job.id,'email:read')
  const result=await readInvoiceMail(credential,job.value.provider,messageId,delivery.value.contact,job.value.eventId,delivery.value.subject)
  need(result.status==='unknown'||result.submittedMessageId===messageId&&result.correlated,'Provider evidence does not match the admitted invoice message',409)
  providerEvidenceMessageId=result.providerMessageId
  state=result.status;exception=result.exception??null
  await dispatchCredential(env,connection.id,connection.value.version,job.id,'email:read')
 }catch(error){exception=error instanceof ProviderDispatchError?error.outcome:'readback-unavailable'}
 // A transient unavailable read never erases an already reconciled terminal failure.
 if(['bounced','failed'].includes(delivery.value.mailboxState)&&!['bounced','failed'].includes(state))state=delivery.value.mailboxState
 const at=Date.now(),failure=['bounced','failed'].includes(state)
 await tx.record('providerJobs',{...job.value,providerState:state,readbackAt:at,readbackException:exception},job,undefined,tx.action!)
 const saved=await tx.record('commercialEvents',{...delivery.value,providerMessageId:messageId,mailboxState:state,providerEvidenceMessageId,readbackAt:at,readbackException:exception,actionRequired:failure?'Confirm the client address and resolve the provider failure; only a fresh explicit owner release may send again':state==='unknown'?'Inspect provider delivery evidence; no message was retried':null,meaning:state==='delivered'?'Provider confirms mailbox delivery':failure?'Invoice delivery failed; owner action required':state==='accepted'?'Provider accepted submission; delivery unconfirmed':'Provider readback unresolved; no message was retried'},delivery,undefined,tx.action!)
 await recordProviderUse(tx,{connectionId:connection.id,credentialVersion:connection.value.version,jobId:job.id,operation:'email:read',outcome:state==='unknown'?'uncertain':'accepted'})
 return finishReadback(tx,digest,saved)
}
