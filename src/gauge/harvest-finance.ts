import { Buffer } from 'node:buffer'
import { canonicalJson, type TargetEffect } from '../modules/import-kit/src/d1/index'
import { parseApiJson } from '../modules/import-kit/src/readers/numeric-lexemes'
import { ReaderError } from '../modules/import-kit/src/readers/errors'
import { date, integer, need, sum, text, type Value } from './model'

export const harvestFinanceKinds = ['expenses','estimates','invoices','payments','retainers'] as const
const metrics = ['expenseMinor','estimateMinor','invoiceMinor','invoicePaidMinor','paidMinor','outstandingMinor','openingMinor','allowanceMinor','usedMinor','closingMinor','carryInMinor','carryOutMinor']
export function harvestFinance(m:Value, content:string|undefined, clients:Map<string,string>, projects:Map<string,string>, projectClients:Map<string,string>, id:(kind:string,source:string)=>string, add:(file:string,index:number,kind:string,source:string,payload:Value,effects:TargetEffect[])=>void) {
 const findings:Value[]=[], records:Record<string,Value[]>={}, controls:Record<string,Value>={}, counts:Record<string,number>={}
 const report=(kind:string,reason:string,sourceId?:string)=>findings.push({kind,reason,...(sourceId?{sourceId}:{})})
 if(content===undefined){report('finance','Complete original finance.json and independent financial controls are required');return {records,controls,counts,findings}}
 let doc:Value
 try{doc=parseApiJson(content,{artifact:'finance.json'},[],{namespace:'harvest:'+m.namespace,url:'https://source.invalid/',preserveNumberLexeme:()=>true,parsePage:()=>({records:[]})}).value as Value}catch(error){if(error instanceof ReaderError)need(false,'Invalid original finance JSON: '+error.code);throw error}
 need(doc&&typeof doc==='object'&&!Array.isArray(doc),'Harvest finance capture must be an object')
 need(m.finance?.mappingVersion==='harvest-finance-v1','Review the harvest-finance-v1 source mapping')
 need(m.finance?.moneyUnit==='minor-units','Declare exact minor-units for Harvest finance')
 const signed=(value:unknown,label:string)=>{need(typeof value==='number'||typeof value==='string'&&/^-?\d+$/.test(value),label+' requires exact integer minor units');return integer(typeof value==='string'?Number(value):value,label,-1e12)}
 for(const kind of harvestFinanceKinds){
  const rows=doc[m.finance.arrays?.[kind]??kind];need(Array.isArray(rows),`Capture Harvest ${kind}, including an empty array when none exist`)
  records[kind]=[];counts[kind]=rows.length
  need(Object.values(counts).reduce((a,b)=>a+b,0)<=1000,'Harvest finance exceeds 1000 source rows')
  const seen=new Set<string>(),mapping=m.finance.columns?.[kind]
  need(mapping&&mapping.id,'Map stable Harvest '+kind+' source IDs')
  for(const raw of rows){
   need(raw&&typeof raw==='object'&&!Array.isArray(raw),'Financial source rows must be objects')
   const v:Value={};for(const [key,column]of Object.entries(mapping)){need(typeof column==='string'&&Object.hasOwn(raw,column),`Missing mapped ${kind} column ${String(column)}`);v[key]=raw[column]}
   v.id=text(v.id,kind+' source ID',200);need(!seen.has(v.id),'Duplicate Harvest '+kind+' source ID');seen.add(v.id)
   v.date=date(v.date);v.currency=text(v.currency,'Source currency',3);need(/^[A-Z]{3}$/.test(v.currency),'Declare source ISO currency')
   if(v.currency!==m.currency)report(kind,'Financial source currency differs from the declared package currency',v.id)
   if(kind==='payments'){v.invoiceId=text(v.invoiceId,'Source invoice ID',200);v.amountMinor=signed(v.amountMinor,'Payment amount')}
   else{
    v.clientId=text(v.clientId,'Source client ID',200);if(!clients.has(v.clientId))report(kind,'Unresolved source client',v.id)
    if(kind==='expenses'||kind==='retainers')v.projectId=text(v.projectId,'Source project ID',200)
    if(v.projectId&&(!projects.has(v.projectId)||projectClients.get(v.projectId)!==v.clientId))report(kind,'Unresolved project or client relationship',v.id)
    if(kind==='retainers'){
     for(const key of ['openingMinor','allowanceMinor','usedMinor','closingMinor','carryInMinor','carryOutMinor'])v[key]=signed(v[key],key)
     if(v.allowanceMinor<0||v.usedMinor<0||sum([v.openingMinor,v.allowanceMinor,-v.usedMinor])!==v.closingMinor||v.carryOutMinor!==v.closingMinor)report(kind,'Retainer opening, allowance, use and signed closing carry do not reconcile',v.id)
     v.familyId=text(v.familyId,'Stable retainer family ID',200)
    }else{
     v.amountMinor=signed(v.amountMinor,'Source amount')
     if(kind==='invoices'){v.paidMinor=signed(v.paidMinor,'Invoice paid amount');v.outstandingMinor=signed(v.outstandingMinor,'Invoice outstanding amount');if(sum([v.amountMinor,-v.paidMinor])!==v.outstandingMinor)report(kind,'Invoice amount, paid and outstanding do not reconcile',v.id)}
    }
   }
   const review=m.sourceCoverage?.[kind]
   if(!review?.historyRange||v.date<review.historyRange.from||v.date>review.historyRange.to)report(kind,'Financial date lies outside the reviewed source history range',v.id)
   records[kind].push(v)
  }
 }
 for(const invoice of records.invoices){const payments=records.payments.filter(p=>p.invoiceId===invoice.id);if(payments.some(p=>p.currency!==invoice.currency)||sum(payments.map(p=>p.amountMinor))!==invoice.paidMinor)report('invoices','Invoice paid control differs from source payment allocations',invoice.id)}
 for(const payment of records.payments){const invoice=records.invoices.find(v=>v.id===payment.invoiceId);if(!invoice)report('payments','Unresolved source invoice',payment.id);else payment.clientId=invoice.clientId}
 const families=new Map<string,Value>()
 for(const v of [...records.retainers].sort((a,b)=>a.date.localeCompare(b.date))){const key=[v.clientId,v.familyId,v.currency].join(':'),prior=families.get(key);if(prior&&(prior.date.slice(0,7)===v.date.slice(0,7)||prior.carryOutMinor!==v.carryInMinor||v.openingMinor!==v.carryInMinor))report('retainers','Retainer family carry continuity does not reconcile',v.id);families.set(key,v)}
 for(const [kind,rows]of Object.entries(records))for(const [index,v]of rows.entries()){
  const key=[v.clientId??'Unresolved',v.date.slice(0,7),v.currency].join('/'),bucket=controls[key]??=Object.fromEntries(metrics.map(k=>[k,0])),increment=(metric:string,amount:number)=>bucket[metric]=sum([bucket[metric],amount])
  if(kind==='expenses')increment('expenseMinor',v.amountMinor)
  if(kind==='estimates')increment('estimateMinor',v.amountMinor)
  if(kind==='invoices')for(const [metric,field]of [['invoiceMinor','amountMinor'],['invoicePaidMinor','paidMinor'],['outstandingMinor','outstandingMinor']])increment(metric,v[field])
  if(kind==='payments')increment('paidMinor',v.amountMinor)
  if(kind==='retainers')for(const metric of metrics.slice(6))increment(metric,v[metric])
  const source={namespace:'harvest:'+m.namespace,externalId:kind+':'+v.id},body={kind,record:v,source,meaning:'Historical source evidence only; no native approval, issuance, settlement, access or retainer billing authority.'}
  add('finance.json',index,'finance:'+kind,v.id,v,[{targetKind:'archives',targetId:id('archives',source.externalId),value:{name:`Harvest ${kind} ${v.id}`,mediaType:'application/json',base64:Buffer.from(canonicalJson(body)).toString('base64'),semantics:body.meaning,harvestFinance:body,source}}])
 }
 if(canonicalJson(m.finance.controls?.counts??null)!==canonicalJson(counts))report('finance','Independent financial object counts are missing or do not reconcile')
 if(canonicalJson(m.finance.controls?.financial??null)!==canonicalJson(controls))report('finance','Independent client, month and currency financial controls are missing or do not reconcile')
 return {records,controls,counts,findings}
}
