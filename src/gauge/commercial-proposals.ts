import { queueProviderJob } from './provider-jobs'
import type { Bindings } from '../auth.server'
import { type Actor, type Transaction, all, get, fence } from './store'
import { type Row, type Value, need, text, uuid, workDate } from './model'
import { commercialProposalDocument, type CommercialProposalInput } from './commercial-proposal-document'

export async function latestCommercial(env:Bindings,tx:Transaction,row:Row){
 const estimates=(await all(env,'estimates')).filter(r=>r.value.rootId===row.value.estimateRootId)
 const versions=(await all(env,'commercialProposals')).filter(r=>r.value.rootId===row.value.rootId)
 need(estimates.at(-1)?.id===row.value.estimateId&&versions.at(-1)?.id===row.id,'A newer commercial version requires fresh client review',409)
 tx.guard("(SELECT COUNT(*) FROM g_estimates WHERE json_extract(data,'$.rootId')=?)=?",row.value.estimateRootId,estimates.length)
 tx.guard("(SELECT COUNT(*) FROM g_commercialProposals WHERE json_extract(data,'$.rootId')=?)=?",row.value.rootId,versions.length)
 need(row.value.document.expiry>=workDate(Date.now(),tx.actor.timezone),'Proposal expired; prepare a new version',409)
 tx.observe('commercialProposals',row)
}
export async function commercialCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(!action.startsWith('commercial:'))return null
 if(action==='commercial:respond'){
  need(a.role==='client'&&a.clientProposal,'Use the invited client review door',403)
  const row=await get(env,'commercialProposals',a.clientProposal.id)
  need(row.revision===input.revision&&input.fingerprint===row.value.fingerprint,'Review the exact current proposal before responding',409)
  await latestCommercial(env,tx,row)
  need(['question','accepted','rejected'].includes(input.outcome),'Choose question, acceptance or rejection')
  need(input.outcome!=='accepted'||!row.value.document.signatureRequired,'This proposal requires verified provider signature evidence; client-link acceptance is unavailable',409)
  const events=(await all(env,'commercialEvents')).filter(r=>r.value.proposalId===row.id)
  need(!events.some(r=>['accepted','rejected'].includes(r.value.type)),'This proposal already has a client decision',409)
  tx.guard("(SELECT COUNT(*) FROM g_commercialEvents WHERE json_extract(data,'$.proposalId')=? AND json_extract(data,'$.type') IN ('accepted','rejected'))=0",row.id)
  if(input.outcome==='accepted')need(input.confirm==='accept-exact-proposal','Confirm acceptance of this exact proposal')
  return tx.record('commercialEvents',{proposalId:row.id,proposalRevision:row.revision,estimateId:row.value.estimateId,opportunityId:row.value.opportunityId,type:input.outcome,fingerprint:row.value.fingerprint,reason:text(input.reason,'Client response'),operatorId:a.session.operator.id,contact:a.session.operator.email,name:a.session.operator.displayName,at:Date.now()},undefined,undefined,action)
 }
 need(a.role==='owner'&&a.session.kind==='native','Only the owner in a native browser session prepares, releases or revokes client proposals',403)
 if(action==='commercial:prepare'){
  const estimate=await get(env,'estimates',text(input.estimateId,'Estimate'))
  need(estimate.revision===input.estimateRevision,'Estimate changed; reload before preparing',409);tx.observe('estimates',estimate)
  const opportunity=await get(env,'opportunities',estimate.value.opportunityId);tx.observe('opportunities',opportunity)
  need(!opportunity.value.engagementId,'Converted work changes through change orders',409)
  const estimates=(await all(env,'estimates')).filter(r=>r.value.rootId===estimate.value.rootId)
  need(estimates.at(-1)?.id===estimate.id,'Prepare from the latest estimate version',409)
  tx.guard("(SELECT COUNT(*) FROM g_estimates WHERE json_extract(data,'$.rootId')=?)=?",estimate.value.rootId,estimates.length)
  const versions=(await all(env,'commercialProposals')).filter(r=>r.value.estimateRootId===estimate.value.rootId),previous=versions.at(-1)
  tx.guard("(SELECT COUNT(*) FROM g_commercialProposals WHERE json_extract(data,'$.estimateRootId')=?)=?",estimate.value.rootId,versions.length)
  if(previous)need(input.previousId===previous.id,'Revise the latest proposal version',409)
  const {document,fingerprint}=await commercialProposalDocument(estimate,input as unknown as CommercialProposalInput),id=uuid()
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(document.recipient.contact),'Use the invited recipient email address')
  need(document.expiry>=workDate(Date.now(),a.timezone),'Expiry must be today or later')
  return tx.record('commercialProposals',{document,fingerprint,estimateId:estimate.id,estimateRevision:estimate.revision,estimateRootId:estimate.value.rootId,opportunityId:estimate.value.opportunityId,clientId:estimate.value.clientId,rootId:previous?.value.rootId??id,previousId:previous?.id??null,number:(previous?.value.number??0)+1,status:'prepared',preparedBy:a.session.operator.id,preparedAt:Date.now(),reason:text(input.reason,'Preparation reason')},undefined,id,action)
 }
 if(action==='commercial:claim'){
  const row=await get(env,'commercialProposals',text(input.id,'Proposal'));need(row.revision===input.revision,'Proposal changed; reload',409)
  need(row.value.status==='prepared','Only a prepared proposal can be sent; inspect its existing delivery outcome',409)
  await latestCommercial(env,tx,row)
  const recipient=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=lower(?) AND status='active' AND role='member'").bind(row.value.document.recipient.contact).first<{id:string}>()
  need(recipient,'Invite the recipient and have them confirm their email before releasing this proposal',409)
  need(!(await env.DB.prepare('SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1').bind(recipient.id).first()),'Client proposal recipient must not hold an internal Gauge staff grant',409)
  tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=lower(?) AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,row.value.document.recipient.contact,recipient.id)
  const released=await tx.record('commercialProposals',{...row.value,status:'released',releasedBy:a.session.operator.id,releasedAt:Date.now(),releaseReason:text(input.reason,'Sending reason')},row,undefined,'commercial:release')
  tx.sql('INSERT INTO g_commercial_proposal_authority(proposal_id,revision,recipient_id,owner_id) VALUES(?,?,?,?)',released.id,released.revision,recipient.id,a.session.operator.id)
  const job=await queueProviderJob(tx,{connectionId:text(input.connectionId,'Resend connection'),operation:'email:send',source:{kind:'commercialProposals',id:released.id,revision:released.revision}},released)
  return tx.record('commercialEvents',{jobId:job.id,proposalId:released.id,proposalRevision:released.revision,estimateId:row.value.estimateId,opportunityId:row.value.opportunityId,type:'delivery',fingerprint:row.value.fingerprint,status:'uncertain',meaning:'Send claimed; submission outcome not yet confirmed. Never automatically retried.',recipientId:recipient.id,contact:row.value.document.recipient.contact,ownerId:a.session.operator.id,at:Date.now()},undefined,undefined,action)
 }
 if(action==='commercial:reconnect'){
  const row=await get(env,'commercialProposals',text(input.id,'Proposal'));need(row.revision===input.revision&&row.value.status==='released','Choose an unchanged released proposal',409);tx.observe('commercialProposals',row)
  need(!(await env.DB.prepare('SELECT 1 FROM g_commercial_proposal_authority WHERE proposal_id=?').bind(row.id).first()),'Recipient access is already authorized',409)
  const recipient=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=lower(?) AND status='active' AND role='member'").bind(row.value.document.recipient.contact).first<{id:string}>();need(recipient,'Recipient must confirm their native email account',409)
  const reason=text(input.reason,'Fresh recipient authorization reason')
  tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=lower(?) AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,row.value.document.recipient.contact,recipient.id)
  tx.sql('INSERT INTO g_commercial_proposal_authority(proposal_id,revision,recipient_id,owner_id) VALUES(?,?,?,?)',row.id,row.revision,recipient.id,a.session.operator.id)
  tx.audit(action,'commercialProposals',row.id,{reason,recipientId:recipient.id,proposalRevision:row.revision});return row
 }
 if(action==='commercial:revoke'){
  const row=await get(env,'commercialProposals',text(input.id,'Proposal'));need(row.revision===input.revision,'Proposal changed; reload',409)
  const reason=text(input.reason,'Revocation reason');tx.sql('DELETE FROM g_commercial_proposal_authority WHERE proposal_id=?',row.id)
  return tx.record('commercialProposals',{...row.value,status:'revoked',revokedBy:a.session.operator.id,revokedAt:Date.now(),revocationReason:reason},row,undefined,action)
 }
 return null
}
/** A client-link decision is the primary carrier; offline attestations remain distinct. */
export async function acceptedCommercial(env:Bindings,tx:Transaction,estimate:Row){
 const proposals=(await all(env,'commercialProposals')).filter(p=>p.value.estimateRootId===estimate.value.rootId)
 const latest=proposals.at(-1);if(!latest||latest.value.estimateId!==estimate.id||latest.value.status!=='released')return null
 const decision=(await all(env,'commercialEvents')).find(e=>e.value.proposalId===latest.id&&e.value.type==='accepted'&&e.value.fingerprint===latest.value.fingerprint)
 if(!decision)return null
 tx.observe('commercialProposals',latest);tx.observe('commercialEvents',decision)
 tx.guard("(SELECT COUNT(*) FROM g_commercialProposals WHERE json_extract(data,'$.estimateRootId')=?)=?",estimate.value.rootId,proposals.length)
 return {proposal:latest,decision,notice:`Accepted through client link by ${decision.value.name} (${decision.value.contact}); proposal version ${latest.value.number}`}
}
