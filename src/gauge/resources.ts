import { phaseFor } from './budget-phases'
import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, integer, date, flag } from './model'
import { type Actor, Transaction, finance, access, get } from './store'
import { resourceCandidates } from './resource-candidates'

export async function resourceCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(!['save:resourceRequests','resource:fill'].includes(action))return null
 need(finance(a)||a.role==='lead','Lead or finance access required',403)
 const previous=input.id?await get(env,'resourceRequests',text(input.id,'Resource request')):undefined
 if(previous){need(previous.revision===input.revision,'Request changed; reload before deciding',409);need(previous.value.status==='open','Request is already filled',409)}
 if(action==='save:resourceRequests'){
  const engagement=await access(env,a,text(input.engagementId,'Engagement'),true);tx.observe('engagements',engagement)
  need(!previous||previous.value.engagementId===engagement.id,'Cannot move a request between engagements')
  const from=date(input.from),to=date(input.to)
  need(to>=from&&Date.parse(to)-Date.parse(from)<=366*86400000,'Choose a request period of up to one year')
  const employmentType=input.employmentType??'';need(['','employee','contractor'].includes(employmentType),'Choose employee, contractor or either')
  const billable=input.billable===undefined?engagement.value.type!=='internal':flag(input.billable)
  need(engagement.value.type!=='internal'||!billable,'Internal requests cannot be billable')
  const phase=await phaseFor(env,tx,engagement.id,input.phaseKey??previous?.value.phaseKey,undefined,input.service)
  return tx.record('resourceRequests',{...(phase?{phaseKey:phase.key}:{}),engagementId:engagement.id,role:text(input.role,'Role needed',200),skill:text(input.skill,'Required skill',100),minProficiency:integer(input.minProficiency,'Minimum proficiency',1,5),from,to,dailySeconds:integer(input.dailySeconds,'Requested seconds per date',1,86400),service:text(input.service,'Service',200),billable,team:input.team?text(input.team,'Team filter',200):'',location:input.location?text(input.location,'Location filter',200):'',employmentType,status:'open',...(previous?.value.opportunityId?{opportunityId:previous.value.opportunityId}:{})},previous)
 }
 need(previous,'Choose an open request')
 const found=await resourceCandidates(env,a,previous,tx)
 need(input.fingerprint===found.fingerprint,'Candidate availability changed; search again before approving',409)
 const candidate=found.candidates.find(c=>c.personId===input.personId)
 need(candidate,'This person does not meet the request or dated availability',409)
 const engagement=await access(env,a,previous.value.engagementId,true),v=previous.value
 const phase=await phaseFor(env,tx,engagement.id,v.phaseKey,undefined,v.service)
 const allocation=await tx.record('staffing',{...(phase?{phaseKey:phase.key}:{}),engagementId:engagement.id,personId:candidate.personId,from:v.from,to:v.to,dailySeconds:v.dailySeconds,commitment:'committed',service:v.service,billable:v.billable,resourceRequestId:previous.id})
 if(!engagement.value.members?.includes(candidate.personId))await tx.record('engagements',{...engagement.value,members:[...(engagement.value.members??[]),candidate.personId]},engagement,undefined,'resource:assign')
 return tx.record('resourceRequests',{...v,status:'filled',personId:candidate.personId,staffingId:allocation.id,staffingRevision:allocation.revision,filledBy:a.session.operator.id,filledAt:Date.now()},previous,undefined,action)
}
