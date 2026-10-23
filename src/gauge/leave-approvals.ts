import { capacity } from './reports'
import type { Bindings } from '../auth.server'
import { type Value, date, integer, need, text } from './model'
import { type Actor, type Transaction, all, get, finance } from './store'
export async function leaveCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value) {
 if(!['leave:request','leave:decide'].includes(action))return null
 if(action==='leave:request') {
  const person=await get(env,'people',text(input.personId,'Person'));tx.observe('people',person)
  need(finance(a)||a.personId===person.id,'Request only your own leave',403)
  const from=date(input.from),to=date(input.to);need(to>=from&&Date.parse(to)-Date.parse(from)<=366*86400000,'Choose at most one year of leave')
  return tx.record('leave',{personId:person.id,from,to,dailySeconds:integer(input.dailySeconds,'Leave seconds per date',1,86400),note:text(input.note,'Private reason'),status:'requested',requestedBy:a.session.operator.id,requestedAt:Date.now(),conflicts:[]})
 }
 need(a.role==='owner','Only the owner decides requested leave',403)
 const row=await get(env,'leave',text(input.id,'Leave'));need(row.revision===input.revision,'Leave changed; reload',409)
 need(['approved','rejected','cancelled'].includes(input.outcome),'Choose approve, reject or cancel')
 need(row.value.status==='requested'&&input.outcome!=='cancelled'||row.value.status==='approved'&&input.outcome==='cancelled','Leave was already decided',409)
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

 return tx.record('leave',{...row.value,status:input.outcome,conflicts,decisionReason:text(input.reason,'Decision reason'),decidedBy:a.session.operator.id,decidedAt:Date.now()},row,undefined,action)
}
