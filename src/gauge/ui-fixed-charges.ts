import type { Report } from './ui-describe'
import { escape as e, input, choices, form, decision } from './ui-forms'
import { money, nameOf } from './ui-format'

const hidden=(name:string,value:string)=>`<input type="hidden" name="${e(name)}" value="${e(value)}">`

/** Approved commercial charges remain separate from delivery acceptance and earned revenue. */
export function fixedChargesSection(report: Report, today: string) {
 const d=report.data
 const latest=new Map(d.engagements.map(eng=>[eng.id,d.budgets.filter(b=>b.value.engagementId===eng.id&&b.value.status==='approved').reverse().sort((a,b)=>b.value.approvedAt-a.value.approvedAt)[0]]))
 const editors=[...latest].filter(([,b])=>b?.value.mode==='fixed').map(([id,b])=>form('fixed:prepare',`Prepare a fixed-fee charge · ${nameOf(d.engagements,id)}`,hidden('engagementId',id)+hidden('budgetId',b!.id)+hidden('budgetRevision',b!.revision)+`<p>Approved fixed fee ${money(b!.value.amountMinor,b!.value.currency)}. Progress is cumulative: prior approved charges and milestones are deducted once. A charge schedules billing; it does not confirm delivery or recognize revenue.</p>`+input('name','Charge name')+choices('chargeType','Charge type',['deposit','progress'])+input('cumulativePercent','Cumulative percentage (for example 20 or 50)')+input('date','Scheduled invoice date',today,'date')+input('reason','Charge reason'),undefined,'Prepare charge','g-bare'))
 const cards=d.fixedCharges.map(r=>{const v=r.value;return `<article class="g-card" id="fixed-${e(r.id)}"><h3>${e(v.name)} · ${e(nameOf(d.engagements,v.engagementId))}</h3><p>${e(v.chargeType)} · ${e(v.status)} · ${e(v.date)}</p><p>Gross cumulative ${(v.cumulativeBasisPoints/100).toFixed(2)}%: ${money(v.grossMinor,v.currency)} · Prior approved: ${money(v.priorMinor,v.currency)} · This charge: ${money(v.amountMinor,v.currency)}</p><p>${e(v.reason)}</p>${v.status==='draft'?decision('fixed:approve','Approve fixed charge',r):'<p>Approved schedule; prepare its source in a billing packet above.</p>'}<a href="/api/gauge/history/fixedCharges/${e(r.id)}">Charge history</a></article>`})
 return `<section class="g-block" id="fixed-charges"><h2>Fixed-fee deposits and progress</h2><p>One engagement per packet. These charges are pre-tax and are not sent or collected automatically.</p>${editors.join('')||'<p>Approve fixed-fee terms to prepare a deposit or progress charge.</p>'}${cards.join('')}</section>`
}
