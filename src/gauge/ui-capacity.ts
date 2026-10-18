// Staffing (owner's pick J): the serif title with the board's period controls, the five-week board beside the agent's
// staffing alternatives, the worklog, and below them the calendar, leave and allocation forms and records that feed it.
import type { Bindings } from '../auth.server'
import { type Actor, finance, all } from './store'
import type { Value } from './model'
import { escape as e, input as i, duration, weekdayChecks, select as s, choices as c, form, table, open } from './ui-forms'
import { hours, period, weekdays, chip, nameOf } from './ui-format'
import type { Report } from './ui-describe'
import { columns, lanes, board, mondayOf, shift } from './ui-board'
import { recoveryPanel, worklog } from './ui-recovery'

export async function capacitySection(env: Bindings, a: Actor, report: Report, options: Value) {
 const d = report.data, today: string = options.today, zone: string = options.zone, weeks = options.view === 'weeks', monday = report.from
 const link = (from: string, view = weeks) => `/app/capacity?from=${from}${view ? '&view=weeks' : ''}`
 const tools = `<nav class="g-board-tools" aria-label="Board period"><a class="g-btn g-btn--secondary g-btn--icon" href="${link(shift(monday, -7))}" aria-label="Previous week"><span aria-hidden="true">‹</span></a><a class="g-btn g-btn--secondary" href="${link(mondayOf(today))}"${monday === mondayOf(today) ? ' aria-current="date"' : ''}>Today</a><a class="g-btn g-btn--secondary g-btn--icon" href="${link(shift(monday, 7))}" aria-label="Next week"><span aria-hidden="true">›</span></a>`
  + `<span class="g-segmented"><a href="${link(monday, false)}"${weeks ? '' : ' aria-current="true"'}>Week</a><a href="${link(monday, true)}"${weeks ? ' aria-current="true"' : ''}>5 weeks</a></span></nav>`
 const legend = '<ul class="g-legend" role="list"><li><span class="g-key g-key--booking"></span>Committed</li><li><span class="g-key g-key--tentative"></span>Tentative</li><li><span class="g-key g-key--option"></span>Proposed</li><li><span class="g-key g-key--leave"></span>Leave</li></ul>'
 let body = `<div class="g-titlebar"><h1>Staffing</h1>${tools}${legend}</div>`
 const proposal = d.proposals.filter(p => p.value.kind === 'staffing' && p.value.status === 'proposed').sort((x, y) => y.value.preparedAt - x.value.preparedAt)[0]
 // Client tints follow the order clients were added, so a client keeps its colour for every viewer.
 const order = (await all(env, 'clients')).map(r => r.id), tintOf = (id: string) => order.includes(id) ? order.indexOf(id) % 6 + 1 : 0
 const cols = columns(monday, weeks), rows = lanes(report, cols, tintOf, { proposal })
 const week = [0, 1, 2, 3, 4, 5, 6].map(n => shift(monday, n))
 const grid = rows.length ? board(report, cols, rows, today) : '<div class="g-card g-empty-state"><img src="/brand/mark.svg" alt="" width="40" height="40"><h2>No people yet.</h2><p>Add people and their working calendars to see who is booked, who is free and who is out.</p>' + (finance(a) ? '<p><a class="g-btn g-btn--primary" href="/app/engagements">Add people on Engagements</a></p>' : '') + '</div>'
 body += `<div class="g-workspace"><section class="g-board-wrap" aria-label="Staffing board">${grid}</section>${await recoveryPanel(env, a, report, zone, today)}</div>${await worklog(env, report, zone, today, week)}`

 const calendar = d.calendars.find(r => r.id === options.edit), leave = d.leave.find(r => r.id === options.edit), staffing = d.staffing.find(r => r.id === options.edit)
 const fields = (row: any, people = d.people, label = 'Hours per date') => s('personId', 'Person', people, row?.value.personId ?? a.personId) + i('from', 'From', row?.value.from ?? today, 'date') + i('to', 'Through', row?.value.to ?? today, 'date') + duration('dailyHours', label, row?.value.dailySeconds ?? 28800)
 const forms = []
 if (finance(a)) forms.push(form('save:calendars', 'Working calendar / contractor availability', fields(calendar, d.people, 'Available hours per working day') + weekdayChecks(calendar?.value.weekdays) + i('timezone', 'Work timezone', calendar?.value.timezone ?? report.agency.timezone), calendar))
 forms.push(form('save:leave', 'Leave', fields(leave, finance(a) ? d.people : d.people.filter(p => p.id === a.personId)) + i('note', 'Reason', leave?.value.note), leave))
 if (finance(a) || a.role === 'lead') forms.push(form('save:staffing', 'Staff allocation', s('engagementId', 'Engagement', d.engagements.filter(x => finance(a) || x.value.leadId === a.personId), staffing?.value.engagementId) + fields(staffing) + c('commitment', 'Commitment', ['tentative', 'committed'], staffing?.value.commitment), staffing))
 body += `<h2 class="g-subhead">Calendars, leave and staffing</h2><p class="g-lede">Calendar dates belong to each person’s stated work timezone. Allocations apply to every date in their range, including non-working days. Contractor calendars represent explicitly supplied availability; missing calendars leave availability unknown.</p><div class="g-forms">${forms.join('')}</div>`
 const person = { label: 'Person', size: 'name' as const, line: 1 as const, cell: (r: any) => open('capacity', r, nameOf(d.people, r.value.personId)) }, range = { label: 'Dates', line: 2 as const, cell: (r: any) => e(period(r.value.from, r.value.to)) }
 const inWindow = (r: any) => r.value.from <= report.to && r.value.to >= report.from
 body += `<details class="g-records"><summary>Staffing, leave and calendar records</summary>${table('Staffing', d.staffing.filter(inWindow), [person, { label: 'Engagement', line: 1, cell: r => e(nameOf(d.engagements, r.value.engagementId)) }, range, { label: 'Per date', num: true, size: 'num', line: 2, cell: r => hours(r.value.dailySeconds) }, { label: 'Commitment', size: 'status', line: 2, cell: r => chip(r.value.commitment) }], undefined, 'No allocations in these five weeks.')}`
 body += table('Leave', d.leave, [person, range, { label: 'Per day', num: true, size: 'num', line: 2, cell: r => hours(r.value.dailySeconds) }, { label: 'Reason', wrap: true, line: 3, cell: r => e(r.value.note) }])
 body += table('Calendars', d.calendars, [person, range, { label: 'Per working day', num: true, size: 'num', line: 2, cell: r => hours(r.value.dailySeconds) }, { label: 'Working weekdays', line: 3, cell: r => e(weekdays(r.value.weekdays)) }, { label: 'Timezone', line: 3, cell: r => e(r.value.timezone) }]) + '</details>'
 return body
}
