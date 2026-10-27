import type { Row } from './model'
import type { CommercialProposalDocument,CommercialProposalInput } from './commercial-proposal-document'
import { escape as e,input,area,amount,table } from './ui-forms'
import { money,hours,day } from './ui-format'

const prose=(value:string)=>e(value).replace(/\r?\n/g,'<br>')
const list=(values:readonly string[])=>`<ul>${values.map(value=>`<li>${prose(value)}</li>`).join('')}</ul>`

/** A read-only document body, suitable for an owner preview or a recipient page
 * after the caller's proof. No document or recipient state is inferred here. */
export function commercialProposalDocumentBody(document:CommercialProposalDocument):string{
 const d=document,p=d.pricing
 const lines:Row[]=d.lines.map(line=>({id:'proposal-line-'+line.key,revision:'',value:line}))
 const payments:Row[]=d.paymentSchedule.map((payment,index)=>({id:'proposal-payment-'+index,revision:'',value:payment}))
 return `<article id="proposal-document" class="g-block" aria-label="${e(d.title)}">`
  + `<header class="g-card g-card--strong"><p class="g-note">${e(d.notice)}</p><p class="g-summary">${e(d.agencyName)}</p><div class="g-titlebar"><h1>${e(d.title)}</h1></div><p>Prepared for ${e(d.recipient.name)} · ${e(d.recipient.contact)}</p><p class="g-note">${e(d.estimate.name)} · estimate version ${e(d.estimate.number)}</p><p>Proposed dates ${e(day(d.from))} – ${e(day(d.to))} · offer expires ${e(day(d.expiry))}</p></header>`
  + `<section class="g-card"><h2>Scope</h2><p>${prose(d.scope)}</p><h3>Deliverables</h3>${list(d.deliverables)}<h3>Exclusions</h3>${list(d.exclusions)}</section>`
  + `<section class="g-card"><h2>Phases and dates</h2>${d.phases.map(phase=>`<section class="g-card"><h3>${e(phase.name)} · ${e(phase.service)}</h3><p>${phase.mode==='fixed'?'Fixed fee':'Hourly'} · ${e(day(phase.from))} – ${e(day(phase.to))} · ${e(hours(phase.effortSeconds))}</p><p>Fees ${e(money(phase.feeMinor,d.currency))} · expenses ${e(money(phase.expenseMinor,d.currency))}</p></section>`).join('')}</section>`
  + table('Customer prices',lines,[
   {label:'Work',line:1,wrap:true,cell:r=>`${e(r.value.name)}<span class="g-sub">${e(r.value.service)}</span>`},
   {label:'Effort / quantity',line:2,cell:r=>e(r.value.kind==='expense'?`${r.value.quantity} units`:hours(r.value.effortSeconds))},
   {label:'Base rate',line:3,cell:r=>r.value.kind==='expense'?e(money(r.value.baseMinor/r.value.quantity,d.currency))+' per unit':e(money(r.value.billRateMinor,d.currency))+' per hour'},
   {label:'Customer amount',line:2,num:true,cell:r=>e(money(r.value.amountMinor,d.currency))},
  ])
  + `<section class="g-card g-card--strong"><h2>Price summary</h2><p>Subtotal ${e(money(p.baseMinor,d.currency))}</p><p>Contingency ${(p.contingencyBasisPoints/100).toFixed(2)}% · ${e(money(p.contingencyMinor,d.currency))}</p><p>Discount ${(p.discountBasisPoints/100).toFixed(2)}% · ${e(money(p.discountMinor,d.currency))}</p><p>Fees ${e(money(d.feeMinor,d.currency))} · expense allowance ${e(money(d.expenseMinor,d.currency))}</p><p class="g-summary">Total ${e(money(d.totalMinor,d.currency))} · ${e(d.currency)} · ${e(hours(d.effortSeconds))}</p></section>`
  + table('Payment schedule',payments,[
   {label:'Payment',line:1,wrap:true,cell:r=>e(r.value.name)},
   {label:'Due',line:2,cell:r=>e(day(r.value.due))},
   {label:'Amount',line:2,num:true,cell:r=>e(money(r.value.amountMinor,d.currency))},
  ])
  + `<section class="g-card"><h2>Review and acceptance</h2><p>${d.signatureRequired?'A provider signature is required before acceptance can be completed.':'Acceptance is recorded separately from this proposal document.'}</p></section></article>`
}

