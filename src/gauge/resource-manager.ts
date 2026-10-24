import type { Bindings } from '../auth.server'
import { type Kind, type Row, type Value, kinds, need, flag, text } from './model'
import { type Actor, type Transaction, all, get, fence } from './store'

export const resourceActions=['save:staffing','save:resourceRequests','resource:fill','staffing:preview','staffing:apply']
export async function resourceGrant(env:Bindings,a:Actor,tx:Transaction,input:Value){
 if(input.role!=='resource-manager')return null
 const previous=await env.DB.prepare('SELECT engagement_ids,planning_people,granted_by FROM g_grants WHERE operator_id=?').bind(input.operatorId).first<any>()
 if(!flag(input.enabled))return {purpose:'resource-planning',engagementIds:JSON.parse(previous?.engagement_ids??'[]'),planningPeople:JSON.parse(previous?.planning_people??'[]'),grantedBy:previous?.granted_by??a.session.operator.id}
 const ids=(value:any,label:string)=>{need(Array.isArray(value)&&value.length>0&&value.length<=100,'Choose 1–100 '+label);return [...new Set(value.map(String))]}
 const engagementIds=ids(input.engagementIds,'engagements'),planningPeople=ids(input.planningPeople,'people')
 for(const id of engagementIds)tx.observe('engagements',await get(env,'engagements',id))
 for(const id of planningPeople)tx.observe('people',await get(env,'people',id))
 const reason=text(input.reason,'Planning scope reason')
 return {purpose:'resource-planning',engagementIds,planningPeople,grantedBy:a.session.operator.id,reason}
}
export function planningPerson(a:Actor,id:string){need(a.role!=='resource-manager'||a.resourceScope?.personIds.includes(id),'Person is outside the planning grant',403)}
const pick=(row:Row,keys:string[])=>({...row,value:Object.fromEntries(keys.filter(k=>row.value[k]!==undefined).map(k=>[k,row.value[k]]))})
export async function resourceData(env:Bindings,a:Actor):Promise<Record<Kind,Row[]>>{
 need(a.role==='resource-manager'&&a.resourceScope,'Scoped resource planning required',403)
 const data=Object.fromEntries(kinds.map(k=>[k,[]])) as unknown as Record<Kind,Row[]>
 const scope=a.resourceScope
 data.people=(await all(env,'people')).filter(p=>scope.personIds.includes(p.id)&&!p.value.privacyErased).map(p=>pick(p,['name','timezone','role','team','location','skills','contractor','employmentType']))
 const people=new Set(data.people.map(p=>p.id))
 data.engagements=(await all(env,'engagements')).filter(e=>scope.engagementIds.includes(e.id)).map(e=>pick(e,['name','clientId','leadId','type','currency','timezone']))
 const engagements=new Set(data.engagements.map(e=>e.id))
 data.clients=(await all(env,'clients')).filter(c=>data.engagements.some(e=>e.value.clientId===c.id)).map(c=>pick(c,['name']))
 data.calendars=(await all(env,'calendars')).filter(c=>people.has(c.value.personId)).map(c=>pick(c,['personId','from','to','timezone','dailySeconds','weekdays','weekdaySeconds','holidays']))
 data.leave=(await all(env,'leave')).filter(l=>people.has(l.value.personId)&&(!l.value.status||l.value.status==='approved')).map(l=>({...pick(l,['personId','from','to','dailySeconds','status']),value:{...pick(l,['personId','from','to','dailySeconds','status']).value,note:'Private leave'}}))
 data.staffing=(await all(env,'staffing')).filter(s=>engagements.has(s.value.engagementId)&&people.has(s.value.personId)).map(s=>pick(s,['engagementId','personId','from','to','dailySeconds','commitment','service','billable','phaseKey','resourceRequestId']))
 data.resourceRequests=(await all(env,'resourceRequests')).filter(r=>engagements.has(r.value.engagementId)&&(!r.value.personId||people.has(r.value.personId))&&!Object.keys(r.value.customFilters??{}).length).map(r=>pick(r,['engagementId','role','skill','minProficiency','from','to','dailySeconds','service','billable','team','location','employmentType','status','personId','staffingId','staffingRevision','phaseKey']))
 await fence(env,a)
 return data
}
