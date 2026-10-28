import type { Bindings } from '../auth.server'
import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { Buffer } from 'node:buffer'
import { type Actor,type Transaction,all,get,fence,finance } from './store'
import { type Kind,need } from './model'

/** Accepted historical terms remain readable after offer expiry. Source revisions
 * and retained verified artifacts, rather than a live provider credential, bind review. */
export async function scopeSource(env:Bindings,a:Actor,id:string,tx?:Transaction) {
 need(finance(a)&&a.session.kind==='native'&&!a.scheduled&&!a.appKey&&!a.clientProposal,'Scope documents require a native owner or finance session',403)
 await fence(env,a)
 const proposal=await get(env,'commercialProposals',id),v=proposal.value,d=v.document
 need(d?.schema==='gauge-commercial-proposal-v1'&&v.nativeOriginal?.format==='gauge-proposal-pdf-v1'&&v.nativeOriginal.mediaType==='application/pdf','Unsupported scope format; no signed-document claim is available',409)
 need(sha256(canonicalJson(d))===v.fingerprint&&sha256(Buffer.from(v.nativeOriginal.base64,'base64'))===v.nativeOriginal.sha256,'Retained document changed; prepare a new preview',409)
 const estimates=(await all(env,'estimates')).filter(r=>r.value.rootId===v.estimateRootId),versions=(await all(env,'commercialProposals')).filter(r=>r.value.rootId===v.rootId)
 const estimate=estimates.at(-1);need(estimate,'Scope estimate is unavailable',409)
 need(v.status==='released'&&estimate.id===v.estimateId&&estimate.revision===v.estimateRevision&&versions.at(-1)?.id===proposal.id,'Scope source superseded or revoked; prepare from the current accepted version',409)
 const events=(await all(env,'commercialEvents')).filter(r=>r.value.proposalId===id),bindings=events.filter(r=>r.value.type==='signature-binding'),binding=bindings.at(-1)
 const accepted=events.find(r=>r.value.type==='accepted'&&r.value.fingerprint===v.fingerprint&&r.value.proposalRevision===proposal.revision)
 const evidence=events.find(r=>r.id===accepted?.value.signatureEvidenceId&&r.value.type==='signature-evidence'&&r.value.status==='verified'&&r.value.bindingId===binding?.id&&r.value.fingerprint===v.fingerprint&&r.value.proposalRevision===proposal.revision&&r.value.originalSha256===v.nativeOriginal.sha256)
 need(accepted&&evidence&&binding,'Approved signed scope requires exact client acceptance and existing verified signature evidence',409)
 for(const kind of ['signed','certificate']){const artifact=evidence.value.artifacts?.[kind];need(artifact?.mediaType==='application/pdf'&&sha256(Buffer.from(artifact.base64,'base64'))===artifact.sha256,'Retained signature artifact is unavailable or changed',409)}
 const sources=[{kind:'commercialProposals',...proposal},{kind:'estimates',...estimate},{kind:'commercialEvents',...accepted},{kind:'commercialEvents',...evidence},{kind:'commercialEvents',...binding}].map(r=>({kind:r.kind as Kind,id:r.id,revision:r.revision}))
 if(tx){
  for(const ref of sources)tx.observe(ref.kind,await get(env,ref.kind,ref.id))
  tx.guard("(SELECT COUNT(*) FROM g_estimates WHERE json_extract(data,'$.rootId')=?)=?",v.estimateRootId,estimates.length)
  tx.guard("(SELECT COUNT(*) FROM g_commercialProposals WHERE json_extract(data,'$.rootId')=?)=?",v.rootId,versions.length)
  tx.guard("(SELECT COUNT(*) FROM g_commercialEvents WHERE json_extract(data,'$.proposalId')=? AND json_extract(data,'$.type')='signature-binding')=?",id,bindings.length)
 }
 await fence(env,a)
 return {proposal,sources,fingerprint:sha256(canonicalJson({sources,documentFingerprint:v.fingerprint,originalSha256:v.nativeOriginal.sha256})),originalSha256:v.nativeOriginal.sha256,signatureEvidenceId:evidence.id,acceptanceId:accepted.id}
}
