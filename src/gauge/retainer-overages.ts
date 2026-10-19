import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, need } from './model'
import { type Transaction, all } from './store'
import { retainerConsumption } from './retainer-consumption'

/** A whole-period overage is one reserved billing source, bound to all inputs.
 * Included work stays held; later corrections use a linked reviewed adjustment. */
export async function retainerOverage(env:Bindings,tx:Transaction,period:Row) {
 const kinds:Kind[]=['retainers','retainerPeriods','time']
 const groups=await Promise.all(kinds.map(async kind=>({kind,rows:await all(env,kind)})))
 const data=Object.fromEntries(groups.map(g=>[g.kind,g.rows])) as {retainers:Row[],retainerPeriods:Row[],time:Row[]}
 for(const {kind,rows} of groups){for(const row of rows)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,rows.length)}
 const balance=retainerConsumption(data).find(b=>b.periodId===period.id)!
 need(balance&&balance.overagePolicy==='bill'&&balance.overageMinor>0,'This period has no complete, contractually billable overage',409)
 const used=new Set(balance.sources)
 const others=retainerConsumption(data).filter(b=>b.periodId!==period.id&&b.sources.some((id:string)=>used.has(id)))
 need(!others.length,'Work matches multiple retainers; resolve its commercial allocation before billing an overage',409)
 const terms=data.retainers.find(t=>t.id===period.value.retainerId)!
 const inputs={period,terms,balance,priorPeriods:data.retainerPeriods.filter(p=>balance.priorPeriodIds.includes(p.id)),work:data.time.filter(t=>t.value.engagementId===period.value.engagementId&&t.value.workDate<=period.value.activeEnd)}
 return {kind:'retainerPeriods',sourceId:period.id,sourceRevision:period.revision,description:`${terms.value.terms.name}: ${period.value.periodStart}–${period.value.periodEnd} overage`,amountMinor:balance.overageMinor,currency:balance.currency,durationSeconds:balance.unit==='hours'?balance.overage:null,billRateMinor:balance.unit==='hours'?terms.value.terms.rules.overageRate:null,roundingPolicy:'Retainer FIFO excess only; exact seconds or value × agreed rate, half up to cents',rateId:terms.id,budgetId:null,retainerFingerprint:sha256(canonicalJson(inputs)),retainerBalance:balance} as Value
}
