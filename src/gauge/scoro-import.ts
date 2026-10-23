import { floatSpec } from './float'
import { rocketlaneSpec } from './rocketlane'
import { rocketlaneCutover } from './rocketlane-cutover'
import { productiveSpec } from './productive'
import { teamworkSpec } from './teamwork'
import type { Bindings } from '../auth.server'
import { type Actor, authority, finance, fence } from './store'
import { type Value, need, text } from './model'
import { planD1Import,createD1ImportJob,applyD1ImportBatches,resumeD1Import,undoD1Import,rollbackD1Import,readD1ImportJob,readD1ImportOriginals,type D1ImportContext } from '../modules/import-kit/src/d1/index'
import { moveInPackage, sourceControls, type MoveInSpec } from './scoro-common'
import { moveInDrafts } from './scoro-native'
import { scoroSpec } from './scoro'
import { moveInTargets } from './import-targets'
export const moveInSpecs:Record<string,MoveInSpec>={scoro:scoroSpec,teamwork:teamworkSpec,productive:productiveSpec,rocketlane:rocketlaneSpec,float:floatSpec}
const context=(env:Bindings,a:Actor,provider:string,namespace:string):D1ImportContext=>({destination:'gauge-'+provider,namespace,mappingVersion:provider+'-v1',batchSize:10,maxBatches:1,storage:{database:env.DB,targets:moveInTargets(provider)},authorization:{principalId:a.session.operator.id,predicate:()=>authority(a,true)}})
export async function moveInCommand(env:Bindings,a:Actor,provider:string,action:string,input:Value){
 need(finance(a),'Finance or the owner manages source evidence',403);await fence(env,a);const spec=Object.hasOwn(moveInSpecs,provider)?moveInSpecs[provider]:undefined;need(spec,'Unsupported source importer')
 if(provider==='rocketlane'&&action.startsWith('cutover-'))return rocketlaneCutover(env,a,action,input)
 if(action==='preview'||action==='create'){
  const p=moveInPackage(spec,input.package,a.currency);moveInDrafts(p,input.package.manifest)
  const ctx=context(env,a,provider,p.namespace),plan=await planD1Import(p.bundle,p.mapping,ctx).catch(error=>{if(error instanceof Error&&error.message==='CREDENTIAL_IN_DURABLE_DATA')need(false,'Remove credential fields or credential-shaped text from the original source export');throw error})
  if(plan.counts.rejected)p.findings.push({kind:'native',reason:'Required fields, source conflicts or current native constraints reject one or more effects'})
  const canApply=!p.findings.length
  if(action==='preview'){await fence(env,a);return {provider,namespace:p.namespace,currency:p.currency,agencyCurrency:a.currency,timezone:p.timezone,fingerprint:plan.fingerprint,counts:p.counts,financial:p.financial,findings:p.findings,canApply,nativeDrafts:input.package.manifest.nativeDrafts===true,meaning:'Historical source finance stays evidence. Reviewed native core/time drafts require fresh native approval; source-billed time cannot rebill. Cutover is not authorized.',package:input.package}}
  need(canApply,'Resolve every source permission, coverage, relationship and independent control finding')
  if(input.package.manifest.nativeDrafts===true)need(a.role==='owner'&&input.confirm==='adopt-reviewed-native-drafts','The owner must explicitly confirm the reviewed native drafts',403)
  need(input.fingerprint===plan.fingerprint,'Source or mapping changed; review a fresh preview',409)
  const job=await createD1ImportJob(plan,{...ctx,reviewedFingerprint:plan.fingerprint,operationKey:text(input.key,'Unique request key')});return applyD1ImportBatches(job.id,ctx)
 }
 if(action==='report'){
  const namespace=text(input.namespace,'Source account',200);need(namespace.startsWith(provider+':'),'Source account belongs to another provider')
  const rows=(await env.DB.prepare(`SELECT data FROM g_${provider}Records WHERE json_extract(data,'$.namespace')=? ORDER BY id`).bind(namespace).all<{data:string}>()).results.map(r=>JSON.parse(r.data)),records:Record<string,Value[]>={}
  need(rows.length,'No imported source records in this account',404);for(const row of rows)(records[row.sourceKind]??=[]).push(row.data)
  const groupBy=input.groupBy??'project';need(['client','project','person'].includes(groupBy),'Group source controls by client, project or person');await fence(env,a)
  return {provider,namespace,groupBy,groups:sourceControls(records,groupBy),records,meaning:'Historical source controls. Source approval and financial status confer no native authority; cutover remains unavailable.'}
 }
 if(action==='cutover')need(false,'Cutover remains unavailable until native financial adoption and full source coverage are proven',409)
 const id=text(input.id,'Source import job'),meta=await env.DB.prepare('SELECT namespace FROM ik_jobs WHERE id=? AND principal_id=? AND destination=?').bind(id,a.session.operator.id,'gauge-'+provider).first<{namespace:string}>();need(meta,'Source import job unavailable',404);const ctx=context(env,a,provider,meta.namespace)
 if(action==='read')return readD1ImportJob(id,ctx)
 if(action==='originals')return readD1ImportOriginals(id,ctx)
 if(action==='resume')return resumeD1Import(id,ctx)
 if(action==='undo')return undoD1Import(id,ctx)
 if(action==='rollback')return rollbackD1Import(id,ctx)
 need(false,'Unknown source import action')
}
