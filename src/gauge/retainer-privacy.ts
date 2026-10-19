import { type Actor, finance } from './store'
import { type Value } from './model'

/** Close snapshots contain nested financial/source records: never shallow-redact them. */
export function correctionValue(a:Actor,kind:string,value:Value):Value {
 if(finance(a))return value
 const base={engagementId:value.engagementId,rootId:value.rootId,periodId:value.periodId}
 if(kind==='retainerCloses'){
  const b=value.statement
  // Source details are served through the separately authorized time rows.
  return {...base,closedAt:value.closedAt,statement:{unit:b.unit,currency:b.currency,allowance:b.allowance,rollover:b.rollover,opening:b.opening,consumed:b.consumed,remaining:b.remaining,adjustments:b.adjustments},sources:[]}
 }
 const own=value.sourceId&&value.personId===a.personId
 return {...base,originPeriodId:value.originPeriodId,closeId:value.closeId,kind:value.kind,status:value.status,unit:value.unit,quantity:value.kind==='late'||value.allowanceDelta?value.quantity:0,allowanceDelta:value.allowanceDelta,sourceId:a.role==='lead'||own?value.sourceId:null,sourceRevision:a.role==='lead'||own?value.sourceRevision:null,ruleId:value.ruleId,ruleRevision:value.ruleRevision}
}
export function correctionBalance(a:Actor,b:Value,ownIds:Set<string>):Value {
 if(finance(a))return b
 const result={...b};delete result.fifoState
 result.linkedAdjustments=(b.linkedAdjustments??[]).filter((r:Value)=>b.unit==='hours').map((r:Value)=>({...correctionValue(a,'retainerAdjustments',{...r,personId:ownIds.has(r.sourceId)?a.personId:null}),id:r.id,revision:r.revision}))
 // New close/correction information is hours-only for leads. Their pre-existing commercial
 // value statement remains available, but contains none of the correction records or cash.
 if(a.role==='lead'&&b.unit==='value'){
  delete result.closeId;delete result.closed;delete result.adjustmentIds;result.linkedAdjustments=[];result.adjustments=0;result.projectedAdjustments=0
 }
 return result
}
