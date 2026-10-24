import type { Bindings } from '../auth.server'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Kind, type Row, type Value, need, text } from './model'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
const owner = (a: Actor) => need(a.role === 'owner' && a.session.kind === 'native' && !a.scheduled && !a.clientProposal && !a.clientInvoice, 'Only the native owner adopts Float records', 403)
const identity = (namespace: string, kind: string, id: string) => 'fn_' + sha256(canonicalJson([namespace, kind, id])).slice(0, 32)
async function source(env: Bindings, namespace: string) {
 need(namespace.startsWith('float:'), 'Choose a Float source account')
 const rows = (await env.DB.prepare("SELECT id,revision,data FROM g_floatRecords WHERE json_extract(data,'$.namespace')=? ORDER BY id").bind(namespace).all<{id:string;revision:string;data:string}>()).results.map(r => ({id:r.id, revision:r.revision, value:JSON.parse(r.data)}))
 need(rows.length && await env.DB.prepare("SELECT 1 FROM ik_jobs WHERE destination='gauge-float' AND namespace=? AND state='completed'").bind(namespace).first(), 'Complete the source import before native adoption', 409)
 need(!await env.DB.prepare("SELECT 1 FROM ik_jobs WHERE destination='gauge-float' AND namespace=? AND state NOT IN ('completed','undone','rolled_back')").bind(namespace).first(), 'Finish every source batch before native adoption', 409)
 return rows
}
function plan(rows: Row[], config: Value, namespace: string) {
 const by = (kind:string) => rows.filter(r => r.value.sourceKind === kind), id = (kind:string, raw:string) => identity(namespace,kind,raw)
 const items: {kind:Kind;id:string;value:Value}[] = []
 const add = (kind:Kind, r:Row, value:Value, suffix=r.value.sourceId) => items.push({kind,id:id(kind,suffix),value:{...value,source:{provider:'float',namespace,externalId:r.value.sourceId,sourceKind:r.value.sourceKind,sourceRecordId:r.id,sourceRevision:r.revision}}})
 const timezone=rows[0].value.timezone, currency=rows[0].value.currency
 for(const r of by('clients'))add('clients',r,{name:r.value.data.name,billingCurrency:currency})
 for(const r of by('people'))add('people',r,{name:r.value.data.name,timezone,contractor:false})
 for(const r of by('projects')) {
  const v=r.value.data,lead=config.projectLeads?.[v.id],members=config.projectMembers?.[v.id]
  need(by('people').some(p=>p.value.sourceId===lead),'Review a captured lead for every native project')
  need(Array.isArray(members)&&new Set(members).size===members.length&&members.every(m=>by('people').some(p=>p.value.sourceId===m)),'Review every native project membership')
  add('engagements',r,{type:'client',name:v.name,clientId:id('clients',v.clientId),leadId:id('people',lead),members:members.map(m=>id('people',m)),scope:'Owner-reviewed Float source adoption',currency,timezone})
 }
 for(const r of by('workweeks')) {
  const v=r.value.data,weekdaySeconds=Array.from({length:7},(_,day)=>v.weekdays[day])
  need(weekdaySeconds.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=86400),'Weekday capacity must fit one day')
  add('calendars',r,{personId:id('people',v.personId),from:v.from,to:v.to,timezone,weekdaySeconds,weekdays:weekdaySeconds.flatMap((n,day)=>n>0?[day]:[]).join(','),dailySeconds:0,holidays:[],workdays:[]})
 }
 for(const kind of ['allocations','leave'])for(const r of by(kind).filter(r=>!r.value.data.sourceDeleted)) {
  const v=r.value.data
  for(const d of v.daily) {
   need(d.seconds>=0&&d.seconds<=86400,'Daily source quantity must fit one day')
   if(!d.seconds)continue
   add(kind==='allocations'?'staffing':'leave',r,{personId:id('people',v.personId),from:d.date,to:d.date,dailySeconds:d.seconds,...(kind==='allocations'?{engagementId:id('engagements',v.projectId),commitment:'tentative',service:'Imported Float allocation',billable:true}:{status:'approved',note:'Prefer not to say',conflicts:[],decisionReason:'Owner reviewed exact imported absence'})},v.id+':'+d.date)
  }
 }
 need(items.length<=1000,'This bounded native adoption supports at most 1000 native effects')
 return items
}
export async function floatAdoptionPreview(env:Bindings,a:Actor,input:Value) {
 owner(a);await fence(env,a)
 const namespace=text(input.namespace,'Float source account',200),rows=await source(env,namespace),config=input.config??{},items=plan(rows,config,namespace)
 const existing=(await all(env,'floatAdoptions')).find(r=>r.value.namespace===namespace)
 need(!existing||canonicalJson(existing.value.config)===canonicalJson(config),'Existing Float adoption uses another reviewed mapping; native remapping is refused',409)
 need(!existing||existing.value.sourceHash===sha256(canonicalJson(rows)),'Source evidence changed since native adoption',409)
 const definitions=await all(env,'customFields'),findings:string[]=[]
 if(!existing)for(const item of items) {
  if(await env.DB.prepare(`SELECT 1 FROM g_${item.kind} WHERE id=?`).bind(item.id).first())findings.push('A native target already exists; existing work is never overwritten')
  if(definitions.some(f=>f.value.required&&!f.value.retired&&f.value.scope===item.kind))findings.push('Required native custom fields need a reviewed mapping before adoption')
 }
 const fingerprint=sha256(canonicalJson({namespace,rows,config,definitions,items}))
 await fence(env,a)
 return {namespace,config,sourceHash:sha256(canonicalJson(rows)),fingerprint,effects:items,canApply:!findings.length,findings,counts:Object.fromEntries([...new Set(items.map(i=>i.kind))].map(k=>[k,items.filter(i=>i.kind===k).length])),existingId:existing?.id??null,meaning:'Exact weekday calendars, tentative daily allocations and explicitly owner-approved daily leave. No source approval, actual time, financial ownership or cutover is adopted.'}
}
export async function floatAdoptionCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value) {
 if(!action.startsWith('floatAdopt:'))return null
 owner(a)
 const reason=text(input.reason,'Float native review reason')
 if(action==='floatAdopt:create') {
  const p=await floatAdoptionPreview(env,a,input)
  need(p.fingerprint===input.fingerprint,'Float adoption inputs changed; preview again',409)
  need(p.canApply,p.findings.join('; '),409)
  need(input.confirm==='adopt-reviewed-float','Confirm the exact Float native effects')
  if(p.existingId)return get(env,'floatAdoptions',p.existingId)
  const rows=await source(env,p.namespace)
  need(sha256(canonicalJson(rows))===p.sourceHash,'Float source changed; preview again',409)
  tx.guard("(SELECT COUNT(*) FROM g_floatRecords WHERE json_extract(data,'$.namespace')=?)=?",p.namespace,rows.length)
  tx.guard("NOT EXISTS(SELECT 1 FROM ik_jobs WHERE destination='gauge-float' AND namespace=? AND state NOT IN ('completed','undone','rolled_back'))",p.namespace)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_floatAdoptions WHERE json_extract(data,'$.namespace')=?)",p.namespace)
  for(const r of rows)tx.guard('EXISTS(SELECT 1 FROM g_floatRecords WHERE id=? AND revision=? AND data=?)',r.id,r.revision,JSON.stringify(r.value))
  return tx.record('floatAdoptions',{namespace:p.namespace,config:p.config,sourceHash:sha256(canonicalJson(rows)),cursor:0,effects:[],status:'adopting',reason,meaning:p.meaning,by:a.session.operator.id},undefined,undefined,action)
 }
 const job=await get(env,'floatAdoptions',text(input.id,'Float adoption'))
 need(job.revision===input.revision,'Float adoption changed; reload',409)
 need(action==='floatAdopt:advance'&&job.value.status==='adopting','Float adoption is not pending',409)
 const rows=await source(env,job.value.namespace)
 need(sha256(canonicalJson(rows))===job.value.sourceHash,'Float source changed; adoption is held',409)
 for(const r of rows)tx.guard('EXISTS(SELECT 1 FROM g_floatRecords WHERE id=? AND revision=? AND data=?)',r.id,r.revision,JSON.stringify(r.value))
 tx.guard("(SELECT COUNT(*) FROM g_floatRecords WHERE json_extract(data,'$.namespace')=?)=?",job.value.namespace,rows.length)
 tx.guard("NOT EXISTS(SELECT 1 FROM ik_jobs WHERE destination='gauge-float' AND namespace=? AND state NOT IN ('completed','undone','rolled_back'))",job.value.namespace)
 for(const effect of job.value.effects) {
  const current=await get(env,effect.kind,effect.id)
  need(current.revision===effect.revision,'Later native edits hold pending Float adoption',409)
  tx.observe(effect.kind,current)
 }
 const items=plan(rows,job.value.config,job.value.namespace),effects=[...job.value.effects]
 let cursor=job.value.cursor
 for(let count=0;cursor<items.length&&count<5;cursor++,count++) {
  const item=items[cursor]
  need(!await env.DB.prepare(`SELECT 1 FROM g_${item.kind} WHERE id=?`).bind(item.id).first(),'Native target exists; adoption never overwrites native work',409)
  tx.guard(`NOT EXISTS(SELECT 1 FROM g_${item.kind} WHERE id=?)`,item.id)
  if(item.kind==='calendars')tx.guard("NOT EXISTS(SELECT 1 FROM g_calendars WHERE person_id=? AND json_extract(data,'$.from')<=? AND json_extract(data,'$.to')>=?)",item.value.personId,item.value.to,item.value.from)
  const saved=await tx.record(item.kind,item.value,undefined,item.id,action)
  effects.push({kind:item.kind,id:saved.id,revision:saved.revision,sourceRecordId:item.value.source.sourceRecordId})
 }
 return tx.record('floatAdoptions',{...job.value,cursor,effects,status:cursor===items.length?'completed':'adopting',lastReason:reason},job,undefined,action)
}
