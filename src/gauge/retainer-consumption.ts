import { type Row, type Value, sum } from './model'
import { normalizeRetainerRules, overageCharge, retainerMatches } from './retainer-rules'

interface Bucket { periodId:string; remaining:number; expires:number }

/** Work posts in work-date/start/id order. Carried lots keep their original age;
 * oldest eligible allowance is spent first. Current rules never rewrite old lots. */
export function retainerConsumption(data:{retainers:Row[],retainerPeriods:Row[],time:Row[]}) {
 const balances:Value[]=[]
 const roots=[...new Set(data.retainerPeriods.map(p=>p.value.rootId))]
 for(const root of roots){
  const periods=data.retainerPeriods.filter(p=>p.value.rootId===root).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart))
  let carried:Bucket[]=[],deficit=0,priorUnknown=false
  for(const [index,period] of periods.entries()){
   const terms=data.retainers.find(r=>r.id===period.value.retainerId)!.value.terms,rules=normalizeRetainerRules(terms.rules,terms.unit)
   const expired=sum(carried.filter(b=>b.expires<index).map(b=>b.remaining))
   carried=carried.filter(b=>b.expires>=index)
   let cap=rules.carryCap
   const capped:Bucket[]=[]
   for(const bucket of carried){const remaining=Math.min(bucket.remaining,cap);cap-=remaining;if(remaining)capped.push({...bucket,remaining})}
   const forfeited=sum(carried.map(b=>b.remaining))-sum(capped.map(b=>b.remaining))
   carried=capped
   const rollover=sum(carried.map(b=>b.remaining)),deficitOpening=deficit
   const opening=sum([period.value.allowance,rollover,-deficitOpening])
   const current={periodId:period.id,remaining:Math.max(0,period.value.allowance-deficitOpening),expires:index+rules.carryPeriods}
   let debt=Math.max(0,deficitOpening-period.value.allowance)
   const buckets=[...carried,current],sources=data.time.filter(r=>r.value.engagementId===period.value.engagementId&&r.value.status==='approved'&&r.value.workDate>=period.value.activeStart&&r.value.workDate<=period.value.activeEnd&&retainerMatches(terms,r.value)).sort((a,b)=>a.value.workDate.localeCompare(b.value.workDate)||(a.value.start??0)-(b.value.start??0)||a.id.localeCompare(b.id))
   const unknown=sources.filter(r=>terms.unit==='value'&&r.value.economics?.billMinor==null).map(r=>r.id)
   const allocation:Value[]=[],known=sum(sources.map(r=>terms.unit==='hours'?r.value.durationSeconds:r.value.economics?.billMinor??0))
   for(const row of sources){
    let remaining=terms.unit==='hours'?row.value.durationSeconds:row.value.economics?.billMinor??0
    for(const bucket of buckets){const used=Math.min(bucket.remaining,remaining);if(used)allocation.push({sourceId:row.id,allowancePeriodId:bucket.periodId,quantity:used});bucket.remaining-=used;remaining-=used}
    if(remaining)allocation.push({sourceId:row.id,allowancePeriodId:null,quantity:remaining})
    debt=sum([debt,remaining])
   }
   const complete:boolean=!unknown.length&&!priorUnknown
   const remaining=opening-known
   const overage=complete?Math.max(0,-remaining):null
   balances.push({periodId:period.id,retainerId:period.value.retainerId,engagementId:period.value.engagementId,unit:terms.unit,currency:terms.currency,allowance:period.value.allowance,rollover:priorUnknown?null:rollover,deficitOpening:priorUnknown?null:deficitOpening,opening:priorUnknown?null:opening,expired,forfeited,consumed:complete?known:null,knownConsumed:known,remaining:complete?remaining:null,overage,overageMinor:complete&&rules.overage==='bill'?overageCharge(overage!,terms.unit,rules.overageRate):null,overagePolicy:rules.overage,allocation,sources:sources.map(r=>r.id),unknownSources:unknown,priorPeriodIds:periods.slice(0,index).map(p=>p.id),priorUnknown})
   carried=buckets.filter(b=>b.remaining>0)
   deficit=rules.deficit?debt:0
   priorUnknown=!complete&&(rules.carryCap>0||rules.deficit)
  }
 }
 return balances
}
