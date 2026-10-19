import type { Row, Value } from './model'
import { retainerMatches } from './retainer-rules'

export function retainerCandidates(data:{retainers:Row[],retainerPeriods:Row[]},time:Value) {
 return data.retainerPeriods.filter(p=>{
  if(p.value.engagementId!==time.engagementId||time.workDate<p.value.activeStart||time.workDate>p.value.activeEnd)return false
  const terms=data.retainers.find(t=>t.id===p.value.retainerId)!.value.terms
  return retainerMatches(terms,time)
 })
}

export function retainerSourceMatches(data:{retainers:Row[],retainerPeriods:Row[]},period:Row,time:Row) {
 const candidates=retainerCandidates(data,time.value)
 const selected=time.value.retainerRootId
 return selected?selected===period.value.rootId&&candidates.some(p=>p.id===period.id):candidates.length===1&&candidates[0].id===period.id
}
