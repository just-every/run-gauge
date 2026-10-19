import { type Row, type Value, sum } from './model'
import { retainerConsumption } from './retainer-consumption'
import { retainerCandidates, retainerSourceMatches } from './retainer-sources'
import { retainerMatches } from './retainer-rules'

/** Projections run the same FIFO calculation with stopped pending work included.
 * They never post consumption or manufacture a pending monetary approval. */
export function retainerStatements(data:{retainers:Row[],retainerPeriods:Row[],time:Row[]},time=data.time,personId?:string,eligibility=data) {
 const posted=retainerConsumption({...eligibility,time}).filter(b=>data.retainerPeriods.some(p=>p.id===b.periodId))
 const pending=time.filter(r=>r.value.status!=='approved'&&r.value.durationSeconds>0)
 const projected=retainerConsumption({...eligibility,time:[...time.filter(r=>r.value.status==='approved'),...pending.map(r=>({...r,value:{...r.value,status:'approved'}}))]})
 return posted.map(balance=>{
  const period=data.retainerPeriods.find(p=>p.id===balance.periodId)!,terms=eligibility.retainers.find(t=>t.id===balance.retainerId)!.value.terms
  const sources=pending.filter(r=>r.value.engagementId===balance.engagementId&&r.value.workDate>=period.value.activeStart&&r.value.workDate<=period.value.activeEnd&&retainerMatches(terms,r.value)&&retainerSourceMatches(eligibility,period,r))
  const unallocatedPending=pending.filter(r=>r.value.engagementId===balance.engagementId&&r.value.workDate>=period.value.activeStart&&r.value.workDate<=period.value.activeEnd&&retainerMatches(terms,r.value)&&!r.value.retainerRootId&&retainerCandidates(eligibility,r.value).length>1)
  const projection=projected.find(b=>b.periodId===balance.periodId)!
  const statement:Value={...balance,unallocatedSources:[...balance.unallocatedSources,...unallocatedPending.map(r=>r.id)],unallocatedSeconds:sum([balance.unallocatedSeconds,...unallocatedPending.map(r=>r.value.durationSeconds)]),pending:terms.unit==='hours'?sum(sources.map(r=>r.value.durationSeconds)):sources.length?null:0,pendingSeconds:sum(sources.map(r=>r.value.durationSeconds)),pendingSources:sources.map(r=>r.id),projectedRemaining:projection.remaining,provisional:balance.unallocatedSources.length>0||unallocatedPending.length>0||sources.length>0||projection.remaining!==balance.remaining,adjustments:0}
  if(personId){
   const own=new Set(time.filter(r=>r.value.personId===personId).map(r=>r.id))
   statement.restrictedSources=[...statement.sources,...statement.pendingSources,...statement.unallocatedSources].some(id=>!own.has(id))
   statement.unallocatedSources=statement.unallocatedSources.filter((id:string)=>own.has(id));statement.sources=statement.sources.filter((id:string)=>own.has(id));statement.pendingSources=statement.pendingSources.filter((id:string)=>own.has(id));statement.unknownSources=statement.unknownSources.filter((id:string)=>own.has(id));statement.allocation=statement.allocation.filter((x:Value)=>own.has(x.sourceId))
   delete statement.overageMinor
  }
  return statement
 })
}
