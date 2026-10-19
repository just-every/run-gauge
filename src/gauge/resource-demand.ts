import { type Row, sum } from './model'

/** Unfilled roles have no named person and never enter a person's capacity.
 * Filling replaces their placeholder demand with the one linked allocation. */
export function resourceDemand(data:Record<string,Row[]>,from:string,to:string){
 const amount=(r:Row)=>{const start=r.value.from>from?r.value.from:from,end=r.value.to<to?r.value.to:to;return start>end?0:r.value.dailySeconds*((Date.parse(end)-Date.parse(start))/86400000+1)}
 return data.engagements.map(e=>{
  const requests=data.resourceRequests.filter(r=>r.value.engagementId===e.id&&r.value.status==='open'&&amount(r)>0)
  const staffing=data.staffing.filter(r=>r.value.engagementId===e.id&&amount(r)>0)
  const unfilledSeconds=sum(requests.map(amount)),staffingSeconds=sum(staffing.map(amount))
  return {engagementId:e.id,unfilledSeconds,staffingSeconds,totalSeconds:sum([unfilledSeconds,staffingSeconds]),requestSources:requests.map(r=>r.id),staffingSources:staffing.map(r=>r.id)}
 })
}
