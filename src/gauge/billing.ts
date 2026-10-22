import type { Bindings } from '../auth.server'
import { type Value, type Kind, need, text, money, sum } from './model'
import { type Actor, Transaction, finance, access, get, all } from './store'
import { packetArtifact } from './billing-artifact'
import { assertUncappedTime } from './budget-caps'
import { assertAdHocTime } from './retainer-eligibility'
import { retainerOverage } from './retainer-overages'
import { correctionReview } from './billing-corrections'
import { authorizedDelivery } from './milestone-delivery'
import { assertIndependentApproval } from './approval-policy'
export async function billingCommand(env: Bindings,a: Actor,tx: Transaction,action: string,input: Value) {
 if (!action.startsWith('packet:')) return null
 need(finance(a),'Finance access required',403)
 if (action === 'packet:create') {
  const e = await access(env,a,text(input.engagementId,'Engagement')); tx.observe('engagements',e)
  need(e.value.type!=='internal','Internal work cannot be billed')
  need(input.currency === undefined || input.currency === e.value.currency, 'Packet currency differs from engagement; no implicit FX')
  const selected = Array.isArray(input.sources) ? input.sources : String(input.sources ?? '').split(',').filter(Boolean)
  need(selected.length>0 && selected.length<=100,'Select between 1 and 100 approved source lines')
  const lines: Value[]=[]
  for (const source of selected) {
   const [k,id] = String(source).split(':'); need(['time','expenses','milestones','retainerPeriods','fixedCharges','retainerCharges'].includes(k),'Unknown source type')
   const row=await get(env,k as Kind,id),v=row.value; if(k==='retainerPeriods'){need(v.engagementId===e.id,'Period belongs to another engagement');const line=await retainerOverage(env,tx,row);need(line.currency===e.value.currency,'Overage currency differs; no implicit FX');lines.push(line);continue} need(v.engagementId===e.id && v.status==='approved','Only approved work for this engagement is eligible'); tx.observe(k as Kind,row)
   if(k==='retainerCharges')need(v.date<=String(input.asOf??v.date),'Retainer fee is not due yet',409)
   if(k==='milestones')need(authorizedDelivery(v),'Record current delivery acceptance and separate finance authorization before billing',409)
   // Legacy milestones were denominated by their engagement before carrying their own currency.
   const currency = k === 'time' ? v.economics?.currency : k === 'milestones' ? v.currency ?? e.value.currency : v.currency
   need(currency === e.value.currency, 'Source currency differs from engagement; no implicit FX')
   let amount:number, description:string
   if (k==='time') { await assertUncappedTime(env,tx,row); await assertAdHocTime(env,tx,v); need(v.billable && !v.source?.billed && v.economics?.mode==='hourly' && v.economics.billMinor!==null,'Time needs approved hourly terms and a bill rate and must be unbilled'); amount=v.economics.billMinor; description=v.notes; }
   else if (k==='expenses') { need(v.reimbursable,'Expense is not reimbursable'); amount=v.amountMinor; description=v.description }
   else { amount=v.amountMinor; description=v.name }
   lines.push({phaseKey:v.phaseKey??null,kind:k,sourceId:id,sourceRevision:row.revision,description,amountMinor:amount,currency,durationSeconds:v.durationSeconds ?? null,billRateMinor:v.economics?.billRateMinor??null,roundedBillingSeconds:v.economics?.roundedBillingSeconds??null,roundingSeconds:v.economics?.roundingSeconds??null,roundingPolicy:k==='time'?'ceil duration to increment; round amount half-up to cents':'exact approved minor units',rateUnit:k==='time'?`${currency} cents per hour`:null,rateId:v.economics?.rateId ?? null,budgetId:v.economics?.budgetId ?? v.budgetId ?? null,...(k==='fixedCharges'?{chargeType:v.chargeType,cumulativeBasisPoints:v.cumulativeBasisPoints,grossMinor:v.grossMinor,priorMinor:v.priorMinor}: {})})
  }
  const total=sum(lines.map(l=>l.amountMinor))
  const packet=await tx.record('packets',{engagementId:e.id,title:text(input.title,'Packet title'),status:'draft',currency:e.value.currency,lines,totalMinor:total,createdAt:Date.now(),createdBy:a.session.operator.id})
  for (const l of lines) tx.sql('INSERT INTO g_billing_sources(kind,source_id,packet_id,source_revision) VALUES(?,?,?,?)',l.kind,l.sourceId,packet.id,l.sourceRevision)
  return packet
 }
 if(action==='packet:adjust') {
  const original=await get(env,'packets',text(input.id,'Original packet'));need(original.revision===input.revision&&original.value.status==='approved','Choose the exact approved packet');tx.observe('packets',original)
  need(input.currency === undefined || input.currency === original.value.currency, 'Adjustment currency differs from original packet; no implicit FX')
  const packets=await all(env,'packets'),byId=new Map(packets.map(p=>[p.id,p])),seen=new Set<string>()
  let current: typeof original | undefined = original
  while (current) {
   need(!seen.has(current.id), 'Correction history is invalid', 409); seen.add(current.id)
   need(current.value.currency === original.value.currency && current.value.lines.every((line:Value)=>line.currency === original.value.currency), 'Correction history mixes currencies; no implicit FX')
   tx.observe('packets',current)
   current = current.value.correctsPacketId ? byId.get(current.value.correctsPacketId) : undefined
  }
  const review=correctionReview(packets,original),sourceId=text(input.sourceId,'Source line ID')
  const matches=review.sources.filter(l=>l.sourceId===sourceId && (!input.sourceKind || l.kind===input.sourceKind));need(matches.length===1,'Choose an original source line from this correction branch')
  const {currentAmountMinor:prior,...line}=matches[0],corrected=money(input.correctedAmountMinor),reason=text(input.reason,'Correction reason')
  need(corrected!==prior,'Correction does not change the amount')
  if(line.kind==='timeSlices')need(corrected<=line.amountMinor,'A capped source cannot be corrected above its original reserved portion',409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_packets WHERE json_extract(data,'$.correctsPacketId')=? AND status<>'cancelled')",original.id)
  const delta=sum([corrected,-prior])
  return tx.record('packets',{engagementId:original.value.engagementId,title:`Adjustment: ${original.value.title}`,status:'draft',currency:original.value.currency,correctsPacketId:original.id,reason,lines:[{...line,amountMinor:delta,priorAmountMinor:prior,correctedAmountMinor:corrected,description:reason}],totalMinor:delta,createdAt:Date.now(),createdBy:a.session.operator.id})
 }
 const row=await get(env,'packets',text(input.id,'Packet')); need(row.revision===input.revision,'Packet changed; approve the version you reviewed',409); need(row.value.status==='draft','Packet already finalized',409)
 if (action==='packet:cancel') { tx.observe('packets',row); tx.sql('DELETE FROM g_billing_sources WHERE packet_id=?',row.id); return tx.record('packets',{...row.value,status:'cancelled'},row,undefined,action) }
 need(action==='packet:approve','Unknown packet command')
 need(!row.value.deferredSources,'Resolve the scheduling exception and run this period again before approving sources',409)
 await assertIndependentApproval(env,a,tx,row)
 need(input.currency === undefined || input.currency === row.value.currency, 'Currency differs from packet; no implicit FX')
 const e=await access(env,a,row.value.engagementId);tx.observe('engagements',e)
 need(e.value.currency === row.value.currency, 'Packet currency differs from engagement; no implicit FX')
 for (const l of row.value.lines) { const source=await get(env,l.kind,l.sourceId); if(l.kind==='retainerPeriods'){need(source.value.currency===row.value.currency&&source.revision===l.sourceRevision,'Retainer source changed',409);if(!row.value.correctsPacketId){const current=await retainerOverage(env,tx,source);need(current.retainerFingerprint===l.retainerFingerprint&&current.amountMinor===l.amountMinor,'Retainer consumption changed; cancel and review a fresh draft',409)}tx.observe('retainerPeriods',source);tx.guard('EXISTS(SELECT 1 FROM g_billing_sources WHERE kind=? AND source_id=? AND source_revision=?)',l.kind,l.sourceId,l.sourceRevision);continue} if(l.kind==='milestones'&&!row.value.correctsPacketId)need(authorizedDelivery(source.value),'Current delivered milestone needs acceptance and finance authorization',409); if(l.kind==='time'&&!row.value.correctsPacketId){await assertUncappedTime(env,tx,source);await assertAdHocTime(env,tx,source.value)}if(l.kind==='timeSlices'){const original=await get(env,'time',source.value.sourceId);need(original.revision===source.value.sourceRevision&&original.value.status==='approved','Original capped time revision changed',409);tx.observe('time',original);await assertAdHocTime(env,tx,original.value);} need(source.revision===l.sourceRevision && source.value.status==='approved','Source revision changed',409); const currency=l.kind==='time'?source.value.economics?.currency:l.kind==='milestones'?source.value.currency??e.value.currency:source.value.currency; need(l.currency===row.value.currency && currency===row.value.currency, 'Packet source currencies differ; no implicit FX'); tx.observe(l.kind,source); tx.guard('EXISTS(SELECT 1 FROM g_billing_sources WHERE kind=? AND source_id=? AND source_revision=?)',l.kind,l.sourceId,l.sourceRevision) }
 need(sum(row.value.lines.map((l:Value)=>l.amountMinor))===row.value.totalMinor, 'Packet total differs from its source lines')
 if(row.value.correctsPacketId){const original=await get(env,'packets',row.value.correctsPacketId);need(original.value.currency===row.value.currency,'Adjustment currency differs from original packet; no implicit FX');tx.observe('packets',original)}
 const artifact=packetArtifact(row.value)
 return tx.record('packets',{...row.value,status:'approved',approvedBy:a.session.operator.id,approvedAt:Date.now(),artifact},row,undefined,action)
}
