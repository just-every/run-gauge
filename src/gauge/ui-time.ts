// Time and approvals: the manual time (or correction) form, the persistent timer,
// and recorded work with each row's decisions on its exact revision.
import { type Actor, finance } from './store'
import type { Value } from './model'
import { escape as e, input as i, duration, area, select as s, check, form, decision, table, open } from './ui-forms'
import { localValue } from './form-input'
import { hours, day, chip, nameOf } from './ui-format'
import { activeDelegation, reviewSettings } from './time-review'
import { workDate } from './model'
import { timePolicySection, timeReviewSection } from './ui-time-policy'
import { timesheetSection } from './ui-timesheets'
import type { Report } from './ui-describe'

export function timeSection(a: Actor, report: Report, options: Value) {
 const d = report.data, row = d.time.find(r => r.id === options.edit), t = row?.value ?? {}
 const own = finance(a) || t.personId === a.personId, editable = !row || (own && ['draft', 'returned'].includes(t.status))
 const people = finance(a) ? d.people : d.people.filter(p => p.id === a.personId)
 let body = '<div class="g-titlebar"><h1>Time and approvals</h1></div><p class="g-lede">Record actual duration in an explicit work timezone. Approval fixes rates, rounding and the exact revision. Correct an approved entry with a reason before editing it.</p>'
 const zone = t.timezone ?? report.agency.timezone
 // Start and End are wall-clock times in the Work timezone below; the server adds its UTC offset.
 const interval = t.source?.clockInstants === 'not-supplied' ? i('workDate', 'Work date', t.workDate, 'date') + duration('durationHours', 'Actual duration (hours)', t.durationSeconds) : i('startLocal', 'Start', localValue(t.start, zone), 'datetime-local') + i('endLocal', 'End', localValue(t.end, zone), 'datetime-local')
 const forms = []
 if (editable) forms.push(form('time:save', row ? 'Correct time entry' : 'Manual time', s('engagementId', 'Engagement', d.engagements, t.engagementId) + s('personId', 'Person', people, t.personId ?? a.personId) + s('taskId', 'Task', d.tasks, t.taskId) + i('service', 'Service', t.service ?? 'Delivery') + interval + i('timezone', 'Work timezone', zone) + area('notes', 'Work notes', t.notes) + check('billable', 'Billable', t.billable ?? reviewSettings(d.timePolicies[0]).serviceBillability[t.service??'Delivery'] ?? true), row, 'Save', 'g-card--form'))
 forms.push(form('timer:start', 'Start persistent timer', s('engagementId', 'Engagement', d.engagements) + s('personId', 'Person', people, a.personId) + s('taskId', 'Task', d.tasks) + i('service', 'Service', 'Delivery') + i('timezone', 'Work timezone', report.agency.timezone) + area('notes', 'Work notes') + check('billable', 'Billable', reviewSettings(d.timePolicies[0]).serviceBillability.Delivery??true), undefined, 'Save', 'g-card--form'))
 body += timeReviewSection(report) + timesheetSection(a,report,options) + forms.join('')
 // Entries waiting for a decision come first, as on Review.
 const recorded = [...d.time.filter(r => r.value.status === 'submitted'), ...d.time.filter(r => r.value.status !== 'submitted')]
 body += table('Recorded work', recorded, [
  { label: 'Work date', size: 'date', line: 2, cell: r => open('time', r, day(r.value.workDate)) },
  { label: 'Person', size: 'name', line: 1, cell: r => e(nameOf(d.people, r.value.personId)) },
  { label: 'Engagement', line: 1, cell: r => e(nameOf(d.engagements, r.value.engagementId)) },
  { label: 'Task', wrap: true, line: 3, cell: r => `${e(nameOf(d.tasks, r.value.taskId))}${r.value.notes ? `<span class="g-sub">${e(r.value.notes)}</span>` : ''}` },
  { label: 'Duration', num: true, size: 'num', line: 2, cell: r => `${r.value.durationSeconds === null ? 'Timer running' : hours(r.value.durationSeconds)}${r.value.billable ? '' : ' <span class="g-tag">not billable</span>'}` },
  { label: 'Status', wrap: true, size: 'status', line: 2, cell: r => `${chip(r.value.status)}${r.value.reviewNote ? `<span class="g-sub">${e(r.value.reviewNote)}</span>` : ''}` },
 ], r => {
  const self = finance(a) || r.value.personId === a.personId, lead = finance(a) || (a.role === 'lead' && d.engagements.some(x => x.id === r.value.engagementId && x.value.leadId === a.personId)) || d.timeDelegations.some(x=>activeDelegation(x,d.engagements.find(e=>e.id===r.value.engagementId)!,a,workDate(Date.now(),a.timezone),r.value.workDate)); let buttons = ''
  if (self && r.value.start !== null && r.value.end === null) buttons += decision('timer:stop', 'Stop timer', r)
  if (self && r.value.durationSeconds && ['draft', 'returned'].includes(r.value.status)) buttons += decision('time:submit', 'Submit exact revision', r)
  if (lead && r.value.status === 'submitted') buttons += decision('time:approve', 'Approve exact revision', r) + decision('time:return', 'Return for correction', r, true)
  if (lead && r.value.status === 'approved') buttons += decision('time:correct', 'Reopen with audited correction', r, true, 'quiet')
  return buttons + `<a class="g-link" href="/api/gauge/history/time/${e(r.id)}">Review revision history</a>`
 })
 body+=timePolicySection(a,report)
 return body
}
