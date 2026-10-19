import type { Actor } from './store'
import { finance } from './store'
import type { Row, Value } from './model'
import type { Report } from './ui-describe'
import { escape as e, input, select, form, table } from './ui-forms'
import { hours, period, nameOf, chip } from './ui-format'
import { shift } from './ui-board'

const hidden = (name: string, value: unknown) => `<input type="hidden" name="${e(name)}" value="${e(value)}">`

/** Search changes the displayed roster only; demand and report calculations retain all their inputs. */
export function schedulePeople(report: Report, options: Value) {
 const contains = (value: unknown, query: unknown) => String(value ?? '').toLowerCase().includes(String(query ?? '').trim().toLowerCase())
 return new Set(report.data.people.filter(p => contains(p.value.name, options.schedulePerson)
  && contains(p.value.role, options.scheduleRole)
  && (!String(options.scheduleSkill ?? '').trim() || (p.value.skills ?? []).some((skill: Value) => contains(skill.name, options.scheduleSkill))))
  .map(p => p.id))
}

export function scheduleSearch(report: Report, options: Value) {
 return `<section class="g-card"><h2>Search the staffing calendar</h2><form class="g-form" method="get" action="/app/capacity">${hidden('from', report.from)}${options.view === 'weeks' ? hidden('view', 'weeks') : ''}`
  + input('schedulePerson', 'Person name contains', options.schedulePerson ?? '', 'search', false)
  + input('scheduleRole', 'Role contains', options.scheduleRole ?? '', 'search', false)
  + input('scheduleSkill', 'Skill contains', options.scheduleSkill ?? '', 'search', false)
  + `<div class="g-actions"><button class="g-btn g-btn--primary">Search calendar</button><a class="g-btn g-btn--secondary" href="/app/capacity?from=${e(report.from)}${options.view === 'weeks' ? '&amp;view=weeks' : ''}">Clear search</a></div></form></section>`
}

function schedulePreview(report: Report, preview: Value) {
 const parts: Row[] = preview.parts.map((value: Value, n: number) => ({ id: `schedule-part-${n}`, revision: '', value }))
 let body = '<section class="g-card"><h2>Schedule change preview</h2><p>The original booking has not changed. Apply this preview to save the change. Dates are inclusive and hours apply to every date, including non-working days.</p></section>'
 body += table('Proposed booking parts', parts, [
  { label: 'Person', line: 1, cell: r => e(nameOf(report.data.people, r.value.personId)) },
  { label: 'Engagement', line: 1, cell: r => e(nameOf(report.data.engagements, r.value.engagementId)) },
  { label: 'Dates', line: 2, cell: r => e(period(r.value.from, r.value.to)) },
  { label: 'Hours per date', line: 2, cell: r => hours(r.value.dailySeconds) },
  { label: 'Commitment', line: 2, cell: r => chip(r.value.commitment) },
  { label: 'Service and billing', line: 3, wrap: true, cell: r => `${e(r.value.service)} · ${r.value.billable ? 'Billable' : 'Nonbillable'}` },
 ])
 body += `<p class="g-lede">Unfilled demand remains ${hours(preview.unfilledSeconds)}. Remaining capacity below deducts committed bookings; tentative hours are shown separately.</p>`
 for (const person of preview.capacity as Value[]) {
  const warnings = [
   ...(person.missingCalendarDays ? [`Availability unknown on ${person.missingCalendarDays} dates without a calendar.`] : []),
   ...person.conflicts.map((conflict: Value) => `${conflict.date}: committed work exceeds capacity by ${hours(conflict.seconds)}.`),
  ]
  if (warnings.length) body += `<section class="g-card"><h2>${e(person.name)}: capacity warnings</h2><ul>${warnings.map(w => `<li>${e(w)}</li>`).join('')}</ul></section>`
  body += table(`${person.name}: daily capacity after change`, person.days.map((value: Value) => ({ id: `schedule-${person.personId}-${value.date}`, revision: '', value })), [
   { label: 'Date', line: 1, cell: r => e(r.value.date) },
   { label: 'Available', line: 2, cell: r => hours(r.value.availableSeconds) },
   { label: 'Committed', line: 2, cell: r => hours(r.value.committedSeconds) },
   { label: 'Tentative', line: 2, cell: r => hours(r.value.tentativeSeconds) },
   { label: 'Remaining', line: 3, cell: r => `${hours(r.value.remainingSeconds)}${r.value.remainingSeconds == null ? ' · Availability unknown' : r.value.remainingSeconds < 0 ? ' · Over capacity' : ''}` },
  ])
 }
 const fields = Object.entries(preview.input).filter(([key]) => !['action', 'key', 'page', 'fingerprint', 'id', 'revision'].includes(key)).map(([key, value]) => hidden(key, value)).join('')
 return body + form('staffing:apply', 'Apply reviewed schedule change', fields + hidden('fingerprint', preview.fingerprint) + hidden('page', 'capacity'), { id: preview.id, revision: preview.revision, value: {} }, 'Apply schedule change')
}

