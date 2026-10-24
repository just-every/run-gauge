import { planningPerson } from './resource-manager'
import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, need, text, date, sum } from './model'
import { type Actor, type Transaction, access, all, finance, fence, get } from './store'
import { capacity } from './reports'
import { resourceDemand } from './resource-demand'

const dayBefore = (day:string) => new Date(Date.parse(day)-86400000).toISOString().slice(0,10)
/** Preview is a real global availability read, without exposing competing projects. */
export async function schedulePreview(env:Bindings,a:Actor,input:Value,tx?:Transaction) {
 need(finance(a)||['lead','resource-manager'].includes(a.role),'Lead or finance access required',403)
 const booking=await get(env,'staffing',text(input.id,'Booking'))
 need(booking.revision===input.revision,'Booking changed; reload before deciding',409)
 const engagement=await access(env,a,booking.value.engagementId,true)
 const observed=await Promise.all((['people','calendars','leave','staffing','resourceRequests'] as Kind[]).map(async kind=>({kind,rows:await all(env,kind)})))
 const rows=(kind:Kind)=>observed.find(o=>o.kind===kind)!.rows
 planningPerson(a,booking.value.personId)
 const v=booking.value,operation=input.operation,normalized:Value={id:booking.id,revision:booking.revision,operation},parts:Value[]=[]
 need(['move','split'].includes(operation),'Choose move or split')
 const person=(id:unknown)=>{const value=text(id,'Person');planningPerson(a,value);need(rows('people').some(p=>p.id===value),'Person not found');return value}
 if(operation==='move'){
  const from=date(input.from),to=date(input.to)
  need(to>=from&&Date.parse(to)-Date.parse(from)===Date.parse(v.to)-Date.parse(v.from),'A move must preserve the number of inclusive booking dates')
  Object.assign(normalized,{personId:person(input.personId),from,to})
  parts.push({...v,personId:normalized.personId,from,to})
 }else{
  const splitDate=date(input.splitDate),secondPersonId=person(input.secondPersonId)
  need(splitDate>v.from&&splitDate<=v.to,'Split date must be after the first date and within the booking')
  need(secondPersonId!==v.personId,'Choose a different person for the second part')
  Object.assign(normalized,{splitDate,secondPersonId})
  parts.push({...v,to:dayBefore(splitDate)},{...v,personId:secondPersonId,from:splitDate})
 }
 const people=rows('people').filter(p=>parts.some(part=>part.personId===p.id))
 const from=parts.map(p=>p.from).sort()[0]!,to=parts.map(p=>p.to).sort().at(-1)!
 const staffing=[...rows('staffing').filter(r=>r.id!==booking.id),...parts.map((value,n)=>({id:`preview-${n}`,revision:'',value}))]
 const cap=capacity({people,calendars:rows('calendars'),leave:rows('leave'),staffing},from,to)
 // Source IDs, hidden project names and private leave reasons never leave this handler.
 const publicCapacity=cap.map(p=>({personId:p.personId,name:p.name,missingCalendarDays:p.missingCalendarDays,conflicts:p.conflicts.map(c=>({date:c.date,seconds:c.seconds})),days:p.days.map(d=>({date:d.date,availableSeconds:d.availableSeconds,committedSeconds:d.committedSeconds,tentativeSeconds:d.tentativeSeconds,remainingSeconds:d.remainingSeconds,holiday:d.holiday}))}))
 const demand=resourceDemand({engagements:[engagement],resourceRequests:rows('resourceRequests'),staffing},from,to)[0]!
 const fingerprint=sha256(canonicalJson({booking,engagement,observed,input:normalized,operator:a.session.operator.id,role:a.role}))
 if(tx){
  tx.observe('engagements',engagement)
  for(const {kind,rows:records} of observed){for(const row of records)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,records.length)}
 }
 await fence(env,a)
 return {id:booking.id,revision:booking.revision,operation,input:normalized,parts,capacity:publicCapacity,unfilledSeconds:demand.unfilledSeconds,totalSeconds:sum(parts.map(p=>p.dailySeconds*((Date.parse(p.to)-Date.parse(p.from))/86400000+1))),fingerprint}
}
