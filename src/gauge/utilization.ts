import { sum, type Row } from './model'
import type { capacity, visible } from './reports'

type Data = Awaited<ReturnType<typeof visible>>
type Capacity = ReturnType<typeof capacity>
const secondsFields = ['scheduledSeconds','scheduledBillableSeconds','tentativeSeconds','tentativeBillableSeconds','recordedSeconds','recordedBillableSeconds','submittedSeconds','submittedBillableSeconds','approvedSeconds','approvedBillableSeconds'] as const
type Seconds = Record<typeof secondsFields[number], number>
interface Detail extends Seconds {
 id: string; name: string; personId: string; engagementId: string; service: string
 sources: {time: string[]; staffing: string[]}
}
const empty = (): Seconds => Object.fromEntries(secondsFields.map(k=>[k,0])) as Seconds
const ratio = (numeratorSeconds: number, denominatorSeconds: number | null) => ({numeratorSeconds,denominatorSeconds,percent:denominatorSeconds===null||denominatorSeconds===0?null:numeratorSeconds/denominatorSeconds*100})

/** Every numerator uses the caller's visible records; each denominator counts a
 * participant's net calendar once, even when they work on several projects. */
export function utilization(data: Data, cap: Capacity, from: string, to: string) {
 const groups = new Map<string,Detail>()
 const group = (row: Row, service: string) => {
  const {personId,engagementId}=row.value, id=JSON.stringify([personId,engagementId,service])
  let result=groups.get(id)
  if(!result){result={id,name:service,personId,engagementId,service,...empty(),sources:{time:[],staffing:[]}};groups.set(id,result)}
  return result
 }
 const billable = (row: Row) => data.engagements.find(e=>e.id===row.value.engagementId)?.value.type!=='internal' && row.value.billable!==false
 for(const row of data.staffing){
  const start=row.value.from>from?row.value.from:from,end=row.value.to<to?row.value.to:to
  if(start>end)continue
  const count=(Date.parse(end)-Date.parse(start))/86400000+1,seconds=row.value.dailySeconds*count
  const g=group(row,row.value.service??'Unspecified'),prefix=row.value.commitment==='committed'?'scheduled':'tentative'
  g[`${prefix}Seconds`]+=seconds;if(billable(row))g[`${prefix}BillableSeconds`]+=seconds
  g.sources.staffing.push(row.id)
 }
 for(const row of data.time){
  const v=row.value
  if(v.workDate<from||v.workDate>to||!v.durationSeconds)continue
  const g=group(row,v.service)
  g.recordedSeconds+=v.durationSeconds;if(billable(row))g.recordedBillableSeconds+=v.durationSeconds
  if(v.status==='submitted'||v.status==='approved'){
   const prefix=v.status==='submitted'?'submitted':'approved'
   g[`${prefix}Seconds`]+=v.durationSeconds;if(billable(row))g[`${prefix}BillableSeconds`]+=v.durationSeconds
  }
  g.sources.time.push(row.id)
 }
 const summarize = (id: string, name: string, selected: Detail[], personIds: string[]) => {
  const people=cap.filter(p=>personIds.includes(p.personId)),missingCalendarDays=sum(people.map(p=>p.missingCalendarDays))
  const availableSeconds=missingCalendarDays?null:sum(people.map(p=>p.knownAvailableSeconds))
  const totals=Object.fromEntries(secondsFields.map(k=>[k,sum(selected.map(g=>g[k]))])) as Seconds
  const ratios={
   scheduledBillableCapacity:ratio(totals.scheduledBillableSeconds,availableSeconds),
   scheduledTotalCapacity:ratio(totals.scheduledSeconds,availableSeconds),
   recordedBillableCapacity:ratio(totals.recordedBillableSeconds,availableSeconds),
   recordedTotalCapacity:ratio(totals.recordedSeconds,availableSeconds),
   submittedBillableCapacity:ratio(totals.submittedBillableSeconds,availableSeconds),
   submittedTotalCapacity:ratio(totals.submittedSeconds,availableSeconds),
   approvedBillableCapacity:ratio(totals.approvedBillableSeconds,availableSeconds),
   approvedTotalCapacity:ratio(totals.approvedSeconds,availableSeconds),
   approvedBillableScheduled:ratio(totals.approvedBillableSeconds,totals.scheduledSeconds),
   approvedBillableScheduledIncludingTentative:ratio(totals.approvedBillableSeconds,sum([totals.scheduledSeconds,totals.tentativeSeconds])),
  }
  return {id,name,personIds,...totals,availableSeconds,missingCalendarDays,varianceSeconds:totals.recordedSeconds-totals.scheduledSeconds,ratios,
   sources:{time:[...new Set(selected.flatMap(g=>g.sources.time))],staffing:[...new Set(selected.flatMap(g=>g.sources.staffing))]}}
 }
 const details=[...groups.values()].map(g=>({...g,...summarize(g.id,g.name,[g],[g.personId])}))
 const aggregate = (field:'engagementId'|'service') => [...new Set(details.map(g=>g[field]))].map(id=>{
  const selected=details.filter(g=>g[field]===id)
  return summarize(id,field==='service'?id:data.engagements.find(e=>e.id===id)?.value.name??'Engagement',selected,[...new Set(selected.map(g=>g.personId))])
 })
 return {byPerson:data.people.map(p=>summarize(p.id,p.value.name,details.filter(g=>g.personId===p.id),[p.id])),byService:aggregate('service'),byProject:aggregate('engagementId'),details}
}
