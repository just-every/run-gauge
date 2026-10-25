import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, csv, integer, money as moneyAmount, need, sum, text, uuid } from './model'
import { type Actor, Transaction, fence, finance, get } from './store'

const handoffKind = 'specialistHandoffs' as Kind
export const handoffNotice = 'Prepared PSA inputs only. Gauge has not sent these inputs, filed payroll or tax, or certified profit. Revenue inputs are billing preparation, not issued invoices or recognized revenue. Invoice rows are issued native pre-tax documents. Correction rows are issued credit notes and voids, negative against their invoice. Payment rows are user-recorded receipts, not provider-verified settlement. Neither category claims recognized revenue. Recognition rows are reviewed operational journal inputs under a user-recorded accountant policy, not posted books or certified recognition.'
export const receiverNotice = 'User-recorded receiver result; provider acceptance not independently verified.'
const signedMoney = (v: unknown) => {need(typeof v==='number' && Number.isSafeInteger(v),'Amount must be exact signed integer minor units');return v}
const currency = (v: unknown) => {need(typeof v==='string'&&/^[A-Z]{3}$/.test(v),'Source currency must be explicit');return v}
type HandoffLine = {
 id:string; category:'labor'|'expense'|'revenue-input'|'invoice'|'payment'|'recognition'|'reimbursement'; sourceKind:string; sourceId:string; sourceRevision:string;
 engagementId:string; personId:string|null; date:string|null; currency:string; amountMinor:number|null; durationSeconds:number|null;
 approvedBy:string|null; approvedAt:number|null; details:Value
}

/** Category totals are independent dimensions, never one combined payroll/revenue amount. */
function totals(lines:HandoffLine[]) {
 const groups=new Map<string,HandoffLine[]>()
 for(const line of lines){const key=`${line.category}:${line.currency}${line.category==='reimbursement'?':'+line.details.expenseCategory+':'+line.details.unit:''}`;groups.set(key,[...(groups.get(key)??[]),line])}
 return [...groups.values()].map(group=>({category:group[0].category,currency:group[0].currency,count:group.length,...(group[0].category==='reimbursement'?{expenseCategory:group[0].details.expenseCategory,unit:group[0].details.unit,quantity:sum(group.map(l=>Math.round((l.details.quantity??0)*1000)))/1000}:{}),
  knownAmountMinor:sum(group.map(l=>l.amountMinor??0)),amountMinor:group.some(l=>l.amountMinor===null)?null:sum(group.map(l=>l.amountMinor!)),
  unknownAmountCount:group.filter(l=>l.amountMinor===null).length,durationSeconds:sum(group.map(l=>l.durationSeconds??0))}))
}

function reference(raw:unknown) {
 let selected:any=raw
 if(typeof selected==='string'&&selected.trim().startsWith('{')){try{selected=JSON.parse(selected)}catch{need(false,'Invalid selected source JSON')}}
 if(typeof selected==='string'){const parts=selected.split(':');need(parts.length===2,'Use kind:id source identities');selected={kind:parts[0],id:parts[1]}}
 need(selected&&typeof selected==='object'&&!Array.isArray(selected),'Choose an approved source')
 need(['time','expenses','packets','invoices','invoiceCorrections','payments','revenueRecognitions'].includes(selected.kind),'Choose approved work, issued documents, receipts or operational revenue journals')
 return {kind:selected.kind as Kind,id:text(selected.id,'Source ID',200),revision:text(selected.revision,'Exact approved source revision',200)}
}

