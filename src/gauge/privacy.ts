import type { Bindings } from '../auth.server'
import { portabilityPolicy } from '../../scripts/installer/portability-policy.mjs'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Value, need, text, integer, date, workDate, uuid } from './model'

// Conservative manual-only default: this is a bounded native erasure, not a
// promise that legally retained work/audit or provider/source originals vanished.
const owner=(a:Actor)=>need(a.role==='owner'&&a.session.kind==='native'&&!a.clientProposal&&!a.scheduled,'Only the native owner manages retention and erasure',403)
const due=(day:string,days:number,today:string)=>Date.parse(day)+days*86400000<=Date.parse(today)
export async function privacyPreview(env:Bindings,a:Actor,input:Value){
 owner(a);await fence(env,a)
 const person=await get(env,'people',text(input.personId,'Person')),policy=(await all(env,'retentionPolicies'))[0]
 need(policy,'Save an explicit retention policy first',409)
 const exit=(await all(env,'privacyExits')).find(r=>r.value.personId===person.id)
 need(exit,'Record the worker exit before previewing erasure',409)
 const today=workDate(Date.now(),a.timezone),files=(await env.DB.prepare('SELECT f.id,f.size,e.data FROM g_files f JOIN g_expenses e ON e.id=f.expense_id WHERE e.person_id=? ORDER BY f.id').bind(person.id).all<any>()).results
 const leave=(await all(env,'leave')).filter(r=>r.value.personId===person.id),favorites=(await all(env,'timeFavorites')).filter(r=>r.value.personId===person.id)
 const financial={time:(await all(env,'time')).filter(r=>r.value.personId===person.id).length,expenses:(await all(env,'expenses')).filter(r=>r.value.personId===person.id).length,rates:(await all(env,'rates')).filter(r=>r.value.personId===person.id).length}
 const blockers:string[]=[]
 if(!due(exit.value.date,policy.value.personalDays,today))blockers.push('Personal-data retention has not elapsed since exit')
 if(files.some(f=>!due(JSON.parse(f.data).date,policy.value.fileDays,today)))blockers.push('A receipt is still inside file retention')
 if(leave.some(r=>!due(r.value.to,policy.value.evidenceDays,today)))blockers.push('Leave evidence is still inside evidence retention')
 if(await env.DB.prepare('SELECT 1 FROM g_grants WHERE person_id=? AND enabled=1').bind(person.id).first())blockers.push('Revoke every Gauge grant for this worker')
 if((await all(env,'engagements')).some(r=>r.value.leadId===person.id))blockers.push('Reassign engagement leadership before erasure')
 if((await all(env,'operationalCases')).some(r=>r.value.ownerId===person.id&&r.value.status!=='closed'))blockers.push('Reassign open operational cases before erasure')
 const transfers=(await env.DB.prepare('SELECT id,kind,phase,completed FROM rer_portability_jobs ORDER BY id').all<any>()).results
 const snapshot={person,policy,exit,files,leave,favorites,financial,today,transfers}
 const fingerprint=sha256(canonicalJson(snapshot))
 await fence(env,a)
 return {personId:person.id,personRevision:person.revision,policyId:policy.id,policyRevision:policy.revision,fingerprint,blockers,remove:{transferJobs:transfers.length,receiptFiles:files.length,receiptBytes:files.reduce((n,f)=>n+f.size,0),favorites:favorites.length,leaveNotes:leave.length,profile:true},retain:{...financial,meaning:'Lawful financial work, amounts, source links and immutable business audit remain on legal hold. Source originals, connected copies and free text outside this bounded scope are not erased.'},snapshot}
}
export async function privacyCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value){
 if(!action.startsWith('privacy:'))return null
 owner(a)
 const reason=text(input.reason,'Retention or erasure reason')
 if(action==='privacy:policy'){
  const current=(await all(env,'retentionPolicies'))[0]
  if(current)need(input.id===current.id&&input.revision===current.revision,'Retention policy changed; reload',409)
  else tx.guard('NOT EXISTS(SELECT 1 FROM g_retentionPolicies)')
  return tx.record('retentionPolicies',{personalDays:integer(input.personalDays,'Personal-data retention days',0,36500),fileDays:integer(input.fileDays,'File retention days',0,36500),evidenceDays:integer(input.evidenceDays,'Evidence retention days',0,36500),reason,setBy:a.session.operator.id,setAt:Date.now(),automatic:false,financialHold:true},current,undefined,action)
 }
 if(action==='privacy:exit'){
  const person=await get(env,'people',text(input.personId,'Person'));tx.observe('people',person)
  const day=date(input.date);need(day<=workDate(Date.now(),a.timezone),'Exit cannot be in the future')
  need(a.personId!==person.id,'An owner cannot exit their own active person')
  const exits=await all(env,'privacyExits'),old=exits.find(r=>r.value.personId===person.id)
  if(old)need(input.id===old.id&&input.revision===old.revision,'Exit record changed; reload',409)
  else tx.guard("NOT EXISTS(SELECT 1 FROM g_privacyExits WHERE json_extract(data,'$.personId')=?)",person.id)
  // Recording an exit never destroys data. Grants are revoked explicitly first.
  return tx.record('privacyExits',{personId:person.id,date:day,reason,by:a.session.operator.id,at:Date.now()},old,undefined,action)
 }
 if(action!=='privacy:erase')return null
 need(input.confirm==='erase-reviewed-native-scope','Confirm the reviewed native erasure scope')
 need(input.lawfulReceiptRemoval==='authorized','Explicitly authorize receipt removal while financial records remain on hold')
 const p=await privacyPreview(env,a,input)
 need(input.fingerprint===p.fingerprint,'Erasure consequences changed; preview again',409)
 need(!p.blockers.length,p.blockers.join('; '),409)
 const {person,policy,exit,files,leave,favorites,transfers}=p.snapshot
 tx.observe('people',person);tx.observe('retentionPolicies',policy);tx.observe('privacyExits',exit)
 tx.guard('(SELECT COUNT(*) FROM rer_portability_jobs)=?',transfers.length)
 for(const job of transfers)tx.guard('EXISTS(SELECT 1 FROM rer_portability_jobs WHERE id=? AND kind=? AND phase=? AND completed=?)',job.id,job.kind,job.phase,job.completed)
 tx.guard('NOT EXISTS(SELECT 1 FROM g_grants WHERE person_id=? AND enabled=1)',person.id)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_engagements WHERE lead_id=?)",person.id)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_operationalCases WHERE json_extract(data,'$.ownerId')=? AND json_extract(data,'$.status')<>'closed')",person.id)
 // Match sets again inside the committing batch, including newly added files.
 tx.guard('(SELECT COUNT(*) FROM g_files f JOIN g_expenses e ON e.id=f.expense_id WHERE e.person_id=?)=?',person.id,files.length)
 tx.guard('(SELECT COUNT(*) FROM g_leave WHERE person_id=?)=?',person.id,leave.length)
 tx.guard("(SELECT COUNT(*) FROM g_timeFavorites WHERE json_extract(data,'$.personId')=?)=?",person.id,favorites.length)
 for(const f of files){tx.guard('EXISTS(SELECT 1 FROM g_expenses e JOIN g_files f ON e.id=f.expense_id WHERE f.id=? AND e.data=?)',f.id,f.data);tx.guard('EXISTS(SELECT 1 FROM g_files WHERE id=? AND size=?)',f.id,f.size);tx.sql('DELETE FROM g_files WHERE id=?',f.id)}
 for(const row of favorites){tx.observe('timeFavorites',row);tx.sql('DELETE FROM g_timeFavorites WHERE id=?',row.id);tx.sql("DELETE FROM g_history WHERE kind='timeFavorites' AND record_id=?",row.id)}
 for(const row of leave){tx.observe('leave',row);tx.sql('UPDATE g_leave SET revision=?,data=? WHERE id=?',uuid(),JSON.stringify({...row.value,note:'Erased private leave',privacyErased:true}),row.id);tx.sql("DELETE FROM g_history WHERE kind='leave' AND record_id=?",row.id)}
 const erasedAt=Date.now(),value={name:'Erased worker',timezone:'UTC',privacyErased:true,erasedAt}
 tx.sql('UPDATE g_people SET revision=?,data=? WHERE id=?',uuid(),JSON.stringify(value),person.id)
 tx.sql("DELETE FROM g_history WHERE kind='people' AND record_id=?",person.id)
 // The irreversible redaction checkpoint invalidates in-progress exports and
 // makes an old archive refuse restoration when the later trusted journal is supplied.
 const portability=await createPortability({db:env.DB,policy:portabilityPolicy})
 tx.statements.push(...await portability.redactionStatements(),...await portability.invalidateTransfersStatements())
 const receipt=await tx.record('privacyErasures',{personId:person.id,policyId:policy.id,policyRevision:policy.revision,exitId:exit.id,fingerprint:p.fingerprint,removed:p.remove,retained:p.retain,reason,by:a.session.operator.id,at:erasedAt,status:'native-scope-complete',meaning:'Bounded native scope complete; financial/audit legal holds and external/source-copy gaps remain. Not a certificate of complete personal-data erasure.'},undefined,undefined,action)
 tx.audit(action,'people',person.id,{privacyErased:true,receiptId:receipt.id})
 return receipt
}
export async function privacyJournal(env:Bindings,a:Actor){
 owner(a);await fence(env,a)
 const exists=await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rer_portability_state'").first()
 if(!exists)return {sourceIdentity:null,epoch:0,journal:[]}
 const s=await env.DB.prepare('SELECT source_identity,epoch FROM rer_portability_state WHERE id=1').first<any>()
 if(!s)return {sourceIdentity:null,epoch:0,journal:[]}
 const rows=(await env.DB.prepare('SELECT tombstone FROM rer_portability_journal WHERE source=? ORDER BY tombstone').bind(s.source_identity).all<any>()).results
 await fence(env,a);return {sourceIdentity:s.source_identity,epoch:s.epoch,journal:rows.map(r=>r.tombstone)}
}
