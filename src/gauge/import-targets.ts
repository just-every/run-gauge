import type { D1TargetAdapter, TargetRow } from '../modules/import-kit/src/d1/index'
import { canonicalJson } from '../modules/import-kit/src/d1/index'
import { kind, kinds, need } from './model'
function table(k:string){return `g_${kind(k)}`}
function admissible(k:string){need(['clients','people','engagements','tasks','rates','time','staffing','archives'].includes(k),'Unsupported import target');return table(k)}
export const targets: D1TargetAdapter = {
 async read(db,destination,k,id) {const r=await db.prepare(`SELECT id,revision,data FROM ${admissible(k)} WHERE id=?`).bind(id).first();return r?{destination,targetKind:k,targetId:r.id,revision:r.revision,value:JSON.parse(r.data)}:undefined},
 matches(row,destination,k,id) { return row ? {sql:`EXISTS(SELECT 1 FROM ${admissible(k)} WHERE id=? AND revision=? AND data=?)`,params:[id,row.revision,canonicalJson(row.value)]} : {sql:`NOT EXISTS(SELECT 1 FROM ${admissible(k)} WHERE id=?)`,params:[id]} },
 write(row) { const k=row.targetKind;admissible(k); if(k==='time')need((row.value as any).status==='draft','Imported time cannot carry approval'); return [{sql:`INSERT INTO ${table(k)}(id,revision,data) VALUES(?,?,?)`,params:[row.targetId,row.revision,canonicalJson(row.value)]}] },
 remove(destination,k,id) {
  const dependency = k==='people' ? "EXISTS(SELECT 1 FROM g_grants WHERE person_id=?) OR EXISTS(SELECT 1 FROM g_rates WHERE json_extract(data,'$.personId')=?) OR EXISTS(SELECT 1 FROM g_engagements, json_each(g_engagements.data,'$.members') m WHERE m.value=?) OR EXISTS(SELECT 1 FROM g_tasks WHERE json_extract(data,'$.assigneeId')=?)" : k==='tasks' ? "EXISTS(SELECT 1 FROM g_time WHERE json_extract(data,'$.taskId')=?) OR EXISTS(SELECT 1 FROM g_expenses WHERE json_extract(data,'$.taskId')=?) OR EXISTS(SELECT 1 FROM g_tasks WHERE json_extract(data,'$.parentId')=?) OR EXISTS(SELECT 1 FROM g_tasks WHERE json_extract(data,'$.previousOccurrenceId')=? OR json_extract(data,'$.nextOccurrenceId')=?)" : k==='rates' ? "EXISTS(SELECT 1 FROM g_time WHERE json_extract(data,'$.economics.rateId')=?)" : k==='time' ? "EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='time' AND source_id=?)" : '0'
  return [{sql:`INSERT INTO g_assert(ok) VALUES(CASE WHEN NOT (${dependency}) THEN 1 ELSE 0 END)`,params:k==='people'?[id,id,id,id]:k==='tasks'?[id,id,id,id,id]:dependency==='0'?[]:[id]},{sql:`DELETE FROM ${admissible(k)} WHERE id=?`,params:[id]},{sql:'DELETE FROM g_assert'}]
 },
 async list(db,destination) {const result:TargetRow[]=[];for(const k of ['clients','people','engagements','tasks','rates','time','staffing','archives'])for(const r of (await db.prepare(`SELECT id,revision,data FROM ${table(k)}`).all()).results)result.push({destination,targetKind:k,targetId:r.id,revision:r.revision,value:JSON.parse(r.data)});return result},
 matchesCount(count) {return {sql:`(${['clients','people','engagements','tasks','rates','time','staffing','archives'].map(k=>`(SELECT COUNT(*) FROM ${table(k)})`).join('+')})=?`,params:[count]}}
}
