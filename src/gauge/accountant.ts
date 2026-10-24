import type { Bindings } from '../auth.server'
import { type Actor, all, fence } from './store'
import { need } from './model'
import { escape as e } from './ui-forms'
import { money } from './ui-format'

// This closed read list does not confer the finance role or its mutations.
export async function accountantInputs(env:Bindings,a:Actor){
 need(a.role==='accountant','Read-only accountant access required',403)
 await fence(env,a)
 const handoffs=(await all(env,'specialistHandoffs')).filter(r=>r.value.purpose==='accounting').map(r=>({id:r.id,revision:r.revision,recipient:r.value.recipient,approvedAt:r.value.approvedAt,controlTotals:r.value.controlTotals,status:r.value.status,result:r.value.result?{verification:r.value.result.verification,acceptedTotals:r.value.result.acceptedTotals,rejectedTotals:r.value.result.rejectedTotals}:null}))
 const closes=(await all(env,'periodCloses')).map(r=>({id:r.id,revision:r.revision,month:r.value.month}))
 await fence(env,a)
 return {handoffs,closes,notice:'Read-only reviewed accounting inputs and operational close evidence. No authority to edit time, approve journals, issue invoices or change access.'}
}
export async function accountantBody(env:Bindings,a:Actor){
 const data=await accountantInputs(env,a)
 return `<div class="g-titlebar"><h1>Accountant inputs</h1></div><p class="g-lede">${e(data.notice)}</p><section class="g-card"><h2>Reviewed accounting exports</h2><ul class="g-lines">${data.handoffs.map(r=>`<li><a href="/api/gauge/handoffs/${e(r.id)}">${e(r.recipient)} · Download reviewed inputs</a><p>${r.status==='awaiting-result'?'Awaiting user-recorded receiver result':r.status==='recorded-with-rejections'?'User-recorded result with unresolved rejections':'User-recorded result: all inputs accepted'}</p>${r.controlTotals.map((t:any)=>`<p>${e(({labor:'Approved labor',expense:'Approved expenses','revenue-input':'Billing preparation',invoice:'Issued invoice inputs',payment:'User-recorded receipts',recognition:'Operational revenue journals'} as Record<string,string>)[t.category]??'Accounting inputs')} · ${t.amountMinor===null?'Unknown total':money(t.amountMinor,t.currency)}</p>`).join('')}</li>`).join('')||'<li>No reviewed accounting exports.</li>'}</ul></section><section class="g-card"><h2>Operational close evidence</h2><ul class="g-lines">${data.closes.map(r=>`<li><a href="/api/gauge/closes/${e(r.id)}">${e(r.month)} · Download close evidence</a></li>`).join('')||'<li>No completed operational closes.</li>'}</ul></section>`
}
