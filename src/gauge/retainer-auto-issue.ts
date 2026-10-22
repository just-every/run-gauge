import type { Bindings } from '../auth.server'
import { type Row, type Value, type Kind, need, integer } from './model'
import { type Actor, type Transaction, all, get, authority, fence } from './store'
import { observedApprovalPolicy } from './approval-policy'
import { reserveNumber, plusDays } from './invoices'

/** Consent belongs to this schedule revision and the live granting operator, not the runner. */
export async function scheduleAuthority(env:Bindings,tx:Transaction,schedule:Row){
 const a={...tx.actor,session:{operator:{id:schedule.value.configuredBy},id:''},role:'finance',grantVersion:schedule.value.grantVersion,scheduled:{id:schedule.id,revision:schedule.revision}} as Actor
 await fence(env,a)
 const check=authority(a);tx.guard(check.sql,...check.params)
}
export async function autoIssueConsent(env:Bindings,tx:Transaction,input:Value,currency:string){
 const capMinor=integer(input.capMinor,'Per-invoice cap in minor units',1,Number.MAX_SAFE_INTEGER),policy=await observedApprovalPolicy(env,tx)
 need(policy?.value.reviewAboveMinor!=null&&policy.value.currency===currency&&capMinor<=policy.value.reviewAboveMinor,'Set a source-currency cap at or below the owner’s saved review limit')
 return {capMinor,currency,includeOverages:input.includeOverages===true||input.includeOverages==='on'}
}
/** Observe all lock state so a close or policy change racing this batch cannot authorize issue. */
export async function scheduleLocks(env:Bindings,tx:Transaction,ranges:{from:string;to:string}[]){
 const kinds:Kind[]=['timePolicies','periodCloses','periodReopens']
 const data=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<Kind,Row[]>
 for(const k of kinds){tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,data[k].length);for(const row of data[k])tx.observe(k,row)}
 const time=data.timePolicies.find(p=>p.value.lockThrough&&ranges.some(r=>r.from<=p.value.lockThrough))
 const close=data.periodCloses.find(c=>!data.periodReopens.some(r=>r.value.closeId===c.id)&&ranges.some(r=>r.from<=c.value.to&&r.to>=c.value.from))
 return {time,close}
}
export async function autoIssueCheck(env:Bindings,tx:Transaction,schedule:Row,term:Row,totalMinor:number){
 const engagement=await get(env,'engagements',schedule.value.engagementId),client=await get(env,'clients',engagement.value.clientId)
 tx.observe('engagements',engagement);tx.observe('clients',client)
 const policy=await observedApprovalPolicy(env,tx),reasons:string[]=[],v=schedule.value
 if(term.value.number>v.consentTermsNumber)reasons.push('Commercial terms are newer than the automatic issue consent')
 if(v.currency!==term.value.terms.currency||engagement.value.currency!==v.currency)reasons.push('Source currency differs from consent')
 if(totalMinor>v.capMinor)reasons.push('Invoice total exceeds the automatic issue cap')
 if(policy?.value.reviewAboveMinor==null||policy.value.currency!==v.currency||v.capMinor>policy.value.reviewAboveMinor)reasons.push('Automatic issue cap exceeds the current owner review limit')
 if(engagement.value.type==='internal'||client.value.merge)reasons.push('An active client engagement is required')
 if(client.value.paymentTermsDays==null)reasons.push('Saved client payment terms are required')
 if(!v.billTo||!v.remitTo)reasons.push('Saved bill-to and remit-to are required')
 if(client.value.poRequired&&!(client.value.poNumbers??[]).some((po:string)=>po.toLowerCase()===String(v.reference).toLowerCase()))reasons.push('Client requires a matching saved PO')
 if(totalMinor<=0)reasons.push('No positive billable invoice total')
 return {engagement,client,reasons}
}
/** All source records, approval, number, invoice and run receipt share the caller's single D1 batch. */
export async function issueScheduledInvoice(env:Bindings,tx:Transaction,schedule:Row,period:Row,term:Row,packet:Row,sources:Row[],engagement:Row,client:Row,allowanceUsed:number){
 const v=schedule.value,issueDate=packet.value.scheduledIssueDate,paymentTermsDays=integer(client.value.paymentTermsDays,'Client payment terms days',0,365)
 const provenance={scheduleId:schedule.id,scheduleRevision:schedule.revision,scheduleNumber:v.number,consentedBy:v.configuredBy,consentedAt:v.configuredAt,reason:v.reason,capMinor:v.capMinor,includeOverages:v.includeOverages,period:structuredClone(period),termsVersion:term.value.number,termsRevision:term.revision,allowanceUsed,allowanceUnit:term.value.terms.unit}
 const lines=packet.value.lines.map((line:Value)=>{const source=sources.find(r=>r.id===line.sourceId)!;need(source&&source.revision===line.sourceRevision,'Scheduled source revision differs',409);return {...line,sourceDate:line.kind==='retainerPeriods'?source.value.activeEnd:source.value.date,sourceSnapshot:structuredClone(source)}})
 return tx.record('invoices',{packetId:packet.id,packetRevision:packet.revision,engagementId:engagement.id,clientId:client.id,number:await reserveNumber(env,tx,'g_invoice_sequence','INV'),issueDate,dueDate:plusDays(issueDate,paymentTermsDays),billTo:v.billTo,remitTo:v.remitTo,reference:v.reference,currency:packet.value.currency,totalMinor:packet.value.totalMinor,lines,issuedBy:v.configuredBy,issuedAt:Date.now(),paymentTermsDays,termsLabel:`Net ${paymentTermsDays}`,clientSnapshot:structuredClone(client),engagementSnapshot:structuredClone(engagement),packetSnapshot:structuredClone(packet),autoIssue:provenance,taxBasis:'pre-tax',issuance:'native ledger only; no sending or accounting-provider submission'},undefined,undefined,'invoice:auto-issue')
}
