import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Value, type Row, need, text } from './model'
import { type Actor, type Transaction, access, all, fence } from './store'
import { normalizeSchedule, reschedule } from './delivery-engine'
import { capacity } from './reports'

const shift=(day:string,days:number)=>new Date(Date.parse(day)+days*86400000).toISOString().slice(0,10)
export async function deliveryPreview(env:Bindings,a:Actor,input:Value,tx?:Transaction) {
 const engagement=await access(env,a,text(input.engagementId,'Engagement'),true)
 const observed=await Promise.all((['deliveryPlans','tasks','milestones','people','calendars','leave','staffing'] as Kind[]).map(async kind=>({kind,rows:await all(env,kind)})))
 const rows=(kind:Kind)=>observed.find(o=>o.kind===kind)!.rows
 const previous=rows('deliveryPlans').filter(r=>r.value.engagementId===engagement.id).at(-1)
 need((input.previousId??null)===(previous?.id??null),'Baseline changed; reload before planning',409)
 const operation=input.operation??'baseline'
 need(['baseline','delay'].includes(operation),'Choose baseline or delay')
 if(operation==='delay')need(previous&&input.revision===previous.revision,'Baseline changed; reload',409)
 const schedule=operation==='delay'?reschedule(previous!.value.schedule,input.nodeId,input.delayBusinessDays):normalizeSchedule(input.plan)
 const linked=new Set<string>()
 const changes:{kind:Kind,id:string,before:Value,after:Value}[]=[]
 for(const node of schedule.nodes) {
  if(node.kind!=='phase') {
   const kind=node.kind==='task'?'tasks':'milestones',source=rows(kind).find(r=>r.id===node.sourceId)
   need(source&&source.value.engagementId===engagement.id,'Schedule source must belong to this engagement')
   const after=kind==='tasks'?{...source.value,from:node.start,to:node.end}:{...source.value,due:node.end}
   if(canonicalJson(after)!==canonicalJson(source.value))changes.push({kind,id:source.id,before:source.value,after})
  }
  for(const id of node.staffingIds) {
   need(!linked.has(id),'Link each booking to only one schedule item');linked.add(id)
   const booking=rows('staffing').find(r=>r.id===id)
   need(booking&&booking.value.engagementId===engagement.id,'Linked booking must belong to this engagement')
   const oldNode=previous?.value.schedule.nodes.find((n:Value)=>n.id===node.id)
   // On first linking, retain the booking's offset from the source's current start.
   const source=node.kind==='task'?rows('tasks').find(r=>r.id===node.sourceId):undefined
   const oldStart=oldNode?.start??source?.value.from??node.start
   const delta=(Date.parse(node.start)-Date.parse(oldStart))/86400000
   if(delta)changes.push({kind:'staffing',id,before:booking.value,after:{...booking.value,from:shift(booking.value.from,delta),to:shift(booking.value.to,delta)}})
  }
 }
 const staffing=rows('staffing').map(r=>({...r,value:changes.find(c=>c.kind==='staffing'&&c.id===r.id)?.after??r.value}))
 const affected=staffing.filter(r=>linked.has(r.id)),people=rows('people').filter(p=>affected.some(r=>r.value.personId===p.id))
 const dates=affected.flatMap(r=>[r.value.from,r.value.to]),from=dates.sort()[0],to=dates.at(-1)
 // The existing capacity door is bounded to a year; concatenate bounded slices
 // so a three-year delivery plan still receives every dated conflict.
 const readCapacity=(bookings:Row[])=>{
  const result:ReturnType<typeof capacity>=[]
  if(!people.length)return result
  for(let start=from;start<=to;start=shift(start,366)){
   const end=shift(start,365)<to?shift(start,365):to
   for(const part of capacity({people,calendars:rows('calendars'),leave:rows('leave'),staffing:bookings},start,end)){
    const previous=result.find(p=>p.personId===part.personId)
    if(previous){previous.days.push(...part.days);previous.conflicts.push(...part.conflicts);previous.missingCalendarDays+=part.missingCalendarDays}
    else result.push(part)
   }
  }
  return result
 }
 const cap=readCapacity(staffing),beforeCapacity=readCapacity(rows('staffing'))
 const publicCapacity=cap.map(p=>({personId:p.personId,name:p.name,missingCalendarDays:p.missingCalendarDays,conflicts:p.conflicts.map(c=>({date:c.date,seconds:c.seconds})),days:p.days.map(d=>({date:d.date,availableSeconds:d.availableSeconds,committedSeconds:d.committedSeconds,tentativeSeconds:d.tentativeSeconds,remainingSeconds:d.remainingSeconds,holiday:d.holiday,beforeCommittedSeconds:beforeCapacity.find(b=>b.personId===p.personId)!.days.find(b=>b.date===d.date)!.committedSeconds,committedDeltaSeconds:d.committedSeconds-beforeCapacity.find(b=>b.personId===p.personId)!.days.find(b=>b.date===d.date)!.committedSeconds}))}))
 const normalized:Value={engagementId:engagement.id,previousId:previous?.id??null,operation,...(operation==='delay'?{revision:previous!.revision,nodeId:input.nodeId,delayBusinessDays:input.delayBusinessDays}:{plan:schedule})}
 const fingerprint=sha256(canonicalJson({input:normalized,engagement,observed,operator:a.session.operator.id,role:a.role}))
 if(tx){tx.observe('engagements',engagement);for(const {kind,rows:records} of observed){for(const row of records)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,records.length)}}
 await fence(env,a)
 return {input:normalized,engagementId:engagement.id,previousId:previous?.id??null,number:(previous?.value.number??0)+1,schedule,changes,capacity:publicCapacity,fingerprint}
}
export async function deliveryCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(action!=='delivery:approve')return null
 const preview=await deliveryPreview(env,a,input,tx)
 need(preview.fingerprint===input.fingerprint,'Delivery inputs changed; preview again before approval',409)
 need(input.acceptEffects===true||input.acceptEffects==='on','Review and accept the displayed schedule effects')
 const reason=text(input.reason,'Baseline approval reason')
 for(const change of preview.changes) {
  const old=(await all(env,change.kind)).find(r=>r.id===change.id)!
  await tx.record(change.kind,change.after,old,undefined,'delivery:reschedule')
 }
 return tx.record('deliveryPlans',{engagementId:preview.engagementId,previousId:preview.previousId,number:preview.number,schedule:preview.schedule,reason,approvedBy:a.session.operator.id,approvedAt:Date.now()},undefined,undefined,'delivery:baseline')
}
