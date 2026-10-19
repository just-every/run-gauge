import { type Row, type Value, sum } from './model'

// Work dates and exact frozen approval economics determine consumption; draft,
// submitted and returned work never posts an allowance consumption.
export function retainerConsumption(data:{retainers:Row[],retainerPeriods:Row[],time:Row[]}) {
 return data.retainerPeriods.map(period=>{
  const terms=data.retainers.find(r=>r.id===period.value.retainerId)!.value.terms
  const sources=data.time.filter(r=>r.value.engagementId===period.value.engagementId&&r.value.status==='approved'&&r.value.workDate>=period.value.activeStart&&r.value.workDate<=period.value.activeEnd&&terms.services.some((s:string)=>s.toLowerCase()===r.value.service.toLowerCase())&&(terms.consumes==='all'||(terms.consumes==='billable'?r.value.billable:!r.value.billable)))
  const unknown=sources.filter(r=>terms.unit==='value'&&r.value.economics?.billMinor==null).map(r=>r.id)
  const known=sum(sources.map(r=>terms.unit==='hours'?r.value.durationSeconds:r.value.economics?.billMinor??0))
  return {periodId:period.id,retainerId:period.value.retainerId,engagementId:period.value.engagementId,unit:terms.unit,currency:terms.currency,allowance:period.value.allowance,consumed:unknown.length?null:known,knownConsumed:known,remaining:unknown.length?null:period.value.allowance-known,sources:sources.map(r=>r.id),unknownSources:unknown}
 })
}
