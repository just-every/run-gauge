import type { Bindings } from '../auth.server'
import { type Kind, type Value, need, text } from './model'
import { type Actor, type Transaction, access, all, get } from './store'
import { assertRetainerSourceEditable } from './retainer-source-lock'
import { retainerCandidates } from './retainer-sources'

export async function allocateRetainer(env:Bindings,a:Actor,tx:Transaction,input:Value) {
 const time=await get(env,'time',text(input.id,'Time entry'))
 need(time.revision===input.revision,'Time changed; review its exact revision again',409)
 const engagement=await access(env,a,time.value.engagementId,true);tx.observe('engagements',engagement)
 need(time.value.durationSeconds>0,'Stop and confirm the time interval before allocating it')
 const [retainers,retainerPeriods]=await Promise.all([all(env,'retainers'),all(env,'retainerPeriods')])
 const candidates=retainerCandidates({retainers,retainerPeriods},time.value)
 const rootId=text(input.retainerRootId,'Retainer family')
 need(candidates.some(p=>p.value.rootId===rootId),'Choose one eligible retainer family for this work')
 need(!time.value.source?.billed,'Historically billed time cannot become included retainer work',409)
 need(!await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?").bind(time.id).first(),'Reserved work cannot be reallocated',409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?)",time.id)
 await assertRetainerSourceEditable(env,tx,time)
 return tx.record('time',{...time.value,retainerRootId:rootId,retainerAllocation:{reason:text(input.reason,'Allocation reason'),by:a.session.operator.id,at:Date.now()}},time,undefined,'retainer:allocate')
}
