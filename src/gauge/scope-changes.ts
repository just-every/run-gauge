import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, uuid } from './model'
import { type Actor, type Transaction, all, get, finance } from './store'
import { projectScenarioPreview } from './project-scenarios'

/** Internal change review never approves terms, work, dates or billing. */
export async function scopeChangePreview(env:Bindings,a:Actor,input:Value,tx?:Transaction) {
 need(finance(a)&&a.session.kind==='native','Native finance or owner access required',403)
 need(!input.id,'Preview explicit changes, not a selected scenario')
 const preview=await projectScenarioPreview(env,a,input,tx)
 const scope=preview.changes.filter(c=>c.type==='scope')
 need(scope.length===1&&preview.changes.every(c=>c.type==='scope'||c.type==='deadline'),'A change request needs one scope and optional delivery baseline changes')
 const engagement=await get(env,'engagements',scope[0].id)
 need(engagement.value.type!=='internal','Client change requests require a client engagement')
 for(const change of preview.changes.filter(c=>c.type==='deadline')) {
  const plan=await get(env,'deliveryPlans',change.id)
  need(plan.value.engagementId===engagement.id,'Delivery changes must belong to the same client engagement')
 }
 return {...preview,engagementId:engagement.id}
}
export async function scopeChangeCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(!['change:prepare','change:review','change:withdraw'].includes(action))return null
 need(finance(a)&&a.session.kind==='native','Native finance or owner access required',403)
 if(action==='change:prepare') {
  const preview=await scopeChangePreview(env,a,input,tx)
  need(input.fingerprint===preview.fingerprint,'Change inputs changed; review the comparison again',409)
  const versions=(await all(env,'projectScenarios')).filter(r=>r.value.changeOrder&&r.value.engagementId===preview.engagementId)
  const previous=versions.at(-1)
  need((input.previousId??null)===(previous?.id??null),'Revise the latest change request',409)
  tx.guard("(SELECT COUNT(*) FROM g_projectScenarios WHERE json_extract(data,'$.changeOrder')=1 AND json_extract(data,'$.engagementId')=?)=?",preview.engagementId,versions.length)
  if(previous)tx.observe('projectScenarios',previous)
  const id=uuid()
  return tx.record('projectScenarios',{...preview,changeOrder:true,rootId:previous?.value.rootId??id,previousId:previous?.id??null,number:versions.length+1,name:text(input.name,'Change request name',200),reason:text(input.reason,'Change request reason'),status:'prepared',reviewStatus:'pending',preparedBy:a.session.operator.id,preparedAt:Date.now(),notice:'Internal change request only; client acceptance and signed evidence pending. No approved budget, date, forecast or billing authority.'},undefined,id,action)
 }
 const row=await get(env,'projectScenarios',text(input.id,'Change request'))
 need(row.value.changeOrder&&row.revision===input.revision&&row.value.status==='prepared','Change request changed or was withdrawn',409)
 const versions=(await all(env,'projectScenarios')).filter(r=>r.value.changeOrder&&r.value.engagementId===row.value.engagementId)
 need(versions.at(-1)?.id===row.id,'A newer change request requires fresh review',409)
 tx.guard("(SELECT COUNT(*) FROM g_projectScenarios WHERE json_extract(data,'$.changeOrder')=1 AND json_extract(data,'$.engagementId')=?)=?",row.value.engagementId,versions.length)
 const reason=text(input.reason,action==='change:review'?'Internal review reason':'Withdrawal reason')
 if(action==='change:withdraw')return tx.record('projectScenarios',{...row.value,status:'withdrawn',withdrawnBy:a.session.operator.id,withdrawnAt:Date.now(),withdrawalReason:reason},row,undefined,action)
 need(row.value.reviewStatus==='pending','This version already has an internal review',409)
 need(row.value.preparedBy!==a.session.operator.id,'Another finance person or owner must review the change request',403)
 need(['approved','declined'].includes(input.outcome),'Choose internal approval or decline')
 // Recompute the entire dated financial basis. A stale review has no side effects.
 const preview=await scopeChangePreview(env,a,{asOf:row.value.asOf,changes:row.value.changes},tx)
 need(preview.fingerprint===row.value.fingerprint,'Change baseline changed; prepare a new version',409)
 return tx.record('projectScenarios',{...row.value,reviewStatus:input.outcome,reviewedBy:a.session.operator.id,reviewedAt:Date.now(),reviewReason:reason},row,undefined,action)
}
