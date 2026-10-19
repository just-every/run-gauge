import { type Actor, finance } from './store'
import { reviewSettings } from './time-review'
import type { Report } from './ui-describe'
import { escape as e, input as i, duration, area, choices as c, select as s, check, form, decision } from './ui-forms'
import { nameOf } from './ui-format'

export function timePolicySection(a:Actor,report:Report) {
 const d=report.data,policy=d.timePolicies[0],v=reviewSettings(policy)
 const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
 const defaults=Object.entries(v.serviceBillability).map(([service,billable])=>`${service} | ${billable?'billable':'nonbillable'}`).join('\n')
 const fields=i('lockThrough','Locked through (blank reopens all)',policy?.value.lockThrough??'','date',false)+s('dueWeekday','Weekly due weekday',weekdays.map((name,id)=>({id:String(id),revision:'',value:{name}})),String(v.dueWeekday))+i('dueTime','Weekly due time',v.dueTime,'time')+i('minimumNotes','Minimum note characters',v.minimumNotes,'number')+duration('maxEntryHours','Maximum hours per entry',v.maxEntrySeconds)+duration('maxDayHours','Maximum hours per day',v.maxDaySeconds)+c('reviewLevels','Review levels (lead, then finance)',['1','2'],String(v.reviewLevels))+check('separation','Require separation: nobody approves their own time',v.separation)+`<label class="g-field g-field--wide"><span>Service defaults (one Service | billable or nonbillable per line)</span><textarea name="serviceDefaults" rows="3">${e(defaults)}</textarea></label>`+area('reason','Policy change or reopening reason')
 let body=`<section class="g-card" id="timesheet-policy"><h2>Timesheet policy</h2><p>${policy?.value.lockThrough?`Locked through ${e(policy.value.lockThrough)} (inclusive).`:'No period is locked.'} Weekly submissions are due the following week on ${e(weekdays[v.dueWeekday])} at ${e(v.dueTime)} · ${e(report.agency.timezone)}.</p><p>Notes: ${e(v.minimumNotes)} characters minimum. Entry: ${v.maxEntrySeconds/3600} h; day: ${v.maxDaySeconds/3600} h maximum. ${v.reviewLevels} review level(s). ${v.separation?'Self-approval refused.':'Self-approval permitted.'} Service defaults may be overridden when recording actual work.</p>${policy?`<p>${e(policy.value.reason)}</p>`:''}</section>`
 if(finance(a))body+=form('time:policy','Set timesheet policy',fields,policy,'Save policy')
 if(a.role==='lead')body+=form('time:delegate','Delegate timesheet review',s('engagementId','Engagement',d.engagements.filter(r=>r.value.leadId===a.personId))+s('delegateId','Delegate (active lead or finance)',report.timeReviewers.filter(r=>r.id!==a.personId))+i('from','From','', 'date')+i('to','Through','', 'date')+area('reason','Delegation reason'),undefined,'Delegate review')
 if(d.timeDelegations.length)body+=`<section class="g-card"><h2>Dated review delegations</h2><p>Inclusive dates cover both the review day and the work date. Only time review is delegated.</p><ul>${d.timeDelegations.map(r=>`<li>${e(nameOf(d.engagements,r.value.engagementId))} · ${e(nameOf(d.people,r.value.delegateId))} · ${e(r.value.from)} through ${e(r.value.to)} · ${r.value.revokedAt?'revoked':e(r.value.reason)}${a.role==='lead'&&r.value.leadId===a.personId&&!r.value.revokedAt?decision('time:revoke-delegate','Revoke delegation',r,true):''}</li>`).join('')}</ul></section>`
 return body
}
export function timeReviewSection(report:Report) {
 if(!report.timeReview.length)return ''
 return `<section class="g-card" id="time-review-queue"><h2>Timesheet policy and reviewer queue</h2><ul class="g-exceptions">${report.timeReview.map(q=>{
  const r=report.data.time.find(t=>t.id===q.id)!
  return `<li><a href="/app/time?edit=${e(q.id)}#${e(q.id)}">${e(nameOf(report.data.people,r.value.personId))} · ${e(nameOf(report.data.tasks,r.value.taskId))} · ${e(r.value.workDate)}</a><span>${q.flags.length?e(q.flags.join('; ')):'Policy checks pass'} · Due ${e(q.dueLocal.replace('T',' '))} ${e(report.agency.timezone)}${q.overdue?' · overdue':''}${q.ageDays===null?'':` · awaiting review ${q.ageDays} whole agency-calendar day(s)`} · ${q.completedLevels}/${q.reviewLevels} reviews</span></li>`
 }).join('')}</ul></section>`
}
