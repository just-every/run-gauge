// Next-month capacity: one card per person with one ruler (committed solid,
// tentative hatched, the end at available time), the daily table in its
// disclosure, and the calendar, leave and staffing forms and records.
import { type Actor, finance } from './store'
import type { Value } from './model'
import { escape as e, input as i, duration, weekdayChecks, select as s, choices as c, form, table, open } from './ui-forms'
import { hours, day, period, weekdays, chip, nameOf } from './ui-format'
import { ruler } from './ui-ruler'
import type { Report } from './ui-describe'

export function capacityCards(capacity: Report['capacity']) {
 return capacity.map(person => {
  const known = person.availableSeconds !== null, conflicts = person.conflicts.length, missing = person.missingCalendarDays, partial = !known && missing < person.days.length
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  // With some calendars supplied, the card reads and draws the known part and counts the unknown days.
  const reading = known ? `Available ${hours(person.availableSeconds)} · committed ${hours(person.committedSeconds)} · tentative ${hours(person.tentativeSeconds)} · remaining ${hours(person.remainingSeconds)}`
   : partial ? `${hours(person.knownAvailableSeconds)} known · ${plural(missing, 'day', 'days')} unknown · committed ${hours(person.committedSeconds)} · tentative ${hours(person.tentativeSeconds)}`
   : `Missing: availability unknown · committed ${hours(person.committedSeconds)} · tentative ${hours(person.tentativeSeconds)}`
  const scale = known ? ruler({ value: person.committedSeconds, end: person.availableSeconds, tentative: person.tentativeSeconds, format: hours, label: reading })
   : partial ? ruler({ value: person.knownAvailableSeconds - person.knownRemainingSeconds, end: person.knownAvailableSeconds, format: hours, label: reading })
   : ruler({ value: null, end: null, format: hours, label: 'Missing: availability unknown' })
  const notes = [missing ? `${plural(missing, 'day lacks', 'days lack')} a calendar` : '', conflicts ? `${plural(conflicts, 'day has', 'days have')} conflicts` : ''].filter(Boolean)
  const flags = `${conflicts ? chip('capacity conflict') : ''}${person.missingCalendarDays ? chip('availability missing') : ''}`
  return `<article class="g-card g-person"><header class="g-card-head"><h2>${e(person.name)}${person.contractor ? ' · contractor' : ''}</h2>${flags ? `<p class="g-flags">${flags}</p>` : ''}</header>
  <p class="g-reading-line g-num">${e(reading)}</p>${scale}
  ${notes.length ? `<p class="g-note">${notes.join('; ')}.${partial ? ` Supplied calendars confirm ${hours(person.knownAvailableSeconds)} available and ${hours(person.knownRemainingSeconds)} remaining on their dates.` : ''}</p>` : ''}
  <details class="g-days"><summary>Daily availability and demand</summary><div class="g-table"><table><thead><tr><th scope="col">Date / timezone</th><th scope="col">Calendar</th><th scope="col" class="g-num">Leave</th><th scope="col" class="g-num">Available</th><th scope="col" class="g-num">Committed</th><th scope="col" class="g-num">Tentative</th><th scope="col" class="g-num">Remaining</th></tr></thead><tbody>${person.days.map(d => `<tr><td data-label="Date / timezone">${e(day(d.date))}<span class="g-sub">${e(d.timezone)}</span></td><td data-label="Calendar">${d.calendarId ? d.workingDay ? 'Working day' : 'Non-working day' : 'Missing: availability unknown'}</td><td data-label="Leave" class="g-num">${hours(d.leaveSeconds)}</td><td data-label="Available" class="g-num">${hours(d.availableSeconds)}</td><td data-label="Committed" class="g-num">${hours(d.committedSeconds)}</td><td data-label="Tentative" class="g-num">${hours(d.tentativeSeconds)}</td><td data-label="Remaining" class="g-num">${hours(d.remainingSeconds)}</td></tr>`).join('')}</tbody></table></div></details>
 </article>`
 }).join('')
}

export function capacitySection(a: Actor, report: Report, options: Value, today: string) {
 const d = report.data
 let body = `<div class="g-page-head"><h1>Next-month capacity</h1><form class="g-period" method="get">${i('from', 'From', report.from, 'date')}${i('to', 'Through', report.to, 'date')}<button class="g-btn g-btn--primary">Show capacity</button></form></div>`
 body += `<p class="g-lede">${e(period(report.from, report.to))}. Calendar dates belong to each person’s stated work timezone. Allocations apply to every date in their range, including non-working days. Tentative work is shown separately. Contractor calendars represent explicitly supplied availability. Missing calendars leave availability and remaining capacity unknown.</p>`
 body += `<section class="g-people">${capacityCards(report.capacity) || '<p class="g-empty">No people yet.</p>'}</section>`
 const calendar = d.calendars.find(r => r.id === options.edit), leave = d.leave.find(r => r.id === options.edit), staffing = d.staffing.find(r => r.id === options.edit)
 const fields = (row: any, people = d.people, label = 'Hours per date') => s('personId', 'Person', people, row?.value.personId ?? a.personId) + i('from', 'From', row?.value.from ?? today, 'date') + i('to', 'Through', row?.value.to ?? today, 'date') + duration('dailyHours', label, row?.value.dailySeconds ?? 28800)
 const forms = []
 if (finance(a)) forms.push(form('save:calendars', 'Working calendar / contractor availability', fields(calendar, d.people, 'Available hours per working day') + weekdayChecks(calendar?.value.weekdays) + i('timezone', 'Work timezone', calendar?.value.timezone ?? report.agency.timezone), calendar))
 forms.push(form('save:leave', 'Leave', fields(leave, finance(a) ? d.people : d.people.filter(p => p.id === a.personId)) + i('note', 'Reason', leave?.value.note), leave))
 if (finance(a) || a.role === 'lead') forms.push(form('save:staffing', 'Staff allocation', s('engagementId', 'Engagement', d.engagements.filter(x => finance(a) || x.value.leadId === a.personId), staffing?.value.engagementId) + fields(staffing) + c('commitment', 'Commitment', ['tentative', 'committed'], staffing?.value.commitment), staffing))
 body += `<h2 class="g-subhead">Calendars, leave and staffing</h2><div class="g-forms">${forms.join('')}</div>`
 const person = { label: 'Person', cell: (r: any) => open('capacity', r, nameOf(d.people, r.value.personId)) }, range = { label: 'Dates', cell: (r: any) => e(period(r.value.from, r.value.to)) }
 body += table('Calendars', d.calendars, [person, range, { label: 'Per working day', num: true, cell: r => hours(r.value.dailySeconds) }, { label: 'Working weekdays', cell: r => e(weekdays(r.value.weekdays)) }, { label: 'Timezone', cell: r => e(r.value.timezone) }])
 body += table('Leave', d.leave, [person, range, { label: 'Per day', num: true, cell: r => hours(r.value.dailySeconds) }, { label: 'Reason', wrap: true, cell: r => e(r.value.note) }])
 body += table('Staffing', d.staffing, [person, { label: 'Engagement', cell: r => e(nameOf(d.engagements, r.value.engagementId)) }, range, { label: 'Per date', num: true, cell: r => hours(r.value.dailySeconds) }, { label: 'Commitment', cell: r => chip(r.value.commitment) }])
 return body
}
