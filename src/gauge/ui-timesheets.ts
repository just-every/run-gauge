import type { Actor } from './store'
import { finance } from './store'
import type { Value } from './model'
import type { Report } from './ui-describe'
import { escape as e, input as i, select as s, choices as c, area, check, form } from './ui-forms'
import { hours, day, chip, nameOf } from './ui-format'
const shift=(day:string,n:number)=>new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10)
const hidden=(name:string,value:unknown)=>`<input type="hidden" name="${name}" value="${e(value)}">`

export function timesheetSection(a:Actor,report:Report,options:Value) {
 const d=report.data,people=finance(a)?d.people:d.people.filter(p=>p.id===a.personId)
 const personId=people.find(p=>p.id===options.sheetPerson)?.id??a.personId??people[0]?.id
 const from=report.from,dates=Array.from({length:options.sheetView==='day'?1:7},(_,n)=>shift(from,n))
 const personTime=d.time.filter(t=>t.value.personId===personId),inWindow=personTime.filter(t=>dates.includes(t.value.workDate))
 const recent=personTime.filter(t=>t.value.durationSeconds>0).sort((a,b)=>b.value.workDate.localeCompare(a.value.workDate))
 const seen=new Set<string>(),templates=recent.filter(t=>{const key=[t.value.taskId,t.value.service,t.value.billable,t.value.timezone].join(':');if(seen.has(key))return false;seen.add(key);return true}).slice(0,12)
 const favorites=d.timeFavorites.filter(f=>f.value.personId===personId&&f.value.enabled),favorite=favorites.find(f=>f.id===options.favorite)
 const copied=favorite?.value??templates.find(t=>t.id===options.copyTime)?.value??{},template=templates.map(t=>({...t,value:{name:`${nameOf(d.tasks,t.value.taskId)} · ${t.value.service}`}}))
 const controls=`<section class="g-card"><h2>Daily and weekly timesheet</h2><form class="g-form" method="get" action="/app/time">${c('sheetView','Timesheet view',['week','day'],options.sheetView??'week')}${i('sheetFrom','Period start',from,'date')}${s('sheetPerson','Timesheet person',people,personId)}${s('copyTime','Copy recent task',template,options.copyTime,true)}${s('favorite','Use favorite',favorites,options.favorite,true)}<div class="g-actions"><button class="g-btn g-btn--secondary">Open timesheet</button></div></form><p class="g-note">Copy reuses the task, service, billability and timezone; enter and confirm new clock times. Missing hours use net calendar availability and actual seconds before billing rounding.</p></section>`
 const favoriteEditor=personId&&(a.personId===personId||a.role==='owner')?form('time:favorite','Personal favorite',hidden('personId',personId)+i('name','Favorite name',favorite?.value.name??'')+s('taskId','Task',d.tasks,copied.taskId)+i('service','Service',copied.service??'Delivery')+i('timezone','Work timezone',copied.timezone??report.agency.timezone)+check('billable','Billable',copied.billable??true)+hidden('enabled','false')+check('enabled','Keep this favorite',favorite?.value.enabled??true,'true'),favorite,'Save favorite'):''
 const rows=dates.map(date=>{
  const entries=inWindow.filter(t=>t.value.workDate===date),capacity=report.capacity.find(p=>p.personId===personId)?.days.find(d=>d.date===date)
  const available=capacity?.availableSeconds??null,recorded=entries.reduce((n,t)=>n+(t.value.durationSeconds??0),0)
  const status=['draft','returned','submitted','approved'].map(status=>`${chip(status)} ${hours(entries.filter(t=>t.value.status===status).reduce((n,t)=>n+(t.value.durationSeconds??0),0))}`).join(' · ')
  const fields=hidden('personId',personId)+hidden('gridDate',date)+s('engagementId','Engagement',d.engagements,copied.engagementId)+s('taskId','Task',d.tasks,copied.taskId)+i('service','Service',copied.service??'Delivery')+i('startClock','Start clock time','','time')+i('endClock','End clock time','','time')+i('timezone','Work timezone',copied.timezone??report.agency.timezone)+area('notes','Work notes')+check('billable','Billable',copied.billable??true)
  return `<tr data-work-date="${e(date)}"><td data-label="Day">${e(day(date))}</td><td data-label="Available">${hours(available)}</td><td data-label="Recorded">${hours(recorded)}</td><td data-label="Missing">${hours(available===null?null:Math.max(0,available-recorded))}</td><td data-label="Approval status">${status}${entries.some(t=>t.value.durationSeconds===null)?'<p>Timer running</p>':''}${entries.filter(t=>t.value.status==='returned').map(t=>`<p>${e(t.value.reviewNote)}</p>`).join('')}</td><td><details class="g-reveal"><summary class="g-btn g-btn--secondary">Add interval</summary>${form('time:save',`Work on ${date}`,fields,undefined,'Save interval','g-bare')}</details></td></tr>`
 }).join('')
 const drafts=inWindow.filter(t=>t.value.durationSeconds>0&&['draft','returned'].includes(t.value.status))
 const bulk=drafts.length?form('time:bulk-submit','Submit selected time',drafts.map(t=>check('entries',`${t.value.workDate} · ${nameOf(d.tasks,t.value.taskId)} · ${hours(t.value.durationSeconds)}`,true,JSON.stringify({id:t.id,revision:t.revision}))).join(''),undefined,'Submit selected exact revisions'):'<p class="g-note">No stopped draft or returned entries in this timesheet.</p>'
 return `<div id="timesheet">${controls}<section class="g-card g-card--table"><h2>${e(nameOf(d.people,personId))} · ${options.sheetView==='day'?'Day':'Week'}</h2><div class="g-table"><table><thead><tr><th>Day</th><th>Available</th><th>Recorded</th><th>Missing</th><th>Approval status</th><th>Enter time</th></tr></thead><tbody>${rows}</tbody></table></div></section>${bulk}${favoriteEditor}</div>`
}