async function prepare(env:Bindings,a:Actor,tx:Transaction,input:Value) {
 const recipient=text(input.recipient,'Specialist recipient',200),reason=text(input.reason,'Preparation and approval reason')
 need(['accounting','payroll','reimbursement'].includes(input.purpose),'Choose accounting or payroll inputs')
 const sources=input.sources??input.handoffSources
 need(Array.isArray(sources)&&sources.length>0&&sources.length<=100,'Select 1–100 approved sources')
 const reimbursement=input.purpose==='reimbursement',handoffId=uuid()
 const selected=sources.map(reference),seen=new Set<string>(),lines:HandoffLine[]=[],snapshots:Value[]=[]
 for(const source of selected){
  need(!reimbursement||source.kind==='expenses','Reimbursement exports contain only approved expenses')
  const identity=`${source.kind}:${source.id}`;need(!seen.has(identity),'A source appears twice');seen.add(identity)
  const row=await get(env,source.kind,source.id),v=row.value
  if(source.kind==='invoiceCorrections')need(v.status==='issued','Only issued invoice corrections can be prepared',409)
  else if(source.kind!=='invoices'&&source.kind!=='payments')need(v.status==='approved','Only approved inputs can be prepared',409)
  need(source.revision===row.revision,'Selected source changed; review it again',409)
  tx.observe(source.kind,row)
  const e=await get(env,'engagements',v.engagementId);tx.observe('engagements',e)
  const base={sourceKind:source.kind,sourceId:row.id,sourceRevision:row.revision,engagementId:e.id,
   personId:v.personId??null,approvedBy:v.approvedBy??v.issuedBy??v.recordedBy??null,approvedAt:v.approvedAt??v.issuedAt??v.recordedAt??null}
  snapshots.push({kind:source.kind,id:row.id,revision:row.revision})
  if(source.kind==='time'){
   need(v.economics&&typeof v.economics==='object','Approved labor needs its frozen economics')
   const cost=v.economics.costMinor==null?null:signedMoney(v.economics.costMinor)
   lines.push({...base,id:identity,category:'labor',date:v.workDate,currency:currency(v.economics.costCurrency??v.economics.currency),amountMinor:cost,
    durationSeconds:integer(v.durationSeconds,'Actual labor seconds'),details:{basis:'Approved actual labor and declared cost; not wages owed',
     costKnown:cost!==null,costKind:v.economics.costKind??null,rateId:v.economics.costRateId??v.economics.rateId??null,
     budgetId:v.economics.budgetId??null,service:v.service,taskId:v.taskId,billable:v.billable}})
  }else if(source.kind==='expenses'){
   if(reimbursement){need(v.reimbursable,'Expense is not reimbursable');tx.sql('INSERT INTO g_expense_reimbursements(expense_id,source_revision,handoff_id) VALUES(?,?,?)',row.id,row.revision,handoffId)}
   lines.push({...base,id:identity,category:reimbursement?'reimbursement':'expense',date:v.date,currency:currency(v.currency),amountMinor:signedMoney(reimbursement?v.reimbursementMinor??v.amountMinor:v.amountMinor),durationSeconds:null,
    details:{basis:reimbursement?'Employee reimbursement input only; not a payment or client recovery':'Approved actual expense; reimbursement and client recovery remain separate',reimbursable:v.reimbursable===true,taskId:v.taskId??null,approvedReimbursementMinor:v.reimbursementMinor??v.amountMinor,expenseCategory:v.category,vendor:v.vendor,incurredCurrency:v.incurredCurrency??v.currency,incurredMinor:v.incurredMinor??v.amountMinor,taxMinor:v.taxMinor??0,unit:v.unit??'receipt',quantity:v.quantity??null,unitRate:v.unitRate??null,fx:v.fx??null,receiptIds:v.attachmentIds??[],reviewNote:v.financeReviewNote??v.reviewNote??null}})
  }else if(source.kind==='revenueRecognitions'){
   lines.push({...base,id:identity,category:'recognition',personId:null,date:v.date,currency:currency(v.currency),amountMinor:signedMoney(v.amountMinor),durationSeconds:null,details:{basis:v.notice,journalType:v.journalType??'delivery',sourceId:v.sourceId,sourceRevision:v.sourceRevision,correctedAmountMinor:v.correctedAmountMinor??null,policy:v.policy,accountant:v.accountant,scheduleId:v.scheduleId,scheduleRevision:v.scheduleRevision,sequence:v.sequence,previous:v.previous,balances:v.balances,journal:v.journal,sources:v.sources,evidence:v.evidence}})
  }else if(source.kind==='invoices'){
   need(Array.isArray(v.lines)&&v.lines.length>0,'Issued invoice has no document lines')
   need(v.lines.every((line:Value)=>line.currency===v.currency),'Invoice source currencies differ; no implicit FX')
   need(sum(v.lines.map((line:Value)=>signedMoney(line.amountMinor)))===v.totalMinor,'Invoice source amounts do not reconcile')
   lines.push({...base,id:identity,category:'invoice',personId:null,date:v.issueDate,currency:currency(v.currency),amountMinor:signedMoney(v.totalMinor),durationSeconds:null,
    details:{basis:'Issued native pre-tax invoice; not recognized revenue',number:v.number,packetId:v.packetId,issueDate:v.issueDate,dueDate:v.dueDate,
     issuedBy:v.issuedBy,issuedAt:v.issuedAt,lines:v.lines}})
  }else if(source.kind==='invoiceCorrections'){
   // INVOICE-004 under BOUNDARY-001: an issued credit note or void is a signed invoice-category row against its exact invoice.
   const invoice=await get(env,'invoices',v.invoiceId);tx.observe('invoices',invoice)
   need(invoice.value.engagementId===e.id&&invoice.value.currency===v.currency,'Correction invoice identity or currency differs',409)
   lines.push({...base,id:identity,category:'invoice',personId:null,date:v.date,currency:currency(v.currency),amountMinor:-signedMoney(v.amountMinor),durationSeconds:null,
    details:{basis:v.type==='void'?'Issued void of a native pre-tax invoice; its reissue, if any, is a separate invoice row':'Issued native pre-tax credit note against its invoice lines; not recognized revenue',
     type:v.type,number:v.number??null,invoiceId:invoice.id,invoiceRevision:invoice.revision,invoiceNumber:invoice.value.number,reason:v.reason,lines:v.lines??v.reissueLines,
     reissueInvoiceId:v.reissueInvoiceId??null,writtenDownMinor:v.writtenDownMinor??null,taxEffect:v.taxEffect,preparedBy:v.preparedBy,approvedBy:v.approvedBy}})
  }else if(source.kind==='payments'){
   const invoice=await get(env,'invoices',v.invoiceId);tx.observe('invoices',invoice)
   need(invoice.value.engagementId===e.id&&invoice.value.currency===v.currency,'Receipt invoice identity or currency differs',409)
   lines.push({...base,id:identity,category:'payment',personId:null,date:v.date,currency:currency(v.currency),amountMinor:signedMoney(v.amountMinor),durationSeconds:null,
    details:{basis:'User-recorded receipt; provider acceptance and settlement not independently verified; not recognized revenue',invoiceId:invoice.id,
     invoiceRevision:invoice.revision,invoiceNumber:invoice.value.number,reference:v.reference,recordedBy:v.recordedBy,recordedAt:v.recordedAt}})
  }else{
   need(Array.isArray(v.lines)&&v.lines.length>0,'Approved packet has no revenue input lines')
   need(v.lines.every((line:Value)=>line.currency===v.currency),'Packet source currencies differ; no implicit FX')
   need(sum(v.lines.map((line:Value)=>signedMoney(line.amountMinor)))===v.totalMinor,'Packet source amounts do not reconcile')
   for(const [index,line] of v.lines.entries())lines.push({...base,id:`${identity}:${index}`,category:'revenue-input',date:null,personId:null,
    currency:currency(v.currency),amountMinor:signedMoney(line.amountMinor),durationSeconds:line.durationSeconds==null?null:integer(line.durationSeconds,'Packet actual seconds'),
    details:{basis:'Approved billing-preparation input; not issued or recognized revenue',kind:line.kind,sourceId:line.sourceId,sourceRevision:line.sourceRevision,
     rateId:line.rateId??null,budgetId:line.budgetId??null,billRateMinor:line.billRateMinor??null,roundedBillingSeconds:line.roundedBillingSeconds??null,
     roundingSeconds:line.roundingSeconds??null,correctsPacketId:v.correctsPacketId??null}})
  }
  need(lines.length<=1000,'Prepare at most 1000 output lines per handoff')
 }
 return sealHandoff(a,tx,handoffId,recipient,input.purpose,reason,snapshots,lines)
}

