import { sourceCustomFields } from './source-custom-fields'
import type { Bindings } from '../auth.server'
import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { type Row,type Value,type Kind,need,text,date,flag,uuid } from './model'
import { type Actor,Transaction,all,get,finance,access,fence } from './store'
import { customScopes,customTypes,canField,normalizeCustom,observeDefinitions,filters,visibleCustom } from './custom-values'

export function definition(input:Value,old?:Row):Value{
 const scope=input.scope??old?.value.scope,type=input.type??old?.value.type,visibility=input.visibility??old?.value.visibility??'finance-only'
 need(customScopes.includes(scope),'Choose clients, engagements, people or tasks');need(customTypes.includes(type),'Choose a supported custom field type');need(['everyone','lead-finance','finance-only'].includes(visibility),'Choose field visibility')
 if(old)need(scope===old.value.scope&&type===old.value.type&&(!input.currency||input.currency===old.value.currency),'Field scope, type and currency are immutable; define a new field')
 const value:Value={...old?.value,scope,type,visibility,name:text(input.name??old?.value.name,'Field name',200),required:input.required===undefined?old?.value.required??false:flag(input.required),retired:input.retired===undefined?old?.value.retired??false:flag(input.retired)}
 if(type==='currency'){value.currency=text(input.currency??old?.value.currency,'ISO currency',3);need(Intl.supportedValuesOf('currency').includes(value.currency),'Use a supported ISO currency')}
 if(['single-select','multi-select'].includes(type)){const options=input.options??old?.value.options;need(Array.isArray(options)&&options.length>0&&options.length<=100,'Supply one to 100 stable options');value.options=options.map((o:Value)=>({id:text(o.id,'Option ID',100),name:text(o.name,'Option name',200),retired:flag(o.retired)}));need(new Set(value.options.map((o:Value)=>o.id)).size===value.options.length,'Option IDs must be unique');for(const o of old?.value.options??[])need(value.options.some((n:Value)=>n.id===o.id),'Retire old options instead of deleting their identities')}
 need(!(value.required&&value.retired),'Retire a field only after making it optional')
 return value
}
export async function customPreview(env:Bindings,a:Actor,input:Value){
 need(a.role==='owner','Only the owner reviews custom-field imports',403)
 const original=input.package;need(['kantata-ox-custom-fields-v1','source-custom-fields-v1'].includes(original?.format),'Use a documented source custom-fields package');const pkg=original.format==='source-custom-fields-v1'?sourceCustomFields(original,input.mapping):original;const namespace=text(pkg.namespace,'Source namespace',200)
 need(Array.isArray(pkg.fields)&&pkg.fields.length<=100&&Array.isArray(pkg.records)&&pkg.records.length<=100,'Custom-field package is bounded to 100 definitions and 100 records')
 const native=await all(env,'customFields'),proposed:Row[]=[],findings:Value[]=[...(pkg.findings??[])],sourceIds=new Set<string>()
 for(const raw of pkg.fields){const sourceId=text(raw.id,'Source field ID',100);need(!sourceIds.has(sourceId),'Duplicate source field identity');sourceIds.add(sourceId);const existing=native.find(f=>f.value.namespace===namespace&&f.value.sourceId===sourceId),id=existing?.id??'field-'+sha256(namespace+'|'+sourceId).slice(0,32),policy=input.policies?.[sourceId]??{};if(original.format==='source-custom-fields-v1')need(policy.visibility===undefined||policy.visibility==='finance-only','Imported source fields remain finance-only; publish later with an explicit native definition review');let value:Value;try{value=definition(existing?{...existing.value,options:raw.options??existing.value.options,...(original.format==='source-custom-fields-v1'?{visibility:'finance-only'}:{})}:{...raw,...policy,visibility:policy.visibility??'finance-only',required:policy.required??false})}catch(error){findings.push({scope:raw.scope,sourceId,reason:error instanceof Error?error.message:'Invalid source field definition'});continue}need(!existing||value.scope===raw.scope&&value.type===raw.type,'Imported field type or scope conflicts with its stable identity');const changed=existing&&canonicalJson({...value,namespace,sourceId})!==canonicalJson(existing.value);proposed.push(changed||!existing?{id,revision:'import-'+sha256(canonicalJson(value)).slice(0,24),value:{...value,namespace,sourceId}}:existing!)}
 const overlay=[...native.filter(f=>!proposed.some(p=>p.id===f.id)),...proposed],records:Value[]=[],seen=new Set<string>()
 for(const raw of pkg.records){const scope=raw.scope;need(customScopes.includes(scope),'Source record needs a supported native scope');const sourceId=text(raw.id,'Source record ID',200),targetId=input.mapping?.[scope]?.[sourceId];if(!targetId){findings.push({scope,sourceId,reason:'No reviewed native relationship mapping'});continue}
  const marker=scope+':'+targetId;need(!seen.has(marker),'Map each native record once');seen.add(marker);const target=await get(env,scope,targetId),values:Value={};for(const [sourceFieldId,v]of Object.entries(raw.values??{})){const f=proposed.find(f=>f.value.sourceId===sourceFieldId&&f.value.scope===scope);if(!f){findings.push({scope,sourceId,field:sourceFieldId,reason:'Undefined source field'});continue}values[f.id]=v}
  const tx=new Transaction(env,a);tx.customOverlay=overlay;tx.customWrite={scope,id:target.id,values};tx.customImport={namespace,sourceId};try{const value=await normalizeCustom(env,tx,scope,target.value,target);records.push({scope,sourceId,target,value,importedValues:values})}catch(error){findings.push({scope,sourceId,reason:(error instanceof Error?error.message:'Invalid custom value')+' · '+JSON.stringify(raw.values)})}
 }
 const digest=sha256(canonicalJson({package:original,mapping:input.mapping??{},policies:input.policies??{}})),fingerprint=sha256(canonicalJson({digest,native,records,findings}))
 await fence(env,a);return {format:pkg.format,namespace,digest,fingerprint,fields:proposed,records,findings,sourceControls:pkg.controls??null,canApply:!findings.length}
}
export async function customCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(action==='field:define'){
  need(a.role==='owner','Only the owner defines field policy',403);await observeDefinitions(env,tx);const old=input.id?await get(env,'customFields',input.id):undefined;if(old)need(old.revision===input.revision,'Field definition changed',409)
  return tx.record('customFields',{...definition(input,old),reason:text(input.reason,'Definition reason'),changedBy:a.session.operator.id,changedAt:Date.now()},old)
 }
 if(action==='field:values'){
  need(customScopes.includes(input.scope),'Choose a supported record scope');const k=input.scope as Kind,r=await get(env,k,text(input.id,'Record'));need(r.revision===input.revision,'Record changed; refresh before editing custom values',409)
  if(k==='tasks')await access(env,a,r.value.engagementId,true);else need(finance(a),'Finance edits this record',403)
  tx.customWrite={scope:k,id:r.id,values:input.customFields};return tx.record(k,{...r.value},r,undefined,action)
 }
 if(action==='field:import'){
  const preview=await customPreview(env,a,input),existing=(await all(env,'customImports')).find(r=>r.value.digest===preview.digest)
  if(existing){need(existing.value.status!=='undone','This source import was undone; review a new source revision',409);return existing}
  need(preview.canApply,'Resolve every preview finding; no custom values are dropped');need(preview.fingerprint===input.fingerprint,'Import inputs or native records changed; review a fresh preview',409);await observeDefinitions(env,tx)
  const definitionEffects:Value[]=[];const native=await all(env,'customFields');tx.customOverlay=[...native.filter(f=>!preview.fields.some(p=>p.id===f.id)),...preview.fields]
  for(const f of preview.fields){const old=native.find(r=>r.id===f.id);if(old?.revision===f.revision)continue;const row=await tx.record('customFields',f.value,old,f.id,action);definitionEffects.push({id:row.id,revision:row.revision,previous:old??null});tx.customOverlay=tx.customOverlay.map(r=>r.id===row.id?row:r)}
  const effects:Value[]=[];const id=uuid();for(const rec of preview.records){tx.customWrite={scope:rec.scope,id:rec.target.id,values:rec.importedValues};tx.customImport={namespace:preview.namespace,sourceId:rec.sourceId,importId:id,digest:preview.digest};const saved=await tx.record(rec.scope,rec.target.value,rec.target,undefined,action);const fieldIds=Object.keys(rec.importedValues),snapshot=(value:Value)=>Object.fromEntries(['customFields','customFieldVersions','customFieldSources'].map(key=>[key,Object.fromEntries(fieldIds.filter(id=>Object.hasOwn(value[key]??{},id)).map(id=>[id,value[key][id]]))]));effects.push({scope:rec.scope,id:saved.id,before:snapshot(rec.target.value),after:snapshot(saved.value),fieldIds});if(rec.scope==='people'){tx.customPendingPeople??=new Map();tx.customPendingPeople.set(saved.id,saved.revision)}}
  return tx.record('customImports',{status:'applied',effects,definitionEffects,digest:preview.digest,namespace:preview.namespace,package:input.package,mapping:input.mapping,policies:input.policies??{},sourceControls:preview.sourceControls,records:preview.records.map(r=>({scope:r.scope,sourceId:r.sourceId,targetId:r.target.id,previousRevision:r.target.revision})),reason:text(input.reason,'Import review reason'),importedBy:a.session.operator.id,importedAt:Date.now()},undefined,id,action)
 }
 if(action==='field:import-undo'){
  need(a.role==='owner','Only the owner reverses custom-field imports',403)
  const receipt=await get(env,'customImports',text(input.id,'Custom-field import'));need(receipt.revision===input.revision,'Import changed; review its current revision',409);tx.observe('customImports',receipt)
  if(receipt.value.status==='undone')return receipt
  need(Array.isArray(receipt.value.effects),'This historical import has no reversible effect journal',409)
  const reason=text(input.reason,'Import reversal reason');await observeDefinitions(env,tx)
  const referenceData=new Map<string,Row[]>()
  for(const scope of customScopes){const records=await all(env,scope as Kind);referenceData.set(scope,records);tx.guard(`(SELECT COUNT(*) FROM g_${scope})=?`,records.length);for(const row of records)tx.observe(scope as Kind,row)}
  const held:Value[]=[],restored:Value[]=[],updated=new Map<string,Value>()
  for(const effect of receipt.value.effects){
   const current=await get(env,effect.scope,effect.id),value:Value={...current.value,customFields:{...current.value.customFields},customFieldVersions:{...current.value.customFieldVersions},customFieldSources:{...current.value.customFieldSources}}
   let changed=false
   for(const id of effect.fieldIds){
    if(value.customFieldSources[id]?.importId!==receipt.id||canonicalJson(value.customFields[id]??null)!==canonicalJson(effect.after.customFields[id]??null)||value.customFieldVersions[id]!==effect.after.customFieldVersions[id]){held.push({scope:effect.scope,id:effect.id,fieldId:id,reason:'Later native or source edit retained'});continue}
    for(const key of ['customFields','customFieldVersions','customFieldSources']){if(Object.hasOwn(effect.before[key]??{},id))value[key][id]=effect.before[key][id];else delete value[key][id]}
    restored.push({scope:effect.scope,id:effect.id,fieldId:id});changed=true
   }
   if(changed){await tx.record(effect.scope,value,current,undefined,action,value);updated.set(effect.scope+':'+current.id,value)}
  }
  // Keep source schemas in custody while retiring unused definitions created by this adoption.
  for(const effect of receipt.value.definitionEffects??[]){
   const current=await get(env,'customFields',effect.id)
   if(current.revision!==effect.revision){held.push({scope:'customFields',id:effect.id,reason:'Later native definition retained'});continue}
   let referenced=false
   for(const scope of customScopes)for(const record of referenceData.get(scope)??[]){const value=updated.get(scope+':'+record.id)??record.value;if(Object.hasOwn(value.customFields??{},effect.id))referenced=true}
   if(referenced){held.push({scope:'customFields',id:effect.id,reason:'Retained native value still references this schema'});continue}
   const value=effect.previous?.value??{...current.value,retired:true,required:false}
   await tx.record('customFields',value,current,undefined,action)
  }
  return tx.record('customImports',{...receipt.value,status:'undone',reversal:{restored,held,reason,reversedBy:a.session.operator.id,reversedAt:Date.now()}},receipt,undefined,action)
 }
 if(action==='saved:save'){
  await observeDefinitions(env,tx)
  need(finance(a)||a.role==='lead','Lead or finance saves reports',403);need(['profitability','utilization'].includes(input.dataset),'Choose profitability or utilization');need(input.dataset!=='profitability'||finance(a),'Profitability is finance only',403)
  const filter=filters(a,input.nativeFilters??input.customFilters,undefined,!!input.nativeFilters),group=text(input.group,'Custom report group'),field=a.customDefinitions?.find(f=>f.id===group);need(field&&canField(a,field),'Report field unavailable',403)
  const measures=(input.measures??[]).map((id:string)=>{const f=a.customDefinitions?.find(f=>f.id===id);need(f&&canField(a,f)&&['number','currency'].includes(f.value.type),'Measure field unavailable',403);return id})
  return tx.record('savedReports',{name:text(input.name,'Report name'),dataset:input.dataset,group,customFilters:filter,measures,from:date(input.from),to:date(input.to),createdBy:a.session.operator.id,createdAt:Date.now()})
 }
 return null
}
export function savedVisible(a:Actor,v:Value){return (finance(a)||v.createdBy===a.session.operator.id)&&[v.group,...Object.keys(v.customFilters??{}),...(v.measures??[])].every(id=>{const f=a.customDefinitions?.find(f=>f.id===id);return f&&canField(a,f)})}
export async function savedRead(env:Bindings,a:Actor,id:string){const r=await get(env,'savedReports',id);need(savedVisible(a,r.value),'Saved report unavailable',403);need(r.value.dataset!=='profitability'||finance(a),'Finance required',403);const {reports}=await import('./reports');const v=r.value,result=await reports(env,a,v.from,v.to,undefined,null,{portfolioGroup:'custom:'+v.group,customGroup:v.group,customFilters:v.customFilters,customMeasures:v.measures});await fence(env,a);return {definition:r,result:v.dataset==='profitability'?result.portfolio:result.customPerformance}}
