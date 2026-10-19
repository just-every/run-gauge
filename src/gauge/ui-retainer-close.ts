import type { Actor } from './store'
import { needsIndependentReview } from './approval-policy'
import { finance } from './store'
import type { Row, Value } from './model'
import type { Report } from './ui-describe'
import { amount, area, escape as e, form } from './ui-forms'
import { day, hours, money, period as periodLabel, when } from './ui-format'
import { describeRetainerRules } from './ui-retainer-rules'
import { retainerSourceMatches } from './retainer-sources'
import { retainerMatches } from './retainer-rules'

const hidden=(name:string,value:unknown)=>`<input type="hidden" name="${e(name)}" value="${e(value)}">`
const quantity=(unit:string,value:number|null|undefined,currency:string)=>unit==='hours'?hours(value):money(value,currency)
const kinds:Record<string,string>={late:'Late approved work',waiver:'Overage waiver',refund:'Refund',pause:'Pause',renewal:'Renewal change',cancellation:'Cancellation'}
const whole=(name:string,label:string,max?:number)=>`<label class="g-field"><span>${e(label)}</span><input name="${e(name)}" type="number" min="0" step="1"${max==null?'':` max="${e(max)}"`} required></label>`

/** Linked statement effects remain readable without exposing financial records. */
export function retainerAdjustmentLinks(report:Report,balance:Value,financial=false) {
 const adjustments:Value[]=balance.linkedAdjustments??[]
 if(!financial&&balance.unit!=='hours')return ''
 if(!adjustments.length)return ''
 return `<details><summary>Linked period adjustments (${adjustments.length})</summary><ul>${adjustments.map(value=>{
  const adjustment:Value=value.value??value
  const destination=report.data.retainerPeriods.find(p=>p.id===adjustment.periodId)
  const origin=report.data.retainerPeriods.find(p=>p.id===adjustment.originPeriodId)
  const source=report.data.time.find(t=>t.id===adjustment.sourceId)
  const cash=financial?` · cash ${e(money(adjustment.cashDeltaMinor,adjustment.currency))}`:''
  const consumption=adjustment.kind==='late'?` · late work consumption ${e(quantity(balance.unit,adjustment.quantity,balance.currency))}`:''
  const label=financial?(kinds[adjustment.kind]??'Adjustment'):'Allowance adjustment'
  return `<li>${financial?`<a href="#retainer-adjustment-${e(value.id??adjustment.id)}">${e(label)}</a>`:e(label)} · ${e(adjustment.status)} · allowance ${e(quantity(balance.unit,adjustment.allowanceDelta,balance.currency))}${consumption}${cash} · origin ${e(origin?periodLabel(origin.value.periodStart,origin.value.periodEnd):'closed period')} · destination ${e(destination?periodLabel(destination.value.periodStart,destination.value.periodEnd):'next open period')}${source?` · <a href="/app/time?edit=${e(source.id)}">Source work</a> · source revision ${e(adjustment.sourceRevision)}`:''} · rule revision ${e(adjustment.ruleRevision)}${financial?` · <a href="#retainer-close-${e(adjustment.originPeriodId)}">Original close and rule versions</a> · ${e(adjustment.reason)}`:''}</li>`
 }).join('')}</ul><p>Approved adjustments affect posted balances. Prepared adjustments affect only the projection; the closed statement stays fixed.</p></details>`
}

function snapshot(report:Report,close:Row) {
 const c=close.value,b=c.statement,p=c.period.value,t=c.terms.value.terms
 const q=(value:number|null|undefined)=>e(quantity(p.unit,value,p.currency))
 const sources:Row[]=c.sources
 const lots=(c.fifoState.carried as Value[]).map(lot=>{const origin=report.data.retainerPeriods.find(row=>row.id===lot.periodId);return `<li>Remaining lot ${q(lot.remaining)} · originating period ${e(origin?day(origin.value.periodStart):lot.periodId)}</li>`}).join('')
 return `<h4>Original closed statement</h4><p>Closed ${e(when(c.closedAt,report.agency.timezone))} · ${e(c.reason)}</p><p>Included ${q(b.allowance)} · opening ${q(b.opening)} · rollover ${q(b.rollover)} · carried deficit ${q(b.deficitOpening)} · approved consumption ${q(b.consumed)} · remaining ${q(b.remaining)} · overage ${q(b.overage)} · overage charge ${e(money(b.overageMinor,p.currency))}</p><details><summary>Frozen rules and source revisions</summary><p>Commercial version ${e(c.terms.value.number)} · revision ${e(c.terms.revision)} · period revision ${e(c.period.revision)}.</p><p>${describeRetainerRules(t)}</p><ul>${sources.map(source=>`<li><a href="/app/time?edit=${e(source.id)}">Source time ${e(source.value.workDate)}</a> · ${e(hours(source.value.durationSeconds))} · frozen revision ${e(source.revision)}</li>`).join('')||'<li>No approved source work at close.</li>'}</ul></details><details><summary>Frozen FIFO allocation</summary><ul>${(b.allocation??[]).map((x:Value)=>{const lot=report.data.retainerPeriods.find(row=>row.id===x.allowancePeriodId);return `<li>Source ${e(x.sourceId)} · ${q(x.quantity)} · ${lot?`allowance from ${e(day(lot.value.periodStart))}`:'overage'}</li>`}).join('')||'<li>No allowance consumed at close.</li>'}</ul><h4>Closing FIFO lots</h4><ul>${lots||'<li>No remaining allowance lots.</li>'}</ul><p>Closing deficit ${q(c.fifoState.deficit)}${c.fifoState.priorUnknown?' · Prior consumption unknown':''} · expired ${q(b.expired)} · cap forfeiture ${q(b.forfeited)}. Later rules and work do not rewrite this snapshot.</p></details>`
}