function handoffCsv(id:string,lines:HandoffLine[]) {
 return csv([['handoffId','id','category','sourceKind','sourceId','sourceRevision','engagementId','personId','date','currency','amountMinor','amountKnown','durationSeconds','approvedBy','approvedAt','details','notice'],
  ...lines.map(l=>[id,l.id,l.category,l.sourceKind,l.sourceId,l.sourceRevision,l.engagementId,l.personId,l.date,l.currency,l.amountMinor,l.amountMinor!==null,l.durationSeconds,l.approvedBy,l.approvedAt,canonicalJson(l.details),handoffNotice])])
}

function sealHandoff(a:Actor,tx:Transaction,handoffId:string,recipient:string,purpose:string,reason:string,snapshots:Value[],lines:HandoffLine[],extra:Value={}){
 const id=handoffId,approvedAt=Date.now(),controlTotals=totals(lines)
 const artifact=handoffCsv(id,lines)
 return tx.record(handoffKind,{recipient,purpose,reason,sources:snapshots,lines,controlTotals,artifact,artifactHash:sha256(artifact),
  status:'awaiting-result',delivery:'manual-export',financialEffect:'none',approvedBy:a.session.operator.id,approvedAt,notice:handoffNotice,result:null,...extra},undefined,id,extra.adjustmentOf?'handoff:adjust-reimbursement':'handoff:prepare')
}

