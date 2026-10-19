import { capacityEvidence } from './report-lineage-capacity'
import { type Evidence, Lineage } from './report-lineage-shared'

export function utilizationLineage(c: Lineage) {
 for(const dimension of ['byPerson','byService','byProject','details'] as const)for(const row of c.report.utilization?.[dimension]??[]){
  const evidence = (calendars=false): Evidence => {
   const e=c.evidence()
   for(const personId of row.personIds){
    c.row(e,'people',personId)
    if(calendars){const cap=c.report.capacity.find(p=>p.personId===personId);if(cap){const available=capacityEvidence(c,personId,cap.days,['calendar','leave'],true);e.sources.push(...available.sources);e.unknown.push(...available.unknown)}}
   }
   for(const id of row.sources.time)c.row(e,'time',id)
   for(const id of row.sources.staffing)c.row(e,'staffing',id)
   for(const source of [...e.sources])if(source.value.engagementId)c.row(e,'engagements',source.value.engagementId)
   return e
  }
  const prefix=`utilization:${dimension}:${encodeURIComponent(row.id)}:`
  for(const key of ['scheduledSeconds','scheduledBillableSeconds','tentativeSeconds','tentativeBillableSeconds','recordedSeconds','recordedBillableSeconds','submittedSeconds','submittedBillableSeconds','approvedSeconds','approvedBillableSeconds','varianceSeconds','availableSeconds']){
   const formula=key==='availableSeconds'?'SUM(unique participants: net workable calendar seconds minus holiday and leave, clamped to zero per day). Missing calendars make the denominator unknown.':key==='varianceSeconds'?'Recorded seconds − committed scheduled seconds.':`${key}: SUM(visible source whole seconds inside the reporting dates). Scheduled excludes tentative; recorded includes all stopped entries; submitted is awaiting approval only; approved is approved only. Internal work is never billable. Legacy allocations have service Unspecified and client-work billability.`
   c.add(prefix+key,`${row.name}: ${key}`,row[key],'seconds',formula,evidence(key==='availableSeconds'))
  }
  for(const [key,value] of Object.entries(row.ratios) as [string,{numeratorSeconds:number;denominatorSeconds:number|null;percent:number|null}][]){
   const e=evidence(key.endsWith('Capacity'))
   if(value.denominatorSeconds===0)e.unknown.push('Denominator is zero; utilization is undefined')
   c.add(prefix+key,`${row.name}: ${key}`,value.percent,'percent',`${value.numeratorSeconds} numerator seconds ÷ ${value.denominatorSeconds??'unknown'} denominator seconds × 100. ${key.includes('IncludingTentative')?'Includes committed + tentative scheduled hours.':'Committed schedule only; tentative excluded.'} Source scope is this viewer’s permitted work.`,e)
  }
 }
}
