import type { Bindings } from '../auth.server'
import { type Row,type Value,need,text,integer,sum,charge } from './model'
import { type Actor,type Transaction,all,get,finance,access } from './store'
import { assertAdHocTime } from './retainer-eligibility'
import { assertIndependentReview } from './approval-policy'

export const latestBudget=(budgets:Row[],engagementId:string)=>budgets.filter(b=>b.value.engagementId===engagementId&&b.value.status==='approved').reverse().sort((a,b)=>b.value.approvedAt-a.value.approvedAt)[0]
const portion=(time:Row,offset:number,seconds:number)=>{
 const x=time.value.economics,total=x.roundedBillingSeconds??time.value.durationSeconds,regular=total-(x.overtimeSeconds??0)
 const cumulative=(seconds:number)=>{const gross=charge(Math.min(seconds,regular),x.billRateMinor)+charge(Math.max(0,seconds-regular),x.overtimeRateMinor??x.billRateMinor);return gross-Number((BigInt(gross)*BigInt(x.writeDownBps??0)+5000n)/10000n)}
 return cumulative(offset+seconds)-cumulative(offset)
}
const quantity=(time:Row)=>time.value.economics.roundedBillingSeconds??time.value.durationSeconds
export function capBalances(data:Record<string,Row[]>,includeUncapped=false){
 const active=new Set((data.packets??[]).filter(p=>p.value.status!=='cancelled').flatMap(p=>p.value.lines.filter((l:Value)=>l.kind==='timeSlices').map((l:Value)=>l.sourceId)))
 return (data.engagements??[]).flatMap(e=>{
  const budget=latestBudget(data.budgets??[],e.id);if(!budget||(!budget.value.notToExceed&&!includeUncapped))return []
  const reserved=(data.timeSlices??[]).filter(s=>s.value.engagementId===e.id&&active.has(s.id)),downs=(data.capWriteDowns??[]).filter(d=>d.value.engagementId===e.id&&d.value.status==='approved')
  let room=budget.value.notToExceed?Math.max(0,budget.value.amountMinor-sum(reserved.map(s=>s.value.amountMinor))):Number.MAX_SAFE_INTEGER
  const full=new Set((data.packets??[]).filter(p=>p.value.status!=='cancelled').flatMap(p=>p.value.lines.filter((l:Value)=>l.kind==='time').map((l:Value)=>l.sourceId)))
  const entries=(data.time??[]).filter(t=>t.value.engagementId===e.id&&!full.has(t.id)&&t.value.status==='approved'&&t.value.billable&&t.value.economics?.mode==='hourly'&&!t.value.source?.billed).sort((a,b)=>a.value.workDate.localeCompare(b.value.workDate)||(a.value.start??0)-(b.value.start??0)||a.id.localeCompare(b.id))
  const rows=entries.flatMap(t=>{
   const allocated=reserved.filter(s=>s.value.sourceId===t.id),written=downs.filter(d=>d.value.sourceId===t.id)
   const ranges=[...allocated,...written].map(s=>({from:s.value.offsetSeconds,to:s.value.offsetSeconds+s.value.durationSeconds})).sort((a,b)=>a.from-b.from)
   const gaps:{from:number;to:number}[]=[];let cursor=0
   for(const range of ranges){need(range.from>=cursor,'Capped billing ranges overlap',409);if(range.from>cursor)gaps.push({from:cursor,to:range.from});cursor=range.to}
   if(cursor<quantity(t))gaps.push({from:cursor,to:quantity(t)})
   return gaps.map(gap=>{const offset=gap.from,available=gap.to-gap.from,rate=t.value.economics?.billRateMinor
   if(rate==null)return {sourceId:t.id,revision:t.revision,workDate:t.value.workDate,offsetSeconds:offset,availableSeconds:available,eligibleSeconds:0,eligibleMinor:null,heldSeconds:available,heldMinor:null,reason:'Approved bill rate is unknown'}
   let low=0,high=available
   while(low<high){const mid=Math.ceil((low+high)/2);if(portion(t,offset,mid)<=room)low=mid;else high=mid-1}
   const amount=portion(t,offset,low);room-=amount
   return {sourceId:t.id,revision:t.revision,workDate:t.value.workDate,offsetSeconds:offset,availableSeconds:available,eligibleSeconds:low,eligibleMinor:amount,heldSeconds:available-low,heldMinor:portion(t,offset+low,available-low),reason:low<available?'Held as over-cap':null}
   })
  })
  return [{engagementId:e.id,budgetId:budget.id,budgetRevision:budget.revision,currency:e.value.currency,notToExceed:!!budget.value.notToExceed,capMinor:budget.value.amountMinor,reservedMinor:sum(reserved.map(s=>s.value.amountMinor)),writtenDownMinor:sum(downs.map(d=>d.value.amountMinor)),remainingMinor:room,rows}]
 })
}
async function observedCaps(env:Bindings,tx:Transaction){
 const kinds=['engagements','budgets','time','timeSlices','capWriteDowns','packets'] as const
 const data=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<string,Row[]>
 for(const kind of kinds){for(const r of data[kind])tx.observe(kind,r);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,data[kind].length)}
 return data
}
export async function assertUncappedTime(env:Bindings,tx:Transaction,time:Row){
 const slices="SELECT 1 FROM g_timeSlices s JOIN g_billing_sources b ON b.kind='timeSlices' AND b.source_id=s.id WHERE json_extract(s.data,'$.sourceId')=?"
 need(!await env.DB.prepare(slices).bind(time.id).first(),'This time has reserved portions; bill only its remaining seconds',409);tx.guard(`NOT EXISTS(${slices})`,time.id)
 const budgets=await all(env,'budgets'),budget=latestBudget(budgets,time.value.engagementId)
 tx.guard('(SELECT COUNT(*) FROM g_budgets)=?',budgets.length);if(budget)tx.observe('budgets',budget)
 need(!budget?.value.notToExceed,'This engagement has a not-to-exceed cap; use the capped billing draft to preserve held excess',409)
}
export async function capCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(!['cap:draft','cap:write-down','cap:write-down-approve','packet:partial'].includes(action))return null
 need(finance(a),'Finance access required',403)
 const data=await observedCaps(env,tx)
 if(action==='cap:write-down-approve'){
  const row=await get(env,'capWriteDowns',text(input.id,'Prepared write-down'))
  need(row.revision===input.revision&&row.value.status==='prepared','Review the exact prepared write-down',409)
  const current=capBalances(data).find(c=>c.engagementId===row.value.engagementId)?.rows.find(r=>r.sourceId===row.value.sourceId)
  need(current&&current.revision===row.value.sourceRevision&&current.offsetSeconds===row.value.offsetSeconds&&current.heldSeconds>=row.value.durationSeconds&&current.eligibleSeconds===0,'Cap eligibility changed; prepare a fresh write-down after drafting eligible work',409)
  await assertIndependentReview(env,a,tx,{createdBy:row.value.createdBy,amountMinor:row.value.amountMinor,currency:row.value.currency})
  return tx.record('capWriteDowns',{...row.value,status:'approved',approvedBy:a.session.operator.id,approvedAt:Date.now()},row)
 }
 const e=await access(env,a,text(input.engagementId,'Engagement')),balance=capBalances(data,action==='packet:partial').find(c=>c.engagementId===e.id)
 need(balance,'Approve billing terms first',409)
 if(action==='packet:partial'){need(!balance.notToExceed,'Use the capped billing draft for not-to-exceed work',409);need(input.sourceRevision===data.time.find(t=>t.id===input.sourceId)?.revision,'Review the exact approved time revision',409)}
 if(action==='cap:write-down'){
  const row=balance.rows.find(r=>r.sourceId===input.sourceId&&(input.offsetSeconds===undefined||r.offsetSeconds===Number(input.offsetSeconds))),time=data.time.find(t=>t.id===input.sourceId)
  need(row&&time&&time.revision===input.sourceRevision,'Choose the exact approved time revision',409)
  need(row.eligibleSeconds===0,'Draft the in-cap portion before writing down the held remainder',409)
  const durationSeconds=integer(input.durationSeconds,'Held seconds to write down',1,row.heldSeconds)
  return tx.record('capWriteDowns',{engagementId:e.id,sourceId:time.id,sourceRevision:time.revision,sourceSnapshot:time,currency:balance.currency,offsetSeconds:row.offsetSeconds,durationSeconds,amountMinor:portion(time,row.offsetSeconds,durationSeconds),status:'prepared',createdBy:a.session.operator.id,createdAt:Date.now(),reason:text(input.reason,'Write-down reason')})
 }
 need(balance.budgetId===input.budgetId&&balance.budgetRevision===input.budgetRevision,'Budget changed; review the cap again',409)
 const lines:Value[]=[]
 for(const row of balance.rows.filter(r=>r.eligibleSeconds>0&&(action!=='packet:partial'||r.sourceId===input.sourceId)).slice(0,action==='packet:partial'?1:undefined)){
  if(action==='packet:partial'){need(lines.length===0,'Select the first unreserved time range',409);row.eligibleSeconds=integer(input.durationSeconds,'Seconds to bill',1,row.availableSeconds)}
  const time=data.time.find(t=>t.id===row.sourceId)!
  await assertAdHocTime(env,tx,time.value)
  if(action==='packet:partial')row.eligibleMinor=portion(time,row.offsetSeconds,row.eligibleSeconds)
  need(lines.length<100,'Draft at most 100 eligible entries at a time',409)
  const slice=await tx.record('timeSlices',{engagementId:e.id,sourceId:time.id,sourceRevision:time.revision,sourceSnapshot:time,budgetId:balance.budgetId,budgetRevision:balance.budgetRevision,currency:balance.currency,offsetSeconds:row.offsetSeconds,durationSeconds:row.eligibleSeconds,amountMinor:row.eligibleMinor,billRateMinor:time.value.economics.billRateMinor,date:time.value.workDate,name:time.value.notes,status:'approved',phaseKey:time.value.phaseKey??null})
  lines.push({kind:'timeSlices',sourceId:slice.id,sourceRevision:slice.revision,description:time.value.notes,amountMinor:row.eligibleMinor,currency:balance.currency,durationSeconds:row.eligibleSeconds,billRateMinor:slice.value.billRateMinor,roundedBillingSeconds:row.eligibleSeconds,roundingSeconds:1,roundingPolicy:'Difference of cumulative half-up second values',rateId:time.value.economics.rateId,budgetId:balance.budgetId,originalTimeId:time.id,originalTimeRevision:time.revision,offsetSeconds:row.offsetSeconds,phaseKey:time.value.phaseKey??null})
 }
 need(lines.length>0,'No selected unreserved work is eligible; capped excess remains held',409)
 const packet=await tx.record('packets',{engagementId:e.id,title:text(input.title,'Packet title'),status:'draft',currency:balance.currency,lines,totalMinor:sum(lines.map(l=>l.amountMinor)),createdAt:Date.now(),createdBy:a.session.operator.id,...(balance.notToExceed?{notToExceed:balance.capMinor}:{partialTime:true})})
 for(const line of lines)tx.sql('INSERT INTO g_billing_sources(kind,source_id,packet_id,source_revision) VALUES(?,?,?,?)',line.kind,line.sourceId,packet.id,line.sourceRevision)
 return packet
}
