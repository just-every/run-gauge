import type { Actor } from './store'
import { finance } from './store'
import type { Row, Value } from './model'
import type { Report } from './ui-describe'
import { area, check, choices, escape as e, form, input } from './ui-forms'
import { hours, money, nameOf, when } from './ui-format'
import { handoffNotice, receiverNotice } from './specialist-handoff'

const label=(category:string)=>category==='labor'?'Approved labor':category==='expense'?'Approved expenses':category==='invoice'?'Issued invoices (pre-tax)':category==='payment'?'User-recorded receipts':'Revenue inputs (billing preparation)'
const controlTotals=(totals:Value[])=>`<ul class="g-lines">${totals.map(t=>`<li>${e(label(t.category))} · ${e(t.currency)} · ${e(t.count)} lines · ${t.amountMinor===null?`Unknown total; known subtotal ${money(t.knownAmountMinor,t.currency)} (${e(t.unknownAmountCount)} unknown)`:money(t.amountMinor,t.currency)} · ${hours(t.durationSeconds)}</li>`).join('')}</ul>`

export function specialistHandoffSection(a:Actor,report:Report):string {
 if(!finance(a))return ''
 const d=report.data,selected:string[]=[]
 for(const kind of ['time','expenses','packets','invoices','invoiceCorrections','payments'] as const)for(const r of d[kind].filter(r=>kind==='invoices'||kind==='payments'||(kind==='invoiceCorrections'?r.value.status==='issued':r.value.status==='approved'))){
  const v=r.value,kindLabel=kind==='time'?'Labor':kind==='expenses'?'Expense':kind==='invoices'?'Issued invoice (pre-tax)':kind==='invoiceCorrections'?(v.type==='void'?'Issued void':'Issued credit note'):kind==='payments'?'User-recorded receipt':'Billing-preparation revenue input'
  const detail=kind==='time'?`${nameOf(d.people,v.personId)} · ${v.workDate} · ${hours(v.durationSeconds)}`:kind==='expenses'?`${v.date} · ${money(v.amountMinor,v.currency)}`:kind==='invoices'?`${v.number} · ${v.issueDate} · ${money(v.totalMinor,v.currency)}`:kind==='invoiceCorrections'?`${v.number??'Void'} of ${v.invoiceNumber} · ${v.date} · −${money(v.amountMinor,v.currency)}`:kind==='payments'?`${d.invoices.find(invoice=>invoice.id===v.invoiceId)?.value.number??v.invoiceId} · ${v.date} · ${money(v.amountMinor,v.currency)} · ${v.reference}`:`${v.title} · ${money(v.totalMinor,v.currency)}`
  selected.push(check('handoffSources',`${kindLabel} · ${nameOf(d.engagements,v.engagementId)} · ${detail}`,false,JSON.stringify({kind,id:r.id,revision:r.revision})))
 }
 const fields='<input type="hidden" name="page" value="billing">'+input('recipient','Accountant or payroll recipient')+
  choices('purpose','Specialist purpose',['accounting','payroll'])+area('reason','Preparation and approval reason')+
  `<fieldset class="g-checklist g-checks"><legend>Approved input revisions</legend>${selected.join('')||'<p class="g-empty">Approve time, expenses or billing packets, issue an invoice or record a receipt to prepare inputs.</p>'}</fieldset>`
 const handoffs=d.specialistHandoffs
 const cards=handoffs.map(r=>{
  const v=r.value,result=v.result
  const rejected=result?.lines.filter((l:Value)=>l.status==='rejected')??[]
  const status=!result?'Awaiting user-recorded receiver result':rejected.length?'User-recorded result with unresolved rejections':'User-recorded result: all inputs accepted'
  return `<article class="g-card"><h3>${e(v.recipient)} · ${e(v.purpose)}</h3><p>${e(status)}</p><p>Prepared by finance ${e(when(v.approvedAt,a.timezone))}. ${e(v.reason)}</p>${controlTotals(v.controlTotals)}<div class="g-actions"><a class="g-link" href="/api/gauge/handoffs/${e(r.id)}">Download prepared inputs CSV</a><a class="g-link" href="/api/gauge/history/specialistHandoffs/${e(r.id)}">Review handoff history</a></div>`+
   (result?`<p>${e(receiverNotice)} Recorded ${e(when(result.recordedAt,a.timezone))}.</p><h4>Accepted inputs (${e(result.acceptedCount)})</h4>${controlTotals(result.acceptedTotals)}${rejected.length?`<h4>Unresolved rejected inputs (${e(result.rejectedCount)})</h4>${controlTotals(result.rejectedTotals)}<ul class="g-lines">${rejected.map((l:Value)=>`<li>${e(label(v.lines.find((source:Value)=>source.id===l.id)?.category??''))} · ${e(l.reason)}</li>`).join('')}</ul>`:''}`:
    form('handoff:record-result','Record receiver result','<input type="hidden" name="page" value="billing">'+input('file','Receiver JSON result','','file').replace('type="file"','type="file" accept="application/json,.json"'),r,'Record result','g-bare'))+'</article>'
 }).join('')
 return `<section class="g-block" id="specialist-handoffs"><h2>Accountant and payroll handoffs</h2><p>${e(handoffNotice)}</p><p>Download and transfer the reviewed file yourself. Import the receiver’s JSON result to reconcile each accepted or rejected line. ${e(receiverNotice)} Labor, expense, revenue-input, invoice and payment totals remain separate by category and currency; they are never added into one amount.</p>`+
  form('handoff:prepare','Approve and prepare specialist inputs',fields,undefined,'Prepare approved inputs','g-card--form')+
  `<details class="g-reveal"><summary>Receiver result format</summary><p>The JSON object names handoffId, artifactHash and lines. Every exported line must appear once with id, status (accepted or rejected), currency, amountMinor and durationSeconds copied exactly. Unknown amounts and absent durations use JSON null. Rejected lines require reason. The result records the receiver’s report; it does not verify the provider or perform payroll, bookkeeping or tax filing.</p></details>${cards}</section>`
}
