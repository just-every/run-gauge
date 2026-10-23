import { phaseFor } from './budget-phases'
import type { Bindings } from '../auth.server'
import { type Value, need, text, date, money, flag, uuid } from './model'
import { type Actor, Transaction, finance, access, get } from './store'
export async function expenseCommand(env: Bindings,a: Actor,tx: Transaction,action: string,input: Value) {
 if (!action.startsWith('expense:')) return null
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
  return tx.record('expenses',{...(phase?{phaseKey:phase.key}:{}),taskId,engagementId:e.id,personId:person.id,date:date(input.date),description:text(input.description,'Description'),category:String(input.category??old?.value.category??'Uncategorized').trim().slice(0,100)||'Uncategorized',vendor:String(input.vendor??old?.value.vendor??'').trim().slice(0,200),amountMinor:money(input.amountMinor),currency,reimbursable:flag(input.reimbursable),attachmentIds:old?.value.attachmentIds??[],status:'draft'},old)
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
 else if (action === 'expense:approve') { need(v.status==='submitted','Approve submitted expenses'); need(v.currency === e.value.currency, 'Expense currency differs from engagement; no implicit FX'); v.status='approved'; v.approvedBy=a.session.operator.id; v.approvedAt=Date.now() }
 else if (action === 'expense:return') { need(v.status==='submitted','Return submitted expenses'); v.status='returned'; v.reviewNote=text(input.reason,'Return reason') }
 else need(false,'Unknown expense command')
 return tx.record('expenses',v,old,undefined,action)
}
