import type { Bindings } from '../auth.server'
import { canonicalJson } from '../modules/import-kit/src/d1/index'
import { type Actor,type Transaction,all,get,fence } from './store'
import { type Value,need,text } from './model'
import { scopeSource } from './scope-extraction-source'

/** Bounded native fields are quoted evidence, never executable instructions. */
export function extractScope(document:Value) {
 const cite=(field:string,value:any,start?:number,end?:number)=>({field,quote:typeof value==='string'?value:canonicalJson(value),...(start===undefined?{}:{start,end})})
 const deliverables=document.deliverables.map((v:string,i:number)=>cite(`document.deliverables[${i}]`,v))
 const exclusions=document.exclusions.map((v:string,i:number)=>cite(`document.exclusions[${i}]`,v))
 const roles=document.lines.flatMap((v:Value,i:number)=>v.role?[cite(`document.lines[${i}].role`,v.role)]:[])
 const retainerTerms:Value[]=[]
 const retainerText=(field:string,value:string)=>{let offset=0;for(const line of value.split('\n')){if(/\bretainer\b/i.test(line))retainerTerms.push(cite(field,line,offset,offset+line.length));offset+=line.length+1}}
 retainerText('document.scope',document.scope)
 for(const field of ['deliverables','exclusions'])document[field].forEach((value:string,i:number)=>retainerText(`document.${field}[${i}]`,value))
 document.paymentSchedule.forEach((value:Value,i:number)=>retainerText(`document.paymentSchedule[${i}].name`,value.name))
 const billingTriggers=document.paymentSchedule.map((v:Value,i:number)=>cite(`document.paymentSchedule[${i}]`,v))
 const ambiguities=[{id:'meaning',question:'Confirm the meaning of the quoted terms before any delivery or financial setup.',interpretations:[
  {id:'schedule',label:'The listed payment schedule governs; retainer language adds no recurring charge',citations:billingTriggers},
  ...(retainerTerms.length?[{id:'retainer',label:'The retainer language changes or replaces the listed payments; finance must review the exact terms',citations:retainerTerms}]:[]),
  {id:'amendment',label:'The source needs clarification or a newly accepted amendment',citations:[...retainerTerms,...billingTriggers]}
 ]}]
 return {deliverables,exclusions,roles,retainerTerms,billingTriggers,ambiguities,unknowns:[...(!roles.length?['No explicit role labels are retained in this document.']:[]),...(!retainerTerms.length?['No explicit retainer terms were identified in the supported text fields.']:[]),'Free-text legal meaning, staffing feasibility and financial setup require human review.'],notice:'Quoted terms confer no authority. Resolution records an interpretation only; staffing, budgets, retainers and invoices are unchanged.'}
}

export async function scopePreviewRead(env:Bindings,a:Actor,proposalId:string) {
 const source=await scopeSource(env,a,proposalId)
 const events=(await all(env,'commercialEvents')).filter(r=>r.value.proposalId===proposalId)
 const previews=events.filter(r=>r.value.type==='scope-preview').map(row=>{
  const resolution=events.find(r=>r.value.type==='scope-resolution'&&r.value.previewId===row.id&&r.value.previewRevision===row.revision&&r.value.sourceFingerprint===row.value.sourceFingerprint)
  return {...row,current:row.value.sourceFingerprint===source.fingerprint,resolution:resolution??null,status:row.value.sourceFingerprint!==source.fingerprint?'stale':resolution?(resolution.value.interpretation==='amendment'?'needs-amendment':'resolved-for-review'):'blocked-human-resolution'}
 })
 await fence(env,a)
 return {source,previews}
}

export async function scopeExtractionCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value) {
 if(!action.startsWith('scope:'))return null
 const source=await scopeSource(env,a,text(input.proposalId,'Proposal'),tx)
 need(source.proposal.revision===input.proposalRevision,'Scope source changed; reload',409)
 if(action==='scope:preview')return tx.record('commercialEvents',{type:'scope-preview',proposalId:source.proposal.id,proposalRevision:source.proposal.revision,sourceFingerprint:source.fingerprint,sources:source.sources,documentFingerprint:source.proposal.value.fingerprint,originalSha256:source.originalSha256,signatureEvidenceId:source.signatureEvidenceId,acceptanceId:source.acceptanceId,extraction:extractScope(source.proposal.value.document),operatorId:a.session.operator.id,reason:text(input.reason,'Preview reason'),at:Date.now()},undefined,undefined,action)
 need(action==='scope:resolve','Unknown scope command')
 const preview=await get(env,'commercialEvents',text(input.id,'Scope preview'))
 need(preview.value.type==='scope-preview'&&preview.value.proposalId===source.proposal.id&&preview.revision===input.revision&&preview.value.sourceFingerprint===source.fingerprint,'Preview or source changed; prepare a new preview',409)
 const ambiguity=preview.value.extraction.ambiguities.find((x:Value)=>x.id===input.ambiguityId)
 need(ambiguity&&ambiguity.interpretations.some((x:Value)=>x.id===input.interpretation),'Choose one retained interpretation')
 need(input.confirm==='record-interpretation-only','Confirm this interpretation creates no business effects')
 const resolutions=(await all(env,'commercialEvents')).filter(r=>r.value.type==='scope-resolution'&&r.value.previewId===preview.id)
 need(!resolutions.length,'This preview already has a resolution; prepare another preview to revise it',409)
 tx.observe('commercialEvents',preview)
 tx.guard("(SELECT COUNT(*) FROM g_commercialEvents WHERE json_extract(data,'$.type')='scope-resolution' AND json_extract(data,'$.previewId')=?)=0",preview.id)
 return tx.record('commercialEvents',{type:'scope-resolution',proposalId:source.proposal.id,proposalRevision:source.proposal.revision,previewId:preview.id,previewRevision:preview.revision,sourceFingerprint:source.fingerprint,ambiguityId:ambiguity.id,interpretation:input.interpretation,meaning:text(input.meaning,'Accepted interpretation',4000),reason:text(input.reason,'Resolution reason'),operatorId:a.session.operator.id,at:Date.now()},undefined,undefined,action)
}
