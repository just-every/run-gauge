import type { Actor } from './store'
import type { Row } from './model'
import type { Report } from './ui-describe'
import { form,area,select,input,check,decision,escape as e } from './ui-forms'
import { commercialProposalDocumentBody,commercialProposalPreparationFields } from './ui-commercial-proposal-document'
const hidden=(name:string,value:string)=>`<input type="hidden" name="${e(name)}" value="${e(value)}">`
export function commercialProposalSection(a:Actor,report:Report,estimate:Row){
 const rows=report.data.commercialProposals.filter(r=>r.value.estimateRootId===estimate.value.rootId),latest=rows.at(-1)
 let html='<section id="commercial-proposals" class="g-block"><h2>Client proposals</h2><p>Review a complete customer document before sending. Only its invited recipient can open the client link and respond. A newer proposal or estimate needs fresh acceptance. Private costs and staffing assumptions are excluded.</p>'
 for(const row of rows){const v=row.value,events=report.data.commercialEvents.filter(r=>r.value.proposalId===row.id)
  html+=`<section class="g-card" id="commercial-${e(row.id)}"><h3>${e(v.document.title)} · proposal version ${v.number}</h3><p>${e(v.status)} · ${e(v.document.recipient.name)} · ${e(v.document.recipient.contact)}</p><details><summary>Review the exact customer document</summary>${commercialProposalDocumentBody(v.document).replaceAll('id="',`id="${e(row.id)}-`)}</details><ul>${events.map(r=>`<li>${e(r.value.type)}${r.value.status?' · '+e(r.value.status):''} · ${e(r.value.meaning??r.value.reason??r.value.contact??'')} <a href="/api/gauge/history/commercialEvents/${e(r.id)}">History</a></li>`).join('')}</ul>`
  if(a.role==='owner')for(const event of events.filter(r=>r.value.type==='delivery'))html+=form('commercial:delivery-readback','Reconcile mailbox delivery',input('providerMessageId','Provider message id (required if submission timed out)',event.value.providerMessageId??'','text',false)+area('reason','Reconciliation reason','',false),event,'Read delivery status')
  if(a.role==='owner'&&v.status==='released'&&v.document.signatureRequired){
   html+=form('commercial:signature-bind','Bind signed proposal evidence',select('connectionId','Inkwell connection',report.data.providerConnections.filter(c=>c.value.provider==='inkwell'&&!c.value.revokedAt).map(c=>({...c,value:{name:c.value.accountLabel}})))+input('envelopeId','Inkwell envelope id')+input('originalSha256','Original PDF SHA-256')+area('reason','Original PDF review reason')+check('confirm','I reviewed the original PDF and it contains this exact complete proposal.',false,'reviewed-exact-pdf'),row,'Bind reviewed original')
   if(events.some(r=>r.value.type==='signature-binding'))html+=decision('commercial:signature-readback','Read signed evidence from Inkwell',row)
  }
  if(a.role==='owner'&&latest?.id===row.id&&v.status==='prepared')html+=form('commercial:send','Send this exact proposal',`<p class="g-note g-field--wide">First invite ${e(v.document.recipient.contact)} through <a href="/app/access">Access</a> and have them confirm their email. Leave internal Gauge access unassigned. Sending records provider submission separately from mailbox delivery.</p>`+select('connectionId','Resend connection',report.data.providerConnections.filter(c=>c.value.provider==='resend'&&!c.value.revokedAt).map(c=>({...c,value:{name:c.value.accountLabel}})))+area('reason','Sending reason'),row,'Send proposal')
  if(a.role==='owner'&&v.status==='released')html+=form('commercial:reconnect','Restore recipient access after installation restore',area('reason','Fresh recipient authorization reason'),row,'Authorize restored access')
  if(a.role==='owner'&&v.status!=='revoked')html+=form('commercial:revoke','Revoke client access',area('reason','Revocation reason'),row,'Revoke client access')
  html+='</section>'
 }
 if(a.role==='owner'&&!report.data.estimateConversions.some(c=>c.value.estimateId===estimate.id))html+=form('commercial:prepare',latest?'Prepare a new proposal version':'Prepare client proposal',commercialProposalPreparationFields(estimate,latest?{...latest.value.document,recipientName:latest.value.document.recipient.name,recipientContact:latest.value.document.recipient.contact}:{} )+(latest?hidden('previousId',latest.id):'')+area('reason','Proposal version reason'),undefined,'Prepare proposal')
 return html+'</section>'
}
