import type { Bindings } from '../auth.server'
import { type Actor, type Transaction, get, fence } from './store'
import { type Value, need, text } from './model'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { assertNoCredentials } from '../modules/import-kit/src/provenance/identity'
import { floatPackage } from './float'
import { targets } from './import-targets'
const owner=(a:Actor)=>need(a.role==='owner'&&a.session.kind==='native'&&!a.scheduled&&!a.clientInvoice&&!a.clientProposal,'Only the native owner continues Float deletions',403)
export async function floatDeletionPreview(env:Bindings,a:Actor,input:Value) {
 owner(a);await fence(env,a)
 const job=await get(env,'floatAdoptions',text(input.id,'Float adoption')),p=floatPackage(input.package,a.currency)
 need(p.namespace===job.value.namespace,'Deletion capture belongs to another source account',409)
 need(!p.findings.length,'Resolve every deletion coverage and independent comparison finding',409)
 try{assertNoCredentials(input.package)}catch{need(false,'Remove credentials from the original deletion capture')}
 const digest=sha256(canonicalJson(input.package)),receipts=job.value.deletionReceipts??[],existing=receipts.find((r:Value)=>r.digest===digest)
 if(existing){await fence(env,a);return {id:job.id,revision:job.revision,digest,fingerprint:existing.fingerprint,replay:true,effects:[],package:input.package,canApply:true}}
 need(job.value.status==='completed','Complete pending native batches before deletion review',409)
 const source=(await env.DB.prepare("SELECT id,revision,data FROM g_floatRecords WHERE json_extract(data,'$.namespace')=? ORDER BY id").bind(p.namespace).all<{id:string;revision:string;data:string}>()).results.map(r=>({...r,value:JSON.parse(r.data)}))
 const clean=(v:Value)=>{const copy={...v};delete copy.sourceDeleted;return copy}
 for(const [kind,records]of Object.entries(p.records).filter(([k])=>k!=='deletions')) {
  const original=source.filter(r=>r.value.sourceKind===kind)
  need(original.length===records.length&&records.every(v=>original.some(r=>r.value.sourceId===v.id&&canonicalJson(clean(r.value.data))===canonicalJson(clean(v)))),'Source comparison changed beyond deletions; review a separate native migration',409)
 }
 const coverage=input.package.manifest.deletionCoverage,initial=Math.max(0,...source.filter(r=>r.value.sourceKind==='deletions').map(r=>r.value.data.sequence)),checkpoint=job.value.deletionSequence??initial
 need(coverage.toSequence>checkpoint&&coverage.fromSequence<=checkpoint+1,'Deletion stream must continue the captured sequence; missed coverage needs a newer full original comparison',409)
 const effects:Value[]=[]
 const known=[...source.filter(r=>r.value.sourceKind==='deletions').map(r=>r.value.data),...receipts.flatMap((r:Value)=>floatPackage(r.originalPackage,a.currency).records.deletions)]
 for(const event of p.records.deletions.filter(e=>e.sequence<=checkpoint))need(known.some((prior:Value)=>canonicalJson(prior)===canonicalJson(event)),'Previously captured deletion events cannot change',409)
 for(const event of p.records.deletions.filter(e=>e.sequence>checkpoint)) {
  const original=source.find(r=>r.value.sourceKind===event.entity&&r.value.sourceId===event.recordId)
  need(original,'Deletion must name retained adopted source evidence',409)
  for(const effect of job.value.effects.filter((e:Value)=>e.sourceRecordId===original.id&&!e.deleted)) {
   need(['staffing','leave'].includes(effect.kind),'Only linked native schedule and leave effects can be removed',409)
   const current=await get(env,effect.kind,effect.id)
   need(current.revision===effect.revision,'Later native edits or approvals hold deletion continuation',409)
   need(current.value.source?.sourceRecordId===original.id&&current.value.source?.namespace===p.namespace,'Deletion target is not linked to this original',409)
   if(effect.kind==='staffing')need(current.value.commitment==='tentative','Committed native staffing holds source deletion',409)
   if(!effects.some(e=>e.id===effect.id))effects.push({...effect,eventId:event.id,review:{from:current.value.from,to:current.value.to,dailySeconds:current.value.dailySeconds,personId:current.value.personId,externalId:current.value.source.externalId}})
  }
 }
 const fingerprint=sha256(canonicalJson({job,source,digest,effects}))
 await fence(env,a)
 return {id:job.id,revision:job.revision,digest,fingerprint,effects,package:input.package,canApply:true,sequence:coverage.toSequence,replay:false}
}
export async function floatDeletionCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value) {
 if(!['floatAdopt:deletion-start','floatAdopt:deletion-advance'].includes(action))return null
 owner(a);const reason=text(input.reason,'Deletion continuation review reason')
 if(action==='floatAdopt:deletion-start') {
  const p=await floatDeletionPreview(env,a,input)
  need(input.fingerprint===p.fingerprint,'Deletion review changed; preview again',409)
  need(input.confirm==='delete-linked-untouched-float','Confirm deletion of only these linked untouched native effects')
  const job=await get(env,'floatAdoptions',p.id)
  need(job.revision===p.revision,'Native adoption changed; review again',409)
  if(p.replay)return job
  tx.guard("NOT EXISTS(SELECT 1 FROM ik_jobs WHERE destination='gauge-float' AND namespace=? AND state NOT IN ('completed','undone','rolled_back'))",job.value.namespace)
  for(const effect of p.effects){const current=await get(env,effect.kind,effect.id);need(current.revision===effect.revision,'Native effect changed; review deletion again',409);tx.observe(effect.kind,current)}
  return tx.record('floatAdoptions',{...job.value,status:'continuing',deletionPending:{digest:p.digest,fingerprint:p.fingerprint,effects:p.effects,cursor:0,sequence:p.sequence,originalPackage:p.package,reason,by:a.session.operator.id}},job,undefined,action)
 }
 const job=await get(env,'floatAdoptions',text(input.id,'Float adoption'))
 need(job.revision===input.revision&&job.value.status==='continuing','Deletion continuation changed or is not pending',409)
 const pending=job.value.deletionPending,effects=structuredClone(job.value.effects)
 // Check every remaining native revision before removing anything in this batch.
 for(const effect of pending.effects.slice(pending.cursor)) {
  const current=await get(env,effect.kind,effect.id)
  need(current.revision===effect.revision,'Later native edits or approvals hold deletion continuation',409)
  tx.observe(effect.kind,current)
 }
 let cursor=pending.cursor
 for(let count=0;cursor<pending.effects.length&&count<5;cursor++,count++) {
  const effect=pending.effects[cursor],current=await get(env,effect.kind,effect.id)
  need(current.revision===effect.revision,'Native effect changed before deletion',409)
  tx.sql('INSERT INTO g_history(kind,record_id,revision,data,actor,action,at) VALUES(?,?,?,?,?,?,?)',effect.kind,effect.id,current.revision,JSON.stringify(current.value),a.session.operator.id,action,Date.now())
  for(const statement of targets.remove('gauge',effect.kind,effect.id))tx.sql(statement.sql,...statement.params??[])
  // Originals, revision history and the deletion receipt remain in the archive.
  tx.audit(action,effect.kind,effect.id,{adoptionId:job.id,eventId:effect.eventId,sourceRecordId:effect.sourceRecordId,previousRevision:effect.revision,reason})
  effects.find((e:Value)=>e.id===effect.id).deleted=true
 }
 const completed=cursor===pending.effects.length
 return tx.record('floatAdoptions',{...job.value,effects,status:completed?'completed':'continuing',deletionPending:completed?null:{...pending,cursor},...(completed?{deletionSequence:pending.sequence,deletionReceipts:[...(job.value.deletionReceipts??[]),{...pending,cursor,completedBy:a.session.operator.id,completedAt:Date.now(),completionReason:reason}]}:{})},job,undefined,action)
}
