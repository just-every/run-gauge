import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Value, type Row, type Kind, need, text, date, integer } from './model'
import { type Actor, type Transaction, access, all, fence } from './store'
import { normalizeRetainer, retainerPeriods } from './retainer-periods'

export async function retainerPreview(env:Bindings,a:Actor,input:Value,tx?:Transaction) {
 const engagement=await access(env,a,text(input.engagementId,'Engagement'),true)
 need(engagement.value.type!=='internal','Internal work has no commercial retainers')
 const observed=await Promise.all((['retainers','retainerPeriods','agencyCalendars'] as Kind[]).map(async kind=>({kind,rows:await all(env,kind)})))
 const rows=(kind:Kind)=>observed.find(o=>o.kind===kind)!.rows
 const operation=input.operation??'terms';need(['terms','periods'].includes(operation),'Choose terms or periods')
 const previous=input.previousId?rows('retainers').find(r=>r.id===input.previousId):undefined
 need(!input.previousId||previous?.value.engagementId===engagement.id,'Previous retainer version not found')
 const existing=operation==='periods'?rows('retainers').find(r=>r.id===input.retainerId):undefined
 need(operation!=='periods'||existing?.value.engagementId===engagement.id,'Retainer version not found')
 const rootId=existing?.value.rootId??previous?.value.rootId??null
 const family=rootId?rows('retainers').filter(r=>r.value.rootId===rootId):[]
 if(previous)need(family.at(-1)?.id===previous.id,'Retainer version changed; reload',409)
 const terms=operation==='terms'?normalizeRetainer(input.terms,engagement.value.currency):existing!.value.terms
 if(previous)need(terms.start>previous.value.terms.start,'A new commercial version starts after the previous version')
 const calendarRow=rows('agencyCalendars').at(-1)
 need(terms.proration!=='working'||(operation==='periods'?existing!.value.calendar:calendarRow),'The owner must save the agency workweek and holidays before working-day proration')
 const calendar=operation==='periods'?existing!.value.calendar:calendarRow?.value.calendar??{weekdays:[],holidays:[]}
 const from=date(input.from??terms.start),to=date(input.to??from)
 const calculated=retainerPeriods(terms,from,to,calendar)
 need(calculated.length>0,'This window has no authorized retainer period')
 const successor=existing?family.find(r=>r.value.number===existing.value.number+1):undefined
 need(!successor||calculated.every(p=>p.activeEnd<successor.value.terms.start),'A later commercial version governs this period; use that version')
 const saved=rows('retainerPeriods').filter(p=>p.value.rootId===rootId)
 const periods=calculated.map(period=>{
  const old=saved.find(p=>p.value.periodStart===period.periodStart)
  if(old){need(operation==='periods'&&old.value.retainerId===existing!.id,'A saved period cannot be replaced by new terms',409);return {...period,existingId:old.id}}
  need(saved.every(p=>period.periodStart>p.value.periodEnd||period.periodEnd<p.value.periodStart),'Commercial periods cannot overlap an already saved period',409)
  return {...period,existingId:null}
 })
 if(previous)need(saved.every(p=>terms.start>p.value.periodEnd),'New terms must start after every saved period',409)
 const normalized:Value={engagementId:engagement.id,operation,from,to,...(operation==='terms'?{previousId:previous?.id??null,terms}:{retainerId:existing!.id})}
 const fingerprint=sha256(canonicalJson({input:normalized,engagement,observed,operator:a.session.operator.id,role:a.role}))
 if(tx){tx.observe('engagements',engagement);for(const {kind,rows:records} of observed){for(const row of records)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,records.length)}}
 await fence(env,a)
 return {input:normalized,engagementId:engagement.id,rootId,number:(previous?.value.number??0)+1,terms,calendar,calendarId:operation==='periods'?existing!.value.calendarId:calendarRow?.id??null,periods,fingerprint}
}
export async function retainerCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(action==='agency:calendar'){
  need(a.role==='owner','Only the owner sets the agency workweek and holidays',403)
  const calendars=await all(env,'agencyCalendars');need((input.previousId||null)===(calendars.at(-1)?.id??null),'Agency calendar changed; reload',409)
  const weekdays=(Array.isArray(input.weekdays)?input.weekdays:String(input.weekdays??'').split(',').filter(Boolean)).map((n:unknown)=>integer(typeof n==='string'?Number(n):n,'Weekday',0,6))
  need(weekdays.length&&new Set(weekdays).size===weekdays.length,'Choose unique working weekdays')
  const holidays=(Array.isArray(input.holidays)?input.holidays:String(input.holidays??'').split(',').map(s=>s.trim()).filter(Boolean)).map(date)
  need(holidays.length<=366&&new Set(holidays).size===holidays.length,'Choose at most 366 unique holiday dates')
  for(const row of calendars)tx.observe('agencyCalendars',row);tx.guard('(SELECT COUNT(*) FROM g_agencyCalendars)=?',calendars.length)
  return tx.record('agencyCalendars',{name:'Agency workweek and holidays',calendar:{weekdays:weekdays.sort(),holidays:holidays.sort()},reason:text(input.reason,'Calendar change reason'),previousId:calendars.at(-1)?.id??null,savedBy:a.session.operator.id,savedAt:Date.now()})
 }
 if(action!=='retainer:approve')return null
 const preview=await retainerPreview(env,a,input,tx)
 need(preview.fingerprint===input.fingerprint,'Retainer inputs changed; preview again',409)
 const reason=text(input.reason,'Commercial approval reason')
 let termsRow:Row
 if(preview.input.operation==='terms'){
  const id=crypto.randomUUID(),rootId=preview.rootId??id
  termsRow=await tx.record('retainers',{engagementId:preview.engagementId,rootId,number:preview.number,previousId:preview.input.previousId,terms:preview.terms,calendar:preview.calendar,calendarId:preview.calendarId,reason,approvedBy:a.session.operator.id,approvedAt:Date.now()},undefined,id)
 }else termsRow=(await all(env,'retainers')).find(r=>r.id===preview.input.retainerId)!
 for(const period of preview.periods)if(!period.existingId){const {existingId,...value}=period;await tx.record('retainerPeriods',{...value,engagementId:preview.engagementId,rootId:termsRow.value.rootId,retainerId:termsRow.id,unit:preview.terms.unit,currency:preview.terms.currency,reason,openedBy:a.session.operator.id,openedAt:Date.now()})}
 return termsRow
}
