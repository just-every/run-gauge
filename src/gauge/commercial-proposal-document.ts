import { canonicalJson } from '../modules/import-kit/src/d1/index'
import { type Row,type Value,need,text,integer,sum,charge } from './model'
import { currencies } from './agency'

export interface CommercialProposalPayment {
 name:string
 due:string
 amountMinor:number
 currency?:string
}
export interface CommercialProposalInput {
 agencyName:string
 title:string
 recipientName:string
 recipientContact:string
 scope:string
 deliverables:string[]
 exclusions:string[]
 from:string
 to:string
 expiry:string
 signatureRequired:boolean
 paymentSchedule:CommercialProposalPayment[]
}
interface CustomerPhase {
 key:string;name:string;service:string;mode:'fixed'|'hourly';from:string;to:string
 effortSeconds:number;feeMinor:number;expenseMinor:number
}
interface CustomerLine {
 key:string;name:string;phaseKey:string;service:string;kind:'labor'|'subcontractor'|'expense'
 effortSeconds:number;quantity:number;billRateMinor:number|null;baseMinor:number;amountMinor:number
}
export interface CommercialProposalDocument {
 readonly schema:'gauge-commercial-proposal-v1'
 readonly notice:'Proposal for client review'
 readonly agencyName:string
 readonly title:string
 readonly estimate:Readonly<{id:string;revision:string;number:number;name:string}>
 readonly recipient:Readonly<{name:string;contact:string}>
 readonly scope:string
 readonly deliverables:readonly string[]
 readonly exclusions:readonly string[]
 readonly from:string
 readonly to:string
 readonly expiry:string
 readonly signatureRequired:boolean
 readonly currency:string
 readonly effortSeconds:number
 readonly feeMinor:number
 readonly expenseMinor:number
 readonly totalMinor:number
 readonly pricing:Readonly<{baseMinor:number;contingencyBasisPoints:number;contingencyMinor:number;discountBasisPoints:number;discountMinor:number}>
 readonly phases:ReadonlyArray<Readonly<CustomerPhase>>
 readonly lines:ReadonlyArray<Readonly<CustomerLine>>
 readonly paymentSchedule:ReadonlyArray<Readonly<Required<CommercialProposalPayment>>>
}
const amount=(value:unknown,label:string)=>integer(value,label,0,Number.MAX_SAFE_INTEGER)
const basisPoints=(value:number,bps:number)=>Number((BigInt(value)*BigInt(bps)+5000n)/10000n)
function day(value:unknown,label:string){
 const result=text(value,label,10),ms=Date.parse(result+'T00:00:00Z')
 need(/^\d{4}-\d{2}-\d{2}$/.test(result)&&Number.isFinite(ms),'Use a valid YYYY-MM-DD '+label)
 need(new Date(ms).toISOString().slice(0,10)===result,'Use a valid YYYY-MM-DD '+label)
 return result
}
function items(value:unknown,label:string){
 need(Array.isArray(value)&&value.length>0&&value.length<=100,`${label} needs one to 100 entries`)
 return value.map(item=>text(item,label,2000))
}
function freeze<T>(value:T):T{
 if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}
 return value
}
/** Pure customer-only projection. The caller must load and transactionally fence
 * the exact latest native estimate, authority and proposal version itself. */
