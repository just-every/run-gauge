import type { Bindings } from '../auth.server'
import { planD1Import, createD1ImportJob, applyD1ImportBatches, resumeD1Import, rollbackD1Import, undoD1Import, readD1ImportJob, readD1ImportOriginals, type D1ImportContext } from '../modules/import-kit/src/d1/index'
import { type Actor, authority, finance, fence, all } from './store'
import { need, text, type Value } from './model'
import { harvest, type HarvestInput } from './harvest'
import { targets } from './import-targets'
export function importContext(env: Bindings,a: Actor,namespace:string):D1ImportContext { return {destination:'gauge',namespace,mappingVersion:'gauge-harvest-1',batchSize:10,maxBatches:1,storage:{database:env.DB,targets},authorization:{principalId:a.session.operator.id,predicate:()=>authority(a,true)}} }
export async function importCommand(env: Bindings,a: Actor,action:string,input:Value) {
 need(finance(a),'Finance access required',403)
 if(action==='import:preview'||action==='import:create') {
  const source=input.package as HarvestInput;need(source?.files,'Upload a Harvest package');const parsed=harvest(source,a.currency),ctx=importContext(env,a,parsed.namespace),plan=await planD1Import(parsed.bundle,parsed.mapping,ctx)
  const required=(await all(env,'customFields')).filter(f=>f.value.required&&!f.value.retired),fieldFindings:Value[]=[]
  for(const entry of plan.entries)for(const effect of entry.effects){const fields=required.filter(f=>f.value.scope===effect.targetKind);if(!fields.length||await targets.read(env.DB,'gauge',effect.targetKind,effect.targetId))continue;for(const f of fields){const value=(effect.value as Value).customFields?.[f.id];if(value===undefined||value===null||value===''||Array.isArray(value)&&!value.length)fieldFindings.push({sourceId:entry.source.sourceId,scope:effect.targetKind,field:f.id,name:f.value.name,reason:'Required custom value has no reviewed mapping in this import format'})}}
  need(action==='import:preview'||!fieldFindings.length,'Map required custom values before creating native import records')
  need(plan.counts.rejected===0,'Resolve rejected source rows')
  if(action==='import:preview')return {currency:parsed.currency,agencyCurrency:a.currency,currencyPolicy:parsed.currencyPolicy,customFieldFindings:fieldFindings,fingerprint:plan.fingerprint,counts:plan.counts,totals:parsed.totals,timeControls:parsed.timeControls,timeSources:parsed.bundle.records.filter(r=>r.kind==='time').map(r=>({sourceId:r.sourceId,location:r.location})),schedule:parsed.schedule,memberships:parsed.memberships,omissions:parsed.omissions,package:source}
  need(input.fingerprint===plan.fingerprint,'Preview changed; review it again',409)
  const job=await createD1ImportJob(plan,{...ctx,reviewedFingerprint:plan.fingerprint,operationKey:text(input.key,'Request key')});return applyD1ImportBatches(job.id,ctx)
 }
 const id=text(input.id,'Import job'),meta=await env.DB.prepare('SELECT namespace FROM ik_jobs WHERE id=? AND principal_id=?').bind(id,a.session.operator.id).first<{namespace:string}>();need(meta,'Import job unavailable',404);const ctx=importContext(env,a,meta.namespace)
 if(action==='import:resume')return resumeD1Import(id,ctx)
 if(action==='import:rollback')return rollbackD1Import(id,ctx)
 if(action==='import:undo')return undoD1Import(id,ctx)
 if(action==='import:read')return readD1ImportJob(id,ctx)
 if(action==='import:originals')return readD1ImportOriginals(id,ctx)
 need(false,'Unknown import action')
}
