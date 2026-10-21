import type { Actor } from './store'
import { finance } from './store'
import type { Value } from './model'
import type { Report } from './ui-describe'
import { escape as e, input as i, amount, duration, form, weekdayChecks, table } from './ui-forms'
import { retainerRuleFields, describeRetainerRules } from './ui-retainer-rules'
import { retainerAllocationForms } from './ui-retainer-allocation'
import { retainerStatementSection, retainerEvidence } from './ui-retainer-statement'
import { money } from './ui-format'
import { retainerCloseSection, retainerAdjustmentLinks } from './ui-retainer-close'

const area=(name:string,label:string,value='')=>`<label class="g-field g-field--wide"><span>${e(label)}</span><textarea name="${e(name)}" aria-label="${e(label)}" rows="3" required>${e(value)}</textarea></label>`
const hidden=(name:string,value:unknown)=>`<input type="hidden" name="${e(name)}" value="${e(value)}">`
const choice=(name:string,label:string,options:[string,string][],value:string)=>`<label class="g-field"><span>${e(label)}</span><select name="${e(name)}" aria-label="${e(label)}">${options.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${e(label)}</option>`).join('')}</select></label>`
const quantity=(unit:string,n:number|null,currency:string)=>n===null?'Unknown':unit==='value'?money(n,currency):`${n<0?'−':''}${Math.floor(Math.abs(n)/3600)} h ${Math.floor(Math.abs(n)%3600/60)} min${Math.abs(n)%60?` ${Math.abs(n)%60} s`:''}`
const nextDay=(day:string)=>new Date(Date.parse(day)+86400000).toISOString().slice(0,10)
export function retainerSection(a:Actor,report:Report,engagementId:string,options:Value){
 const engagement=report.data.engagements.find(r=>r.id===engagementId)
 if(a.role==='staff')return retainerStatementSection(report,engagementId)
 if(!engagement||engagement.value.type==='internal'||(!finance(a)&&(a.role!=='lead'||engagement.value.leadId!==a.personId)))return ''
 const terms=report.data.retainers.filter(r=>r.value.engagementId===engagementId),periods=report.data.retainerPeriods.filter(r=>r.value.engagementId===engagementId),preview=options.retainerPreview
 let body='<section id="retainers" class="g-card"><h2>Recurring retainers</h2><p>Commercial versions and period entitlements stay separate from project budgets. Calendar-day proration is the default; working-day proration uses the saved agency workweek and holidays. Values round half up to cents; hours round to whole minutes.</p>'
 if(finance(a)&&periods.length&&!preview)body+='<p><a href="#retainer-corrections">Close periods and review corrections</a></p>'
 if(preview){
  const t=preview.terms
  body+=`<h3>Review ${e(t.name)}</h3><p>${e(t.frequency)} · ${e(quantity(t.unit,t.allowance,t.currency))} per full period · ${e(t.proration)} days · ${e(t.renewal)} renewal · ${t.noticeDays} days notice</p><p>Eligible services: ${e(t.services.join(', '))}. Consumption: ${e(t.consumes)} approved time, by its work date and frozen bill value.</p>`
  body+=table('Previewed period entitlements',preview.periods.map((p:Value)=>({id:p.periodStart,revision:'',value:p})),[
   {label:'Period',size:'date',line:1,cell:r=>e(`${r.value.periodStart} → ${r.value.periodEnd}`)},
   {label:'Active dates',line:2,cell:r=>e(`${r.value.activeStart} → ${r.value.activeEnd}`)},
   {label:'Proration',line:3,cell:r=>`${r.value.numeratorDays} / ${r.value.denominatorDays} ${e(t.proration)} days`},
   {label:'Included allowance',line:3,cell:r=>e(quantity(t.unit,r.value.allowance,t.currency))},
   {label:'Renewal and notice',line:3,cell:r=>`Renewal ${e(r.value.renewalDate??'ends')} · notice ${e(r.value.noticeDate??'none')}`},
  ])
  body+=`<p>${describeRetainerRules(t)}</p>${finance(a)?`<p>Period fee: ${t.feeMinor==null?'Not recorded':e(money(t.feeMinor,t.currency))} · separate from allowance; earned ratably, not invoiced. Billing schedule assumed until scheduled retainer billing is available.</p>`:''}`
  body+=form('retainer:approve','Save reviewed retainer',hidden('retainerInput',JSON.stringify(preview.input))+hidden('fingerprint',preview.fingerprint)+area('reason','Commercial approval reason'),undefined,'Save retainer')
  return body+retainerAllocationForms(report,engagementId)+retainerEvidence(report,engagementId)+'</section>'
 }
 const latest=terms.filter(t=>!terms.some(n=>n.value.previousId===t.id))
 if(a.role==='owner'){
  const calendar=report.data.agencyCalendars.at(-1)
  body+=`<details><summary>Agency workweek and holidays</summary>${form('agency:calendar','Agency calendar version',hidden('engagementId',engagementId)+hidden('previousId',calendar?.id??'')+hidden('page','engagements')+weekdayChecks(calendar?.value.calendar.weekdays.join(',')??'1,2,3,4,5')+i('holidays','Agency holidays (comma-separated dates)',calendar?.value.calendar.holidays.join(', ')??'','text',false)+area('reason','Calendar change reason'),undefined,'Save agency calendar')}</details>`
 }
 const editor=(old?:typeof terms[number])=>{
  const t=old?.value.terms??{},saved=old?periods.filter(p=>p.value.rootId===old.value.rootId):[],last=saved.map(p=>p.value.periodEnd).sort().at(-1)
  const start=last?nextDay(last):options.today
  return form('retainer:preview',old?`New version: ${t.name}`:'New retainer',hidden('engagementId',engagementId)+hidden('previousId',old?.id??'')+hidden('operation','terms')+i('name','Retainer name',t.name)+choice('frequency','Period frequency',[['monthly','Monthly'],['quarterly','Quarterly'],['annual','Annual']],t.frequency??'monthly')+choice('unit','Allowance type',[['value','Value'],['hours','Hours']],t.unit??'value')+amount('allowanceDollars',`Included value (${engagement.value.currency})`,t.unit==='value'?t.allowance:0)+(finance(a)?amount('feeDollars',`Period fee (${engagement.value.currency}, optional)`,t.feeMinor??'',false):'')+duration('allowanceHours','Included hours',t.unit==='hours'?t.allowance:0,3600,'any')+area('services','Eligible services (one per line)',t.services?.join('\n')??'Delivery')+choice('consumes','Approved work consuming allowance',[['all','All'],['billable','Billable only'],['nonbillable','Nonbillable only']],t.consumes??'billable')+choice('proration','Proration basis',[['calendar','Calendar days'],['working','Agency working days']],t.proration??'calendar')+i('start','Retainer start date',start,'date')+i('end','Retainer end date (optional)',t.end??'','date',false)+choice('renewal','Renewal terms',[['automatic','Automatic'],['manual','Manual decision each period']],t.renewal??'automatic')+i('noticeDays','Renewal notice (calendar days)',t.noticeDays??0,'number')+retainerRuleFields(t,engagement.value.currency),undefined,'Preview retainer')
 }
 body+=`<details><summary>Set up a retainer</summary>${editor()}</details>`
 for(const term of latest){const t=term.value.terms;body+=`<article class="g-card"><h3>${e(t.name)} · version ${term.value.number}</h3><p>${e(t.frequency)} · ${e(quantity(t.unit,t.allowance,t.currency))} · ${e(t.services.join(', '))} · ${e(t.consumes)} approved work · ${e(t.start)} → ${e(t.end??'ongoing')} · ${e(t.renewal)} renewal</p><p>${describeRetainerRules(t)}</p>${finance(a)?`<p>Period fee: ${t.feeMinor==null?'Not recorded':e(money(t.feeMinor,t.currency))} · earned ratably, not invoiced; assumed schedule until scheduled retainer billing is available.</p>`:''}<details><summary>Revise future commercial terms</summary>${editor(term)}</details>${form('retainer:preview','Preview further periods',hidden('engagementId',engagementId)+hidden('retainerId',term.id)+hidden('operation','periods')+i('from','Period window start',t.start,'date')+i('to','Period window end',t.start,'date'),undefined,'Preview periods')}</article>`}
 body+=table('Saved retainer periods',periods,[
  {label:'Retainer',line:1,cell:r=>e(terms.find(t=>t.id===r.value.retainerId)?.value.terms.name)},
  {label:'Period',size:'date',line:2,cell:r=>`${e(`${r.value.periodStart} → ${r.value.periodEnd}`)}${report.retainerBalances.find(b=>b.periodId===r.id)?.closed?' · Closed snapshot':''}`},
  {label:'Entitlement',line:3,cell:r=>`Included ${e(quantity(r.value.unit,r.value.allowance,r.value.currency))} · ${r.value.numeratorDays}/${r.value.denominatorDays} days`},
  {label:'Opening balance',line:3,cell:r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `Opening ${e(quantity(r.value.unit,b.opening,r.value.currency))} · rollover ${e(quantity(r.value.unit,b.rollover,r.value.currency))} · deficit ${e(quantity(r.value.unit,b.deficitOpening,r.value.currency))} · adjustments ${e(quantity(r.value.unit,b.adjustments,r.value.currency))} · expired ${e(quantity(r.value.unit,b.expired,r.value.currency))} · cap forfeiture ${e(quantity(r.value.unit,b.forfeited,r.value.currency))}`}},
  {label:'Approved consumption',line:3,cell:r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `Consumed ${e(quantity(r.value.unit,b.consumed,r.value.currency))} · remaining ${e(quantity(r.value.unit,b.remaining,r.value.currency))}${b.unknownSources.length?' · Approved bill value unknown or restricted':''}`}},
  {label:'Pending projection',line:3,cell:r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `Pending ${e(quantity(r.value.unit,b.pending,r.value.currency))}${finance(a)||r.value.unit==='hours'?` · prepared allowance changes ${e(quantity(r.value.unit,b.projectedAdjustments??0,r.value.currency))}`:''} · projected remaining ${e(quantity(r.value.unit,b.projectedRemaining,r.value.currency))} · unallocated ${e(quantity('hours',b.unallocatedSeconds,r.value.currency))} · ${b.provisional?'Provisional; not posted consumption':'No pending stopped work'}${retainerAdjustmentLinks(report,b,finance(a))}`}},
  {label:'Renewal',line:3,cell:r=>`Renewal ${e(r.value.renewalDate??'ends')} · notice ${e(r.value.noticeDate??'none')}`},
 ],r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `<a href="/app/engagements?edit=${e(engagementId)}&calculation=${e(encodeURIComponent(`retainer:${r.id}:allowance`))}#report-evidence">Calculation and sources</a>${finance(a)&&b.overageMinor>0?form('packet:create','Review retainer overage',hidden('engagementId',engagementId)+hidden('sources',`retainerPeriods:${r.id}`)+i('title','Overage packet title',`Retainer overage ${r.value.periodStart}`)+`<p>${e(quantity(r.value.unit,b.overage,r.value.currency))} excess · ${e(money(b.overageMinor,r.value.currency))}. Creates a draft; finance reviews it before approval.</p>`,undefined,'Draft overage packet'):''}<details><summary>FIFO source allocation</summary><ul>${b.allocation.map((x:Value)=>`<li><a href="/app/time?edit=${e(x.sourceId)}">Source time</a> · ${e(quantity(r.value.unit,x.quantity,r.value.currency))} · ${x.allowancePeriodId?e(periods.find(p=>p.id===x.allowancePeriodId)?.value.periodStart??'Earlier allowance'):'Overage'}</li>`).join('')}</ul></details>${b.pendingSources.length?`<details><summary>Provisional pending sources</summary><ul>${b.pendingSources.map((id:string)=>`<li><a href="/app/time?edit=${e(id)}">Pending time</a></li>`).join('')}</ul></details>`:''}`})
 if(terms.length)body+=`<details><summary>Commercial version history</summary><ul>${terms.map(t=>`<li>${e(t.value.terms.name)} · version ${t.value.number} · ${e(t.value.reason)} · starts ${e(t.value.terms.start)}</li>`).join('')}</ul></details>`
 return body+retainerAllocationForms(report,engagementId)+retainerEvidence(report,engagementId)+'</section>'+retainerCloseSection(a,report,engagementId,options.today)
}
