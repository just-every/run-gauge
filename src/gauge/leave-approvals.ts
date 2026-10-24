import { capacity } from './reports'
import type { Bindings } from '../auth.server'
import { type Value, date, integer, need, text } from './model'
import { type Actor, type Transaction, all, get, finance } from './store'
export const leaveReasons = ['Personal time', 'Vacation', 'Prefer not to say']
export const leaveDecisions: Record<string,string> = {approved:'Owner approved requested absence',rejected:'Requested date unavailable',cancelled:'Absence cancelled by agreement'}
export async function leaveCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value) {
 if(!['save:leave','leave:request','leave:decide'].includes(action))return null
 if(action!=='leave:decide') {
  need(!input.id, 'Use the reviewed leave decision controls', 409)
  const person=await get(env,'people',text(input.personId,'Person'));tx.observe('people',person)
  need(finance(a)||a.personId===person.id,'Request only your own leave',403)
  const from=date(input.from),to=date(input.to);need(to>=from&&Date.parse(to)-Date.parse(from)<=366*86400000,'Choose at most one year of leave')
  need(leaveReasons.includes(input.note), 'Choose a private leave category; do not enter medical or legal details')
  return tx.record('leave',{personId:person.id,from,to,dailySeconds:integer(input.dailySeconds,'Leave seconds per date',1,86400),note:input.note,status:'requested',requestedBy:a.session.operator.id,requestedAt:Date.now(),conflicts:[]},undefined,undefined,action)
 }
 need(a.role==='owner','Only the owner decides requested leave',403)
 const row=await get(env,'leave',text(input.id,'Leave'));need(row.revision===input.revision,'Leave changed; reload',409)
 need(['approved','rejected','cancelled'].includes(input.outcome),'Choose approve, reject or cancel')
 need(row.value.status==='requested'&&input.outcome!=='cancelled'||(!row.value.status||row.value.status==='approved')&&input.outcome==='cancelled','Leave was already decided',409)
 need(input.reason===undefined||input.reason===''||input.reason===leaveDecisions[input.outcome], 'Leave decisions use a fixed administrative reason; do not enter medical or legal details')
 const bookings=await all(env,'staffing'),engagements=await all(env,'engagements')
 for(const r of bookings)tx.observe('staffing',r)
 tx.guard('(SELECT COUNT(*) FROM g_staffing)=?',bookings.length)
 const conflicts:Value[]=[]
 if(input.outcome==='approved') {
  const person=await get(env,'people',row.value.personId),calendars=await all(env,'calendars'),leave=await all(env,'leave')
  tx.observe('people',person)
  for(const r of calendars)tx.observe('calendars',r)
  for(const r of leave)tx.observe('leave',r)
  tx.guard('(SELECT COUNT(*) FROM g_calendars)=?',calendars.length);tx.guard('(SELECT COUNT(*) FROM g_leave)=?',leave.length)
  const result=capacity({people:[person],calendars,leave:leave.map(r=>r.id===row.id?{...r,value:{...r.value,status:'approved'}}:r),staffing:bookings},row.value.from,row.value.to)[0]
  for(const day of result.conflicts) for(const id of day.sources) {
   const booking=bookings.find(b=>b.id===id)!,engagement=engagements.find(e=>e.id===booking.value.engagementId)!
   tx.observe('engagements',engagement)
   conflicts.push({engagementId:engagement.id,leadId:engagement.value.leadId,staffingId:id,from:day.date,to:day.date,overbookedSeconds:day.seconds})
  }
 }

 return tx.record('leave',{...row.value,status:input.outcome,conflicts,decisionReason:leaveDecisions[input.outcome],decidedBy:a.session.operator.id,decidedAt:Date.now()},row,undefined,action)
}