async function readResult(input:Value):Promise<{result:Value;original:string}> {
 let result=input.result,original:string
 if(input.file instanceof File){
  need(input.file.size>0&&input.file.size<=1024*1024,'Upload a receiver JSON result up to 1 MiB')
  original=await input.file.text()
  try{result=JSON.parse(original)}catch{need(false,'Receiver result must be valid JSON')}
 }else{need(result&&typeof result==='object'&&!Array.isArray(result),'Supply a receiver result object or JSON file');original=canonicalJson(result);need(new TextEncoder().encode(original).length<=1024*1024,'Receiver result is limited to 1 MiB')}
 need(result&&typeof result==='object'&&!Array.isArray(result),'Receiver result must be an object')
 need(Object.keys(result).every(k=>['handoffId','artifactHash','lines'].includes(k)),'Receiver result has unsupported fields')
 return {result,original}
}

export async function specialistHandoffCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(!['handoff:prepare','handoff:record-result','handoff:adjust-reimbursement'].includes(action))return null
 need(finance(a),'Finance access required',403)
 await fence(env,a)
 if(action==='handoff:prepare')return prepare(env,a,tx,input)
 const row=await get(env,handoffKind,text(input.id,'Handoff ID'))
 need(input.revision===row.revision,'Handoff changed; review the current version',409)
 if(action==='handoff:adjust-reimbursement'){
  need(row.value.purpose==='reimbursement'&&row.value.result,'Review the exact reconciled reimbursement export before adjusting',409)
  const selected=text(input.sourceId,'Reimbursement line'),line=row.value.lines.find((l:Value)=>l.id===selected)
  need(line&&line.category==='reimbursement','Choose an exported reimbursement source')
  const corrected=moneyAmount(input.correctedMinor),current=line.details.currentReimbursementMinor??line.amountMinor
  need(corrected<=(line.details.approvedReimbursementMinor??line.amountMinor),'Reimbursement cannot exceed the exact approved claim')
  need(corrected!==current,'Adjustment must change the reimbursement amount')
  const delta=sum([corrected,-current]),reason=text(input.reason,'Adjustment reason'),id=uuid()
  tx.observe(handoffKind,row)
  tx.sql('INSERT INTO g_reimbursement_adjustments(parent_id,source_id,handoff_id) VALUES(?,?,?)',row.id,selected,id)
  tx.guard('EXISTS(SELECT 1 FROM g_expense_reimbursements WHERE expense_id=? AND handoff_id=?)',line.sourceId,row.id)
  tx.sql('UPDATE g_expense_reimbursements SET handoff_id=? WHERE expense_id=? AND handoff_id=?',id,line.sourceId,row.id)
  const adjusted={...line,amountMinor:delta,details:{...line.details,priorReimbursementMinor:current,currentReimbursementMinor:corrected,adjustmentOf:row.id,reason}}
  return sealHandoff(a,tx,id,row.value.recipient,'reimbursement',reason,row.value.sources,[adjusted],{adjustmentOf:row.id})
 }
 need(row.value.status==='awaiting-result'&&!row.value.result,'Receiver result is immutable; it has already been recorded',409)
 need(sha256(row.value.artifact)===row.value.artifactHash,'Stored handoff artifact failed integrity verification',409)
 const {result,original}=await readResult(input)
 need(result.handoffId===row.id&&result.artifactHash===row.value.artifactHash,'Receiver result refers to another handoff or artifact',409)
 const expected=new Map<string,HandoffLine>(row.value.lines.map((l:HandoffLine)=>[l.id,l]))
 need(Array.isArray(result.lines)&&result.lines.length===expected.size,'Receiver result must account for every exported line')
 const seen=new Set<string>(),accepted:HandoffLine[]=[],rejected:HandoffLine[]=[]
 const outcomes=result.lines.map((line:Value)=>{
  need(line&&typeof line==='object'&&!Array.isArray(line),'Invalid receiver line')
  need(Object.keys(line).every(k=>['id','status','reason','currency','amountMinor','durationSeconds','quantity','unit'].includes(k)),'Receiver line has unsupported fields')
  const id=text(line.id,'Receiver line ID',500),source=expected.get(id)
  need(source&&!seen.has(id),'Unknown or duplicate receiver line');seen.add(id)
  need(['accepted','rejected'].includes(line.status),'Every receiver line must be accepted or rejected')
  need(line.currency===source.currency&&line.amountMinor===source.amountMinor&&line.durationSeconds===source.durationSeconds,'Receiver quantity, amount or currency differs from the exported line')
  if(source.category==='reimbursement')need(line.quantity===source.details.quantity&&line.unit===source.details.unit,'Receiver claim quantity or unit differs from the export')
  const reason=line.status==='rejected'?text(line.reason,'Rejection reason'):line.reason===undefined?'':text(line.reason,'Receiver note')
  const bucket=line.status==='accepted'?accepted:rejected
  bucket.push(source)
  return {id,status:line.status,reason,...(source.category==='reimbursement'?{quantity:source.details.quantity,unit:source.details.unit}:{}),currency:source.currency,amountMinor:source.amountMinor,durationSeconds:source.durationSeconds}
 })
 return tx.record(handoffKind,{...row.value,status:rejected.length?'recorded-with-rejections':'recorded-accepted',
  result:{handoffId:row.id,artifactHash:row.value.artifactHash,lines:outcomes,original,originalHash:sha256(original),
   recordedBy:a.session.operator.id,recordedAt:Date.now(),verification:'user-recorded',notice:receiverNotice,acceptedCount:accepted.length,rejectedCount:rejected.length,
   acceptedTotals:totals(accepted),rejectedTotals:totals(rejected)}},row,undefined,action)
}