function adjustmentForms(report:Report,engagementId:string,origin:Row,close:Row,destination:Row|undefined,adjustments:Row[]) {
 if(!destination)return '<p>Open a later period in this retainer family before preparing an adjustment.</p>'
 const p=origin.value,common=hidden('engagementId',engagementId)
 const used=new Set(adjustments.filter(r=>r.value.kind==='late'&&r.value.status!=='cancelled').map(r=>r.value.sourceId))
 const frozen=new Set((close.value.sources as Row[]).map(r=>r.id))
 const terms=close.value.terms.value.terms
 const late=report.data.time.filter(t=>t.value.engagementId===engagementId&&t.value.status==='approved'&&t.value.durationSeconds>0&&t.value.workDate>=p.activeStart&&t.value.workDate<=p.activeEnd&&!frozen.has(t.id)&&!used.has(t.id)&&retainerMatches(terms,t.value)&&retainerSourceMatches(report.data,origin,t))
 const prepare=(kind:string,fields:string,explanation:string)=>`<details><summary>${e(kinds[kind])}</summary>${form('retainer:adjust-prepare',`Prepare ${kinds[kind].toLowerCase()}`,common+hidden('kind',kind)+`<p>${e(explanation)}</p>`+fields+area('reason','Adjustment reason'),origin,'Prepare adjustment')}</details>`
 const unit=p.unit==='hours'?'whole seconds':'currency cents'
 let body=`<h4>Prepare a correction</h4><p>Next open destination: ${e(periodLabel(destination.value.periodStart,destination.value.periodEnd))}. Preparation saves a preview for review; approval applies its effects.</p>`
 body+=late.length?prepare('late',`<label class="g-field"><span>Late approved source</span><select name="sourceId" required><option value="">Choose approved work</option>${late.map(t=>`<option value="${e(t.id)}">${e(t.value.workDate)} · ${e(hours(t.value.durationSeconds))} · ${e(t.id)}</option>`).join('')}</select></label>`,'Link work missing from the original close once. It consumes the next open period’s allowance using FIFO.'):'<p>No unlinked late approved work is available for this closed period.</p>'
 body+=prepare('waiver',whole('quantity',`Overage quantity to waive (${unit})`,close.value.statement.overage),'Waive part of the original overage at its original agreed rate. This credits cash without adding allowance.')
 body+=prepare('refund',amount('amountDollars',`External refund (${p.currency})`,''),'Record a declared external cash credit. This does not increase allowance or send a payment.')
 body+=prepare('pause',amount('amountDollars',`Declared cash credit (${p.currency}; enter 0 for none)`,0),'Remove the next open period’s base entitlement and hold its overage billing.')
 body+=prepare('renewal',whole('quantity',`Next period base allowance (${unit})`)+amount('amountDollars',`Declared renewal cash charge (${p.currency}; enter 0 for none)`,0),'Set the next open period’s base allowance and lift any cancellation. Review the resulting allowance and cash before approving.')
 body+=prepare('cancellation',amount('amountDollars',`Declared cash credit (${p.currency}; enter 0 for none)`,0),'Remove the next open period’s base entitlement, hold its overage billing and stop later periods until an approved renewal.')
 return body
}

