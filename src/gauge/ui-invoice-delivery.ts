import type { Bindings } from '../auth.server'
import { type Actor,all } from './store'
import { type Row } from './model'
import { providerRegister } from './provider-custody'
import { escape as e,form,select,input,decision } from './ui-forms'

const identifier=(value:unknown)=>e(String(value??'')).replace(/(.{8})(?=.)/g,'$1<wbr>')

/** Delivery evidence belongs beside the retained invoice, including failed mail. */
export async function invoiceDeliveryControls(env:Bindings,a:Actor,release:Row){
 const deliveries=(await all(env,'commercialEvents')).filter(r=>r.value.type==='invoice-delivery'&&r.value.accessId===release.id)
 let body='<section id="invoice-mail-'+e(release.id)+'"><h3>Invoice email</h3>'
 if(!deliveries.length&&a.role==='owner'&&release.value.status==='released'&&release.value.expiresAt>Date.now()){
  const register=await providerRegister(env,a),connections=register.connections.filter(r=>['sendgrid','resend'].includes(r.value.provider)&&r.value.status==='connected').map(r=>({...r,value:{name:r.value.accountLabel}}))
  body+=connections.length?form('invoice:queue-mail','Release invoice email',select('connectionId','Mail connection',connections)+input('reason','Explicit mail release reason'),release,'Queue invoice email'):'<p>Connect SendGrid or Resend in Access before releasing invoice email.</p>'
 }
 for(const row of deliveries){
  const v=row.value,job=(await all(env,'providerJobs')).find(r=>r.id===v.jobId)
  body+=`<div class="g-card"><p>${e(v.provider)} · ${e(v.status)} · ${e(v.mailboxState)}</p>${job?`<p>Job ${e(job.value.status)}${job.value.exceptionClass?' · '+e(job.value.exceptionClass):''}</p>`:''}<p>${e(v.meaning??'Queued for explicit owner dispatch')}</p><p>From ${e(v.from)} · to ${e(v.contact)}</p><details><summary>Delivery evidence</summary><p>Invoice revision ${identifier(v.invoiceRevision)} · PDF SHA-256 ${identifier(v.pdfSha256)}</p>${v.providerMessageId?`<p>Provider message ${identifier(v.providerMessageId)}</p>`:''}</details>${v.senderEvidence?.verified?'<p>Agency sender verified by the provider.</p>':''}${v.actionRequired?`<p role="alert">${e(v.actionRequired)}</p>`:''}${v.readbackException?`<p>Readback exception: ${e(v.readbackException)}</p>`:''}`
  if(a.role==='owner'&&job?.value.ownerId===a.session.operator.id){
   if(['queued','retry-wait'].includes(job.value.status))body+=decision('providerJob:dispatch','Dispatch invoice email',job)+decision('providerJob:cancel','Cancel invoice email',job,true,'quiet')
   if(job.value.providerMessageId)body+=decision('invoice:delivery-readback','Reconcile invoice delivery',row)
   if(job.value.status==='dispatching'||job.value.exceptionClass==='uncertain')body+='<p>Submission uncertain. Inspect provider evidence before any new release; this job will not resend.</p>'
  }
  body+='</div>'
 }
 return body+'</section>'
}
