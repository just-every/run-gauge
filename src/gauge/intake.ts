import type { Bindings } from '../auth.server'
import { type Actor, type Transaction, access, all, finance, get } from './store'
import { type Value, type Row, need, text, integer, date, uuid, workDate } from './model'
import { sha256 } from '../modules/import-kit/src/d1/index'
import { escape as e, form, input as i, area, choices } from './ui-forms'

export function normalizeIntake(input:Value){
 const questions=Array.isArray(input.questions)?input.questions:String(input.questions??'').split(/\r?\n/).filter(s=>s.trim())
 need(questions.length>=1&&questions.length<=12,'Use one to twelve required questions')
 return {title:text(input.title,'Intake title',200),questions:questions.map(q=>text(q,'Question',200)),fileLabel:text(input.fileLabel,'Requested file',200),everyDays:integer(input.everyDays??1,'Reminder interval',1,30)}
}
export async function createIntake(tx:Transaction,project:Row,input:Value){
 return tx.record('intakeRequests',{...normalizeIntake(input),engagementId:project.id,clientId:project.value.clientId,due:date(input.due),reminderOn:date(input.reminderOn??input.due),status:'requested',submissions:[],decisions:[],reminders:[],escalations:[],templateId:input.templateId??null,requestedBy:tx.actor.session.operator.id},undefined,undefined,'intake:request')
}
export async function intakeCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Value|null>{
 if(!action.startsWith('intake:'))return null
 if(action==='intake:request'){
  need(!a.clientPortal&&a.session.kind==='native','Native project lead required',403)
  const project=await access(env,a,text(input.engagementId,'Project'),true);tx.observe('engagements',project)
  return createIntake(tx,project,input)
 }
 const row=await get(env,'intakeRequests',text(input.id,'Intake request')),v=row.value
 need(row.revision===input.revision,'Intake changed; reload',409)
 const project=await get(env,'engagements',v.engagementId);tx.observe('engagements',project)
 need(project.value.clientId===v.clientId,'Project client changed; request fresh intake',403)
 if(action==='intake:submit'){
  need(a.clientPortal&&a.role==='client','Only an invited project recipient submits intake',403)
  tx.guard('EXISTS(SELECT 1 FROM g_client_portal_authority WHERE id=? AND engagement_id=?)',a.clientPortal.id,project.id)
  need(v.status!=='accepted','Accepted intake is closed',409)
  const answers=v.questions.map((_:string,n:number)=>String(input.answers?.[n]??'').trim())
  need(answers.every((s:string)=>s.length<=4000),'Each response is limited to 4000 characters')
  const file=input.file instanceof File&&input.file.size?input.file:null,submissionId=uuid()
  let attachment:Value|null=null
  if(file){
   need(file.size<=512*1024,'Use a file up to 512 KiB',413)
   const bytes=new Uint8Array(await file.arrayBuffer()),id=uuid(),digest=sha256(bytes),name=text(file.name,'Filename',200)
   attachment={id,name,size:bytes.length,digest}
   tx.sql('INSERT INTO g_intake_files(id,request_id,submission_id,name,digest,bytes) VALUES(?,?,?,?,?,?)',id,row.id,submissionId,name,digest,bytes)
  }
  return tx.record('intakeRequests',{...v,status:'submitted',submissions:[...v.submissions,{id:submissionId,by:a.session.operator.id,at:Date.now(),answers,file:attachment}]},row,undefined,action)
 }
 need(!a.clientPortal&&a.session.kind==='native','Native project lead required',403)
 await access(env,a,project.id,true)
 if(action==='intake:review'){
  need(v.status==='submitted','Review the latest submitted intake',409)
  const submission=v.submissions.at(-1),outcome=text(input.outcome,'Review decision')
  need(['accepted','rejected'].includes(outcome),'Accept or reject the submission')
  need(outcome!=='accepted'||submission.file&&submission.answers.every((s:string)=>s.length>0),'Required answers and requested file are incomplete',409)
  return tx.record('intakeRequests',{...v,status:outcome,decisions:[...v.decisions,{submissionId:submission.id,outcome,reason:text(input.reason,'Review reason'),by:a.session.operator.id,at:Date.now()}]},row,undefined,action)
 }
 need(v.status!=='accepted','Accepted intake has no outstanding reminders or escalation',409)
 if(action==='intake:remind'){
  const on=date(input.on);need(on>=v.reminderOn,'Reminder is not due yet',409)
  const next=new Date(Date.parse(on+'T00:00:00Z')+v.everyDays*86400000).toISOString().slice(0,10)
  return tx.record('intakeRequests',{...v,reminderOn:next,reminders:[...v.reminders,{on,reason:text(input.reason,'Reminder reason'),by:a.session.operator.id}]},row,undefined,action)
 }
 if(action==='intake:escalate')return tx.record('intakeRequests',{...v,escalations:[...v.escalations,{reason:text(input.reason,'Blocked input reason'),ownerId:project.value.leadId,by:a.session.operator.id,at:Date.now()}]},row,undefined,action)
 need(false,'Unknown intake action')
}
export function intakeProjection(row:Row,a:Actor):Row{
 const v=row.value,own=v.submissions.filter((s:Value)=>!a.clientPortal||s.by===a.session.operator.id)
 return {...row,value:{...v,submissions:own,decisions:v.decisions.filter((d:Value)=>own.some((s:Value)=>s.id===d.submissionId))}}
}
export async function intakeSection(env:Bindings,a:Actor,project:Row){
 const manage=!a.clientPortal&&(finance(a)||a.role==='lead'&&project.value.leadId===a.personId)
 if(!manage&&!a.clientPortal)return ''
 const rows=(await all(env,'intakeRequests')).filter(r=>r.value.engagementId===project.id&&r.value.clientId===project.value.clientId).map(r=>intakeProjection(r,a))
 const today=workDate(Date.now(),a.timezone)
 const editor=manage?`<details><summary>Request client inputs</summary>${form('intake:request','New client intake',`<input type="hidden" name="engagementId" value="${e(project.id)}">`+i('title','Intake title')+area('questions','Required questions, one per line')+i('fileLabel','Requested file')+i('due','Due date',today,'date')+i('reminderOn','First in-app reminder',today,'date')+i('everyDays','Reminder interval in days',1,'number'),undefined,'Request inputs')}</details>`:''
 return `<section id="client-intake" class="g-card"><h2>Client intake</h2><p>Project inputs and in-app reminders. Files download as attachments. Do not submit passwords or authentication keys. No notification is sent.</p>${editor}${rows.map(row=>{
  const v=row.value,last=v.submissions.at(-1),latestDecision=v.decisions.at(-1),open=v.status!=='accepted'
  const history=v.submissions.map((s:Value)=>`<details><summary>Submission · ${e(new Date(s.at).toISOString())}</summary>${v.questions.map((q:string,n:number)=>`<p>${e(q)}: ${e(s.answers[n]||'Missing answer')}</p>`).join('')}${s.file?`<p><a href="/api/gauge/intake-files/${e(s.file.id)}">Download ${e(s.file.name)}</a></p>`:'<p>Requested file missing.</p>'}</details>`).join('')
  const submit=a.clientPortal&&open?`<form method="post" enctype="multipart/form-data" action="/app/client-intake/${e(project.id)}/${e(row.id)}" class="g-form"><input type="hidden" name="key" value="${uuid()}"><input type="hidden" name="revision" value="${e(row.revision)}">${v.questions.map((q:string,n:number)=>area('answer'+n,q,last?.answers[n]??'',false)).join('')}${i('file',v.fileLabel,'','file',false)}<button class="g-btn g-btn--primary">Submit inputs</button></form>`:''
  const review=manage&&v.status==='submitted'?form('intake:review','Review submitted inputs',choices('outcome','Review decision',['rejected','accepted'])+area('reason','Review reason'),row,'Save review'):''
  const reminders=open?`<p role="status">Action due ${e(v.due)} · Next in-app reminder ${e(v.reminderOn)} · every ${e(v.everyDays)} days · ${e(v.status)}</p>`:'<p role="status">Accepted · No outstanding reminders.</p>'
  const controls=manage&&open?`<details><summary>Follow through</summary>${form('intake:remind','Record in-app reminder',i('on','Reminder date',today,'date')+area('reason','Reminder reason'),row,'Record reminder')}${form('intake:escalate','Escalate blocked inputs',area('reason','Blocked input reason'),row,'Escalate to project lead')}</details>`:''
  return `<article data-intake-id="${e(row.id)}"><h3>${e(v.title)}</h3>${reminders}<p>Requested file: ${e(v.fileLabel)}</p>${latestDecision?`<p>${e(latestDecision.outcome)}: ${e(latestDecision.reason)}</p>`:''}${v.escalations.map((x:Value)=>`<p>Blocked · ${e(x.reason)}</p>`).join('')}${history}${submit}${review}${controls}</article>`
 }).join('')||'<p>No inputs requested.</p>'}</section>`
}
