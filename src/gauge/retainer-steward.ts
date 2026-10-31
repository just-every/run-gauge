import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, need, sum } from './model'
import { type Actor, all, fence, finance } from './store'
import { retainerConsumption } from './retainer-consumption'
import { retainerCandidates, retainerSourceMatches } from './retainer-sources'

const inputKinds:Kind[]=['engagements','retainers','retainerPeriods','time','timeSlices','retainerCloses','retainerAdjustments','retainerSchedules','retainerCharges','retainerRuns','packets']

async function inputs(env:Bindings,engagementId:string) {
 const groups=await Promise.all(inputKinds.map(async kind=>[kind,(await all(env,kind)).filter(r=>kind==='engagements'?r.id===engagementId:r.value.engagementId===engagementId||kind==='packets'&&r.value.lines?.some((l:Value)=>l.engagementId===engagementId)).sort((a,b)=>a.id.localeCompare(b.id))] as const))
 const data=Object.fromEntries(groups) as Record<Kind,Row[]>
 const ids=new Set(groups.flatMap(([,rows])=>rows.map(r=>r.id)))
 const reservations=(await env.DB.prepare('SELECT kind,source_id,source_revision,packet_id FROM g_billing_sources ORDER BY kind,source_id').all<{kind:string;source_id:string;source_revision:string;packet_id:string}>()).results.filter(r=>ids.has(r.source_id)||ids.has(r.packet_id))
 return {data,reservations}
}
const fingerprint=(snapshot:Awaited<ReturnType<typeof inputs>>)=>sha256(canonicalJson(snapshot))

