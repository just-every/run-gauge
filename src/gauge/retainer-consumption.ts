import { type Row, type Value, sum } from './model'
import { retainerCandidates, retainerSourceMatches } from './retainer-sources'
import { normalizeRetainerRules, overageCharge, retainerMatches } from './retainer-rules'

interface Bucket { periodId:string; remaining:number; expires:number }

/** Work posts in work-date/start/id order. Carried lots keep their original age;
 * oldest eligible allowance is spent first. Current rules never rewrite old lots. */
export interface RetainerData {retainers:Row[];retainerPeriods:Row[];time:Row[];retainerCloses?:Row[];retainerAdjustments?:Row[]}
export function retainerConsumption(data:RetainerData) {
 const balances:Value[]=[]
 const roots=[...new Set(data.retainerPeriods.map(p=>p.value.rootId))]
 for(const root of roots){
  const periods=data.retainerPeriods.filter(p=>p.value.rootId===root).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart))
  let carried:Bucket[]=[],deficit=0,priorUnknown=false
  for(const [index,period] of periods.entries()){
   const close=data.retainerCloses?.find(c=>c.value.periodId===period.id)
   if(close){
    const frozen=structuredClone(close.value.statement)
    balances.push({...frozen,closed:true,closeId:close.id})
    carried=structuredClone(close.value.fifoState.carried);deficit=close.value.fifoState.deficit;priorUnknown=close.value.fifoState.priorUnknown
    continue
   }
   const adjustments=(data.retainerAdjustments??[]).filter(r=>r.value.periodId===period.id&&r.value.status==='approved')
   const familyLifecycle=(data.retainerAdjustments??[]).filter(r=>r.value.rootId===root&&r.value.status==='approved'&&['cancellation','renewal'].includes(r.value.kind)&&periods.find(p=>p.id===r.value.periodId)!.value.periodStart<=period.value.periodStart).sort((a,b)=>a.value.approvedAt-b.value.approvedAt).at(-1)
   if(familyLifecycle?.value.kind==='cancellation'&&!adjustments.some(r=>r.id===familyLifecycle.id))adjustments.push(familyLifecycle)
   const allowanceDelta=familyLifecycle?.value.kind==='cancellation'?-period.value.allowance:sum(adjustments.map(r=>r.value.allowanceDelta))
   const late=adjustments.filter(r=>r.value.kind==='late')
   const terms=data.retainers.find(r=>r.id===period.value.retainerId)!.value.terms,rules=normalizeRetainerRules(terms.rules,terms.unit)
   const expired=sum(carried.filter(b=>b.expires<index).map(b=>b.remaining))
   carried=carried.filter(b=>b.expires>=index)
   let cap=rules.carryCap
   const capped:Bucket[]=[]
   for(const bucket of carried){const remaining=Math.min(bucket.remaining,cap);cap-=remaining;if(remaining)capped.push({...bucket,remaining})}
   const forfeited=sum(carried.map(b=>b.remaining))-sum(capped.map(b=>b.remaining))
   carried=capped
   const rollover=sum(carried.map(b=>b.remaining)),deficitOpening=deficit
   const opening=sum([period.value.allowance,allowanceDelta,rollover,-deficitOpening])
   const current={periodId:period.id,remaining:Math.max(0,period.value.allowance+allowanceDelta-deficitOpening),expires:index+rules.carryPeriods}
   let debt=Math.max(0,deficitOpening-period.value.allowance-allowanceDelta)
   const buckets=[...carried,current],sources=data.time.filter(r=>r.value.engagementId===period.value.engagementId&&r.value.status==='approved'&&r.value.workDate>=period.value.activeStart&&r.value.workDate<=period.value.activeEnd&&retainerMatches(terms,r.value)).sort((a,b)=>a.value.workDate.localeCompare(b.value.workDate)||(a.value.start??0)-(b.value.start??0)||a.id.localeCompare(b.id))
   const unallocated=sources.filter(r=>!r.value.retainerRootId&&retainerCandidates(data,r.value).length>1)
   const eligible=[...sources.filter(r=>retainerSourceMatches(data,period,r)),...late.map(r=>data.time.find(t=>t.id===r.value.sourceId)).filter((r):r is Row=>!!r)].sort((a,b)=>a.value.workDate.localeCompare(b.value.workDate)||(a.value.start??0)-(b.value.start??0)||a.id.localeCompare(b.id))
   const unknown=eligible.filter(r=>terms.unit==='value'&&r.value.economics?.billMinor==null).map(r=>r.id)
   const quantity=(r:Row)=>late.find(a=>a.value.sourceId===r.id)?.value.quantity??(terms.unit==='hours'?r.value.durationSeconds:r.value.economics?.billMinor??0)
   const allocation:Value[]=[],known=sum(eligible.map(quantity))
   for(const row of eligible){
    let remaining=quantity(row)
    for(const bucket of buckets){const used=Math.min(bucket.remaining,remaining);if(used)allocation.push({sourceId:row.id,allowancePeriodId:bucket.periodId,quantity:used});bucket.remaining-=used;remaining-=used}
    if(remaining)allocation.push({sourceId:row.id,allowancePeriodId:null,quantity:remaining})
    debt=sum([debt,remaining])
   }
   const complete:boolean=!unknown.length&&!priorUnknown
   const remaining=opening-known
   const overage=complete?Math.max(0,-remaining):null
   const lifecycle=adjustments.filter(r=>['pause','cancellation','renewal'].includes(r.value.kind)).sort((a,b)=>a.value.approvedAt-b.value.approvedAt).at(-1)
   const held=lifecycle&&lifecycle.value.kind!=='renewal'
   balances.push({closed:false,adjustments:allowanceDelta,adjustmentIds:adjustments.map(r=>r.id),fifoState:{carried:buckets.filter(b=>b.remaining>0),deficit:rules.deficit?debt:0,priorUnknown:!complete&&(rules.carryCap>0||rules.deficit)},periodId:period.id,retainerId:period.value.retainerId,engagementId:period.value.engagementId,unit:terms.unit,currency:terms.currency,allowance:period.value.allowance,rollover:priorUnknown?null:rollover,deficitOpening:priorUnknown?null:deficitOpening,opening:priorUnknown?null:opening,expired,forfeited,consumed:complete?known:null,knownConsumed:known,remaining:complete?remaining:null,overage,overageMinor:complete&&!held&&!unallocated.length&&rules.overage==='bill'?overageCharge(overage!,terms.unit,rules.overageRate):null,overagePolicy:held?'held':rules.overage,allocation,sources:eligible.map(r=>r.id),unallocatedSources:unallocated.map(r=>r.id),unallocatedSeconds:sum(unallocated.map(r=>r.value.durationSeconds)),unknownSources:unknown,priorPeriodIds:periods.slice(0,index).map(p=>p.id),priorUnknown})
   carried=buckets.filter(b=>b.remaining>0)
   deficit=rules.deficit?debt:0
   priorUnknown=!complete&&(rules.carryCap>0||rules.deficit)
  }
 }
 return balances
}
