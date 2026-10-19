import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, charge, sum, need } from './model'
import { type Actor, type Transaction, access, all, finance, fence } from './store'
import { capacity } from './reports'

const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase()
export async function resourceCandidates(env:Bindings,a:Actor,request:Row,tx?:Transaction) {
 need(finance(a)||a.role==='lead','Lead or finance access required',403)
 const engagement=await access(env,a,request.value.engagementId,true)
 const observed=await Promise.all((['people','calendars','leave','staffing',...(finance(a)?['rates']:[])] as Kind[]).map(async k=>({kind:k,rows:await all(env,k)})))
 if(tx){
  tx.observe('engagements',engagement)
  for(const {kind,rows} of observed){for(const row of rows)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,rows.length)}
 }
 const rows=(kind:Kind)=>observed.find(o=>o.kind===kind)!.rows
 const people=rows('people'),calendars=rows('calendars'),leave=rows('leave'),staffing=rows('staffing')
 const {from,to,dailySeconds}=request.value
 const cap=capacity({people,calendars,leave,staffing},from,to),candidates:Value[]=[],unavailable:Value[]=[]
 for(const person of people){
  const p=person.value,employmentType=p.employmentType??(p.contractor?'contractor':'employee')
  if(!(p.skills??[]).some((s:Value)=>same(s.name,request.value.skill)&&s.proficiency>=request.value.minProficiency))continue
  if(request.value.team&&!same(p.team??'',request.value.team)||request.value.location&&!same(p.location??'',request.value.location)||request.value.employmentType&&employmentType!==request.value.employmentType)continue
  const available=cap.find(c=>c.personId===person.id)!
  if(available.missingCalendarDays||available.days.some(d=>d.remainingSeconds!==null&&d.remainingSeconds<dailySeconds)){
   unavailable.push({personId:person.id,name:p.name,reason:available.missingCalendarDays?'Working calendar missing for requested dates':'Committed work or time off leaves insufficient daily capacity'})
   continue
  }
  const days=available.days.map(d=>({date:d.date,availableSeconds:d.availableSeconds,committedSeconds:d.committedSeconds,remainingSeconds:d.remainingSeconds}))
  const candidate:Value={personId:person.id,name:p.name,profile:{skills:p.skills,team:p.team??'',location:p.location??'',role:p.role??'',employmentType},days,totalSeconds:sum(days.map(()=>dailySeconds))}
  if(finance(a)){
   const missingRateDates:string[]=[],costRates:Value[]=[],amounts:number[]=[]
   for(const day of days){
    const rates=rows('rates').filter(r=>(r.value.personId===person.id||(!r.value.personId&&r.value.service===request.value.service))&&(r.value.service==='*'||r.value.service===request.value.service)&&r.value.effective<=day.date).sort((x,y)=>(Number(y.value.personId!==null)*2+Number(y.value.service===request.value.service))-(Number(x.value.personId!==null)*2+Number(x.value.service===request.value.service))||y.value.effective.localeCompare(x.value.effective))
    const rate=rates[0]
    if(rate?.value.costMinor==null||rate.value.currency!==a.currency){missingRateDates.push(day.date);continue}
    amounts.push(charge(dailySeconds,rate.value.costMinor));costRates.push({date:day.date,id:rate.id,revision:rate.revision,effective:rate.value.effective,costMinor:rate.value.costMinor})
   }
   Object.assign(candidate,{costMinor:missingRateDates.length?null:sum(amounts),currency:a.currency,missingRateDates,costRates})
  }
  candidates.push(candidate)
 }
 // The opaque fingerprint binds the exact eligibility read, including private
 // competing bookings, without revealing their projects or leave reasons.
 const fingerprint=sha256(canonicalJson({request,engagement,observed,role:a.role,operator:a.session.operator.id}))
 await fence(env,a)
 return {request,candidates,unavailable,fingerprint}
}