export function scheduleSection(a: Actor, report: Report, options: Value, people: Set<string>) {
 if (!finance(a) && a.role !== 'lead') return ''
 const d = report.data, preview: Value | undefined = options.schedulePreview
 const selected = d.staffing.find(r => r.id === (preview?.id ?? options.edit))
 let body = '<details class="g-records" id="schedule-changes" open><summary>Move or split a booking</summary><p class="g-lede">Select a booking, preview its new dates or people, review daily capacity and apply the exact change. Hours per date, service, billability and commitment stay the same.</p>'
 body += table('Select a booking', d.staffing.filter(r => people.has(r.value.personId)), [
  { label: 'Person', line: 1, cell: r => `<a href="/app/capacity?edit=${e(r.id)}#schedule-changes">${e(nameOf(d.people, r.value.personId))}</a>` },
  { label: 'Engagement', line: 1, cell: r => e(nameOf(d.engagements, r.value.engagementId)) },
  { label: 'Dates', line: 2, cell: r => e(period(r.value.from, r.value.to)) },
  { label: 'Hours per date', line: 2, cell: r => hours(r.value.dailySeconds) },
  { label: 'Commitment', line: 3, cell: r => chip(r.value.commitment) },
 ], undefined, 'No bookings match this calendar search.')
 if (selected) {
  const v = selected.value, move = preview?.operation === 'move' ? preview.input : {}, split = preview?.operation === 'split' ? preview.input : {}
  body += `<section class="g-card"><h2>Selected booking</h2><p>${e(nameOf(d.people, v.personId))} · ${e(nameOf(d.engagements, v.engagementId))} · ${e(period(v.from, v.to))} · ${hours(v.dailySeconds)} per date · ${e(v.service ?? 'Unspecified')} · ${v.billable ? 'Billable' : 'Nonbillable'} · ${chip(v.commitment)}</p><p>A split keeps the original person through the day before the split date; the second person starts on the split date and continues through the original end date. No dates are dropped or counted twice.</p></section>`
  const context = hidden('page', 'capacity')
  body += '<div class="g-forms">' + form('staffing:preview', 'Move booking', context + hidden('operation', 'move')
   + select('personId', 'Target person', d.people, move.personId ?? v.personId)
   + input('from', 'New start date', move.from ?? v.from, 'date') + input('to', 'New end date (inclusive)', move.to ?? v.to, 'date'), selected, 'Preview move')
  body += form('staffing:preview', 'Split booking', context + hidden('operation', 'split')
   + input('splitDate', 'Second person starts on', split.splitDate ?? (v.from < v.to ? shift(v.from, 1) : v.from), 'date')
   + select('secondPersonId', 'Second person', d.people, split.secondPersonId ?? v.personId), selected, 'Preview split') + '</div>'
 }
 if (preview) body += schedulePreview(report, preview)
 return body + '</details>'
}
