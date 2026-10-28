import type { Value } from './model'
import { escape as e,form,area,check } from './ui-forms'
import { commercialProposalHtml } from './ui-commercial-proposal-document'
import type { scopePreviewRead } from './scope-extraction'

const hidden=(name:string,value:string)=>`<input type="hidden" name="${e(name)}" value="${e(value)}">`
const citations=(rows:Value[])=>rows.length?`<ul>${rows.map(c=>`<li><code>${e(c.field)}${c.start===undefined?'':` · characters ${c.start}–${c.end}`}</code><blockquote>${e(c.quote)}</blockquote></li>`).join('')}</ul>`:'<p>Unknown: no supported explicit terms found.</p>'
export function scopePreviewPage(read:Awaited<ReturnType<typeof scopePreviewRead>>) {
 const {source,previews}=read,p=source.proposal
 let panel=`<section id="scope-extraction" class="g-block"><h1>Signed scope preview</h1><p><a href="/app/engagements?estimate=${e(p.value.estimateId)}">Return to proposal</a></p><p>Verified signature and exact client acceptance retained.</p><details><summary>Exact retained source</summary><p>Signature evidence ${e(source.signatureEvidenceId)} · client acceptance ${e(source.acceptanceId)}</p><p>Proposal ${e(p.id)} · revision ${e(p.revision)}</p><p>Document fingerprint ${e(p.value.fingerprint)}</p><p>Original PDF digest ${e(source.originalSha256)}</p></details>`
 panel+=form('scope:preview','Extract retained signed scope',hidden('proposalId',p.id)+hidden('proposalRevision',p.revision)+area('reason','Preview reason'),undefined,'Prepare scope preview')
 for(const preview of previews){const v=preview.value,x=v.extraction
  panel+=`<section class="g-card" id="scope-${e(preview.id)}"><h2>${e(({stale:'Source changed — prepare a new preview','needs-amendment':'Source amendment required','resolved-for-review':'Resolved for human review','blocked-human-resolution':'Human resolution required'})[preview.status]??preview.status)}</h2><p>${e(x.notice)}</p><details><summary>Source citations and competing interpretations</summary>`
  for(const [key,label] of [['deliverables','Deliverables'],['exclusions','Exclusions'],['roles','Roles'],['retainerTerms','Retainer terms'],['billingTriggers','Billing triggers']])panel+=`<h3>${label}</h3>${citations(x[key])}`
  panel+=`<h3>Unknowns</h3><ul>${x.unknowns.map((s:string)=>`<li>${e(s)}</li>`).join('')}</ul>`
  for(const ambiguity of x.ambiguities)panel+=`<h3>${e(ambiguity.question)}</h3>${ambiguity.interpretations.map((i:Value)=>`<h4>${e(i.label)}</h4>${citations(i.citations)}`).join('')}`
  panel+='</details>'
  if(preview.resolution){const r=preview.resolution.value;panel+=`<h3>Human interpretation</h3><p>${e(r.interpretation)} · ${e(r.meaning)}</p><p>${e(r.reason)} · recorded by ${e(r.operatorId)}</p>`}
  else if(preview.current)panel+=form('scope:resolve','Resolve this exact preview',hidden('proposalId',p.id)+hidden('proposalRevision',p.revision)+hidden('ambiguityId','meaning')+`<label class="g-field g-field--wide"><span>Interpretation</span><select name="interpretation" aria-label="Interpretation" required><option value="">Choose an interpretation</option>${x.ambiguities[0].interpretations.map((i:Value)=>`<option value="${e(i.id)}">${e(i.label)}</option>`).join('')}</select></label>`+area('meaning','Accepted interpretation')+area('reason','Resolution reason')+check('confirm','I reviewed these exact citations. This records interpretation only and creates no business effects.',false,'record-interpretation-only'),preview,'Record human resolution')
  panel+='</section>'
 }
 return commercialProposalHtml(p.value.document).replace('<main class="g-main">','<main class="g-main">'+panel+'</section>')
}
