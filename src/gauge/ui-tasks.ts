import { phasePicker } from './ui-budget-phases'
import type { Actor } from './store'
import { finance } from './store'
import type { Row, Value } from './model'
import type { Report } from './ui-describe'
import { escape as e, input as i, duration, select as s, choices as c, check, form, table, open } from './ui-forms'
import { hours, chip, nameOf } from './ui-format'
import { taskStates } from './tasks'
import { activeClients } from './ui-clients'

export function taskEditor(a:Actor,report:Report,old?:Row,engagementId?:string) {
 const d=report.data,v=old?.value??{},managed=d.engagements.filter(r=>finance(a)||r.value.leadId===a.personId)
 const fields=s('engagementId','Engagement',managed,v.engagementId??engagementId)+phasePicker(report,v.engagementId??engagementId,v.phaseKey)+i('name','Task name',v.name)
  +s('assigneeId','Assignee',d.people,v.assigneeId,true)+s('parentId','Parent task',d.tasks.filter(t=>t.id!==old?.id&&(!engagementId||t.value.engagementId===engagementId)),v.parentId,true)
  +c('status','Task status',taskStates,v.status??'todo')+c('priority','Priority',['low','normal','high','urgent'],v.priority??'normal')
  +i('from','Start date',v.from??'','date',false)+i('to','Due date',v.to??'','date',false)
  +duration('estimateHours','Estimated effort (hours)',v.estimateSeconds??v.remainingSeconds??0)+duration('remainingHours','Remaining effort (hours)',v.remainingSeconds??0)
  +'<input type="hidden" name="billable" value="false">'+check('billable','Billable task',v.billable??d.engagements.find(t=>t.id===engagementId)?.value.type!=='internal','true')
  +`<label class="g-field g-field--wide"><span>Checklist (one item per line)</span><textarea name="checklist" rows="3">${e((v.checklist??[]).map((item:Value)=>item.label).join('\n'))}</textarea></label>`
  +i('repeatEveryDays','Repeat every calendar days (0 = once)',v.repeatEveryDays??0,'number')+i('repeatUntil','Last recurring start date',v.repeatUntil??'','date',false)
 return form('save:tasks','Task and remaining effort',fields,old)
}
function taskTable(a:Actor,report:Report,title:string,rows:Row[]) {
 const d=report.data
 return table(title,rows,[
  {label:'Task',line:1,cell:r=>`${open('engagements',r,r.value.name)}${r.value.parentId?`<span class="g-sub">Subtask of ${e(nameOf(d.tasks,r.value.parentId))}</span>`:''}`},
  {label:'Assignee / project',line:2,cell:r=>`${e(r.value.assigneeId?nameOf(d.people,r.value.assigneeId):'Unassigned')}<span class="g-sub">${e(nameOf(d.engagements,r.value.engagementId))}</span>`},
  {label:'Status / priority',line:2,cell:r=>`${chip(r.value.status??'todo')} ${e(r.value.priority??'normal')}`},
  {label:'Dates / effort',line:3,cell:r=>`${e(r.value.from??'No start')} → ${e(r.value.to??'No due date')}<span class="g-sub">${hours(r.value.remainingSeconds)} remaining · ${hours(r.value.estimateSeconds??r.value.remainingSeconds)} estimate · ${r.value.billable===false?'Nonbillable':'Billable'}</span>`},
  {label:'Recorded time',line:3,cell:r=>hours(d.time.filter(t=>t.value.taskId===r.id).reduce((n,t)=>n+(t.value.durationSeconds??0),0))},
 ],r=>taskActions(a,report,r))
}
function taskActions(a:Actor,report:Report,r:Row) {
 const d=report.data
  const project=d.engagements.find(p=>p.id===r.value.engagementId),can=finance(a)||(a.role==='lead'&&project?.value.leadId===a.personId)||r.value.assigneeId===a.personId
  const trail=`<a class="g-link" href="/api/gauge/history/tasks/${e(r.id)}">Revision history</a>`
  if(!can)return trail
  const fields=c('status','Task status',taskStates,r.value.status??'todo')+duration('remainingHours','Remaining effort (hours)',r.value.remainingSeconds)
   +`<fieldset class="g-checklist"><legend>Completed checklist items</legend>${(r.value.checklist??[]).map((item:Value)=>check('completedItems',item.label,item.done,item.id)).join('')||'<p>No checklist items.</p>'}</fieldset>`
  return `<details class="g-reveal"><summary class="g-btn g-btn--secondary">Update progress</summary>${form('task:progress','Task progress',fields,r,'Update progress','g-bare')}</details>`+trail
}
function taskBoard(a:Actor,report:Report,rows:Row[]) {
 const d=report.data
 return `<div class="g-pair">${taskStates.map(status=>`<section class="g-card"><h2>${e(status)}</h2>${rows.filter(r=>(r.value.status??'todo')===status).map(r=>`<article class="g-card" id="${e(r.id)}"><h3>${open('engagements',r,r.value.name)}</h3><p class="g-note">${e(r.value.assigneeId?nameOf(d.people,r.value.assigneeId):'Unassigned')} · ${e(nameOf(d.engagements,r.value.engagementId))}</p><p>${chip(status)} ${e(r.value.priority??'normal')}</p>${r.value.parentId?`<p class="g-note">Subtask of ${e(nameOf(d.tasks,r.value.parentId))}</p>`:''}<p class="g-note">${e(r.value.from??'No start')} → ${e(r.value.to??'No due date')}</p><p>${hours(r.value.remainingSeconds)} remaining · ${hours(r.value.estimateSeconds??r.value.remainingSeconds)} estimate · ${r.value.billable===false?'Nonbillable':'Billable'}</p><p>${hours(d.time.filter(t=>t.value.taskId===r.id).reduce((n,t)=>n+(t.value.durationSeconds??0),0))} recorded</p><div class="g-row-actions">${taskActions(a,report,r)}</div></article>`).join('')||'<p class="g-empty">No records yet.</p>'}</section>`).join('')}</div>`
}

export function tasksSection(a:Actor,report:Report,options:Value,engagementId?:string) {
 const d=report.data,view=['list','board','mine'].includes(options.taskView)?options.taskView:'list'
 const client=options.taskClient??'',project=engagementId??options.taskProject??''
 const rows=d.tasks.filter(t=>(!project||t.value.engagementId===project)&&(!client||d.engagements.some(p=>p.id===t.value.engagementId&&p.value.clientId===client))&&(view!=='mine'||t.value.assigneeId===a.personId))
 const filters=`<section class="g-card"><h2>Task views</h2><form class="g-form" method="get" action="/app/engagements">${engagementId?`<input type="hidden" name="edit" value="${e(engagementId)}">`:''}${c('taskView','View',['list','board','mine'],view)}${s('taskClient','Client filter',activeClients(d.clients),client,true)}${s('taskProject','Project filter',d.engagements,project,true)}<div class="g-actions"><button class="g-btn g-btn--secondary">Show tasks</button></div></form><p class="g-note">Mine shows tasks assigned to you. Recorded time includes the work records you may read. Each task's estimate is its own effort; subtask effort is additional. Recurrence creates the next task tree when its root completes, shifting calendar dates and resetting progress.</p></section>`
 const lists=view==='board'?taskBoard(a,report,rows):taskTable(a,report,view==='mine'?'My work':'Tasks',rows)
 return `<div id="delivery-tasks">${filters}${lists}</div>`
}
