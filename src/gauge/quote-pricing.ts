import type { Bindings } from '../auth.server'
import { type Row,type Value,need } from './model'
import { type Transaction,all,get } from './store'

/** A real accepted estimate is the source of this transient bill-rate view.
 * It is never persisted as a fictitious RATE-002 card and carries its own kind. */
export function quoteBill(data:Record<string,Row[]>,engagementId:string,budget:Row|undefined,work:Value):Row|undefined{
 if(!budget?.value.estimateId)return undefined
 const quote=(data.estimates??[]).find(q=>q.id===budget.value.estimateId&&q.revision===budget.value.estimateRevision),conversion=(data.estimateConversions??[]).find(c=>c.value.engagementId===engagementId&&c.value.estimateId===budget.value.estimateId)
 const held=(reason:string)=>({id:budget.value.estimateId,revision:budget.value.estimateRevision,value:{estimateId:budget.value.estimateId,currency:budget.value.currency,billMinor:null,quoteHeldReason:reason,estimateLineKeys:[]}})
 if(!quote||!conversion)return held('The accepted quote source is unavailable')
 if(quote.value.currency!==budget.value.currency)return held('Quote currency differs; no implicit FX')
 const task=work.taskId?(data.tasks??[]).find(t=>t.id===work.taskId&&t.value.engagementId===engagementId):undefined,request=work.resourceRequestId?(data.resourceRequests??[]).find(r=>r.id===work.resourceRequestId&&r.value.engagementId===engagementId):undefined
 const phaseKey=work.phaseKey??task?.value.phaseKey,phases=quote.value.phases.filter((p:Value)=>phaseKey?p.key===phaseKey:p.service===work.service)
 if(phases.length!==1)return held('Choose the agreed quote phase and service')
 const phase=phases[0];if(phase.service!==work.service)return held('The task service differs from the accepted quote')
 let lines=quote.value.lines.filter((l:Value)=>l.phaseKey===phase.key&&l.kind!=='expense')
 if(task?.value.estimateId===quote.id&&task.value.estimateLineKey)lines=lines.filter((l:Value)=>l.key===task.value.estimateLineKey)
 else if(request?.value.estimateId===quote.id&&request.value.estimateLineKeys?.length)lines=lines.filter((l:Value)=>request.value.estimateLineKeys.includes(l.key))
 else {const person=lines.filter((l:Value)=>l.personId===work.personId);if(person.length)lines=person}
 if(!lines.length||new Set(lines.map((l:Value)=>l.billRateMinor)).size!==1)return held('The agreed quote rate is ambiguous; choose a quoted task or reviewed role request')
 return {id:quote.id,revision:quote.revision,value:{currency:quote.value.currency,service:phase.service,effective:phase.from,billMinor:lines[0].billRateMinor,writeDownBps:quote.value.discountBasisPoints,estimateId:quote.id,estimateRevision:quote.revision,estimateLineKeys:lines.map((l:Value)=>l.key),quoteHeldReason:null}}
}
export async function observedQuoteBill(env:Bindings,tx:Transaction|undefined,engagementId:string,budget:Row|undefined,work:Value){
 if(!budget?.value.estimateId)return undefined
 const quote=await get(env,'estimates',budget.value.estimateId),conversions=(await all(env,'estimateConversions')).filter(c=>c.value.engagementId===engagementId),task=work.taskId?await get(env,'tasks',work.taskId):undefined,request=work.resourceRequestId?await get(env,'resourceRequests',work.resourceRequestId):undefined
 if(task)need(task.value.engagementId===engagementId,'Quoted task belongs to another engagement')
 if(tx){tx.observe('estimates',quote);for(const c of conversions)tx.observe('estimateConversions',c);if(task)tx.observe('tasks',task);if(request)tx.observe('resourceRequests',request)}
 const bill=quoteBill({estimates:[quote],estimateConversions:conversions,tasks:task?[task]:[],resourceRequests:request?[request]:[]},engagementId,budget,work)
 return bill
}
