// FINANCE-006 on Week in review: finance's committed forecast per engagement and month,
// with tentative work and weighted pipeline shown only as labelled additions.
import { escape as e } from './ui-forms'
import { money } from './ui-format'
import type { Report } from './ui-describe'

export function forecastSection(report: Report) {
 const f = report.forecast
 if (!f || !f.engagements.length) return ''
 const figure = (x: Report['economics'][number] | any, field: string) => `<a href="?calculation=${e(`forecast:${x.engagementId}:${field}`)}#report-evidence">${money(x[field], x.currency)}</a>`
 const td = (label: string, html: string, num = true) => `<td data-label="${e(label)}"${num ? ' class="g-num"' : ''}>${html}</td>`
 const rows = f.engagements.map(x => `<tr><th scope="row">${e(x.name)}${x.complete ? '' : ' <span class="g-chip g-chip--warn">Incomplete</span>'}</th>${td('Basis', e(x.basis), false)}${td('Actual fees', figure(x, 'actualFeesMinor'))}${td('Committed ETC', figure(x, 'etcFeesMinor'))}${td('Committed EAC', figure(x, 'eacFeesMinor'))}${td('+ tentative', money(x.tentativeFeesMinor, x.currency))}${td('Cost EAC', figure(x, 'eacCostMinor'))}${td('Margin', figure(x, 'marginMinor'))}</tr>`).join('')
 const months = f.engagements.flatMap(x => x.months.filter(m => m.committedFeesMinor || m.tentativeFeesMinor).map(m => `<tr><th scope="row">${e(x.name)}</th>${td('Month', e(m.month), false)}${td('Committed fees', money(m.committedFeesMinor, x.currency))}${td('+ tentative', m.tentativeFeesMinor ? `+ ${money(m.tentativeFeesMinor, x.currency)}` : '—')}${td('Committed cost', money(m.committedCostMinor, x.currency))}</tr>`)).join('')
 const pipeline = f.pipeline.flatMap(p => p.months.map(m => `<li>${e(m.month)}: + ${money(m.weightedMinor, p.currency)} weighted pipeline</li>`)).join('')
 const incomplete = f.engagements.filter(x => !x.complete).map(x => `<li>${e(x.name)}: ${e(x.incomplete.join('; '))}</li>`).join('')
 return `<section class="g-block"><h2>Committed forecast</h2><p class="g-lede">As of ${e(f.asOf)}. Committed figures use approved actuals at frozen rates plus future committed allocations at the rate effective each day; tentative work and weighted pipeline are separate additions, never inside committed totals.</p><section class="g-card g-card--table"><div class="g-table"><table><thead><tr><th>Engagement</th><th>Basis</th><th>Actual fees</th><th>Committed ETC</th><th>Committed EAC</th><th>+ tentative</th><th>Cost EAC</th><th>Margin</th></tr></thead><tbody>${rows}</tbody></table></div></section>${months ? `<section class="g-card g-card--table"><h3>By month</h3><div class="g-table"><table><thead><tr><th>Engagement</th><th>Month</th><th>Committed fees</th><th>+ tentative</th><th>Committed cost</th></tr></thead><tbody>${months}</tbody></table></div></section>` : ''}${pipeline ? `<ul class="g-card g-exceptions">${pipeline}</ul>` : ''}${incomplete ? `<details class="g-card"><summary>Incomplete or unpriced sources</summary><ul>${incomplete}</ul></details>` : ''}</section>`
}
