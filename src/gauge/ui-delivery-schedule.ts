import type { Actor } from './store'
import { finance } from './store'
import type { Row, Value } from './model'
import type { Report } from './ui-describe'
import { escape as e, input as i, area, form, check, weekdayChecks, table } from './ui-forms'
import { nameOf, hours } from './ui-format'

const hidden=(name:string,value:unknown)=>`<input type="hidden" name="${e(name)}" value="${e(value)}">`
const multiple=(name:string,label:string,rows:{id:string,name:string}[],selected:string[]=[],multi=true)=>`<label class="g-field"><span>${e(label)}</span><select name="${e(name)}" aria-label="${e(label)}" ${multi?'multiple':'required'}>${rows.map(r=>`<option value="${e(r.id)}" ${selected.includes(r.id)?'selected':''}>${e(r.name)}</option>`).join('')}</select></label>`
function timeline(schedule:Value) {
 const nodes=schedule.nodes as Value[],start=nodes.map(n=>n.start).sort()[0],end=schedule.finish
 const days=Math.max(1,(Date.parse(end)-Date.parse(start))/86400000+1),x=(day:string)=>280+((Date.parse(day)-Date.parse(start))/86400000)/days*580
 return `<div class="g-delivery-timeline"><svg role="img" aria-label="Gantt timeline. Dark bars are critical; dependency details follow in the table." width="900" height="${nodes.length*38+48}" viewBox="0 0 900 ${nodes.length*38+48}"><text x="280" y="18" font-size="12">${e(start)}</text><text x="780" y="18" font-size="12">${e(end)}</text>${nodes.map((n,index)=>`<text x="8" y="${48+38*index}" font-size="13">${e(n.name.slice(0,33))}</text><rect x="${x(n.start)}" y="${32+38*index}" width="${Math.max(3,x(n.end)-x(n.start)+580/days)}" height="22" fill="currentColor" opacity="${n.critical?'1':'.3'}"/><text x="${x(n.start)+4}" y="${48+38*index}" font-size="11" fill="white">${n.durationDays}d</text>`).join('')}</svg></div>`
}
export function deliveryScheduleSection(a:Actor,report:Report,engagementId:string,options:Value) {
 if(!finance(a)&&a.role!=='lead')return ''
 const engagement=report.data.engagements.find(r=>r.id===engagementId)
 if(!engagement||(!finance(a)&&engagement.value.leadId!==a.personId))return ''
 const plans=report.data.deliveryPlans.filter(r=>r.value.engagementId===engagementId),latest=plans.at(-1),preview=options.deliveryPreview
 const schedule=preview?.schedule??latest?.value.schedule
 let body=`<section id="delivery-schedule" class="g-card"><h2>Dependencies and delivery baselines</h2><p>Finish-to-start dependencies use this project's working weekdays and explicit holidays. Dates are inclusive; a successor starts on the next working day. Linked bookings move by the same calendar-date offset and retain their booked duration. Review client dates and capacity before approval.</p>`
 if(schedule){
  body+=`<h3>${preview?'Proposed baseline':`Approved baseline ${latest!.value.number}`}</h3><p>Project finish ${e(schedule.finish)} · Holidays: ${e(schedule.calendar.holidays.join(', ')||'none declared')}</p>${timeline(schedule)}`
  body+=table('Dependency dates',schedule.nodes.map((n:Value)=>({id:`delivery-node-${n.id}`,revision:'',value:n})),[
   {label:'Work',line:1,cell:r=>`${e(r.value.name)}<span class="g-sub">${e(r.value.kind)}</span>`},
   {label:'Dates',line:2,cell:r=>`${e(r.value.start)} → ${e(r.value.end)}`},
   {label:'Duration',line:2,cell:r=>`${r.value.durationDays} business ${r.value.durationDays===1?'day':'days'}`},
   {label:'Predecessors',line:3,cell:r=>e(r.value.predecessors.map((id:string)=>schedule.nodes.find((n:Value)=>n.id===id)?.name).join(', ')||'None')},
   {label:'Critical path',line:3,cell:r=>r.value.critical?'Critical':`${r.value.slackDays} business ${r.value.slackDays===1?'day':'days'} slack`},
  ])
 }
 if(preview){
  body+=table('Date and commitment effects',preview.changes.map((c:Value)=>({id:c.id,revision:'',value:c})),[
   {label:'Record',line:1,cell:r=>e(r.value.before.name??nameOf(report.data.people,r.value.before.personId))},
   {label:'Kind',line:1,cell:r=>e(r.value.kind)},
   {label:'Before',line:2,cell:r=>e(r.value.before.due??`${r.value.before.from??'unscheduled'} → ${r.value.before.to??'unscheduled'}`)},
   {label:'After',line:3,cell:r=>e(r.value.after.due??`${r.value.after.from} → ${r.value.after.to}`)},
  ],undefined,'No source dates change.')
  body+=`<h3>Staffing capacity after this change</h3>${preview.capacity.map((p:Value)=>`<p>${e(p.name)}: ${p.missingCalendarDays?`${p.missingCalendarDays} ${p.missingCalendarDays===1?'date has':'dates have'} unknown availability. `:''}${p.conflicts.length?p.conflicts.map((c:Value)=>`${e(c.date)}: ${hours(c.seconds)} over capacity`).join('; '):'No known committed conflicts.'}</p>`).join('')||'<p>No linked bookings.</p>'}`
  for(const person of preview.capacity)body+=`<details><summary>Daily capacity: ${e(person.name)}</summary>${table('Capacity effects',person.days.filter((d:Value)=>d.committedDeltaSeconds||d.tentativeSeconds||d.availableSeconds===null||d.remainingSeconds<0).map((d:Value)=>({id:`delivery-capacity-${person.personId}-${d.date}`,revision:'',value:d})),[
   {label:'Date',line:1,cell:r=>e(r.value.date)},
   {label:'Available',line:2,cell:r=>`<span class="g-brief">Available&nbsp;</span>${r.value.availableSeconds===null?'Unknown':hours(r.value.availableSeconds)}`},
   {label:'Committed before → after',line:3,cell:r=>`<span class="g-brief">Committed&nbsp;</span>${hours(r.value.beforeCommittedSeconds)} → ${hours(r.value.committedSeconds)}`},
   {label:'Tentative (separate)',line:3,cell:r=>`<span class="g-brief">Tentative&nbsp;</span>${hours(r.value.tentativeSeconds)}`},
  ],undefined,'No dated capacity changes.')}</details>`
  body+=form('delivery:approve','Approve reviewed baseline',hidden('deliveryInput',JSON.stringify(preview.input))+hidden('fingerprint',preview.fingerprint)+area('reason','Baseline approval reason')+check('acceptEffects','I have reviewed changed client dates, unknown capacity and staffing conflicts'),undefined,'Approve baseline')
  return body+'</section>'
 }
 if(latest)body+=form('delivery:preview','Preview upstream delay',hidden('engagementId',engagementId)+hidden('previousId',latest.id)+hidden('revision',latest.revision)+hidden('operation','delay')+multiple('nodeId','Delayed work',latest.value.schedule.nodes.map((n:Value)=>({id:n.id,name:n.name})),[],false)+i('delayBusinessDays','Delay (business days)',2,'number'),undefined,'Preview delay')
 const sourceRows=[...report.data.tasks.filter(r=>r.value.engagementId===engagementId).map(r=>({row:r,kind:'task'})),...report.data.milestones.filter(r=>r.value.engagementId===engagementId).map(r=>({row:r,kind:'milestone'}))]
 const oldNodes=latest?.value.schedule.nodes??[]
 const phaseId=crypto.randomUUID(),phases=[...oldNodes.filter((n:Value)=>n.kind==='phase'),{id:phaseId,kind:'phase',name:'',start:options.today,durationDays:1,predecessors:[],staffingIds:[]}]
 const nodes=[...sourceRows.map(({row,kind})=>({id:row.id,sourceId:row.id,kind,name:row.value.name,start:row.value.from??row.value.due??options.today,durationDays:1,predecessors:[],staffingIds:[],...oldNodes.find((n:Value)=>n.sourceId===row.id)})),...phases]
 const choices=nodes.map(n=>({id:n.id,name:n.name||'New phase'})),bookings=report.data.staffing.filter(r=>r.value.engagementId===engagementId).map(r=>({id:r.id,name:`${nameOf(report.data.people,r.value.personId)} · ${r.value.from}${r.value.from===r.value.to?'':` → ${r.value.to}`}`}))
 const fields=nodes.map(n=>`<fieldset class="g-checklist g-delivery-node"><legend>${e(n.name||'Add a phase (optional)')}</legend>${hidden('nodeId',n.id)+hidden(`nodeKind:${n.id}`,n.kind)+hidden(`nodeSource:${n.id}`,n.sourceId??'')}${check(`include:${n.id}`,'Include in baseline',!!n.name)}${n.kind==='phase'?i(`nodeName:${n.id}`,'Phase name',n.name,'text',false):hidden(`nodeName:${n.id}`,n.name)}${i(`start:${n.id}`,'Earliest start date',n.start,'date')}${i(`duration:${n.id}`,'Business-day duration',n.durationDays,'number')}${multiple(`predecessors:${n.id}`,'Finish after',choices.filter(c=>c.id!==n.id),n.predecessors)}${multiple(`staffing:${n.id}`,'Move linked bookings',bookings,n.staffingIds)}</fieldset>`).join('')
 body+=`<details class="g-reveal"><summary class="g-btn g-btn--secondary">Plan a new baseline</summary>${form('delivery:preview','Plan dependency dates',hidden('engagementId',engagementId)+hidden('previousId',latest?.id??'')+hidden('operation','baseline')+weekdayChecks(latest?.value.schedule.calendar.weekdays.join(',')??'1,2,3,4,5')+i('deliveryHolidays','Project holidays (comma-separated dates)',latest?.value.schedule.calendar.holidays.join(', ')??'','text',false)+fields,undefined,'Preview baseline')}</details>`
 if(plans.length)body+=`<h3>Immutable baseline history</h3><ul>${plans.map(p=>`<li>Baseline ${p.value.number}: finish ${e(p.value.schedule.finish)} · ${e(p.value.reason)}<details><summary>Inspect baseline ${p.value.number}</summary>${timeline(p.value.schedule)}<ul>${p.value.schedule.nodes.map((n:Value)=>`<li>${e(n.name)}: ${e(n.start)} → ${e(n.end)}</li>`).join('')}</ul></details> <a href="/api/gauge/history/deliveryPlans/${e(p.id)}">Record history</a></li>`).join('')}</ul>`
 return body+'</section>'
}
