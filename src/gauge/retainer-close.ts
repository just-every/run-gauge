import type { Bindings } from '../auth.server'
import { type Row, type Kind, type Value, need, text, workDate } from './model'
import { type Actor, type Transaction, finance, all, access, get } from './store'
import { retainerStatements } from './retainer-statements'

export const retainerInputKinds:Kind[]=['retainers','retainerPeriods','time','retainerCloses','retainerAdjustments']
export async function correctionInputs(env:Bindings,tx:Transaction) {
 const data=Object.fromEntries(await Promise.all(retainerInputKinds.map(async k=>[k,await all(env,k)]))) as Record<typeof retainerInputKinds[number],Row[]>
 for(const kind of retainerInputKinds){for(const row of data[kind])tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,data[kind].length)}
 return data
}
export async function correctionPeriod(env:Bindings,a:Actor,tx:Transaction,input:Value) {
 need(finance(a),'Finance access required for retainer corrections',403)
 const period=await get(env,'retainerPeriods',text(input.id,'Retainer period'))
 need(period.revision===input.revision,'Period changed; reload',409)
 await access(env,a,period.value.engagementId,true);tx.observe('retainerPeriods',period)
 return period
}
export async function closeRetainer(env:Bindings,a:Actor,tx:Transaction,input:Value) {
 const period=await correctionPeriod(env,a,tx,input),data=await correctionInputs(env,tx)
 need(workDate(Date.now(),a.timezone)>period.value.periodEnd,'Close only after the period ends in the agency timezone',409)
 need(!data.retainerCloses.some(c=>c.value.periodId===period.id),'This retainer period is already closed; it cannot reopen',409)
 need(data.retainerPeriods.filter(p=>p.value.rootId===period.value.rootId&&p.value.periodStart<period.value.periodStart).every(p=>data.retainerCloses.some(c=>c.value.periodId===p.id)),'Close earlier periods first to preserve FIFO history',409)
 const balance=retainerStatements(data).find(b=>b.periodId===period.id)!
 need(balance.remaining!==null&&!balance.unallocatedSources.length,'Resolve unknown or unallocated consumption before closing',409)
 need(!data.retainerAdjustments.some(r=>r.value.periodId===period.id&&r.value.status==='prepared'),'Decide prepared adjustments before closing',409)
 const terms=data.retainers.find(t=>t.id===period.value.retainerId)!
 return tx.record('retainerCloses',{engagementId:period.value.engagementId,rootId:period.value.rootId,periodId:period.id,statement:balance,fifoState:balance.fifoState,sources:data.time.filter(t=>balance.sources.includes(t.id)),terms,period,reason:text(input.reason,'Close reason'),closedBy:a.session.operator.id,closedAt:Date.now()})
}