/** Human inspection only. No transaction, command, retained preview or provider call. */
export async function retainerReadiness(env:Bindings,a:Actor,input:Value) {
 need(a.session.kind==='native'&&finance(a),'Retainer readiness requires a native owner or finance session',403)
 await fence(env,a)
 const engagementId=String(input.engagementId??''),snapshot=await inputs(env,engagementId),{data,reservations}=snapshot
 need(data.engagements.length,'Engagement unavailable',403)
 const period=data.retainerPeriods.find(p=>p.id===input.periodId)
 need(period,'Choose a saved period in this engagement',404)
 const stamp=fingerprint(snapshot)
 if(input.fingerprint)need(input.fingerprint===stamp,'Retainer sources changed; refresh the readiness preview',409)
 const term=data.retainers.find(t=>t.id===period.value.retainerId)!
 const balances=retainerConsumption(data),posted=balances.find(b=>b.periodId===period.id)!
 const priorIds=new Set([...posted.priorPeriodIds,period.id])
 const related=data.retainerPeriods.filter(p=>priorIds.has(p.id))
 const relevant=data.time.filter(t=>(!t.value.retainerRootId||t.value.retainerRootId===period.value.rootId)&&related.some(p=>retainerCandidates(data,t.value).some(c=>c.id===p.id)))
 const pending=relevant.filter(t=>t.value.status!=='approved'&&t.value.durationSeconds>0)
 // Pending value is deliberately unknown until ordinary approval freezes its economics.
 const projected=retainerConsumption({...data,time:data.time.map(t=>pending.some(p=>p.id===t.id)?{...t,value:{...t.value,status:'approved',economics:undefined}}:t)}).find(b=>b.periodId===period.id)!
 const ambiguous=relevant.filter(t=>!t.value.retainerRootId&&retainerCandidates(data,t.value).length>1)
 const matchedPending=pending.filter(t=>retainerSourceMatches(data,period,t))
 const used=new Set(related.flatMap(p=>balances.find(b=>b.periodId===p.id)?.sources??[]))
 const relevantReservations=reservations.filter(r=>priorIds.has(r.source_id)||used.has(r.source_id)||data.timeSlices.some(s=>s.id===r.source_id&&used.has(s.value.sourceId)))
 const periodReservation=relevantReservations.find(r=>r.kind==='retainerPeriods'&&r.source_id===period.id)
 const blockers:string[]=[]
 if(posted.closed)blockers.push('Closed statement: use the ordinary linked correction review.')
 if(ambiguous.length)blockers.push('Ambiguous source allocation: choose one eligible retainer family before a monetary candidate can be offered.')
 if(posted.consumed===null||projected.consumed===null)blockers.push('Unknown value inputs: ordinary time approval must freeze known prices; an incomplete value cannot become a monetary candidate.')
 if(posted.overagePolicy!=='bill')blockers.push('Overage is held by the agreed rules; this preview cannot grant billing consent or change promises.')
 if(data.retainerAdjustments.some(r=>r.value.rootId===period.value.rootId&&r.value.status==='prepared'&&priorIds.has(r.value.periodId)))blockers.push('Prepared adjustment requires ordinary finance review; it is excluded from both figures.')
 if(relevant.some(t=>used.has(t.id)&&t.value.source?.billed))blockers.push('Historically billed work cannot produce another charge.')
 if(relevantReservations.length)blockers.push('Existing source reservation: inspect the ordinary billing packet; no duplicate billing candidate is offered.')
 const postedMinor=ambiguous.length?null:posted.overageMinor
 const provisionalMinor=ambiguous.length?null:projected.overageMinor
 const decisions=pending.map(t=>({kind:t.value.status==='submitted'?'reviewer':'worker',id:t.id,revision:t.revision,status:t.value.status,href:t.value.status==='submitted'?'/app/review#'+encodeURIComponent(t.id):'/app/time?edit='+encodeURIComponent(t.id),required:t.value.status==='submitted'?'Ordinary reviewer approval is missing':'Worker confirmation and submission are missing'}))
 const work=relevant.map(t=>({id:t.id,revision:t.revision,status:t.value.status,href:'/app/time?edit='+encodeURIComponent(t.id)}))
 const sources=inputKinds.flatMap(kind=>data[kind].map(r=>({kind,id:r.id,revision:r.revision})))
 const result={engagementId,periodId:period.id,fingerprint:stamp,term:{id:term.id,revision:term.revision,name:term.value.terms.name,rules:term.value.terms.rules},period:{id:period.id,revision:period.revision,from:period.value.activeStart,to:period.value.activeEnd},currency:posted.currency,unit:posted.unit,
  figures:{included:posted.allowance,carryOver:posted.rollover,adjustments:posted.adjustments,opening:posted.opening,postedConsumption:posted.consumed,pendingSeconds:sum(matchedPending.map(t=>t.value.durationSeconds)),postedOverage:postedMinor,provisionalOverage:provisionalMinor},
  status:blockers.length?'blocked':decisions.length?'decisions-missing':'reviewable',blockers,decisions,ambiguous:ambiguous.map(t=>({id:t.id,revision:t.revision,href:'/app/engagements?edit='+encodeURIComponent(engagementId)+'#retainers'})),
  candidate:blockers.length||decisions.length||!(postedMinor>0)?null:{kind:'retainerPeriods',sourceId:period.id,sourceRevision:period.revision,amountMinor:postedMinor,href:'/app/engagements?edit='+encodeURIComponent(engagementId)+'#retainers'},
  reservations:relevantReservations.map(r=>({...r,href:'/app/billing#'+encodeURIComponent(r.packet_id)})),reservedPacket:periodReservation?.packet_id??null,sources,work,pricingHref:'/app/rates',termsHref:'/app/engagements?edit='+encodeURIComponent(engagementId)+'#retainers',
  limits:['Client overage decision is missing: no verified client decision is established by this preview.','Preview grants no consent, changes no promise, approval or monetary record, closes no case and sends nothing.','Provisional overage includes stopped pending work but excludes prepared adjustments; it is not a bill, invoice or payment.']}
 need(stamp===fingerprint(await inputs(env,engagementId)),'Retainer sources changed during preview; refresh',409)
 await fence(env,a)
 return result
}
export type RetainerReadiness=Awaited<ReturnType<typeof retainerReadiness>>
