import { customFilterInputs } from './ui-custom-fields'
import type { Bindings } from '../auth.server'
import { type Actor, all, finance } from './store'
import type { Value, Row } from './model'
import type { Report } from './ui-describe'
import { resourceCandidates } from './resource-candidates'
import { escape as e, form, input as i, select as s, duration, check, decision, table } from './ui-forms'
import { hours, nameOf, money, chip, period } from './ui-format'

export async function resourcesSection(env:Bindings,a:Actor,report:Report,options:Value){
 if(!finance(a)&&!['lead','resource-manager'].includes(a.role))return ''
 const selected=report.data.resourceRequests.find(r=>r.id===options.resourceRequest),open=selected?.value.status==='open'?selected:undefined,v=open?.value??{}
 const roster=a.role==='resource-manager'?report.data.people:await all(env,'people'),skills=[...new Set(roster.flatMap(p=>(p.value.skills??[]).map((s:Value)=>s.name as string)))].sort()
 const fields=s('engagementId','Engagement',report.data.engagements.filter(r=>finance(a)||a.role==='resource-manager'||r.value.leadId===a.personId),v.engagementId)
  +i('role','Role needed',v.role)+i('skill','Required skill',v.skill)+i('minProficiency','Minimum proficiency',v.minProficiency??3,'number')
  +i('from','From',v.from??report.from,'date')+i('to','Through',v.to??report.to,'date')+duration('dailyHours','Requested hours per date',v.dailySeconds??14400)
  +i('service','Service',v.service??'Delivery')+i('team','Team filter',v.team??'','text',false)+i('location','Location filter',v.location??'','text',false)
  +s('employmentType','Employment filter',[{id:'employee',revision:'',value:{name:'Employee'}},{id:'contractor',revision:'',value:{name:'Contractor'}}],v.employmentType,true)
  +'<input type="hidden" name="billable" value="false">'+check('billable','Billable request',v.billable??true)
 let body=`<details class="g-records" id="resource-requests" open><summary>Skills and resource requests</summary><p class="g-lede">Create an unfilled role, search qualified people and approve one person. Hours apply to every requested date, including weekends. Candidate availability deducts all committed work and time off; competing project details and leave reasons remain private. Missing calendars prevent approval. Tentative bookings remain separate.</p><p>Skills catalogue: ${skills.length?skills.map(e).join(', '):'Add skills and proficiency to people on Engagements.'}</p>`
 body+=form('save:resourceRequests',open?'Change resource request':'New resource request',fields+customFilterInputs(report,undefined,v.customFilters??{}),open)
 body+=table('Resource requests',report.data.resourceRequests,[
  {label:'Role',line:1,wrap:true,cell:r=>`<a href="/app/capacity?resourceRequest=${e(r.id)}#resource-requests">${e(r.value.role)}</a>`},
  {label:'Engagement',line:1,wrap:true,cell:r=>e(nameOf(report.data.engagements,r.value.engagementId))},
  {label:'Requirement',line:2,wrap:true,cell:r=>`${e(r.value.skill)} · proficiency ${e(r.value.minProficiency)}+ · ${hours(r.value.dailySeconds)} per date · ${e(period(r.value.from,r.value.to))}`},
  {label:'Status',line:3,wrap:true,cell:r=>`${chip(r.value.status)}${r.value.status==='filled'?` · ${e(nameOf(roster,r.value.personId))} · <a href="/app/capacity?edit=${e(r.value.staffingId)}">Named allocation</a>`:''}`},
 ],undefined,'No unfilled roles yet.')
 if(selected?.value.status==='open'){
  const result=await resourceCandidates(env,a,selected)
  const rows:Row[]=result.candidates.map(c=>({id:c.personId,revision:'',value:c}))
  body+=table(`Qualified candidates for ${selected.value.role}`,rows,[
   {label:'Person',line:1,wrap:true,cell:r=>e(r.value.name)},
   {label:'Profile',line:2,wrap:true,cell:r=>e([r.value.profile.role,r.value.profile.team,r.value.profile.location,r.value.profile.employmentType,...r.value.profile.skills.map((s:Value)=>`${s.name}: ${s.proficiency}/5`)].filter(Boolean).join(' · '))},
   {label:'Dated availability',line:3,wrap:true,cell:r=>`<details><summary>${hours(r.value.totalSeconds)} requested; all dates feasible</summary><ul>${r.value.days.map((d:Value)=>`<li>${e(d.date)} · ${hours(d.availableSeconds)} net − ${hours(d.committedSeconds)} committed = ${hours(d.remainingSeconds)} available</li>`).join('')}</ul></details>`},
   ...(finance(a)?[{label:'Declared cost',line:3 as const,wrap:true,cell:(r:Row)=>`<span class="g-brief">Declared cost&nbsp;</span>${money(r.value.costMinor,r.value.currency)}${r.value.missingRateDates.length?` · missing cost dates: ${r.value.missingRateDates.map(e).join(', ')}`:`<details><summary>Effective rates</summary><ul>${r.value.costRates.map((d:Value)=>`<li>${e(d.date)} · ${money(d.costMinor,r.value.currency)}/h · from ${e(d.effective)} · <a href="/api/gauge/history/rates/${e(d.id)}">Rate version</a></li>`).join('')}</ul></details>`}`}]:[]),
  ],r=>decision('resource:fill','Approve and staff',selected,false,'primary',`<input type="hidden" name="personId" value="${e(r.id)}"><input type="hidden" name="fingerprint" value="${e(result.fingerprint)}">`),'No qualified person has enough known daily capacity.')
  if(result.unavailable.length)body+=`<section class="g-card"><h2>Qualified but unavailable</h2><ul>${result.unavailable.map(p=>`<li>${e(p.name)} · ${e(p.reason)}</li>`).join('')}</ul></section>`
 }
 body+=table('Demand without duplicates',report.resourceDemand.map(r=>({id:r.engagementId,revision:'',value:r})),[
  {label:'Engagement',line:1,wrap:true,cell:r=>e(nameOf(report.data.engagements,r.id))},
  {label:'Unfilled roles',line:2,cell:r=>`<span class="g-brief">Unfilled&nbsp;</span>${hours(r.value.unfilledSeconds)}`},
  {label:'Named staffing',line:2,cell:r=>`<span class="g-brief">Named&nbsp;</span>${hours(r.value.staffingSeconds)}`},
  {label:'Total demand',line:3,cell:r=>`<span class="g-brief">Total demand&nbsp;</span>${hours(r.value.totalSeconds)}`},
 ])
 return body+'</details>'
}
