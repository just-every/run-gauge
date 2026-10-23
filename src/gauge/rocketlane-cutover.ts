import type { Bindings } from '../auth.server'
import { type Actor, fence, Transaction } from './store'
import { type Value, need, text, uuid } from './model'
import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
/** Conservative default: owner can accept only an exact historical comparison.
 * This receipt performs no provider action or native ownership transfer. */
export async function rocketlaneCutover(env:Bindings,a:Actor,action:string,input:Value){
 need(a.role==='owner','Only the owner reviews source cutover comparisons',403);await fence(env,a)
 if(action==='cutover-withdraw'){
  const id=text(input.id,'Comparison receipt'),r=await env.DB.prepare('SELECT * FROM g_rocketlaneCutovers WHERE id=?').bind(id).first<any>();need(r,'Comparison receipt unavailable',404);const value=JSON.parse(r.data);need(value.status==='accepted','Comparison already withdrawn',409);const reason=text(input.reason,'Withdrawal reason',1000),tx=new Transaction(env,a);tx.key=text(input.key,'Unique request key');tx.guard('EXISTS(SELECT 1 FROM g_rocketlaneCutovers WHERE id=? AND revision=?)',id,r.revision);tx.sql('UPDATE g_rocketlaneCutovers SET revision=?,data=? WHERE id=?',uuid(),canonicalJson({...value,status:'withdrawn',withdrawnAt:Date.now(),withdrawnBy:a.session.operator.id,withdrawalReason:reason}),id);tx.audit('import:rocketlane:cutover-withdraw','rocketlaneCutovers',id,{namespace:value.namespace,reason});await tx.commit();return {id,status:'withdrawn'}
 }
 const jobId=text(input.jobId,'Completed source import job'),job=await env.DB.prepare("SELECT id,namespace,state,fingerprint,principal_id FROM ik_jobs WHERE id=? AND destination='gauge-rocketlane' AND principal_id=?").bind(jobId,a.session.operator.id).first<any>();need(job&&job.state==='completed','Complete and reconcile every source/finance batch before cutover review',409)
 const rows=(await env.DB.prepare("SELECT id,revision,data FROM g_rocketlaneRecords WHERE json_extract(data,'$.namespace')=? ORDER BY id").bind(job.namespace).all<any>()).results;need(rows.length,'Source comparison is empty',409)
 const fingerprint=sha256(canonicalJson({job,rows,currency:a.currency})),meaning='Owner accepted the exact source comparison only. No automatic provider shutdown, destructive deletion, native financial ownership transfer or payment authority. Operational cutover remains held pending policy approval.'
 if(action==='cutover-preview'){await fence(env,a);return {provider:'rocketlane',jobId,namespace:job.namespace,fingerprint,records:rows.length,meaning}}
 need(action==='cutover-approve','Unknown comparison action');need(input.confirm==='accept-source-comparison-only','Explicitly confirm source comparison only');need(input.fingerprint===fingerprint,'Source comparison changed; review a fresh fingerprint',409)
 const reason=text(input.reason,'Comparison review reason',1000),key=text(input.key,'Unique request key'),prior=await env.DB.prepare('SELECT id,data FROM g_rocketlaneCutovers WHERE request_key=?').bind(key).first<any>();if(prior){const v=JSON.parse(prior.data);need(v.fingerprint===fingerprint&&v.actor===a.session.operator.id&&v.reason===reason,'Request key belongs to another comparison',409);await fence(env,a);return {id:prior.id,...v}}
 const tx=new Transaction(env,a),id=uuid(),value={status:'accepted',namespace:job.namespace,jobId,fingerprint,actor:a.session.operator.id,at:Date.now(),reason,meaning};tx.key=key;tx.guard("EXISTS(SELECT 1 FROM ik_jobs WHERE id=? AND state='completed' AND fingerprint=?)",job.id,job.fingerprint);tx.guard("(SELECT count(*) FROM g_rocketlaneRecords WHERE json_extract(data,'$.namespace')=?)=?",job.namespace,rows.length)
 for(const r of rows)tx.guard('EXISTS(SELECT 1 FROM g_rocketlaneRecords WHERE id=? AND revision=? AND data=?)',r.id,r.revision,r.data)
 tx.sql('INSERT INTO g_rocketlaneCutovers(id,revision,data,request_key) VALUES(?,?,?,?)',id,uuid(),canonicalJson(value),key);tx.audit('import:rocketlane:cutover-approve','rocketlaneCutovers',id,value);await tx.commit();return {id,...value}
}