function adjustmentReview(actor:Actor,report:Report,engagementId:string,row:Row) {
 const a=row.value,preview=a.preview,destination=report.data.retainerPeriods.find(p=>p.id===preview.nextPeriodId)
 const origin=report.data.retainerPeriods.find(p=>p.id===a.originPeriodId)
 const unit=destination?.value.unit??origin?.value.unit
 const fields=hidden('engagementId',engagementId)
 const restricted=needsIndependentReview(report.data.approvalPolicies[0],{amountMinor:Math.max(Math.abs(a.cashDeltaMinor),preview.reviewMinor??0),currency:a.currency,unpriced:preview.reviewMinor===null})&&a.createdBy===actor.session.operator.id
 return `<article id="retainer-adjustment-${e(row.id)}" class="g-card"><h4>${e(kinds[a.kind]??a.kind)} · ${e(a.status)}</h4><p>Origin ${e(origin?periodLabel(origin.value.periodStart,origin.value.periodEnd):a.originPeriodId)} · next period ${e(destination?periodLabel(destination.value.periodStart,destination.value.periodEnd):preview.nextPeriodId)}</p><p>Next base allowance ${e(quantity(unit,preview.nextAllowance,a.currency))} · next remaining ${e(quantity(unit,preview.nextRemaining,a.currency))} · allowance change ${e(quantity(unit,a.allowanceDelta,a.currency))} · cash effect ${e(money(preview.cashDeltaMinor,a.currency))} (${e(preview.cashLabel)})</p><p>${e(a.reason)} · prepared ${e(when(a.createdAt,report.agency.timezone))}${a.approvedAt?` · approved ${e(when(a.approvedAt,report.agency.timezone))}`:''}</p><p>Linked close ${e(a.closeId)}${a.sourceId?` · <a href="/app/time?edit=${e(a.sourceId)}">Source work</a> · source revision ${e(a.sourceRevision)}`:''}</p>${a.status==='prepared'?`<p>These reviewed effects have not been posted. Changed period or source inputs require a fresh preparation.</p>${restricted?'<p>Needs an independent approver: another active owner or finance person must approve this adjustment.</p>':form('retainer:adjust-approve','Review and approve adjustment',fields,row,'Approve adjustment')}<details><summary>Cancel prepared adjustment</summary>${form('retainer:adjust-cancel','Cancel prepared adjustment',fields+area('reason','Cancellation reason'),row,'Cancel adjustment')}</details>`:''}</article>`
}

export function retainerCloseSection(actor:Actor,report:Report,engagementId:string,today:string) {
 if(!finance(actor))return ''
 const periods=report.data.retainerPeriods.filter(p=>p.value.engagementId===engagementId)
 if(!periods.length)return ''
 const closes=report.data.retainerCloses.filter(r=>r.value.engagementId===engagementId)
 const adjustments=report.data.retainerAdjustments.filter(r=>r.value.engagementId===engagementId)
 const cards=periods.map(p=>{
  const close=closes.find(c=>c.value.periodId===p.id)
  const balance=report.retainerBalances.find(b=>b.periodId===p.id)!
  const name=report.data.retainers.find(t=>t.id===p.value.retainerId)?.value.terms.name
  if(!close)return `<article class="g-card"><h3>${e(name)} · ${e(periodLabel(p.value.periodStart,p.value.periodEnd))}</h3><p>Open period · approved ${e(quantity(p.value.unit,balance.consumed,p.value.currency))} · remaining ${e(quantity(p.value.unit,balance.remaining,p.value.currency))}</p>${p.value.periodEnd<today?`<details><summary>Close ended period</summary>${form('retainer:close','Close retainer period',hidden('engagementId',engagementId)+`<p>Close once to preserve the original statement, FIFO state, rules and source revisions. Late work and later decisions use linked adjustments.</p>`+area('reason','Close reason'),p,'Close period')}</details>`:`<p>Available to close after ${e(day(p.value.periodEnd))}.</p>`}</article>`
  const destination=periods.filter(next=>next.value.rootId===p.value.rootId&&next.value.periodStart>p.value.periodStart&&!closes.some(c=>c.value.periodId===next.id)).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart))[0]
  return `<article id="retainer-close-${e(p.id)}" class="g-card"><h3>${e(name)} · ${e(periodLabel(p.value.periodStart,p.value.periodEnd))} · Closed</h3>${snapshot(report,close)}${adjustmentForms(report,engagementId,p,close,destination,adjustments)}</article>`
 }).join('')
 return `<section id="retainer-corrections" class="g-card"><h2>Retainer closes and corrections</h2><p>Closed statements stay fixed. Prepare a linked adjustment, review its next-period allowance and cash effects, then approve it.</p>${cards}${adjustments.length?`<h3>Adjustment review and history</h3>${adjustments.map(row=>adjustmentReview(actor,report,engagementId,row)).join('')}`:''}</section>`
}
