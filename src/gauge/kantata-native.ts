import { definition } from './custom-fields'
import type { Bindings } from '../auth.server'
import { type Actor,Transaction,all,get,fence } from './store'
import { type Row,type Kind,type Value,need,text,date,integer,sum } from './model'
import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { targets } from './import-targets'
const owner=(a:Actor)=>need(a.role==='owner'&&a.session.kind==='native'&&!a.clientProposal&&!a.scheduled,'Only the native owner adopts reviewed Kantata records',403)
const nativeId=(ns:string,k:string,id:string)=>'kn_'+sha256(`${ns}:${k}:${id}`).slice(0,32)
const stages=['fields','clients','people','projects','tasks','rates','time','expenses','schedules','values']
const rowHash=(rows:Row[])=>sha256(canonicalJson(rows.map(r=>({id:r.id,revision:r.revision,value:r.value})).sort((a,b)=>a.id.localeCompare(b.id))))
async function sourceRows(env:Bindings,namespace:string){const rows=(await all(env,'kantataRecords')).filter(r=>r.value.namespace===namespace);need(rows.length,'Import the complete historical source package before native adoption',409);need(await env.DB.prepare("SELECT 1 FROM ik_jobs WHERE destination='gauge-kantata' AND namespace=? AND state='completed'").bind(namespace).first(),'A completed source import is required before adoption',409);need(!(await env.DB.prepare("SELECT 1 FROM ik_jobs WHERE destination='gauge-kantata' AND namespace=? AND state NOT IN ('completed','undone','rolled_back')").bind(namespace).first()),'Finish or reverse every pending source batch before native adoption',409);return rows}
function plan(rows:Row[],config:Value,namespace:string){
 const by=(kind:string)=>rows.filter(r=>r.value.sourceKind===kind),find=(kind:string,id:string)=>by(kind).find(r=>r.value.sourceId===id),id=(kind:string,sourceId:string)=>nativeId(namespace,kind,sourceId),items:Record<string,Value[]> = Object.fromEntries(stages.map(s=>[s,[]])),findings:string[]=[]
 const timezone=rows[0].value.sourceTimezone;need(timezone,'Source timezone is missing; review a fresh source package')
 const source=(r:Row)=>({namespace,externalId:r.value.sourceId,sourceRecordId:r.id,sourceRevision:r.revision,provider:r.value.flavor==='ox'?'kantata-ox':'kantata-sx'})
 const add=(stage:string,kind:Kind,r:Row,value:Value,suffix?:string)=>items[stage].push({kind,id:id(kind,suffix??r.value.sourceId),sourceRecordId:r.id,value})
 for(const r of by('customFields')){
  const v=r.value.data,scope=v.mappedScope
  need(['clients','people','engagements','tasks'].includes(scope),'Every source field needs a reviewed native scope')
  try{add('fields','customFields',r,{...definition({...v,scope,visibility:'finance-only',required:false,retired:false}),namespace,sourceId:r.value.sourceId,reason:'Explicit owner adoption of a retained Kantata source field; private by default'})}catch(error){findings.push(`Field ${r.value.sourceId}: ${error instanceof Error?error.message:'Invalid native definition'}`)}
 }
 for(const r of by('clients'))add('clients','clients',r,{name:r.value.data.name,source:source(r)})
 for(const r of by('people'))add('people','people',r,{name:r.value.data.name,timezone,contractor:false,skills:by('skills').filter(s=>s.value.data.personId===r.value.sourceId).map(s=>({name:s.value.data.name,proficiency:integer(Number(s.value.data.proficiency??1),'Source skill proficiency',1,5)})),source:source(r)})
 for(const r of by('projects')){
  const v=r.value.data,currencies=[...new Set(rows.filter(x=>x.value.data.projectId===r.value.sourceId&&x.value.data.currency).map(x=>x.value.data.currency))]
  if(currencies.length!==1)findings.push(`Project ${r.value.sourceId} needs exactly one explicit source currency; no implicit FX is performed`)
  add('projects','engagements',r,{type:'client',name:v.name,scope:v.scope,clientId:id('clients',v.clientId),leadId:id('people',v.leadId),members:[],currency:currencies[0]??null,timezone,source:source(r)})
 }
 for(const r of by('tasks'))add('tasks','tasks',r,{name:r.value.data.name,engagementId:id('engagements',r.value.data.projectId),status:'todo',priority:'normal',remainingSeconds:0,estimateSeconds:0,billable:true,checklist:[],source:source(r)})
 for(const r of by('rates')){const v=r.value.data;add('rates','rates',r,{personId:id('people',v.personId),service:'*',effective:v.effective,billMinor:v.billRateMinor,costMinor:v.costRateMinor,currency:v.currency,costCurrency:v.currency,source:source(r)})}
 for(const r of by('time')){
  const v=r.value.data;add('time','time',r,{personId:id('people',v.personId),engagementId:id('engagements',v.projectId),taskId:id('tasks',v.taskId),service:find('tasks',v.taskId)!.value.data.name,notes:typeof r.value.raw.notes==='string'?r.value.raw.notes:'Imported Kantata historical time',workDate:v.date,timezone,start:null,end:null,durationSeconds:v.seconds,billable:v.billable,status:'draft',currency:v.currency,source:{...source(r),billed:!!v.invoiceId,invoiceId:v.invoiceId??null,billMinor:v.billMinor,costMinor:v.costMinor,clockInstants:'not-supplied'}})
 }
 for(const r of by('expenses')){const v=r.value.data;add('expenses','expenses',r,{personId:id('people',v.personId),engagementId:id('engagements',v.projectId),taskId:null,date:v.date,description:typeof r.value.raw.description==='string'?r.value.raw.description:'Imported Kantata historical expense',amountMinor:v.amountMinor,currency:v.currency,status:'draft',reimbursable:false,attachmentIds:[],source:{...source(r),billed:!!v.invoiceId,invoiceId:v.invoiceId??null,receiptStatus:'source evidence only; native receipt adoption pending'}})}
 for(const r of by('schedules')){
  const v=r.value.data,allocations=config.scheduleAllocations?.[r.value.sourceId]??(v.from===v.to?[{date:v.from,seconds:v.seconds}]:null)
  if(!Array.isArray(allocations)){findings.push(`Schedule ${r.value.sourceId} needs reviewed exact date allocations; no daily distribution is invented`);continue}
  need(allocations.length>0&&allocations.length<=1000,'Use at most 1000 explicit allocation dates per source schedule')
  const seen=new Set<string>();for(const item of allocations){const day=date(item.date),seconds=integer(item.seconds,'Native allocation seconds',0,86400);need(day>=v.from&&day<=v.to&&!seen.has(day),'Allocation dates must be unique and inside the captured source period');seen.add(day);add('schedules','staffing',r,{personId:id('people',v.personId),engagementId:id('engagements',v.projectId),from:day,to:day,dailySeconds:seconds,commitment:'tentative',service:'Imported schedule',billable:true,source:{...source(r),meaning:'Owner-reviewed exact dates; source totals retained; no source approval imported'}},r.value.sourceId+':'+day)}
  need(sum(allocations.map((v:Value)=>v.seconds))===v.seconds,'Native schedule allocations must reconcile exactly to the source aggregate')
 }
 const records=new Map<string,Value>()
 for(const r of by('customValues')){
  const v=r.value.data,f=find('customFields',v.fieldId)!;const k=f.value.data.mappedScope as Kind,targetKind=({clients:'clients',engagements:'projects',people:'people',tasks:'tasks'} as Value)[k],target=find(targetKind,v.recordId);need(target,'Custom value source target is missing')
  const key=k+':'+v.recordId,rec=records.get(key)??{kind:k,id:id(k,v.recordId),sourceRecordId:target.id,values:{}}
  let value=v.value;if(f.value.data.type==='person')value=id('people',value);if(f.value.data.type==='currency')value=value.amountMinor
  rec.values[id('customFields',v.fieldId)]=value;records.set(key,rec)
 }
 items.values=[...records.values()]
 return {items,findings,counts:Object.fromEntries(stages.map(s=>[s,items[s].length]))}
}
export async function nativeAdoptionPreview(env:Bindings,a:Actor,input:Value){
 owner(a);await fence(env,a)
 const namespace=text(input.namespace,'Imported Kantata namespace',200),rows=await sourceRows(env,namespace),config=input.config??{},p=plan(rows,config,namespace),defs=await all(env,'customFields')
 // A pre-existing required field cannot be bypassed by migration. The owner
 // supplies values through the existing native field mapping before adoption.
 for(const f of defs.filter(f=>f.value.required&&!f.value.retired))if(Object.values(p.items).flat().some(item=>item.kind===f.value.scope))p.findings.push(`Existing required native field ${f.value.name} needs a reviewed migration value mapping`)
 const existing=(await all(env,'kantataAdoptions')).find(r=>r.value.namespace===namespace&&r.value.sourceHash===rowHash(rows)&&canonicalJson(r.value.config)===canonicalJson(config)&&r.value.status!=='undone')
 const fingerprint=sha256(canonicalJson({namespace,sourceHash:rowHash(rows),config,defs:defs.map(d=>({id:d.id,revision:d.revision})),counts:p.counts,findings:p.findings}))
 return {namespace,fingerprint,sourceHash:rowHash(rows),config,counts:p.counts,findings:p.findings,canApply:!p.findings.length,existingId:existing?.id??null,meaning:'Owner-reviewed native draft records, tentative allocations and finance-only fields. No source operator, approval, invoice issuance or settlement authority is adopted.'}
}
export async function nativeAdoptionCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value){
 if(!action.startsWith('kantataAdopt:'))return null
 owner(a);const reason=text(input.reason,'Native adoption review reason')
 if(action==='kantataAdopt:create'){
  const p=await nativeAdoptionPreview(env,a,input);need(p.canApply,p.findings.join('; '),409);need(p.fingerprint===input.fingerprint,'Native adoption inputs changed; preview again',409);need(input.confirm==='adopt-reviewed-native-drafts','Confirm this exact native draft adoption')
  if(p.existingId)return get(env,'kantataAdoptions',p.existingId)
  const rows=await sourceRows(env,p.namespace);need(rowHash(rows)===p.sourceHash,'Source evidence changed; preview again',409);for(const row of rows)tx.observe('kantataRecords',row)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_kantataAdoptions WHERE json_extract(data,'$.namespace')=? AND json_extract(data,'$.status')<>'undone')",p.namespace)
  return tx.record('kantataAdoptions',{namespace:p.namespace,sourceHash:p.sourceHash,config:p.config,counts:p.counts,status:'adopting',stage:0,cursor:0,effects:[],reason,by:a.session.operator.id,at:Date.now(),meaning:p.meaning},undefined,undefined,action)
 }
 const job=await get(env,'kantataAdoptions',text(input.id,'Native adoption'));need(job.revision===input.revision,'Native adoption changed; reload',409);tx.observe('kantataAdoptions',job)
 if(action==='kantataAdopt:advance'){
  need(job.value.status==='adopting','Native adoption is not pending',409)
  const rows=await sourceRows(env,job.value.namespace);need(rowHash(rows)===job.value.sourceHash,'Source evidence changed during native adoption; review before continuing',409);for(const row of rows)tx.observe('kantataRecords',row);tx.guard("(SELECT COUNT(*) FROM g_kantataRecords WHERE json_extract(data,'$.namespace')=?)=?",job.value.namespace,rows.length)
  const p=plan(rows,job.value.config,job.value.namespace);need(!p.findings.length,p.findings.join('; '),409)
  const stage=stages[job.value.stage],items=p.items[stage],effects=structuredClone(job.value.effects);let cursor=job.value.cursor,count=0
  for(;cursor<items.length&&count<10;cursor++,count++){
   const item=items[cursor]
   if(stage==='values'){
    const old=await get(env,item.kind,item.id);tx.customWrite={scope:item.kind,id:old.id,values:item.values};tx.customImport={namespace:job.value.namespace,sourceRecordId:item.sourceRecordId,adoptionId:job.id};const saved=await tx.record(item.kind,{...old.value},old,undefined,action),effect=effects.find((e:Value)=>e.kind===item.kind&&e.id===item.id);need(effect,'Native custom value target was not adopted by this journal',409);effect.revision=saved.revision
   }else{
    need(!(await env.DB.prepare(`SELECT 1 FROM g_${item.kind} WHERE id=?`).bind(item.id).first()),'Native adoption target already exists; no native edits are overwritten',409);tx.guard(`NOT EXISTS(SELECT 1 FROM g_${item.kind} WHERE id=?)`,item.id)
    const saved=await tx.record(item.kind,item.value,undefined,item.id,action);effects.push({kind:item.kind,id:saved.id,revision:saved.revision})
   }
  }
  const next=cursor===items.length?job.value.stage+1:job.value.stage,status=next===stages.length?'completed':'adopting'
  return tx.record('kantataAdoptions',{...job.value,effects,stage:next,cursor:cursor===items.length?0:cursor,status,lastReason:reason,...(status==='completed'?{completedAt:Date.now()}:{})},job,undefined,action)
 }
 if(action==='kantataAdopt:undo'){
  need(input.confirm==='undo-untouched-native-adoption','Confirm bounded undo of untouched native effects')
  need(['adopting','completed','undoing'].includes(job.value.status),'Native adoption is already undone',409)
  const effects=structuredClone(job.value.effects)
  // Validate all current revisions before each step. Any business edits or
  // native approval hold reversal before this batch removes anything.
  for(const effect of effects){const current=await get(env,effect.kind,effect.id);need(current.revision===effect.revision,'Native edits or approvals hold adoption undo',409);tx.observe(effect.kind,current)}
  for(let count=0;effects.length&&count<10;count++){
   const effect=effects.pop()!
   if(effect.kind==='customFields'){for(const scope of ['clients','people','engagements','tasks'])tx.guard(`NOT EXISTS(SELECT 1 FROM g_${scope} r,json_each(r.data,'$.customFields') f WHERE f.key=?)`,effect.id);tx.guard("NOT EXISTS(SELECT 1 FROM g_savedReports r WHERE json_extract(r.data,'$.group')=? OR EXISTS(SELECT 1 FROM json_each(r.data,'$.customFilters') f WHERE f.key=?) OR EXISTS(SELECT 1 FROM json_each(r.data,'$.measures') m WHERE m.value=?))",effect.id,effect.id,effect.id);tx.guard("NOT EXISTS(SELECT 1 FROM g_resourceRequests r,json_each(r.data,'$.customFilters') f WHERE f.key=?)",effect.id);tx.guard("NOT EXISTS(SELECT 1 FROM g_customFields f WHERE f.id=? AND json_extract(f.data,'$.required')=1)",effect.id);tx.sql('DELETE FROM g_customFields WHERE id=?',effect.id)}
   else if(effect.kind==='expenses'){tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='expenses' AND source_id=?)",effect.id);tx.sql('DELETE FROM g_expenses WHERE id=?',effect.id)}
   else for(const sql of targets.remove('gauge',effect.kind,effect.id))tx.sql(sql.sql,...sql.params??[])
   tx.sql('DELETE FROM g_history WHERE kind=? AND record_id=?',effect.kind,effect.id)
   tx.audit('kantataAdopt:undo',effect.kind,effect.id,{adoptionId:job.id,reason})
  }
  return tx.record('kantataAdoptions',{...job.value,effects,status:effects.length?'undoing':'undone',lastReason:reason},job,undefined,action)
 }
 return null
}
