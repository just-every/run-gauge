import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, need } from './model'
import { type Transaction, all } from './store'
import { retainerCandidates } from './retainer-sources'
import { retainerConsumption } from './retainer-consumption'

/** A whole-period overage is one reserved billing source, bound to all inputs.
 * Included work stays held; later corrections use a linked reviewed adjustment. */
export async function retainerOverage(env:Bindings,tx:Transaction,period:Row) {
 const kinds:Kind[]=['retainers','retainerPeriods','time','retainerCloses','retainerAdjustments']
 const groups=await Promise.all(kinds.map(async kind=>({kind,rows:await all(env,kind)})))
 const data=Object.fromEntries(groups.map(g=>[g.kind,g.rows])) as {retainers:Row[],retainerPeriods:Row[],time:Row[]}
 for(const {kind,rows} of groups){for(const row of rows)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,rows.length)}
 const balance=retainerConsumption(data).find(b=>b.periodId===period.id)!
 need(balance&&balance.overagePolicy==='bill'&&balance.overageMinor>0,'This period has no complete, contractually billable overage',409)
 need(!data.time.some(t=>t.value.durationSeconds>0&&!t.value.retainerRootId&&retainerCandidates(data,t.value).some(p=>p.id===period.id)&&retainerCandidates(data,t.value).length>1),'Unallocated ambiguous work holds retainer overage billing',409)
 const used=new Set(balance.sources)
 const others=retainerConsumption(data).filter(b=>b.periodId!==period.id&&b.sources.some((id:string)=>used.has(id)))
 need(!others.length,'Work matches multiple retainers; resolve its commercial allocation before billing an overage',409)
 const root=data.retainerPeriods.find(p=>p.id===period.id)!.value.rootId
 const related=retainerConsumption(data).filter(b=>data.retainerPeriods.find(p=>p.id===b.periodId)!.value.rootId===root&&data.retainerPeriods.find(p=>p.id===b.periodId)!.value.periodStart<=period.value.periodStart)
 const sourceIds=[...new Set(related.flatMap(b=>b.sources as string[]))]
 for(const id of sourceIds){const time=data.time.find(t=>t.id===id)!;need(!time.value.source?.billed,'Historically billed work cannot produce another retainer charge',409);need(!await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?").bind(id).first(),'Retainer work is already reserved or billed elsewhere',409);tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?)",id)}
 const terms=data.retainers.find(t=>t.id===period.value.retainerId)!
 const inputs={period,terms,balance,priorPeriods:data.retainerPeriods.filter(p=>balance.priorPeriodIds.includes(p.id)),work:data.time.filter(t=>t.value.engagementId===period.value.engagementId&&t.value.workDate<=period.value.activeEnd)}
 return {kind:'retainerPeriods',sourceId:period.id,sourceRevision:period.revision,description:`${terms.value.terms.name}: ${period.value.periodStart}–${period.value.periodEnd} overage`,amountMinor:balance.overageMinor,currency:balance.currency,durationSeconds:balance.unit==='hours'?balance.overage:null,billRateMinor:balance.unit==='hours'?terms.value.terms.rules.overageRate:null,roundingPolicy:'Retainer FIFO excess only; exact seconds or value × agreed rate, half up to cents',rateId:terms.id,budgetId:null,retainerFingerprint:sha256(canonicalJson(inputs)),retainerBalance:balance} as Value
}
