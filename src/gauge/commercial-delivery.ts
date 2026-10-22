import type { Bindings } from '../auth.server'
import { proposalMail } from './provider-mail.mjs'
import { type Actor, Transaction, get, all, fence } from './store'
import { type Value, need, text } from './model'
import { command } from './commands'
import { claimProviderJob,finishProviderJob,type ProviderJobResult } from './provider-jobs'
import { dispatchCredential,ProviderDispatchError,type ProviderOutcome } from './provider-custody'
import { commercialProposalHtml } from './ui-commercial-proposal-document'
import { escape as e } from './ui-forms'

/** Manual send commits document release and a version-bound job before the provider edge. */
export async function sendCommercial(env:Bindings,a:Actor,input:Value):Promise<Value>{
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner sends a client proposal',403);await fence(env,a)
 need(env.MAIL_FROM,'Configure the installation sender address before sending',409)
 const key=text(input.key,'Unique request key',200)
 const prior=await env.DB.prepare('SELECT actor FROM g_receipts WHERE key=?').bind(key).first()
 const acknowledgement=await command(env,a,'commercial:claim',{...input,key})
 if(prior)return acknowledgement // The command checks exact replay digest and live authority.
 const delivery=await get(env,'commercialEvents',acknowledgement.id),job=await get(env,'providerJobs',delivery.value.jobId)
 await dispatchCommercial(env,a,{id:job.id,revision:job.revision,key})
 return acknowledgement
}

/** Also serves an explicitly re-queued credential-rotation exception. Never retries uncertain sends. */
export async function dispatchCommercial(env:Bindings,a:Actor,input:Value):Promise<Value>{
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner dispatches proposal mail',403);await fence(env,a)
 const job=await get(env,'providerJobs',text(input.id,'Provider job')),key=text(input.key,'Unique request key',200),from=text(env.MAIL_FROM,'Installation sender address')
 need(job.value.operation==='email:send'&&job.value.provider==='resend','Choose a proposal email job')
 const row=await get(env,'commercialProposals',job.value.source.id)
 need(row.value.status==='released'&&row.revision===job.value.source.revision,'Proposal access or source changed before dispatch',409)
 if(['queued','retry-wait'].includes(job.value.status))need(job.revision===input.revision,'Provider job changed; refresh before dispatch',409)
 const claimed=await claimProviderJob(env,a,job,key)
 if(!claimed){const current=await get(env,'providerJobs',job.id);return {id:current.id,revision:current.revision,saved:true}}
 const v=row.value,link=env.AUTH_ORIGIN+'/app/client-proposals/'+row.id
 let result:ProviderJobResult={status:'exception',exceptionClass:'uncertain'},outcome:ProviderOutcome='uncertain'
 try{
  await fence(env,a)
  const credential=await dispatchCredential(env,claimed.value.connectionId,claimed.value.credentialVersion,claimed.id,'email:send')
  const response=await proposalMail(credential).send({deliveryId:claimed.value.eventId,from,to:[v.document.recipient.contact],subject:`${v.document.title} · proposal version ${v.number}`,text:`${v.document.agencyName}\n${v.document.title}\nProposal version ${v.number}; ${v.document.currency} ${(v.document.totalMinor/100).toFixed(2)}. Expires ${v.document.expiry}.\nSign in with your invited email to review this exact version and respond: ${link}\nDelivery reference: ${claimed.value.eventId}\nThis message does not accept or sign the proposal.`,html:commercialProposalHtml(v.document).replace('</body>',`<p><a href="${e(link)}">Sign in to review and respond</a></p></body>`),headers:{}})
  // Persist only an opaque provider id. Never preserve arbitrary response bodies or echoed secrets.
  const reference=response.providerMessageId
  if(response.status==='accepted'&&typeof reference==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(reference)&&!reference.includes(credential)){result={status:'submitted',providerMessageId:reference};outcome='accepted'}
  else if(response.status==='rate_limited'){result={status:'retry-wait',exceptionClass:'provider-rate-limit'};outcome='rate-limited'}
  else if(response.status==='rejected'){result={status:'exception',exceptionClass:'provider-rejected'};outcome='rejected'}
 }catch(error){if(error instanceof ProviderDispatchError){result={status:error.outcome==='credential-revoked'?'revoked':'exception',exceptionClass:error.outcome};outcome=error.outcome}}
 const saved=await finishProviderJob(env,a,claimed,key,result,outcome)
 const delivery=(await all(env,'commercialEvents')).find(r=>r.value.jobId===job.id&&r.value.type==='delivery')
 if(delivery){const tx=new Transaction(env,a);tx.key=key;tx.action='commercial:delivery-result'
  await tx.record('commercialEvents',{...delivery.value,status:outcome,provider:'resend',providerMessageId:result.providerMessageId??null,completedAt:Date.now(),meaning:outcome==='accepted'?'Provider accepted submission; mailbox delivery unconfirmed':outcome==='rate-limited'?'Provider explicitly rate limited this request; bounded backoff applies before any owner retry':outcome.startsWith('credential-')?'Credential exception; inspect the owned provider job':'Submission not confirmed; owner must reconcile before any further send'},delivery,undefined,tx.action)
  await tx.commit()
 }
 return {id:saved.id,revision:saved.revision,saved:true}
}
