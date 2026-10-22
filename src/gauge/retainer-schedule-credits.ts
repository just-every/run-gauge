import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text } from './model'
import { type Transaction, all } from './store'

export const creditConfirmation='apply-unexecuted-adjustments-as-invoice-credits'
/** Existing external adjustments never imply a native credit. Finance must select exact
 * approved revisions and explicitly attest that their cash effect has not been executed elsewhere. */
export async function scheduledCreditConsent(env:Bindings,tx:Transaction,input:Value,term:Row){
 const ids=Array.isArray(input.creditAdjustmentIds)?input.creditAdjustmentIds:String(input.creditAdjustmentIds??'').split(',').map(s=>s.trim()).filter(Boolean)
 need(ids.length<=50&&new Set(ids).size===ids.length,'Choose each adjustment once, at most 50')
 if(!ids.length)return []
 need(input.creditConfirmation===creditConfirmation,'Confirm these adjustments have not already been executed externally before applying native invoice credits')
 const rows=await all(env,'retainerAdjustments')
 return ids.map(id=>{const row=rows.find(r=>r.id===text(id,'Credit adjustment'));need(row&&row.value.rootId===term.value.rootId&&row.value.status==='approved'&&row.value.cashDeltaMinor<0&&row.value.currency===term.value.terms.currency,'Choose an approved credit adjustment in this retainer and currency');tx.observe('retainerAdjustments',row);return {id:row.id,revision:row.revision,amountMinor:row.value.cashDeltaMinor}})
}
export async function scheduledCreditLines(env:Bindings,tx:Transaction,schedule:Row,adjustments:Row[],period:Row,issueDate:string){
 const lines:Value[]=[],exceptions:Value[]=[]
 for(const consent of schedule.value.creditAdjustments??[]){
  const row=adjustments.find(r=>r.id===consent.id)
  if(!row||row.revision!==consent.revision||row.value.status!=='approved'||row.value.cashDeltaMinor!==consent.amountMinor){exceptions.push({periodId:period.id,reason:'Selected credit adjustment changed; finance must renew its explicit consent'});continue}
  if(row.value.periodId!==period.id){
   // Carry a credit forward only after its original destination period starts.
   const destination=await env.DB.prepare('SELECT data FROM g_retainerPeriods WHERE id=?').bind(row.value.periodId).first<{data:string}>()
   if(!destination||JSON.parse(destination.data).activeStart>issueDate)continue
  }
  if(await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='retainerAdjustments' AND source_id=?").bind(row.id).first())continue
  tx.observe('retainerAdjustments',row)
  lines.push({kind:'retainerAdjustments',sourceId:row.id,sourceRevision:row.revision,description:`Explicitly applied ${row.value.kind} credit: ${row.value.reason}`,amountMinor:row.value.cashDeltaMinor,currency:row.value.currency,durationSeconds:null,billRateMinor:null,rateId:row.value.ruleId,budgetId:null,sourceDate:issueDate,creditConsent:{scheduleId:schedule.id,scheduleRevision:schedule.revision,operatorId:schedule.value.configuredBy,reason:schedule.value.reason,confirmation:creditConfirmation},roundingPolicy:'Exact approved adjustment cents; finance confirms no prior external execution'})
 }
 return {lines,exceptions}
}