export async function commercialProposalDocument(estimate:Row,input:CommercialProposalInput):Promise<Readonly<{document:CommercialProposalDocument;fingerprint:string}>>{
 need(estimate&&typeof estimate==='object'&&estimate.value&&input&&typeof input==='object','Provide an exact estimate and commercial proposal fields')
 const v=estimate.value,currency=text(v.currency,'Estimate currency',3)
 need(currencies.some(c=>c===currency),'Use a supported estimate currency; no implicit FX')
 need(typeof input.signatureRequired==='boolean','Choose whether a provider signature is required')
 need(Array.isArray(v.phases)&&v.phases.length>0&&v.phases.length<=30,'Estimate needs one to 30 phases')
 const phases:CustomerPhase[]=v.phases.map((p:Value)=>{
  need(p&&typeof p==='object','Estimate phase is invalid')
  const from=day(p.from,'phase start'),to=day(p.to,'phase end');need(to>=from,'Estimate phase ends before it starts')
  need(p.mode==='fixed'||p.mode==='hourly','Estimate phase needs a fixed or hourly basis')
  return {key:text(p.key,'Phase key',100),name:text(p.name,'Phase name',200),service:text(p.service,'Service',200),mode:p.mode,from,to,effortSeconds:amount(p.hourBudgetSeconds,'Phase effort seconds'),feeMinor:amount(p.feeBudgetMinor,'Phase fee'),expenseMinor:amount(p.expenseBudgetMinor,'Phase expense allowance')}
 })
 need(new Set(phases.map(p=>p.key)).size===phases.length,'Estimate phase keys must be unique')
 const from=day(input.from,'proposal start'),to=day(input.to,'proposal end')
 need(from===phases.map(p=>p.from).sort()[0]&&to===phases.map(p=>p.to).sort().at(-1),'Proposal dates must match the exact estimate dates')
 need(Array.isArray(v.lines)&&v.lines.length>0&&v.lines.length<=100,'Estimate needs one to 100 price lines')
 const lines:CustomerLine[]=v.lines.map((l:Value)=>{
  need(l&&typeof l==='object','Estimate line is invalid')
  const phase=phases.find(p=>p.key===l.phaseKey);need(phase,'Every price line needs a listed phase')
  need(l.kind==='labor'||l.kind==='subcontractor'||l.kind==='expense','Estimate line kind is invalid')
  const effortSeconds=amount(l.effortSeconds,'Line effort seconds'),quantity=integer(l.quantity,'Line quantity',1,100000),baseMinor=amount(l.baseMinor,'Line base price'),billRateMinor=l.kind==='expense'?null:amount(l.billRateMinor,'Customer hourly rate')
  need(l.kind==='expense'?effortSeconds===0&&baseMinor%quantity===0:quantity===1&&effortSeconds>0&&charge(effortSeconds,billRateMinor!)===baseMinor,'Estimate line price and effort do not reconcile')
  return {key:text(l.key,'Line key',100),name:text(l.name,'Line description',200),phaseKey:phase.key,service:phase.service,kind:l.kind,effortSeconds,quantity,billRateMinor,baseMinor,amountMinor:amount(l.amountMinor,'Line customer amount')}
 })
 need(new Set(lines.map(l=>l.key)).size===lines.length,'Estimate line keys must be unique')
 const totalMinor=amount(v.totalMinor,'Estimate total'),feeMinor=amount(v.feeMinor,'Estimate fees'),expenseMinor=amount(v.expenseMinor,'Estimate expenses'),effortSeconds=amount(v.effortSeconds,'Estimate effort seconds'),baseMinor=amount(v.baseMinor,'Estimate base price'),grossMinor=amount(v.grossMinor,'Estimate contingency price'),discountMinor=amount(v.discountMinor,'Estimate discount')
 const contingencyBasisPoints=integer(v.contingencyBasisPoints,'Contingency basis points',0,10000),discountBasisPoints=integer(v.discountBasisPoints,'Discount basis points',0,10000)
 need(sum(lines.map(l=>l.baseMinor))===baseMinor&&grossMinor===sum([baseMinor,basisPoints(baseMinor,contingencyBasisPoints)])&&discountMinor===basisPoints(grossMinor,discountBasisPoints)&&grossMinor-discountMinor===totalMinor,'Estimate customer price adjustments do not reconcile')
 need(sum(lines.map(l=>l.amountMinor))===totalMinor&&sum([feeMinor,expenseMinor])===totalMinor&&sum(lines.map(l=>l.effortSeconds))===effortSeconds,'Estimate customer totals do not reconcile')
 for(const phase of phases){const mine=lines.filter(l=>l.phaseKey===phase.key);need(sum(mine.map(l=>l.effortSeconds))===phase.effortSeconds&&sum(mine.filter(l=>l.kind!=='expense').map(l=>l.amountMinor))===phase.feeMinor&&sum(mine.filter(l=>l.kind==='expense').map(l=>l.amountMinor))===phase.expenseMinor,'Estimate phase totals do not reconcile')}
 need(sum(phases.map(p=>p.feeMinor))===feeMinor&&sum(phases.map(p=>p.expenseMinor))===expenseMinor,'Estimate phase allowances do not reconcile')
 need(Array.isArray(input.paymentSchedule)&&input.paymentSchedule.length>0&&input.paymentSchedule.length<=30,'Provide one to 30 scheduled payments')
 const paymentSchedule=input.paymentSchedule.map(p=>{
  need(p&&typeof p==='object'&&(p.currency===undefined||p.currency===currency),'Every scheduled payment must use the estimate currency')
  return {name:text(p.name,'Payment description',200),due:day(p.due,'payment due date'),amountMinor:integer(p.amountMinor,'Scheduled payment amount',totalMinor?1:0,Number.MAX_SAFE_INTEGER),currency}
 })
 need(sum(paymentSchedule.map(p=>p.amountMinor))===totalMinor,'Scheduled payments must equal the exact estimate total')
 need(paymentSchedule.every((p,i)=>!i||p.due>=paymentSchedule[i-1].due),'List scheduled payments in due-date order')
 const document=freeze<CommercialProposalDocument>({schema:'gauge-commercial-proposal-v1',notice:'Proposal for client review',agencyName:text(input.agencyName,'Agency name',200),title:text(input.title,'Proposal title',200),estimate:{id:text(estimate.id,'Estimate ID',200),revision:text(estimate.revision,'Estimate revision',200),number:integer(v.number,'Estimate version',1),name:text(v.name,'Estimate name',200)},recipient:{name:text(input.recipientName,'Reported recipient name',200),contact:text(input.recipientContact,'Reported recipient contact',500)},scope:text(input.scope,'Scope',10000),deliverables:items(input.deliverables,'Deliverables'),exclusions:items(input.exclusions,'Exclusions'),from,to,expiry:day(input.expiry,'proposal expiry'),signatureRequired:input.signatureRequired,currency,effortSeconds,feeMinor,expenseMinor,totalMinor,pricing:{baseMinor,contingencyBasisPoints,contingencyMinor:grossMinor-baseMinor,discountBasisPoints,discountMinor},phases,lines,paymentSchedule})
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(document)))
 const fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
 return Object.freeze({document,fingerprint})
}

/** Exact decimal cents for immutable mail/PDF terms, including large safe integers. */
export function proposalMoney(currency:string,minor:number){const n=BigInt(minor);return currency+' '+String(n/100n)+'.'+String(n%100n).padStart(2,'0')}
