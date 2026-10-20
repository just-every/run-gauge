import {escape as e} from './ui-forms'
import {hours,period} from './ui-format'
import type {Value} from './model'
export function forecastSchedule(rows:Value[]) {
 if(!rows.length)return ''
 return `<section class="g-block"><h2>Forecast source periods</h2><p class="g-lede">Team totals overlap project totals; never add them together. Aggregate-only periods and placeholders are retained for reconciliation and excluded from daily staffing. Reviewed distributions are planning allocations, not original daily facts.</p><div class="g-table"><table><thead><tr><th>Source</th><th>Person</th><th>Period</th><th>Hours</th><th>Meaning</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${e(r.view)}${r.project?`<br><small>${e(r.project)}</small>`:''}</th><td>${e(r.placeholder?`${r.person} (placeholder)`:r.person)}</td><td>${e(period(r.from,r.to))}${r.workingDays?`<br>${e(r.workingDays)} working days`:''}</td><td class="g-num">${r.totalSeconds===undefined?`${hours(r.dailySeconds)} per working day`:hours(r.totalSeconds)}</td><td>${e(r.commitment??'')}<br>${e(r.resolution)}</td></tr>`).join('')}</tbody></table></div></section>`
}
