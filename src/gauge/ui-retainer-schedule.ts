import type { Actor } from './store'
import { finance } from './store'
import type { Report } from './ui-describe'
import { form, input, area, choices, escape as e } from './ui-forms'
export function retainerScheduleSection(a:Actor,report:Report,engagementId:string,today:string){
 if(!finance(a))return ''
 const d=report.data,terms=d.retainers.filter(t=>t.value.engagementId===engagementId&&!d.retainers.some(n=>n.value.previousId===t.id))
 return `<section id="retainer-schedules" class="g-card"><h2>Scheduled retainer billing</h2><p>Runs hourly and creates drafts only. Finance reviews, approves and issues each invoice. Enabling is explicit consent; disabling or revoking the configuring finance person stops the next run. Restored schedules require fresh consent.</p>${terms.map(t=>{
  const s=d.retainerSchedules.find(s=>s.value.rootId===t.value.rootId),v=s?.value
  return form('retainer:schedule',t.value.terms.name,`<input type="hidden" name="retainerId" value="${e(t.id)}"><input type="hidden" name="engagementId" value="${e(engagementId)}">`+choices('basis','Contractual billing basis',['advance','arrears'],v?.basis)+input('from','First scheduled period date',v?.from??t.value.terms.start,'date')+`<label><input type="checkbox" name="enabled" ${v?.enabled?'checked':''}> Enable draft scheduling</label>`+input('heldPeriodIds','Disputed overage period IDs (comma separated)',v?.heldPeriodIds.join(',')??'','text',false)+area('reason','Scheduling consent or change reason'),s,'Save billing schedule')+(s?form('retainer:run','Run one due period',input('asOf','Run through date',today,'date'),s,'Run due billing'):'')
 }).join('')}<ul>${d.retainerRuns.filter(r=>r.value.engagementId===engagementId).map(r=>`<li>Due ${e(r.value.issueDate)} · ${r.value.packetId?'<a href="/app/billing">Review draft</a>':'No billable fee'}${r.value.exceptions.map((x:any)=>` · ${e(x.reason)} (${e(x.periodId)})`).join('')}</li>`).join('')}</ul></section>`
}