/** Complete escaped HTML. The route must authorize access before calling this;
 * this renderer neither publishes a proposal nor asserts an acceptance. */
export function commercialProposalHtml(document:CommercialProposalDocument):string{
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><meta name="robots" content="noindex,nofollow"><title>${e(document.title)} · ${e(document.agencyName)}</title><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/gauge.css"><link rel="stylesheet" href="/gauge-shell.css"></head><body class="g-app"><aside class="g-rail" aria-label="Gauge"><a class="g-brand" href="#proposal-document"><img src="/brand/mark.svg" alt="" width="28" height="28"><span>Gauge</span></a></aside><div class="g-work"><main class="g-main">${commercialProposalDocumentBody(document)}</main><footer class="g-foot">Proposal for client review · Prepared with Gauge</footer></div></body></html>`
}

/** Fields only: the parent supplies the owner-only command form and exact-version
 * guards. Split deliverables/exclusions by newlines. After formInput, collect
 * proposalPaymentN{Name,Due,AmountMinor} into paymentSchedule; ignore wholly
 * blank rows and reject partially filled ones. Parse signatureRequired explicitly
 * as true/false; a missing choice is invalid, never a default. */
export function commercialProposalPreparationFields(estimate:Row,defaults:Partial<CommercialProposalInput>={}):string{
 const v=estimate.value,phases=v.phases??[],payments=defaults.paymentSchedule??[]
 const signature=defaults.signatureRequired===undefined?'':String(defaults.signatureRequired)
 let fields=`<input type="hidden" name="estimateId" value="${e(estimate.id)}"><input type="hidden" name="estimateRevision" value="${e(estimate.revision)}"><p class="g-note g-field--wide">Prepare a proposal from ${e(v.name)} · estimate version ${e(v.number)}. Preparation does not release it to a recipient.</p>`
 fields+=input('agencyName','Agency name',defaults.agencyName??'')+input('title','Proposal title',defaults.title??v.name)
 fields+=input('recipientName','Reported recipient name',defaults.recipientName??'')+input('recipientContact','Reported recipient contact',defaults.recipientContact??'')
 fields+=area('scope','Proposed scope',defaults.scope??'')+area('deliverables','Deliverables (one per line)',defaults.deliverables?.join('\n')??'')+area('exclusions','Exclusions (one per line; explicitly state none if applicable)',defaults.exclusions?.join('\n')??'')
 fields+=input('from','Proposed start',defaults.from??phases.map((p:{from:string})=>p.from).sort()[0]??'','date')+input('to','Proposed end',defaults.to??phases.map((p:{to:string})=>p.to).sort().at(-1)??'','date')+input('expiry','Proposal expiry',defaults.expiry??'','date')
 fields+=`<label class="g-field"><span>Provider signature required</span><select name="signatureRequired" required><option value=""${signature===''?' selected':''}>Choose signature requirement</option><option value="false"${signature==='false'?' selected':''}>No</option><option value="true"${signature==='true'?' selected':''}>Yes</option></select></label><p class="g-note g-field--wide">Scheduled payments must total ${e(money(v.totalMinor,v.currency))} in ${e(v.currency)}, in due-date order. Complete every field in each payment you use.</p>`
 for(let index=0;index<Math.max(3,payments.length);index++){
  const payment=payments[index],prefix='proposalPayment'+index,required=index===0||!!payment
  fields+=`<fieldset class="g-form g-field--wide"><legend>Payment ${index+1}${required?'':' (optional)'}</legend>${input(prefix+'Name','Payment description',payment?.name??'','text',required)}${input(prefix+'Due','Payment due date',payment?.due??'','date',required)}${amount(prefix+'AmountDollars',`Payment amount (${v.currency})`,payment?.amountMinor??'',required)}</fieldset>`
 }
 return fields
}
