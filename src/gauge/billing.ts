import type { Bindings } from '../auth.server'
import { type Value, type Kind, need, text, csv, money } from './model'
import { type Actor, Transaction, finance, access, get, all } from './store'
import { correctionReview } from './billing-corrections'
export async function billingCommand(env: Bindings,a: Actor,tx: Transaction,action: string,input: Value) {
 if (!action.startsWith('packet:')) return null
 need(finance(a),'Finance access required',403)
 if (action === 'packet:create') {
  const e = await access(env,a,text(input.engagementId,'Engagement')); tx.observe('engagements',e)
  const selected = Array.isArray(input.sources) ? input.sources : String(input.sources ?? '').split(',').filter(Boolean)
  need(selected.length>0 && selected.length<=100,'Select between 1 and 100 approved source lines')
  const lines: Value[]=[]
  for (const source of selected) {
   const [k,id] = String(source).split(':'); need(['time','expenses','milestones'].includes(k),'Unknown source type')
   const row=await get(env,k as Kind,id),v=row.value; need(v.engagementId===e.id && v.status==='approved','Only approved work for this engagement is eligible'); tx.observe(k as Kind,row)
   let amount:number, description:string
   if (k==='time') { need(v.billable && !v.source?.billed && v.economics?.mode==='hourly' && v.economics.billMinor!==null,'Time needs approved hourly terms and a bill rate and must be unbilled'); amount=v.economics.billMinor; description=v.notes; }
   else if (k==='expenses') { need(v.reimbursable,'Expense is not reimbursable'); amount=v.amountMinor; description=v.description }
   else { amount=v.amountMinor; description=v.name }
   lines.push({kind:k,sourceId:id,sourceRevision:row.revision,description,amountMinor:amount,currency:'AUD',durationSeconds:v.durationSeconds ?? null,billRateMinor:v.economics?.billRateMinor??null,roundedBillingSeconds:v.economics?.roundedBillingSeconds??null,roundingSeconds:v.economics?.roundingSeconds??null,roundingPolicy:k==='time'?'ceil duration to increment; round amount half-up to cents':'exact approved minor units',rateUnit:k==='time'?'AUD cents per hour':null,rateId:v.economics?.rateId ?? null,budgetId:v.economics?.budgetId ?? v.budgetId ?? null})
  }
  const total=lines.reduce((s,l)=>s+l.amountMinor,0); need(Number.isSafeInteger(total),'Packet total too large')
  const packet=await tx.record('packets',{engagementId:e.id,title:text(input.title,'Packet title'),status:'draft',currency:'AUD',lines,totalMinor:total,createdAt:Date.now(),createdBy:a.session.operator.id})
  for (const l of lines) tx.sql('INSERT INTO g_billing_sources(kind,source_id,packet_id,source_revision) VALUES(?,?,?,?)',l.kind,l.sourceId,packet.id,l.sourceRevision)
  return packet
 }
 if(action==='packet:adjust') {
  const original=await get(env,'packets',text(input.id,'Original packet'));need(original.revision===input.revision&&original.value.status==='approved','Choose the exact approved packet');tx.observe('packets',original)
  const review=correctionReview(await all(env,'packets'),original),sourceId=text(input.sourceId,'Source line ID')
  const matches=review.sources.filter(l=>l.sourceId===sourceId && (!input.sourceKind || l.kind===input.sourceKind));need(matches.length===1,'Choose an original source line from this correction branch')
  const {currentAmountMinor:prior,...line}=matches[0],corrected=money(input.correctedAmountMinor),reason=text(input.reason,'Correction reason')
  need(corrected!==prior,'Correction does not change the amount')
  tx.guard("NOT EXISTS(SELECT 1 FROM g_packets WHERE json_extract(data,'$.correctsPacketId')=? AND status<>'cancelled')",original.id)
  return tx.record('packets',{engagementId:original.value.engagementId,title:`Adjustment: ${original.value.title}`,status:'draft',currency:'AUD',correctsPacketId:original.id,reason,lines:[{...line,amountMinor:corrected-prior,priorAmountMinor:prior,correctedAmountMinor:corrected,description:reason}],totalMinor:corrected-prior,createdAt:Date.now(),createdBy:a.session.operator.id})
 }
 const row=await get(env,'packets',text(input.id,'Packet')); need(row.revision===input.revision,'Packet changed; approve the version you reviewed',409); need(row.value.status==='draft','Packet already finalized',409)
 if (action==='packet:cancel') { tx.observe('packets',row); tx.sql('DELETE FROM g_billing_sources WHERE packet_id=?',row.id); return tx.record('packets',{...row.value,status:'cancelled'},row,undefined,action) }
 need(action==='packet:approve','Unknown packet command')
 for (const l of row.value.lines) { const source=await get(env,l.kind,l.sourceId); need(source.revision===l.sourceRevision && source.value.status==='approved','Source revision changed',409); tx.observe(l.kind,source); tx.guard('EXISTS(SELECT 1 FROM g_billing_sources WHERE kind=? AND source_id=? AND source_revision=?)',l.kind,l.sourceId,l.sourceRevision) }
 const artifact=csv([['Gauge billing preparation','AUD','Not an invoice'],['kind','source id','approved revision','description','actual duration seconds','amount minor','currency','rate id','budget id','bill rate minor per hour','rounded billing seconds','rounding increment seconds','rounding policy','corrected source total minor'],...row.value.lines.map((l:Value)=>[l.kind,l.sourceId,l.sourceRevision,l.description,l.durationSeconds,l.amountMinor,l.currency,l.rateId,l.budgetId,l.billRateMinor,l.roundedBillingSeconds,l.roundingSeconds,l.roundingPolicy,l.correctedAmountMinor??'']),['TOTAL','','','','',row.value.totalMinor,'AUD']])
 return tx.record('packets',{...row.value,status:'approved',approvedBy:a.session.operator.id,approvedAt:Date.now(),artifact},row,undefined,action)
}
