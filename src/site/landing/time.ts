// 06 "22 timesheets, approved by Monday noon.": Friday's direct message to Sam with the missing hours drafted from
// his calendar and Linear, and Monday's approval queue for all leads.
import { dot, to, nw, avatar, check, flag, calendar, list, people, head, section } from './parts'

const dm = '<div class="card dm"><div class="dm-head"><h3 class="card-title">Direct message&nbsp;· Gauge&nbsp;→ Sam Reyes</h3>'
 + `<p class="card-sub">${nw('Fri Oct 23')}${dot}${nw('4:00 pm')}</p></div>`
 + `<div class="dm-msg"><span class="dm-mark"><img src="/brand/mark.svg" alt="" width="30" height="30"></span><div><p class="dm-from"><b>Gauge</b>${dot}<span class="quiet">${nw('4:00 pm')}</span></p>`
 + '<p>Thursday has 4.5 hrs missing. I drafted them from your calendar and Linear:</p></div></div>'
 + `<div class="dm-entry">${calendar()}<p>${nw('1:00–2:00 pm')}${dot}<b class="ink-willamette">Willamette CU</b> sprint review${dot}from calendar${dot}${nw('1.0 hr')}</p></div>`
 + `<div class="dm-entry dm-entry--pick">${list()}<div><p>${nw('2:30–6:00 pm')}${dot}“Checkout sync”${dot}matches <span class="ink-pacific">Pacific Trail</span> and <span class="ink-capitol">Capitol Grain</span></p>`
 + `<div class="dm-choice"><span class="pick is-picked"><span class="radio" aria-hidden="true"></span>Pacific Trail</span><span class="pick"><span class="radio" aria-hidden="true"></span>Capitol Grain</span><span class="dm-evidence">${nw('PT-212')} activity${dot}3.5 hrs</span></div></div></div>`
 + '<p class="dm-button"><span class="button-look">Confirm and submit</span></p>'
 + `<div class="dm-reply">${avatar('SR', 'mint')}<div><p class="dm-from"><b>Sam Reyes</b>${dot}<span class="quiet">${nw('4:22 pm')}</span></p><p>Confirmed and submitted ${check()}</p></div></div></div>`

const qrow = (lead: string, body: string, tail = '') => `<li>${lead}<p>${body}</p>${tail}</li>`
const queue = `<div class="card queue"><div class="queue-head"><h3 class="card-title">Approval queue${dot}week of ${nw('Oct 19')}${dot}all leads</h3><p class="card-sub">Owen Park, Rachel Kim and Marcus Bell</p>`
 + '<span class="ring" role="img" aria-label="22 of 22 approved"><svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="40"/><circle cx="48" cy="48" r="40" class="ring-fill"/></svg><b>22 of 22</b></span></div><ul class="queue-rows" role="list">'
 + qrow(`<span class="avatar avatar--fog">${people()}</span>`, `20 of 22 approved by ${nw('9:00 am')}`)
 + qrow(avatar('MC', 'rose'), `Maya Chen${dot}Thu${dot}returned ${nw('9:15 am')}${dot}“Add a task note”`, `<span class="q-flag">${flag()}</span>`)
 + qrow(avatar('MC', 'mint'), `Maya Chen${dot}fixed ${nw('9:40 am')}${dot}approved ${nw('10:02 am')} ${check()}`)
 + qrow(avatar('DR', 'sky'), `Diego Ramos${dot}${nw('Tue–Wed')} leave ${check()}`)
 + qrow(`<span class="avatar avatar--mint">${check()}</span>`, `Last sheet approved ${nw('11:40 am')} ${check()}`)
 + `</ul><p class="queue-total">Week of ${nw('Oct 19')}${dot}22 of 22 approved${dot}628.5 hrs</p></div>`

export function timeSection() {
 return section('time-title', 'pale', `<div class="centre-head">${head('time-title', 'Time&nbsp;· Fri Oct 23 – Mon Oct 26', '22 timesheets, approved by Monday noon.', 'Friday’s nudge arrives in Slack with the missing hours already drafted from the calendar. People confirm their own time, and leads approve it in one queue.')}</div>`
  + `<div class="time-grid">${dm}${queue}</div>`)
}
