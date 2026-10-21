import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, date, uuid } from './model'
import { type Actor, type Transaction, access, get } from './store'

export function acceptedDelivery(value:Value) {
 const d=value.delivery, latest=d?.deliveries?.at(-1), decision=d?.decisions?.at(-1)
 return !!latest && d.currentDeliveryId===latest.id && decision?.deliveryId===latest.id && decision.outcome==='accepted'
}
export async function milestoneDeliveryCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(!['milestone:health','milestone:issue','milestone:dependency','milestone:deliver','milestone:decision'].includes(action))return null
 const row=await get(env,'milestones',text(input.id,'Milestone'))
 need(row.revision===input.revision,'Milestone changed; reload before saving',409)
 const engagement=await access(env,a,row.value.engagementId,true);tx.observe('engagements',engagement)
 // A packet reserves an exact source revision; delivery edits cannot silently rewrite it.
 tx.guard("NOT EXISTS(SELECT 1 FROM g_billing_sources WHERE kind='milestones' AND source_id=?)",row.id)
 need(!await env.DB.prepare("SELECT 1 FROM g_billing_sources WHERE kind='milestones' AND source_id=?").bind(row.id).first(),'Milestone is reserved for billing; cancel the draft or use a linked billing correction',409)
 const d:Value=structuredClone(row.value.delivery??{health:'unknown',issues:[],dependencies:[],deliveries:[],decisions:[],currentDeliveryId:null})
 const at=Date.now(),recordedBy=a.session.operator.id,recordedByName=a.session.operator.displayName
 if(action==='milestone:health') {
  need(['healthy','at-risk','blocked'].includes(input.health),'Choose healthy, at-risk or blocked')
  d.health=input.health;d.healthReason=text(input.reason,'Health reason');d.currentDeliveryId=null
 }
 if(action==='milestone:issue'||action==='milestone:dependency') {
  const isIssue=action==='milestone:issue',items:Value[]=isIssue?d.issues:d.dependencies
  need(items.length<100||input.itemId,'At most 100 items per milestone')
  const old=input.itemId?items.find(item=>item.id===input.itemId):undefined
  need(!input.itemId||old,'Item not found',404)
  const item:Value={id:old?.id??uuid(),name:text(input.name,isIssue?'Issue':'Client dependency',200),status:input.status,updatedAt:at,recordedBy}
  if(isIssue){
   need(['open','resolved'].includes(item.status),'Choose open or resolved')
   const owner=await get(env,'people',text(input.ownerId,'Risk owner'));tx.observe('people',owner)
   item.ownerId=owner.id;item.mitigation=text(input.mitigation,'Mitigation');item.reason=text(input.reason,'Issue update reason')
  }else{
   need(['pending','received'].includes(item.status),'Choose pending or received')
   item.contact=text(input.contact,'Named client contact',200);item.due=date(input.due);item.reason=text(input.reason,'Dependency update reason')
  }
  if(old)items[items.indexOf(old)]=item;else items.push(item)
  d.currentDeliveryId=null
 }
 if(action==='milestone:deliver') {
  need(d.deliveries.length<100,'At most 100 deliveries per milestone')
  const deliveredOn=date(input.date),latest=d.deliveries.at(-1)
  need(!latest||deliveredOn>=latest.date,'Delivery date precedes the previous delivery')
  const delivery={id:uuid(),date:deliveredOn,reason:text(input.reason,'Delivered work'),recordedBy,recordedByName,at,snapshot:{name:row.value.name,amountMinor:row.value.amountMinor,currency:row.value.currency,health:d.health,issues:structuredClone(d.issues),dependencies:structuredClone(d.dependencies)}}
  d.deliveries.push(delivery);d.currentDeliveryId=delivery.id
 }
 if(action==='milestone:decision') {
  const delivery=d.deliveries.at(-1)
  need(delivery&&d.currentDeliveryId===delivery.id,'Deliver the current work before recording a client decision',409)
  need(input.deliveryId===delivery.id,'Delivered work changed; reload the exact delivery',409)
  need(!d.decisions.some((decision:Value)=>decision.deliveryId===delivery.id),'This delivery already has a decision; record a new delivery',409)
  need(['accepted','rejected'].includes(input.outcome),'Choose accepted or rejected')
  const on=date(input.date);need(on>=delivery.date,'Decision date precedes delivery')
  d.decisions.push({deliveryId:delivery.id,outcome:input.outcome,contact:text(input.contact,'Named client contact',200),date:on,reason:text(input.reason,'Client decision reason'),recordedBy,recordedByName,at,notice:`recorded by ${recordedByName}, not confirmed by the client`})
 }
 return tx.record('milestones',{...row.value,delivery:d},row,undefined,action)
}