export async function handoffDownload(env:Bindings,a:Actor,id:string):Promise<Response> {
 need(finance(a)||a.role==='accountant','Finance access required',403)
 await fence(env,a)
 const row=await get(env,handoffKind,text(id,'Handoff ID'))
 need(a.role!=='accountant'||row.value.purpose==='accounting','Accountants cannot download payroll inputs',403)
 need(sha256(row.value.artifact)===row.value.artifactHash,'Stored handoff artifact failed integrity verification',409)
 // Accountant views retain reviewed amounts and exact source identities while finance keeps the original bytes.
 const accountantView=a.role==='accountant'&&row.value.lines.some((line:HandoffLine)=>line.sourceKind==='expenses')
 const artifact=accountantView?handoffCsv(row.id,row.value.lines.map((line:HandoffLine)=>{
  if(line.sourceKind!=='expenses')return line
  const {unitRate,fx,reviewNote,...details}=line.details
  return {...line,details}
 })):row.value.artifact
 await fence(env,a)
 return new Response(artifact,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="gauge-handoff-${row.id}${accountantView?'-accountant':''}.csv"`,
  'cache-control':'no-store','x-content-type-options':'nosniff','x-gauge-artifact-sha256':accountantView?sha256(artifact):row.value.artifactHash,
  ...(accountantView?{'x-gauge-artifact-view':'accountant','x-gauge-source-artifact-sha256':row.value.artifactHash}:{})}})
}
