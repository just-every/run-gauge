import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Value, type Row, need, text } from './model'
import { observeProviderJobAuthority, observeProviderJobSource } from './provider-jobs'
import { dispatchCredential, recordProviderUse } from './provider-custody'
import { taskCommand } from './tasks'

export interface VerifiedFollowup { tx:Transaction; job:Row; connection:Row; receipt:Value; digest:string; existing?:Row; source:Row|null }

/** Native owner intake only. Remote text is data and can request one unassigned,
 * nonbillable task; it never becomes a command or an unattended write. */
export async function verifyProviderFollowup(env:Bindings,a:Actor,input:Value):Promise<VerifiedFollowup>{
 need(a.role==='owner'&&a.session.kind==='native'&&!a.scheduled&&!a.clientProposal,'Only the native owner reviews workflow follow-ups',403);await fence(env,a)
 need(input.confirm==='apply-exact-followup','Confirm the exact workflow request before applying it')
 text(input.reason,'Follow-up review reason')
 let raw:Value
 try{raw=typeof input.receipt==='string'?JSON.parse(input.receipt):input.receipt}catch{need(false,'Use the workflow receipt JSON')}
 need(raw&&typeof raw==='object'&&!Array.isArray(raw),'Use a workflow receipt object')
 const fields=['schema','eventId','sourceRevision','remoteReference','taskName']
 need(Object.keys(raw).every(k=>fields.includes(k))&&fields.every(k=>typeof raw[k]==='string'),'Use only the declared workflow receipt fields')
 const receipt={schema:text(raw.schema,'Receipt schema',40),eventId:text(raw.eventId,'Event id',200),sourceRevision:text(raw.sourceRevision,'Source revision',200),remoteReference:text(raw.remoteReference,'Workflow reference',200),taskName:text(raw.taskName,'Follow-up task name',200)}
 need(canonicalJson(raw)===canonicalJson(receipt),'Workflow receipt fields must be exact, trimmed strings')
 need(receipt.schema==='gauge-followup-v1','Unsupported workflow receipt schema')
 const job=await get(env,'providerJobs',text(input.id,'Provider job')),tx=new Transaction(env,a);tx.action='providerJob:apply-followup';tx.key=text(input.key,'Unique request key',200)
 await observeProviderJobAuthority(env,a,job,tx);tx.observe('providerJobs',job)
 need(job.value.operation==='trigger:submit'&&job.value.status==='submitted','Only an admitted automation event can carry a follow-up',409)
 need(receipt.eventId===job.value.eventId&&receipt.sourceRevision===job.value.source.revision,'Workflow request belongs to another event or source revision',409)
 need(receipt.remoteReference===(job.value.providerRunId??job.value.eventId),'Workflow reference does not match the admitted event',409)
 const digest=sha256(canonicalJson(receipt)),existing=(await all(env,'providerFollowups')).find(r=>r.value.jobId===job.id)
 if(existing)need(existing.value.receiptDigest===digest,'This event already applied a different workflow request',409)
 else need(job.revision===input.revision,'Provider job changed; review its latest state',409)
 const source=existing?null:await observeProviderJobSource(env,tx,job.value.source)
 const original=await get(env,'providerConnections',job.value.connectionId);tx.observe('providerConnections',original);need(!original.value.revokedAt,'The source connection is revoked; no follow-up can be applied',409)
 const connection=await get(env,'providerConnections',text(input.connectionId,'Workflow receipt connection'));tx.observe('providerConnections',connection)
 need(connection.value.provider==='receipt','Choose a workflow receipt verification key')
 const signature=text(input.signature,'Workflow receipt signature',64);need(/^[a-fA-F0-9]{64}$/.test(signature),'Use the receipt HMAC-SHA-256 signature')
 const secret=await dispatchCredential(env,connection.id,connection.value.version,job.id,'followup:verify')
 need(!canonicalJson({receipt,reason:input.reason,customFields:input.customFields??null}).includes(secret),'A workflow request must not contain its verification credential')
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 const bytes=Uint8Array.from(signature.match(/../g)!,v=>parseInt(v,16)),valid=await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode('gauge-followup-v1\n'+canonicalJson(receipt)))
 if(!valid){await recordProviderUse(tx,{connectionId:connection.id,credentialVersion:connection.value.version,jobId:job.id,operation:'followup:verify',outcome:'rejected'});await tx.commit();need(false,'Workflow receipt signature is invalid',403)}
 await dispatchCredential(env,connection.id,connection.value.version,job.id,'followup:verify')
 return {tx,job,connection,receipt,digest,existing,source}
}
export async function applyProviderFollowup(env:Bindings,a:Actor,tx:Transaction,input:Value,proof:VerifiedFollowup):Promise<Row>{
 need(proof.tx===tx&&tx.actor===a&&tx.env===env,'Workflow proof belongs to another transaction',403)
 if(proof.existing)return proof.existing
 const {job,source,receipt,connection}=proof
 need(source,'Workflow source is unavailable',409)
 const engagementId=job.value.source.kind==='engagements'?source.id:source.value.engagementId
 need(typeof engagementId==='string','This source has no project for a permitted follow-up')
 tx.guard("NOT EXISTS(SELECT 1 FROM g_providerFollowups WHERE json_extract(data,'$.jobId')=?)",job.id)
 tx.customWrite={scope:'tasks',values:input.customFields}
 const task=await taskCommand(env,a,tx,'save:tasks',{engagementId,name:receipt.taskName,remainingSeconds:0,estimateSeconds:0,billable:false,status:'todo',phaseKey:input.phaseKey})
 need(task,'Could not prepare the native follow-up task')
 const row=await tx.record('providerFollowups',{jobId:job.id,eventId:job.value.eventId,source:job.value.source,connectionId:connection.id,credentialVersion:connection.value.version,receiptDigest:proof.digest,remoteReference:receipt.remoteReference,taskName:receipt.taskName,engagementId,status:'applied',effect:{kind:'tasks',id:task.id,revision:task.revision},reviewedBy:a.session.operator.id,reason:text(input.reason,'Follow-up review reason'),at:Date.now(),meaning:'Workflow-authenticated request; native owner applied one nonbillable task. This is not a claim that the whole external workflow completed.'},undefined,undefined,'providerJob:apply-followup')
 await recordProviderUse(tx,{connectionId:connection.id,credentialVersion:connection.value.version,jobId:job.id,operation:'followup:verify',outcome:'accepted'})
 return row
}
