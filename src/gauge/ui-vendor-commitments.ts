import { needsIndependentReview } from './approval-policy'
import type { Actor } from './store'
import { finance } from './store'
import type { Report } from './ui-describe'
import type { Row, Value } from './model'
import { currentVendors, vendorCosts } from './vendor-commitments'
import { form, input, amount, area, decision, escape as e } from './ui-forms'
import { money, chip } from './ui-format'
import { phasePicker } from './ui-budget-phases'

const hidden=(key:string,value:unknown)=>`<input type="hidden" name="${e(key)}" value="${e(value)}">`
const history=(kind:string,row:Row)=>`<a href="/api/gauge/history/${kind}/${e(row.id)}">Revision history</a>`
export function vendorSection(a:Actor,report:Report,engagementId:string) {
 if(!finance(a))return ''
 const commitments=report.data.vendorCommitments.filter(c=>c.value.engagementId===engagementId),bills=report.data.vendorBills.filter(c=>c.value.engagementId===engagementId),current=currentVendors(commitments)
 const approve=(action:string,label:string,row:Row,rows:Row[])=>{
  const previous=rows.find(r=>r.id===row.value.previousId),independent=needsIndependentReview(report.data.approvalPolicies[0],{currency:row.value.currency,amountMinor:Math.max(row.value.amountMinor,previous?.value.amountMinor??0)})
  return independent&&row.value.createdBy===a.session.operator.id?'<p>Needs an independent approver</p>':decision(action,label,row,true)
 }
 const common=(v:Value={})=>hidden('engagementId',engagementId)+amount('amountDollars','Amount',v.amountMinor??'')+input('date','Record date',v.date??'','date')+area('reason','Preparation reason')
 const fields=(v:Value={})=>common(v)+input('vendor','Vendor',v.vendor??'')+area('scope','Subcontractor scope',v.scope??'')+input('poReference','Purchase order reference',v.poReference??'')+input('from','Scope starts',v.from??'','date')+input('to','Scope ends',v.to??'','date')+input('expectedDate','Expected cost date',v.expectedDate??'','date')+phasePicker(report,engagementId,v.phaseKey)
 const billForm=(c:Row,v:Value={},row?:Row)=>form('vendorBill:save',row?'Edit received bill':v.previousId?'Prepare bill correction':'Receive a bill',common(v)+hidden('phaseKey',c.value.phaseKey??'')+hidden('commitmentId',c.id)+hidden('commitmentRevision',c.revision)+input('reference','Vendor bill reference',v.reference??'')+(v.previousId?hidden('previousId',v.previousId)+hidden('previousRevision',v.previousRevision):''),row,'Save bill draft')
 const ledger=vendorCosts(report.data,report.forecast?.asOf).filter(v=>v.commitment.value.engagementId===engagementId)
 const totals=ledger.map(v=>`<p><strong>${e(v.commitment.value.vendor)} · ${e(v.commitment.value.poReference)}</strong> · Actual ${money(v.actualMinor,a.currency)} · Remaining ${money(v.remainingMinor,a.currency)} · Forecast ${money(v.actualMinor+v.remainingMinor,a.currency)} · <a href="?edit=${e(engagementId)}&amp;calculation=${e('vendor:'+v.commitment.id+':totalMinor')}#report-evidence">Calculation and sources</a></p>`).join('')
 return `<section class="g-block" id="vendor-commitments"><h2>Vendor commitments and bills</h2><p>Private, same-currency vendor costs. User-recorded bills do not establish accounting posting, payment or settlement. Ambiguous expense and contractor-work overlaps are refused.</p>${totals}
 <details><summary>New commitment</summary>${form('vendor:save','Prepare commitment',fields(),undefined,'Save commitment draft')}</details>
 ${commitments.map(c=>`<article class="g-card" id="vendor-${e(c.id)}"><h3>${e(c.value.vendor)} · ${e(c.value.poReference)}</h3><p>${chip(c.value.status)} · ${money(c.value.amountMinor,c.value.currency)} · ${e(c.value.scope)} · ${e(c.value.from)} to ${e(c.value.to)}${c.value.previousId?' · Linked correction':''}</p><p>${history('vendorCommitments',c)}</p>${c.value.status==='draft'?`<details><summary>Edit commitment draft</summary>${form('vendor:save','Edit commitment',fields(c.value)+(c.value.previousId?hidden('previousId',c.value.previousId)+hidden('previousRevision',c.value.previousRevision):''),c,'Save commitment draft')}</details>${approve('vendor:approve','Approve commitment',c,commitments)}`:current.some(r=>r.id===c.id)?`<details><summary>Receive bill</summary>${billForm(c)}</details><details><summary>Correct commitment</summary>${form('vendor:save','Prepare commitment correction',fields(c.value)+hidden('previousId',c.id)+hidden('previousRevision',c.revision),undefined,'Prepare correction')}</details>`:'<p>Superseded by a linked approved correction.</p>'}</article>`).join('')}
 ${bills.map(b=>{const c=current.find(c=>c.value.rootId===b.value.commitmentRootId);return `<article class="g-card" id="bill-${e(b.id)}"><h3>${e(b.value.vendor)} · ${e(b.value.reference)}</h3><p>${chip(b.value.status)} · ${money(b.value.amountMinor,b.value.currency)} · ${e(b.value.date)}${b.value.previousId?' · Linked correction':''}</p><p>${e(b.value.evidence)}</p><p>${history('vendorBills',b)} · ${b.value.attachmentIds.map((id:string)=>`<a href="/api/gauge/vendor-files/${e(id)}">Bill original</a>`).join(' · ')}</p>${b.value.status==='draft'?`${c?`<details><summary>Edit bill draft</summary>${billForm(c,b.value,b)}</details>`:''}${form('vendorBill:file','Retain bill original',input('file','Original bill file','','file'),b,'Attach original')}${approve('vendorBill:approve','Approve and match bill',b,bills)}`:c&&currentVendors(bills).some(r=>r.id===b.id)?`<details><summary>Correct bill</summary>${billForm(c,{...b.value,previousId:b.id,previousRevision:b.revision})}</details>`:''}</article>`}).join('')}</section>`
}
