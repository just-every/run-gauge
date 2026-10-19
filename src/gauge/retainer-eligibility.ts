import type { Bindings } from '../auth.server'
import { type Row, type Value, need } from './model'
import { type Transaction, all } from './store'
import { retainerPeriods } from './retainer-periods'

export function retainerCovers(terms:Row[],time:Value) {
 const candidates=terms.filter(t=>t.value.engagementId===time.engagementId&&t.value.terms.start<=time.workDate)
 const latest=candidates.filter(t=>!candidates.some(n=>n.value.rootId===t.value.rootId&&n.value.number>t.value.number))
 return latest.some(row=>{
  const t=row.value.terms
  if(!t.services.some((s:string)=>s.toLowerCase()===time.service.toLowerCase()))return false
  if(t.consumes!=='all'&&(t.consumes==='billable'?!time.billable:time.billable))return false
  return retainerPeriods(t,time.workDate,time.workDate,row.value.calendar).length>0
 })
}
// Retainer-covered work cannot also enter an ordinary hourly packet. Overage
// rules and scheduled retainer billing must release their own reviewed sources.
export async function assertAdHocTime(env:Bindings,tx:Transaction,time:Value) {
 const terms=await all(env,'retainers')
 for(const row of terms)tx.observe('retainers',row)
 tx.guard('(SELECT COUNT(*) FROM g_retainers)=?',terms.length)
 need(!retainerCovers(terms,time),'Retainer-covered time is held from ordinary hourly billing; review retainer overage and billing rules first',409)
}
