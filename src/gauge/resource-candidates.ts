import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, charge, sum, need } from './model'
import { type Actor, type Transaction, access, all, finance, fence } from './store'
import { personMatches } from './custom-resource'
import { filters,visibleCustom } from './custom-values'
import { capacity,visible } from './reports'
import { explain, costCurrencyOf } from './rate-cards'

const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase()
export async function resourceCandidates(env:Bindings,a:Actor,request:Row,tx?:Transaction) {
 need(finance(a)||['lead','resource-manager'].includes(a.role),'Lead or finance access required',403)
 const engagement=await access(env,a,request.value.engagementId,true)
 if(a.role==='resource-manager')need(!Object.keys(request.value.customFilters??{}).length,'This request needs finance review',403)
 const observed=await Promise.all((['people','calendars','leave','staffing',...(finance(a)?['rates']:[])] as Kind[]).map(async k=>({kind:k,rows:await all(env,k)})))
 if(tx){
  tx.observe('engagements',engagement)
  for(const {kind,rows} of observed){for(const row of rows)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,rows.length)}
 }
 const rows=(kind:Kind)=>observed.find(o=>o.kind===kind)!.rows
 const people=rows('people').filter(p=>a.role!=='resource-manager'||a.resourceScope?.personIds.includes(p.id)),calendars=rows('calendars'),leave=rows('leave'),staffing=rows('staffing')
 const customFilters=filters(a,request.value.customFilters),customData=Object.keys(customFilters).length?await visible(env,a):null
 const {from,to,dailySeconds}=request.value
 const cap=capacity({people,calendars,leave,staffing},from,to),candidates:Value[]=[],unavailable:Value[]=[]
 for(const person of people){
  if(customData&&!personMatches(customData,{...person,value:visibleCustom(a,'people',person.value)},customFilters))continue
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
   const missingRateDates:string[]=[],costRates:Value[]=[],amounts:number[]=[],currencies=new Set<string>()
   for(const day of days){
    // RATE-002 / RATE-003 cost precedence; the engagement only matters for bill rates, so none is needed here.
    const rate=explain(rows('rates'),person,{id:'',revision:'',value:{type:'internal'}},request.value.service,day.date).cost?.chosen
    if(rate?.value.costMinor==null){missingRateDates.push(day.date);continue}
    currencies.add(costCurrencyOf(rate));amounts.push(charge(dailySeconds,rate.value.costMinor));costRates.push({date:day.date,id:rate.id,revision:rate.revision,effective:rate.value.effective,costMinor:rate.value.costMinor,currency:costCurrencyOf(rate)})
   }
   // Declared costs keep their currency; a total across currencies is refused without SETUP-003 rates.
   const currency=currencies.size===1?[...currencies][0]:currencies.size?null:a.currency
   Object.assign(candidate,{costMinor:missingRateDates.length||currency===null?null:sum(amounts),currency,costCurrencies:[...currencies].sort(),missingRateDates,costRates})
  }
  candidates.push(candidate)
 }
 // The opaque fingerprint binds the exact eligibility read, including private
 // competing bookings, without revealing their projects or leave reasons.
 if(tx&&customData)for(const k of ['clients','engagements','tasks','customFields'] as const)for(const r of customData[k])tx.observe(k,r)
 const fingerprint=sha256(canonicalJson({customData,request,engagement,observed,role:a.role,operator:a.session.operator.id}))
 await fence(env,a)
 return {request,candidates,unavailable,fingerprint}
}
