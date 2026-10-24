import type { Bindings } from '../auth.server'
import { type Row, need } from './model'
import { type Transaction, all } from './store'
import { retainerCandidates } from './retainer-sources'

/** An overage review binds prior carry inputs too. Source edits/allocations may
 * not invalidate a reserved or approved period anywhere later in that family. */
export async function assertRetainerSourceEditable(env:Bindings,tx:Transaction,time:Row) {
 const portions="SELECT 1 FROM g_timeSlices s JOIN g_billing_sources b ON b.kind='timeSlices' AND b.source_id=s.id WHERE json_extract(s.data,'$.sourceId')=?"
 need(!await env.DB.prepare(portions).bind(time.id).first(),'Reserved time portions are immutable; use invoice corrections',409);tx.guard(`NOT EXISTS(${portions})`,time.id)
 const closes=await all(env,'retainerCloses'),adjustments=await all(env,'retainerAdjustments')
 need(!closes.some(c=>c.value.sources.some((s:Row)=>s.id===time.id))&&!adjustments.some(r=>r.value.status!=='cancelled'&&r.value.sourceId===time.id),'Closed or linked retainer work is immutable; prepare a linked adjustment',409)
 for(const [kind,rows] of [['retainerCloses',closes],['retainerAdjustments',adjustments]] as const){for(const row of rows)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,rows.length)}
 const [retainers,retainerPeriods]=await Promise.all([all(env,'retainers'),all(env,'retainerPeriods')])
 const roots=new Set(retainerCandidates({retainers,retainerPeriods},time.value).map(p=>p.value.rootId))
 if(time.value.retainerRootId)roots.add(time.value.retainerRootId)
 const dependencies=retainerPeriods.filter(p=>roots.has(p.value.rootId)&&p.value.periodEnd>=time.value.workDate&&!closes.some(c=>c.value.periodId===p.id))
 for(const period of dependencies){
  need(!await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='retainerPeriods' AND source_id=?").bind(period.id).first(),'Reserved or approved retainer overage depends on this source; use the correction workflow',409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='retainerPeriods' AND source_id=?)",period.id)
 }
 for(const [kind,rows] of [['retainers',retainers],['retainerPeriods',retainerPeriods]] as const){for(const row of rows)tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,rows.length)}
}
