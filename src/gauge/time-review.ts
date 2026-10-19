import type { Bindings } from '../auth.server'
import { type Row, type Value, need, date, text, workDate } from './model'
import { type Actor, Transaction, all, get, finance } from './store'

export const reviewDefaults = {dueWeekday:1,dueTime:'17:00',minimumNotes:0,maxEntrySeconds:86400,maxDaySeconds:86400,reviewLevels:1,separation:false,serviceBillability:{} as Record<string,boolean>}
export const reviewSettings = (policy?: Row) => ({...reviewDefaults,...policy?.value.review})
export function activeDelegation(row:Row,engagement:Row,a:Actor,day:string,entryDate?:string) {
 const v=row.value
 return !v.revokedAt && v.engagementId===engagement.id && v.leadId===engagement.value.leadId && v.delegateId===a.personId && ['lead','finance'].includes(a.role) && v.from<=day && v.to>=day && (!entryDate || (v.from<=entryDate&&v.to>=entryDate))
}
export async function timeReviewer(env:Bindings,a:Actor,tx:Transaction,row:Row) {
 const engagement=await get(env,'engagements',row.value.engagementId);tx.observe('engagements',engagement)
 if(finance(a)||(a.role==='lead'&&engagement.value.leadId===a.personId))return engagement
 const delegates=await all(env,'timeDelegations'),day=workDate(Date.now(),a.timezone)
 const delegation=delegates.find(d=>activeDelegation(d,engagement,a,day,row.value.workDate))
 need(delegation,'This time is not assigned to you for review',403)
 tx.observe('timeDelegations',delegation)
 return engagement
}
export async function delegationCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(!['time:delegate','time:revoke-delegate'].includes(action))return null
 need(a.role==='lead','Only the engagement lead delegates their review',403)
 const current=input.id?await get(env,'timeDelegations',text(input.id,'Delegation')):undefined
 if(current)need(current.revision===input.revision,'Delegation changed; reload',409)
 const engagement=await get(env,'engagements',current?.value.engagementId??text(input.engagementId,'Engagement'))
 need(engagement.value.leadId===a.personId,'Delegate only your own engagements',403);tx.observe('engagements',engagement)
 const reason=text(input.reason,'Delegation reason')
 if(action==='time:revoke-delegate'){
  need(current&&!current.value.revokedAt,'Delegation is not active',409)
  return tx.record('timeDelegations',{...current.value,revokedAt:Date.now(),revokeReason:reason},current,undefined,action)
 }
 need(!current,'Create a new dated delegation instead of changing its history')
 const from=date(input.from),to=date(input.to),delegateId=text(input.delegateId,'Delegate')
 need(to>=from,'Delegation end precedes start');need(delegateId!==a.personId,'Choose another reviewer')
 const person=await get(env,'people',delegateId);tx.observe('people',person)
 const sql="EXISTS(SELECT 1 FROM g_grants g JOIN oa_operators o ON o.id=g.operator_id WHERE g.person_id=? AND g.enabled=1 AND g.role IN ('lead','finance') AND o.status='active')"
 need((await env.DB.prepare(`SELECT (${sql}) AS ok`).bind(delegateId).first<{ok:number}>())?.ok,'Delegate must have an active lead or finance grant')
 tx.guard(sql,delegateId)
 return tx.record('timeDelegations',{engagementId:engagement.id,leadId:a.personId,delegateId,from,to,reason,createdBy:a.session.operator.id,createdAt:Date.now(),revokedAt:null},undefined,undefined,action)
}

export function policyFlags(row:Row,settings:ReturnType<typeof reviewSettings>,time:Row[]) {
 const v=row.value,flags:string[]=[]
 if(String(v.notes??'').trim().length<settings.minimumNotes)flags.push(`Work notes need ${settings.minimumNotes} characters`)
 if(v.durationSeconds>settings.maxEntrySeconds)flags.push('Entry exceeds maximum hours')
 const total=time.filter(t=>t.value.personId===v.personId&&t.value.workDate===v.workDate).reduce((n,t)=>n+(t.value.durationSeconds??0),0)
 if(total>settings.maxDaySeconds)flags.push('Day exceeds maximum hours')
 return flags
}
export function dueLocal(row:Row,settings:ReturnType<typeof reviewSettings>) {
 const day=Date.parse(row.value.workDate),weekday=new Date(day).getUTCDay()
 const nextMonday=day+((7-weekday)%7+1)*86400000
 return `${new Date(nextMonday+((settings.dueWeekday+6)%7)*86400000).toISOString().slice(0,10)}T${settings.dueTime}`
}
const observedDays = new WeakMap<Transaction,Set<string>>()
export async function enforceTimeReview(env:Bindings,a:Actor,tx:Transaction,row:Row,policy:Row|undefined) {
 const settings=reviewSettings(policy),time=await all(env,'time')
 const observed=observedDays.get(tx)??new Set<string>(),key=`${row.value.personId}:${row.value.workDate}`
 if(!observed.has(key)){
  tx.guard('(SELECT COUNT(*) FROM g_time)=?',time.length)
  for(const t of time)if(t.value.personId===row.value.personId&&t.value.workDate===row.value.workDate)tx.observe('time',t)
  observed.add(key);observedDays.set(tx,observed)
 }
 const flags=policyFlags(row,settings,time);need(!flags.length,flags.join('; '))
 return settings
}
export function reviewQueue(data:{time:Row[];timePolicies:Row[]},timezone:string,allTime:Row[]=data.time) {
 const settings=reviewSettings(data.timePolicies[0]),today=workDate(Date.now(),timezone)
 const now=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(Date.now()).replace(' ','T')
 return data.time.filter(r=>r.value.status!=='approved').map(r=>({id:r.id,source:`time:${r.id}`,flags:policyFlags(r,settings,allTime),dueLocal:dueLocal(r,settings),overdue:now>dueLocal(r,settings),ageDays:r.value.status==='submitted'&&r.value.submittedAt?Math.max(0,Math.floor((Date.parse(today)-Date.parse(workDate(r.value.submittedAt,timezone)))/86400000)):null,completedLevels:r.value.reviewApprovals?.length??0,reviewLevels:settings.reviewLevels}))
}
