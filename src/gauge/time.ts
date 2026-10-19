import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, instant, zone, flag, workDate, integer, date } from './model'
import { freeze } from './rate-cards'
import { assertRetainerSourceEditable } from './retainer-source-lock'
import { enforceTimeReview, timeReviewer, reviewSettings, activeDelegation } from './time-review'
import { assertTimeUnlocked, observedPolicy } from './time-policy'
import { type Actor, Transaction, finance, access, get, all } from './store'
export async function snapshotRates(env: Bindings,tx: Transaction,row: Row) {
 const engagement = await get(env,'engagements',row.value.engagementId); tx.observe('engagements',engagement)
 // Internal approvals freeze declared labor cost without inventing client terms.
 if (engagement.value.type === 'internal') { need(!row.value.billable,'Internal time cannot be billable'); return freeze(env,tx,row,engagement,{mode:'internal',roundingSeconds:1,budgetId:null}) }
 const budgets = (await all(env,'budgets')).filter(b=> b.value.engagementId === row.value.engagementId && b.value.status === 'approved').sort((x,y)=>y.value.approvedAt-x.value.approvedAt)
 need(budgets[0],'Approve engagement terms first'); tx.observe('budgets',budgets[0]);tx.guard("(SELECT COUNT(*) FROM g_budgets WHERE engagement_id=? AND status='approved')=?",row.value.engagementId,budgets.length)
 need(budgets[0].value.currency === engagement.value.currency, 'Terms currency differs from engagement; no implicit FX')
 return freeze(env,tx,row,engagement,{mode:budgets[0].value.mode,roundingSeconds:budgets[0].value.roundingSeconds,budgetId:budgets[0].id})
}
export async function timeCommand(env: Bindings,a: Actor,tx: Transaction,action: string,input: Value): Promise<Row | null> {
 if (!['time:save','timer:start','timer:stop','time:submit','time:return','time:approve','time:correct'].includes(action)) return null
 if (action === 'time:save' || action === 'timer:start') {
  const old = input.id ? await get(env,'time',input.id) : undefined
  if (old) { need(finance(a) || a.personId === old.value.personId, 'Only your own entry', 403); const original = await access(env,a,old.value.engagementId); tx.observe('engagements',original); need(old.value.personId === input.personId && old.value.engagementId === input.engagementId,'Cannot move an existing entry'); need(old.revision === input.revision,'Entry changed; reload',409); need(['draft','returned'].includes(old.value.status),'Submitted or approved entries require return/correction',409) }
  if(old)await assertRetainerSourceEditable(env,tx,old)
  if(old)await assertTimeUnlocked(env,tx,[old.value.workDate])
  const policy=await observedPolicy(env,tx),settings=reviewSettings(policy)
  const billable=input.billable===undefined?(settings.serviceBillability[String(input.service)]??true):flag(input.billable)
  const person = await get(env,'people',text(input.personId,'Person')); need(finance(a) || a.personId === person.id,'You can only record your own time',403); tx.observe('people',person)
  const e = await access(env,a,text(input.engagementId,'Engagement')); tx.observe('engagements',e)
  need(e.value.type !== 'internal' || !billable,'Internal time cannot be billable')
  const task = await get(env,'tasks',text(input.taskId,'Task')); need(task.value.engagementId === e.id,'Task belongs to another engagement'); tx.observe('tasks',task); need(task.value.billable!==false||!billable,'This task is nonbillable')
  const dateOnly=old?.value.source?.clockInstants==='not-supplied'; const start = dateOnly ? null : action === 'timer:start' ? Date.now() : instant(input.start), end = dateOnly ? null : action === 'timer:start' ? null : instant(input.end)
  need(end === null || end > start!,'End must follow start'); need(end === null || end <= Date.now()+60000,'Time cannot end in the future')
  const timezone = zone(input.timezone)
  await assertTimeUnlocked(env,tx,[dateOnly?date(input.workDate):workDate(start!,timezone)])
  return tx.record('time',{engagementId:e.id,personId:person.id,taskId:task.id,service:text(input.service,'Service'),notes:String(input.notes ?? '').slice(0,4000),billable,start,end,durationSeconds:dateOnly ? integer(input.durationSeconds,'Actual duration seconds',1,86400) : end === null ? null : Math.round((end-start!)/1000),timezone,workDate:dateOnly ? date(input.workDate) : workDate(start!,timezone),status:'draft',source:old?.value.source ?? null},old)
 }
 const row = await get(env,'time',text(input.id,'Entry')); need(row.revision === input.revision,'Entry changed; reload',409)
 await assertTimeUnlocked(env,tx,[row.value.workDate])
 const v = {...row.value}; const manage = ['time:approve','time:return','time:correct'].includes(action)
 const e = manage&&action!=='time:correct' ? await timeReviewer(env,a,tx,row) : await access(env,a,v.engagementId,manage); tx.observe('engagements',e)
 if (!manage) need(finance(a) || a.personId === v.personId,'Only your own entry',403)
 if (action === 'timer:stop') { need(v.start !== null && v.end === null,'Timer already stopped',409); v.end=Date.now(); v.durationSeconds=Math.round((v.end-v.start)/1000); need(v.end>v.start,'Timer has no elapsed duration') }
 if (action === 'time:submit') { need(v.durationSeconds > 0 && ['draft','returned'].includes(v.status),'Stop the timer and save a draft first'); const policy=await observedPolicy(env,tx);await enforceTimeReview(env,a,tx,row,policy);v.status='submitted';v.submittedAt=Date.now();v.reviewApprovals=[];v.reviewPolicyRevision=policy?.revision??null }
 if (action === 'time:return') { need(v.status === 'submitted','Only submitted time can be returned'); v.status='returned'; v.reviewNote=text(input.reason,'Return reason');v.reviewApprovals=[] }
 if (action === 'time:approve') { need(v.status === 'submitted','Approve the exact submitted revision'); const policy=await observedPolicy(env,tx),settings=await enforceTimeReview(env,a,tx,row,policy)
  need((v.reviewPolicyRevision??null)===(policy?.revision??null),'Review policy changed; return and resubmit the entry',409)
  const approvals=v.reviewApprovals??[]
  if(settings.reviewLevels===2&&!approvals.length){
   const delegates=await all(env,'timeDelegations'),delegation=delegates.find(d=>activeDelegation(d,e,a,workDate(Date.now(),a.timezone),v.workDate))
   need(a.role==='lead'&&e.value.leadId===a.personId||delegation,'First review requires the engagement lead or their active delegate',403)
   if(delegation)tx.observe('timeDelegations',delegation)
  }
  need(!settings.separation||a.personId!==v.personId,'Separation policy forbids self-approval',403)
  need(!approvals.some((p:Value)=>p.operatorId===a.session.operator.id||p.personId&&p.personId===a.personId),'Two review levels need different people',403)
  if(approvals.length>0)need(finance(a),'Second review requires finance',403)
  v.reviewApprovals=[...approvals,{operatorId:a.session.operator.id,personId:a.personId,at:Date.now(),revision:row.revision}]
  if(v.reviewApprovals.length===settings.reviewLevels){v.economics=await snapshotRates(env,tx,row);v.status='approved';v.approvedBy=a.session.operator.id;v.approvedAt=Date.now()} }
 if (action === 'time:correct') { await assertRetainerSourceEditable(env,tx,row); need(v.status === 'approved','Only approved entries need audited correction'); v.status='returned'; v.reviewNote=text(input.reason,'Correction reason'); v.reviewApprovals=[];delete v.submittedAt;delete v.economics; delete v.approvedBy; delete v.approvedAt }
 return tx.record('time',v,row,undefined,action)
}
