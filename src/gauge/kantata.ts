import type { Bindings } from '../auth.server'
import { type Actor,authority,finance,fence,all } from './store'
import { type Value,need,text,uuid,sum } from './model'
import { canonicalJson,planD1Import,createD1ImportJob,applyD1ImportBatches,resumeD1Import,undoD1Import,rollbackD1Import,readD1ImportJob,readD1ImportOriginals,type D1TargetAdapter,type D1ImportContext } from '../modules/import-kit/src/d1/index'
import { kantataPackage } from './kantata-package'
const targets:D1TargetAdapter={
 async read(db,destination,kind,id){need(kind==='kantataRecords','Unsupported Kantata target');const r=await db.prepare('SELECT * FROM g_kantataRecords WHERE id=?').bind(id).first<any>();return r?{destination,targetKind:kind,targetId:id,revision:r.revision,value:JSON.parse(r.data)}:undefined},
 matches(row,destination,kind,id){need(kind==='kantataRecords','Unsupported Kantata target');return row?{sql:'EXISTS(SELECT 1 FROM g_kantataRecords WHERE id=? AND revision=? AND data=?)',params:[id,row.revision,canonicalJson(row.value)]}:{sql:'NOT EXISTS(SELECT 1 FROM g_kantataRecords WHERE id=?)',params:[id]}},
 write(row){need(row.targetKind==='kantataRecords','Unsupported Kantata target');return [{sql:'INSERT INTO g_kantataRecords(id,revision,data) VALUES(?,?,?)',params:[row.targetId,row.revision,canonicalJson(row.value)]}]},
 remove(destination,kind,id){need(kind==='kantataRecords','Unsupported Kantata target');return [{sql:"INSERT INTO g_assert(ok) VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM g_kantataAdoptions a JOIN g_kantataRecords r ON json_extract(a.data,'$.namespace')=json_extract(r.data,'$.namespace') WHERE r.id=? AND json_extract(a.data,'$.status')<>'undone') THEN 1 ELSE 0 END)",params:[id]},{sql:'DELETE FROM g_kantataRecords WHERE id=?',params:[id]},{sql:'DELETE FROM g_assert',params:[]}]},
 async list(db,destination){return (await db.prepare('SELECT * FROM g_kantataRecords').all<any>()).results.map(r=>({destination,targetKind:'kantataRecords',targetId:r.id,revision:r.revision,value:JSON.parse(r.data)}))},
 matchesCount(count){return {sql:'(SELECT COUNT(*) FROM g_kantataRecords)=?',params:[count]}}
}
const context=(env:Bindings,a:Actor,namespace:string):D1ImportContext=>({destination:'gauge-kantata',namespace,mappingVersion:namespace.startsWith('kantata-ox:')?'kantata-ox-v1':'kantata-sx-v1',batchSize:10,maxBatches:1,storage:{database:env.DB,targets},authorization:{principalId:a.session.operator.id,predicate:()=>authority(a,true)}})
export async function kantataCommand(env:Bindings,a:Actor,action:string,input:Value){
 need(finance(a),'Finance or the owner manages Kantata source evidence',403);await fence(env,a)
 if(['kantata:preview','kantata:create'].includes(action)){
  const p=kantataPackage(input.package),ctx=context(env,a,p.namespace),plan=await planD1Import(p.bundle,p.mapping,ctx)
  if(action==='kantata:preview')return {flavor:p.flavor,namespace:p.namespace,fingerprint:plan.fingerprint,counts:p.counts,financial:p.financial,findings:p.findings,canApply:p.canApply,meaning:'Reviewed historical evidence import; native adoption and cutover remain unavailable.',package:input.package}
  need(p.canApply,'Resolve every object permission, window, relationship, custom value and control-total finding before applying source evidence')
  need(input.fingerprint===plan.fingerprint,'Kantata source or mapping changed; review again',409)
  const job=await createD1ImportJob(plan,{...ctx,reviewedFingerprint:plan.fingerprint,operationKey:text(input.key,'Unique request key')});return applyD1ImportBatches(job.id,ctx)
 }
 const id=text(input.id,'Kantata import job'),meta=await env.DB.prepare("SELECT namespace FROM ik_jobs WHERE id=? AND principal_id=? AND destination='gauge-kantata'").bind(id,a.session.operator.id).first<{namespace:string}>();need(meta,'Kantata import job unavailable',404);const ctx=context(env,a,meta.namespace)
 if(action==='kantata:resume')return resumeD1Import(id,ctx)
 if(action==='kantata:undo'||action==='kantata:rollback')need(!(await all(env,'kantataAdoptions')).some(r=>r.value.namespace===meta.namespace&&r.value.status!=='undone'),'Undo native adoption before reversing its source evidence',409)
 if(action==='kantata:undo')return undoD1Import(id,ctx)
 if(action==='kantata:rollback')return rollbackD1Import(id,ctx)
 if(action==='kantata:originals')return readD1ImportOriginals(id,ctx)
 if(action==='kantata:read')return readD1ImportJob(id,ctx)
 need(false,'Unknown Kantata import action')
}
export async function kantataReport(env:Bindings,a:Actor,input:Value){
 need(finance(a),'Finance or the owner reads historical Kantata controls',403)
 const namespace=text(input.namespace,'Source namespace',200),rows=(await all(env,'kantataRecords')).filter(r=>r.value.namespace===namespace).map(r=>r.value)
 need(rows.length,'No imported Kantata source evidence in that namespace',404)
 const selected=input.fieldId?rows.find(r=>r.sourceKind==='customFields'&&r.sourceId===input.fieldId):null
 if(input.fieldId)need(selected,'Unknown historical custom field',404)
 const find=(kind:string,id:string)=>rows.find(r=>r.sourceKind===kind&&r.sourceId===id),groups:Record<string,Value>={}
 for(const kind of ['time','expenses','invoices','payments','wip'])for(const row of rows.filter(r=>r.sourceKind===kind)){
  const v=row.data,project=find('projects',kind==='payments'?find('invoices',v.invoiceId)?.data.projectId:v.projectId),person=kind==='time'?find('people',v.personId):null
  let dimension=project?.data.clientId??'Unresolved'
  if(selected){const scope=selected.data.scope,target=selected.data.mappedScope==='engagements'?project:selected.data.mappedScope==='people'?person:selected.data.mappedScope==='tasks'?find('tasks',v.taskId):selected.data.mappedScope==='clients'?find('clients',project?.data.clientId):null,cv=target&&rows.find(r=>r.sourceKind==='customValues'&&r.data.fieldId===selected.sourceId&&r.data.scope===scope&&r.data.recordId===target.sourceId);dimension=cv?typeof cv.data.value==='string'?cv.data.value:canonicalJson(cv.data.value):'Unassigned'}
  const key=dimension+'/'+v.currency,total=groups[key]??={dimension,currency:v.currency,timeSeconds:0,billableSeconds:0,timeValueMinor:0,timeCostMinor:0,expenseMinor:0,invoiceMinor:0,paidMinor:0,outstandingMinor:0,wipMinor:0,sources:[]},add=(field:string,n:number)=>total[field]=sum([total[field],n]);total.sources.push({kind,sourceId:row.sourceId})
  if(kind==='time'){add('timeSeconds',v.seconds);if(v.billable){add('billableSeconds',v.seconds);add('timeValueMinor',v.billMinor)}add('timeCostMinor',v.costMinor)}
  if(kind==='expenses')add('expenseMinor',v.amountMinor)
  if(kind==='invoices'){add('invoiceMinor',v.amountMinor);add('outstandingMinor',v.outstandingMinor)}
  if(kind==='payments')add('paidMinor',v.amountMinor)
  if(kind==='wip')add('wipMinor',v.amountMinor)
 }
 await fence(env,a);return {namespace,field:selected?.data??null,groups:Object.values(groups),meaning:'Historical source controls, not current native utilization/profitability or an approved cutover.'}
}
