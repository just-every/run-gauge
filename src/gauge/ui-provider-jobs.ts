import type { Bindings } from '../auth.server'
import type { Report } from './ui-describe'
import { fieldInputs } from './ui-custom-fields'
import { phasePicker } from './ui-budget-phases'
import type { Actor } from './store'
import { all } from './store'
import { providerRegister } from './provider-custody'
import { providerJobsRegister } from './provider-jobs'
import { escape as e, form, select, input, area, check, decision, table } from './ui-forms'
import { chip } from './ui-format'

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

export async function providerJobsSection(env: Bindings, a: Actor, report:Report, preview?:any): Promise<string> {
 if (a.session.kind !== 'native') return '<section class="g-card"><h2>Provider jobs</h2><p>Sign in through your native email link to manage provider jobs.</p></section>'
 const jobs = await providerJobsRegister(env, a), register = await providerRegister(env, a)
 const projects=new Map((await all(env,'engagements')).map(r=>[r.id,r.value.name])),proposals=new Map((await all(env,'commercialProposals')).map(r=>[r.id,r.value.document.title])),accounts=new Map(register.connections.map(r=>[r.id,r.value.accountLabel])),alertProjects=new Map((await all(env,'budgetAlerts')).map(r=>[r.id,r.value.engagementId]))
 const connections = register.connections.filter(r => r.value.provider === 'crank' && r.value.status === 'connected').map(r => ({...r, value: {...r.value, name: r.value.accountLabel}}))
 const alerts = await all(env, 'budgetAlerts')
 // Each form binds both source identity and revision without accepting a caller-provided payload.
 let body = '<div class="g-titlebar" id="provider-jobs"><h2>Provider jobs</h2></div><p class="g-lede">Queue an exact budget exception for Crank, then explicitly dispatch it. Crank admission creates pending approval or a held event; it does not confirm any downstream action. Signed Zapier/webhook events also require explicit release of one exact source. Uncertain submissions require provider readback and are never retried. Only explicit rate-limit refusals permit up to three owner retries with backoff; cancelling queued work or revoking its connection stops dispatch.</p>'
 if (connections.length && alerts.length) for (const alert of alerts) body += form('providerJob:queue-crank', `Queue budget exception · ${projects.get(alert.value.engagementId)??'Archived engagement'}`, `<p class="g-note">${e(alert.value.metric)} · ${e(alert.value.threshold)}% threshold · alert ${e(alert.id)}</p><input type="hidden" name="alertId" value="${e(alert.id)}"><input type="hidden" name="alertRevision" value="${e(alert.revision)}">` + select('connectionId', 'Crank connection', connections) + input('endpoint', 'Crank HTTPS trigger endpoint', '', 'url'), undefined, 'Queue Crank event', 'g-card--form')
 else body += '<p class="g-empty">Connect Crank and record a budget threshold alert before queueing an event.</p>'
 const hooks=register.connections.filter(r=>['zapier','webhook'].includes(r.value.provider)&&r.value.status==='connected').map(r=>({...r,value:{name:r.value.accountLabel}}))
 if(hooks.length){
  const sources=[]
  for(const kind of ['budgetAlerts','engagements','time','invoices','payments'] as const)for(const row of await all(env,kind))if(kind!=='time'||row.value.status==='approved')sources.push({id:`${kind}:${row.id}:${row.revision}`,revision:row.revision,value:{name:`${kind} · ${row.value.name??row.value.number??row.value.metric??row.id}`}})
  body+=form('providerJob:preview-webhook','Review a signed automation event',select('connectionId','Zapier or webhook connection',hooks)+select('sourceRef','Exact source record',sources),undefined,'Preview signed event','g-card--form')
 }
 if(preview)body+=form(preview.jobId?((jobs.find(j=>j.id===preview.jobId)?.value.exceptionClass==='retry-exhausted')?'providerJob:resume-refused':'providerJob:requeue'):'providerJob:queue-webhook','Release the reviewed signed event',
  `<p class="g-note g-field--wide">${e(preview.accountLabel)} · credential version ${e(preview.credentialVersion)}. This exact payload is released once. Dispatch remains a separate action.</p><label class="g-field g-field--wide"><span>Exact signed payload</span><textarea readonly rows="12" data-webhook-preview>${e(preview.body)}</textarea></label><label class="g-field g-field--wide"><span>Payload digest</span><input readonly value="${e(preview.payloadDigest)}"></label><input type="hidden" name="previewId" value="${e(preview.previewId)}"><input type="hidden" name="sourceRef" value="${e(preview.sourceRef)}"><input type="hidden" name="connectionId" value="${e(preview.connectionId)}">`+
  area('reason','Explicit event release reason')+check('confirm','I reviewed this exact payload and authorize its release.',false,'release-exact-event'),preview.jobId?{id:preview.jobId,revision:preview.jobRevision,value:{}}:undefined,'Queue signed event','g-card--form')
 if(connections.length){
  const sources=[]
  for(const kind of ['engagements','time','invoices','payments'] as const)for(const row of report.data[kind])if(kind!=='time'||row.value.status==='approved')sources.push({id:`${kind}:${row.id}:${row.revision}`,revision:row.revision,value:{name:`${kind} · ${row.value.name??row.value.number??row.id}`}})
  if(sources.length)body+=form('providerJob:queue-crank-source','Release a scoped Crank event',select('connectionId','Crank connection',connections)+select('sourceRef','Exact Crank source record',sources)+input('endpoint','Crank HTTPS trigger endpoint','','url')+area('reason','Explicit Crank event release reason'),undefined,'Queue scoped Crank event','g-card--form')
 }
 body += table('Queued work and outcomes', jobs, [
  {label: 'Job', wrap: true, line: 1, cell: r => `${e(r.value.operation==='trigger:submit'?(r.value.source.kind==='budgetAlerts'?'Budget exception · '+(projects.get(alertProjects.get(r.value.source.id))??'Archived engagement'):r.value.source.kind+' · '+r.value.source.id):r.value.source.kind==='invoiceAccess'?'Invoice document delivery':proposals.get(r.value.source.id)??'Archived proposal')}<span class="g-sub">${e(r.value.operation)} · ${e(r.id)}</span>`},
  {label: 'Queued', size: 'date', line: 2, cell: r => e(when(r.value.createdAt))},
  {label: 'Credential', wrap: true, line: 2, cell: r => `${e(accounts.get(r.value.connectionId)??'Disconnected account')} · version ${e(r.value.credentialVersion)}`},
  {label: 'Outcome', wrap: true, line: 3, cell: r => `${chip(r.value.status)}${r.value.exceptionClass ? `<span class="g-sub">${e(r.value.exceptionClass)}</span>` : ''}${r.value.attempts?`<span class="g-sub">${e(r.value.attempts)} / ${e(r.value.retryLimit??3)} attempts</span>`:''}${r.value.providerRunId ? `<span class="g-sub">Crank admitted run ${e(r.value.providerRunId)} · completion unverified</span>` : ''}${r.value.providerHoldId ? `<span class="g-sub">Crank held event ${e(r.value.providerHoldId)}</span>` : ''}`},
 ], r => r.value.ownerId !== a.session.operator.id ? '' : ['queued','retry-wait'].includes(r.value.status) ? (r.value.nextAttemptAt>Date.now()?`<span>Retry after ${e(when(r.value.nextAttemptAt))}</span>`:decision('providerJob:dispatch', r.value.operation === 'email:send' ? (r.value.source.kind==='invoiceAccess'?'Dispatch invoice email':'Dispatch proposal email') : r.value.provider==='crank'?'Dispatch Crank event':'Dispatch signed event', r))+decision('providerJob:cancel','Cancel queued work',r,true,'quiet') : r.value.status === 'exception' && r.value.exceptionClass === 'credential-rotated' ? (['zapier','webhook'].includes(r.value.provider)?decision('providerJob:preview-webhook','Review current signed payload',r,false,'secondary',`<input type="hidden" name="jobId" value="${e(r.id)}"><input type="hidden" name="jobRevision" value="${e(r.revision)}"><input type="hidden" name="connectionId" value="${e(r.value.connectionId)}"><input type="hidden" name="sourceRef" value="${e(r.value.source.kind+':'+r.value.source.id+':'+r.value.source.revision)}">`):decision('providerJob:requeue', 'Re-queue with current credential', r)) : r.value.status==='exception'&&r.value.exceptionClass==='retry-exhausted'?(['zapier','webhook'].includes(r.value.provider)?decision('providerJob:preview-webhook','Review refused signed payload',r,false,'secondary',`<input type="hidden" name="jobId" value="${e(r.id)}"><input type="hidden" name="jobRevision" value="${e(r.revision)}"><input type="hidden" name="connectionId" value="${e(r.value.connectionId)}"><input type="hidden" name="sourceRef" value="${e(r.value.source.kind+':'+r.value.source.id+':'+r.value.source.revision)}">`):decision('providerJob:resume-refused','Review and resume refused work',r,true,'secondary')):'', 'No provider jobs yet.')
 const receiptKeys=register.connections.filter(c=>c.value.provider==='receipt'&&c.value.status==='connected').map(c=>({...c,value:{name:c.value.accountLabel}}))
 const applied=report.data.providerFollowups
 if(receiptKeys.length)for(const job of jobs.filter(j=>j.value.operation==='trigger:submit'&&j.value.status==='submitted'&&j.value.ownerId===a.session.operator.id&&!applied.some(f=>f.value.jobId===j.id))){
  const source=(report.data as any)[job.value.source.kind]?.find((r:any)=>r.id===job.value.source.id),projectId=job.value.source.kind==='engagements'?source?.id:source?.value.engagementId
  body+=form('providerJob:apply-followup','Review signed workflow task request',`<p class="g-note g-field--wide">Event ${e(job.value.eventId)} · ${e(projects.get(projectId)??'Project source')}. The workflow may request one unassigned, nonbillable task with no planned effort. Imported instructions are text only; nothing is applied until you confirm this exact request. This does not mark the whole external workflow complete.</p>`+select('connectionId','Workflow receipt verification key',receiptKeys)+area('receipt','Workflow receipt JSON')+input('signature','Workflow receipt signature','','password')+phasePicker(report,projectId)+fieldInputs(report,'tasks')+area('reason','Follow-up review reason')+check('confirm','I reviewed this signed task request and authorize this one native follow-up.',false,'apply-exact-followup'),job,'Apply signed follow-up')
 }
 body+=table('Applied workflow follow-ups',applied,[
  {label:'Task',wrap:true,line:1,cell:r=>`<a href="/app/engagements?edit=${e(r.value.engagementId)}">${e(r.value.taskName)}</a>`},
  {label:'Source',wrap:true,line:2,cell:r=>`${e(r.value.source.kind)} · ${e(r.value.source.id)}`},
  {label:'Outcome',wrap:true,line:3,cell:r=>e(r.value.meaning)},
 ],undefined,'No workflow follow-up has been applied.')
 return body
}
