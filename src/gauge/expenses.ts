import { phaseFor } from './budget-phases'
import type { Bindings } from '../auth.server'
import { type Value, need, text, date, money, flag, uuid, integer, sum } from './model'
import { type Actor, Transaction, finance, access, get, all } from './store'
import { rateOn } from './fx-rates'
import { currencies } from './agency'
export async function expenseCommand(env: Bindings,a: Actor,tx: Transaction,action: string,input: Value) {
 if (!action.startsWith('expense:')) return null
 if(action==='expense:rate'){
  need(finance(a),'Finance sets expense unit rates',403)
  need(['mileage','per-diem'].includes(input.unit),'Choose mileage or per-diem')
  const currency=text(input.currency,'Currency').toUpperCase();need(currencies.includes(currency as any),'Choose a supported currency')
  const effective=date(input.effective),rows=(await all(env,'expenseRates')).filter(r=>r.value.unit===input.unit&&r.value.currency===currency)
  need(rows.every(r=>r.value.effective<effective),'A unit rate must apply after the latest effective date',409)
  tx.guard("(SELECT COUNT(*) FROM g_expenseRates WHERE json_extract(data,'$.unit')=? AND json_extract(data,'$.currency')=?)=?",input.unit,currency,rows.length)
  return tx.record('expenseRates',{unit:input.unit,currency,effective,unitMinor:money(input.unitMinor),reason:text(input.reason,'Rate reason'),approvedBy:a.session.operator.id,approvedAt:Date.now()})
 }
 const old = input.id ? await get(env,'expenses',text(input.id,'Expense')) : undefined
 if (old) { need(old.revision === input.revision,'Expense changed; reload',409); if(action==='expense:save'){need(finance(a)||a.personId===old.value.personId,'Only your own expense',403);const original=await access(env,a,old.value.engagementId);tx.observe('engagements',original);need(old.value.personId===input.personId&&old.value.engagementId===input.engagementId,'Cannot move an existing expense')} }
 if (action === 'expense:save') {
  need(!old || ['draft','returned'].includes(old.value.status),'Return the expense before editing')
  const person = await get(env,'people',text(input.personId,'Person')); need(finance(a) || a.personId === person.id,'Only your own expense',403)
  const e = await access(env,a,text(input.engagementId,'Engagement')); tx.observe('engagements',e); tx.observe('people',person)
  const currency = old ? old.value.currency : e.value.currency
  need(currency === e.value.currency && (input.currency === undefined || input.currency === currency), 'Expense currency differs from engagement; no implicit FX')
  const taskId=input.taskId===undefined?old?.value.taskId??null:input.taskId||null
  if(taskId){const task=await get(env,'tasks',taskId);need(task.value.engagementId===e.id,'Task belongs to another engagement');tx.observe('tasks',task)}
  const phase=await phaseFor(env,tx,e.id,taskId?(await get(env,'tasks',taskId)).value.phaseKey:undefined)
  const incurredCurrency=String(input.incurredCurrency??currency).toUpperCase();need(currencies.includes(incurredCurrency as any),'Choose a supported incurred currency')
  const unit=String(input.unit??'receipt');need(['receipt','mileage','per-diem'].includes(unit),'Choose receipt, mileage or per-diem')
  const rawQuantity=String(input.quantity??'1');need(unit==='receipt'||/^\d+(?:\.\d{1,3})?$/.test(rawQuantity),'Claim quantity supports up to three decimal places')
  const quantity=unit==='receipt'?null:Number(rawQuantity),quantityMilli=quantity===null?null:Math.round(quantity*1000);need(quantity===null||Number.isSafeInteger(quantityMilli)&&quantity>0&&quantity<=1000000,'Claim quantity is outside supported bounds')
  const incurredMinor=money(input.amountMinor??0),taxMinor=money(input.taxMinor??0)
  const markupBasisPoints=integer(input.markupBasisPoints??0,'Markup basis points',0,100000)
  return tx.record('expenses',{...(phase?{phaseKey:phase.key}:{}),taskId,engagementId:e.id,personId:person.id,date:date(input.date),description:text(input.description,'Description'),category:String(input.category??old?.value.category??'Uncategorized').trim().slice(0,100)||'Uncategorized',vendor:String(input.vendor??old?.value.vendor??'').trim().slice(0,200),amountMinor:unit==='receipt'&&incurredCurrency===currency?sum([incurredMinor,taxMinor]):null,currency,incurredCurrency,incurredMinor,taxMinor,unit,quantity,quantityMilli,markupBasisPoints,clientBillable:input.clientBillable===undefined?flag(input.reimbursable):flag(input.clientBillable),policyException:String(input.policyException??'').trim().slice(0,2000),reimbursable:flag(input.reimbursable),attachmentIds:old?.value.attachmentIds??[],status:'draft'},old)
 }
 need(old,'Expense not found',404)
 const e = await access(env,a,old.value.engagementId,['expense:approve','expense:return'].includes(action)); tx.observe('engagements',e)
 need(input.currency === undefined || input.currency === old.value.currency, 'Currency differs from expense; no implicit FX')
 if (action === 'expense:file') {
  need(finance(a) || a.personId === old.value.personId,'Only your own attachment',403); need(['draft','returned'].includes(old.value.status),'Attachments are fixed at submission')
  const file=input.file; need(file instanceof File && file.size>0 && file.size<=1024*1024,'Upload a receipt up to 1 MiB'); need(['application/pdf','image/jpeg','image/png','text/plain'].includes(file.type),'Use PDF, PNG, JPEG or text')
  const id=uuid(); tx.sql('INSERT INTO g_files(id,expense_id,name,media_type,bytes,size,actor) VALUES(?,?,?,?,?,?,?)',id,old.id,file.name.slice(0,180),file.type,await file.arrayBuffer(),file.size,a.session.operator.id)
  return tx.record('expenses',{...old.value,attachmentIds:[...(old.value.attachmentIds ?? []),id]},old,undefined,action)
 }
 const v={...old.value}
 if (action === 'expense:submit') { need(finance(a) || a.personId === v.personId,'Only your own expense',403); need(['draft','returned'].includes(v.status),'Already submitted'); v.status='submitted' }
 else if (action === 'expense:approve') { need(v.status==='submitted','Approve submitted expenses'); need(v.currency === e.value.currency, 'Expense currency differs from engagement; no implicit FX');
  const advanced=!!(v.policyException||v.unit&&v.unit!=='receipt'||v.incurredCurrency&&v.incurredCurrency!==v.currency||v.markupBasisPoints||v.taxMinor)
  if(advanced){need(finance(a),'Finance reviews expense policy, receipt and economics',403);need((v.attachmentIds??[]).length>0||v.unit!=='receipt','Receipt review requires an attached receipt');v.financeReviewNote=text(input.reason,'Finance approval reason')}
  let base=v.incurredMinor??v.amountMinor
  if(v.unit&&v.unit!=='receipt'){
   const rates=(await all(env,'expenseRates')).filter(r=>r.value.unit===v.unit&&r.value.currency===v.incurredCurrency&&r.value.effective<=v.date).sort((x,y)=>x.value.effective.localeCompare(y.value.effective)),rate=rates.at(-1)
   need(rate,'No approved unit rate for the incurred date',409);tx.observe('expenseRates',rate)
   tx.guard("(SELECT COUNT(*) FROM g_expenseRates WHERE json_extract(data,'$.unit')=? AND json_extract(data,'$.currency')=? AND json_extract(data,'$.effective')<=?)=?",v.unit,v.incurredCurrency,v.date,rates.length)
   base=Number((BigInt(v.quantityMilli??Math.round(v.quantity*1000))*BigInt(rate.value.unitMinor)+500n)/1000n);need(Number.isSafeInteger(base),'Claim exceeds exact integer range');v.unitRate={id:rate.id,revision:rate.revision,...rate.value}
  }
  v.incurredMinor=base;const gross=sum([base,v.taxMinor??0]);v.amountMinor=gross
  if(v.incurredCurrency&&v.incurredCurrency!==v.currency){
   const rates=await all(env,'fxRates'),source=v.incurredCurrency===a.currency?null:rateOn(rates,v.incurredCurrency,v.date),target=v.currency===a.currency?null:rateOn(rates,v.currency,v.date)
   need((v.incurredCurrency===a.currency||source)&&(v.currency===a.currency||target),'No owner-approved FX rate for the incurred date',409)
   if(source)tx.observe('fxRates',source);if(target)tx.observe('fxRates',target)
   tx.guard('(SELECT COUNT(*) FROM g_fxRates)=?',rates.length)
   const numerator=BigInt(source?.value.rateMicro??1000000),denominator=BigInt(target?.value.rateMicro??1000000)
   v.amountMinor=Number((BigInt(gross)*numerator+denominator / 2n)/denominator);v.fx={...(source?.value??{}),from:v.incurredCurrency,to:v.currency,sourceRate:source,targetRate:target,rounding:'half up to target minor units'}
  }
  need(Number.isSafeInteger(v.amountMinor),'Expense exceeds exact integer range')
  v.reimbursementMinor=v.reimbursable?v.amountMinor:0
  const markup=Number((BigInt(v.amountMinor)*BigInt(v.markupBasisPoints??0)+5000n)/10000n)
  v.clientRecoveryMinor=(v.clientBillable??v.reimbursable)?sum([v.amountMinor,markup]):0
  v.status='approved'; v.approvedBy=a.session.operator.id; v.approvedAt=Date.now() }
 else if (action === 'expense:return') { need(v.status==='submitted','Return submitted expenses'); v.status='returned'; v.reviewNote=text(input.reason,'Return reason') }
 else need(false,'Unknown expense command')
 return tx.record('expenses',v,old,undefined,action)
}
