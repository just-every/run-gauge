import { Buffer } from 'node:buffer'
import type { Bindings } from '../auth.server'
import { type Actor, Transaction, get, all, fence } from './store'
import { type Value, type Row, need, text } from './model'
import { assertInvoiceMailSource } from './invoice-mail-source'
import { queueProviderJob,claimProviderJob,finishProviderJob,type ProviderJobResult } from './provider-jobs'
import { dispatchCredential,ProviderDispatchError,type ProviderOutcome } from './provider-custody'
import { invoiceMail,verifyInvoiceSender } from './invoice-mail-provider.mjs'

export const invoiceSubject=(invoice:Row)=>`Invoice ${invoice.value.number} · ${invoice.value.document.agencyName}`
export async function invoiceMailCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(action!=='invoice:queue-mail')return null
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner releases invoice mail',403)
 const release=await get(env,'invoiceAccess',text(input.id,'Invoice access'))
 need(release.revision===input.revision,'Invoice access changed; refresh',409)
 const invoice=await assertInvoiceMailSource(env,tx,release),reason=text(input.reason,'Explicit mail release reason')
 const from=text(env.MAIL_FROM,'Installation sender address',254)
 need(/^(?:[^<>\r\n]+<)?[^<>\s@]+@[^<>\s@]+>?$/.test(from),'Configure a valid installation sender email address',409)
 const prior=(await all(env,'commercialEvents')).find(r=>r.value.type==='invoice-delivery'&&r.value.accessId===release.id)
 need(!prior,'This access release already has a mail job; reconcile it before authorizing fresh work',409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_commercialEvents WHERE json_extract(data,'$.type')='invoice-delivery' AND json_extract(data,'$.accessId')=?)",release.id)
 const job=await queueProviderJob(tx,{connectionId:text(input.connectionId,'Mail connection'),operation:'email:send',source:{kind:'invoiceAccess',id:release.id,revision:release.revision}})
 return tx.record('commercialEvents',{type:'invoice-delivery',accessId:release.id,accessRevision:release.revision,invoiceId:invoice.id,invoiceRevision:invoice.revision,pdfSha256:invoice.value.pdf.sha256,detailPdfSha256:invoice.value.detailPdf?.sha256??null,contact:release.value.contact,from,subject:invoiceSubject(invoice),jobId:job.id,provider:job.value.provider,status:'queued',mailboxState:'unconfirmed',reason,at:Date.now()},undefined,undefined,action)
}

/** The durable claim commits before verification or submission; uncertain submissions never replay. */
export async function dispatchInvoice(env:Bindings,a:Actor,input:Value):Promise<Value>{
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner dispatches invoice mail',403);await fence(env,a)
 const job=await get(env,'providerJobs',text(input.id,'Invoice job')),key=text(input.key,'Unique request key',200)
 need(job.value.operation==='email:send'&&job.value.source.kind==='invoiceAccess'&&['sendgrid','resend'].includes(job.value.provider),'Choose an invoice mail job')
 if(['queued','retry-wait'].includes(job.value.status))need(job.revision===input.revision,'Provider job changed; refresh',409)
 const claimed=await claimProviderJob(env,a,job,key)
 if(!claimed){const current=await get(env,'providerJobs',job.id);return{id:current.id,revision:current.revision,saved:true}}
 const delivery=(await all(env,'commercialEvents')).find(r=>r.value.type==='invoice-delivery'&&r.value.jobId===job.id)
 need(delivery,'Invoice delivery event missing; reconcile this job',409)
 const release=await get(env,'invoiceAccess',job.value.source.id),invoice=await get(env,'invoices',delivery.value.invoiceId),v=invoice.value
 let result:ProviderJobResult={status:'exception',exceptionClass:'uncertain'},outcome:ProviderOutcome='uncertain',senderEvidence:Value|null=null
 try{
  const credential=await dispatchCredential(env,claimed.value.connectionId,claimed.value.credentialVersion,claimed.id,'email:send')
  senderEvidence=await verifyInvoiceSender(credential,job.value.provider,delivery.value.from)
  if(!senderEvidence.verified){result={status:'exception',exceptionClass:'provider-rejected'};outcome='rejected'}else{
   const check=new Transaction(env,a);await assertInvoiceMailSource(env,check,release);await check.commit()
   await dispatchCredential(env,claimed.value.connectionId,claimed.value.credentialVersion,claimed.id,'email:send')
   const link=env.AUTH_ORIGIN+'/app/client-invoices/'+release.id
   const attachments=[{filename:v.number+'.pdf',contentType:'application/pdf',content:Buffer.from(v.pdf.base64,'base64')}]
   if(v.document.settings.attachDetail){attachments.push({filename:v.number+'-detail.pdf',contentType:'application/pdf',content:Buffer.from(v.detailPdf.base64,'base64')},{filename:v.number+'-detail.csv',contentType:'text/csv',content:Buffer.from(v.detailCsv)})}
   const sent=await invoiceMail(credential,job.value.provider).send({deliveryId:claimed.value.eventId,from:delivery.value.from,to:[delivery.value.contact],subject:delivery.value.subject,text:`${delivery.value.subject}\n${v.document.currency} ${(v.totalMinor/100).toFixed(2)}\nSign in with your confirmed recipient email to view this exact issued invoice: ${link}\nInvoice revision: ${invoice.revision}\nPDF SHA-256: ${v.pdf.sha256}\nDelivery reference: ${claimed.value.eventId}`,headers:{'X-Gauge-Delivery':claimed.value.eventId,'X-Gauge-Invoice-Revision':invoice.revision},attachments})
   const id=sent.providerMessageId
   if(sent.status==='accepted'&&typeof id==='string'&&/^[A-Za-z0-9_.-]{1,200}$/.test(id)&&!id.includes(credential)){result={status:'submitted',providerMessageId:id};outcome='accepted'}
   else if(sent.status==='rate_limited'){result={status:'retry-wait',exceptionClass:'provider-rate-limit'};outcome='rate-limited'}
   else if(sent.status==='rejected'){result={status:'exception',exceptionClass:'provider-rejected'};outcome='rejected'}
  }
 }catch(error){if(error instanceof ProviderDispatchError){result={status:error.outcome==='credential-revoked'?'revoked':'exception',exceptionClass:error.outcome};outcome=error.outcome}}
 const saved=await finishProviderJob(env,a,claimed,key,result,outcome)
 const tx=new Transaction(env,a);tx.key=key;tx.action='invoice:delivery-result'
 await tx.record('commercialEvents',{...delivery.value,status:outcome,providerMessageId:result.providerMessageId??null,senderEvidence,completedAt:Date.now(),meaning:outcome==='accepted'?'Provider accepted submission; mailbox delivery unconfirmed':senderEvidence&&!senderEvidence.verified?'Sender verification failed; inspect the agency sender before a fresh release':'Submission unresolved or refused; reconcile this job before any fresh release'},delivery,undefined,tx.action)
 await tx.commit();return{id:saved.id,revision:saved.revision,saved:true}
}
