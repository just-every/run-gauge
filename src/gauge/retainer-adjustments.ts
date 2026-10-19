import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Row, type Value, need, text, integer, sum } from './model'
import { type Actor, type Transaction, finance, get } from './store'
import { correctionInputs, correctionPeriod } from './retainer-close'
import { retainerStatements } from './retainer-statements'
import { retainerSourceMatches } from './retainer-sources'
import { overageCharge, normalizeRetainerRules } from './retainer-rules'
import { assertIndependentReview } from './approval-policy'

function previewAdjustment(data:Record<string,Row[]>,origin:Row,input:Value) {
 const close=data.retainerCloses.find(c=>c.value.periodId===origin.id)
 need(close,'Close the originating period before preparing an adjustment',409)
 const period=data.retainerPeriods.filter(p=>p.value.rootId===origin.value.rootId&&p.value.periodStart>origin.value.periodEnd&&!data.retainerCloses.some(c=>c.value.periodId===p.id)).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart))[0]
 need(period,'Open the next period before preparing an adjustment',409)
 const kind=input.kind;need(['late','waiver','refund','pause','renewal','cancellation'].includes(kind),'Choose a retainer adjustment kind')
 const existing=data.retainerAdjustments.filter(r=>r.id!==input.adjustmentId&&r.value.status!=='cancelled')
 if(['pause','renewal','cancellation'].includes(kind))need(!existing.some(r=>r.value.periodId===period.id&&r.value.status==='prepared'&&['pause','renewal','cancellation'].includes(r.value.kind)),'Decide the prepared lifecycle adjustment before preparing another',409)
 const balance=retainerStatements(data as any).find(b=>b.periodId===period.id)!,terms=close.value.terms.value.terms,rules=normalizeRetainerRules(terms.rules,terms.unit)
 let quantity=0,allowanceDelta=0,cashDeltaMinor=0,source:Row|undefined
 if(kind==='late'){
  source=data.time.find(t=>t.id===input.sourceId)
  need(source?.value.status==='approved'&&retainerSourceMatches(data as any,origin,source),'Choose approved late work eligible for the originating period')
  need(!close.value.statement.sources.includes(source.id),'This work was already consumed in the closed statement',409)
  need(!existing.some(r=>r.value.kind==='late'&&r.value.sourceId===source!.id),'This late source already has a linked adjustment',409)
  quantity=terms.unit==='hours'?source.value.durationSeconds:source.value.economics?.billMinor
  need(Number.isSafeInteger(quantity),'Approve a known frozen value before adjusting late work',409)
 } else if(kind==='waiver'){
  quantity=integer(input.quantity,'Waived overage quantity',1)
  const waived=sum(existing.filter(r=>r.value.closeId===close.id&&r.value.kind==='waiver').map(r=>r.value.quantity))
  need(rules.overage==='bill'&&quantity+waived<=close.value.statement.overage,'Waiver exceeds the unwaived closed overage',409)
  const approvedWaived=sum(existing.filter(r=>r.value.closeId===close.id&&r.value.kind==='waiver'&&r.value.status==='approved').map(r=>r.value.quantity))
  cashDeltaMinor=-(overageCharge(approvedWaived+quantity,terms.unit,rules.overageRate)-overageCharge(approvedWaived,terms.unit,rules.overageRate))
 } else {
  const amount=integer(input.amountMinor??0,'External cash effect in cents')
  cashDeltaMinor=kind==='renewal'?amount:-amount
  if(kind==='pause'||kind==='cancellation')allowanceDelta=-period.value.allowance-balance.adjustments
  if(kind==='renewal'){quantity=integer(input.quantity,'Renewed allowance');allowanceDelta=quantity-period.value.allowance-balance.adjustments}
 }
 const value={engagementId:origin.value.engagementId,rootId:origin.value.rootId,periodId:period.id,originPeriodId:origin.id,closeId:close.id,kind,quantity,allowanceDelta,cashDeltaMinor,currency:origin.value.currency,unit:origin.value.unit,sourceId:source?.id??null,sourceRevision:source?.revision??null,ruleId:close.value.terms.id,ruleRevision:close.value.terms.revision}
 const reviewMinor=allowanceDelta&&terms.unit==='hours'?(rules.overageRate?overageCharge(Math.abs(allowanceDelta),terms.unit,rules.overageRate):null):Math.abs(allowanceDelta)
 const preview={reviewMinor,nextPeriodId:period.id,nextAllowance:sum([period.value.allowance,balance.adjustments,allowanceDelta]),nextRemaining:balance.remaining===null?null:sum([balance.remaining,allowanceDelta,kind==='late'?-quantity:0]),cashDeltaMinor,cashLabel:'External adjustment only; no payment, refund, invoice or collection was executed'}
 // Approval binds business inputs, excluding this adjustment's own prepared revision.
 const inputs={value,preview,period,close,time:data.time,terms:data.retainers,periods:data.retainerPeriods,closes:data.retainerCloses,adjustments:existing}
 return {...value,preview,fingerprint:sha256(canonicalJson(inputs))}
}
export async function adjustmentCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value) {
 if(!['retainer:adjust-prepare','retainer:adjust-approve','retainer:adjust-cancel'].includes(action))return null
 need(finance(a),'Finance access required for retainer corrections',403)
 if(action==='retainer:adjust-prepare'){
  const origin=await correctionPeriod(env,a,tx,input),data=await correctionInputs(env,tx),prepared=previewAdjustment(data,origin,input)
  need(!await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='retainerPeriods' AND source_id=?").bind(prepared.periodId).first(),'Next period has a reserved overage; resolve it before adjusting',409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='retainerPeriods' AND source_id=?)",prepared.periodId)
  if(prepared.sourceId){need(!await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?").bind(prepared.sourceId).first(),'Late work is already reserved for billing',409);tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?)",prepared.sourceId)}
  return tx.record('retainerAdjustments',{...prepared,status:'prepared',input:{kind:input.kind,sourceId:input.sourceId??null,quantity:input.quantity??null,amountMinor:input.amountMinor??0},reason:text(input.reason,'Adjustment reason'),createdBy:a.session.operator.id,createdAt:Date.now()})
 }
 const row=await get(env,'retainerAdjustments',text(input.id,'Adjustment'));need(row.revision===input.revision&&row.value.status==='prepared','Adjustment changed or already decided',409)
 if(action==='retainer:adjust-cancel')return tx.record('retainerAdjustments',{...row.value,status:'cancelled',decisionReason:text(input.reason,'Cancellation reason'),decidedBy:a.session.operator.id,decidedAt:Date.now()},row,undefined,action)
 const data=await correctionInputs(env,tx),origin=data.retainerPeriods.find(p=>p.id===row.value.originPeriodId)!
 const reviewed=previewAdjustment(data,origin,{...row.value.input,adjustmentId:row.id})
 need(reviewed.fingerprint===row.value.fingerprint,'Adjustment inputs changed; cancel and prepare again',409)
 await assertIndependentReview(env,a,tx,{createdBy:row.value.createdBy,currency:row.value.currency,amountMinor:Math.max(Math.abs(row.value.cashDeltaMinor),row.value.preview.reviewMinor??0),unpriced:row.value.preview.reviewMinor===null})
 tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='retainerPeriods' AND source_id=?)",row.value.periodId)
 if(row.value.sourceId)tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?)",row.value.sourceId)
 return tx.record('retainerAdjustments',{...row.value,status:'approved',approvedBy:a.session.operator.id,approvedAt:Date.now()},row,undefined,action)
}
