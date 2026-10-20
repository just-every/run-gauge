// FINANCE-001 on Week in review: finance's actual and forecast margin per engagement, each figure opening its
// calculation and sources. Earned value is operational, billing is prepared not invoiced, and no payments are recorded.
import { escape as e } from './ui-forms'
import { money, hours } from './ui-format'
import { type Report, describeSource } from './ui-describe'

// "kind:id: reason" from the margin calculation, as the source's plain summary and link.
const plain: Record<string, string> = { 'frozen costMinor unknown': 'cost unknown: no cost rate when approved', 'frozen billMinor unknown': 'bill amount unknown: no bill rate when approved' }
function unknownSource(report: Report, text: string) {
 const at = text.indexOf(': '), source = text.slice(0, at), reason = text.slice(at + 2), x = describeSource(report.data, source)
 return `<li><a href="${e(x.href)}">${e(x.text)}</a>: ${e(plain[reason] ?? reason)}</li>`
}

export function marginSection(report: Report) {
 const rows = report.margin ?? []
 if (!rows.length) return ''
 const figure = (x: (typeof rows)[number], field: string, known?: number) => {
  const value = (x as Record<string, unknown>)[field] as number | null
  return `<a href="?calculation=${e(`margin:${x.engagementId}:${field}`)}#report-evidence">${value === null ? 'Unknown' : money(value, x.currency)}</a>${value === null && known !== undefined ? `<br><small>known ${money(known, x.currency)}</small>` : ''}`
 }
 const td = (label: string, html: string) => `<td data-label="${e(label)}" class="g-num">${html}</td>`
 const body = rows.map(x => `<tr><th scope="row">${e(x.name)}${x.complete ? '' : ' <span class="g-chip g-chip--warn">Incomplete</span>'}</th>${td('Approved cost', figure(x, 'approvedCostMinor', x.knownApprovedCostMinor))}${td('Provisional cost', figure(x, 'provisionalCostMinor', x.knownProvisionalCostMinor))}${td('Earned value', figure(x, 'earnedValueMinor', x.knownEarnedValueMinor))}${td('Billed', figure(x, 'billedMinor'))}${td('Credits', figure(x, 'creditsMinor'))}${td('Paid cash', e(x.paidCashLabel))}${td('Remaining effort', `${hours(x.remainingTaskSeconds)} tasks<br><small>${hours(x.committedFutureSeconds)} committed</small>`)}${td('Actual margin', figure(x, 'actualMarginMinor', x.knownActualMarginMinor))}${td('Forecast margin', figure(x, 'forecastMarginMinor', x.knownForecastMarginMinor))}</tr>`).join('')
 const unknown = rows.filter(x => !x.complete).map(x => `<li>${e(x.name)}<ul>${[...new Set([...x.actualUnknown, ...x.forecastUnknown])].map(u => unknownSource(report, u)).join('')}</ul></li>`).join('')
 return `<section class="g-block" id="project-margin"><h2>Project margin</h2><p class="g-lede">Earned value is operational value, not recognized revenue. Billed is billing prepared, not invoiced, net of credits. No payments recorded. Missing rates or costs make a margin unknown and name their sources. ETC and EAC are the committed forecast's.</p><section class="g-card g-card--table"><div class="g-table"><table><thead><tr><th>Engagement</th><th>Approved cost</th><th>Provisional cost</th><th>Earned value</th><th>Billed</th><th>Credits</th><th>Paid cash</th><th>Remaining effort</th><th>Actual margin</th><th>Forecast margin</th></tr></thead><tbody>${body}</tbody></table></div></section>${unknown ? `<details class="g-card"><summary>Sources that make a margin unknown</summary><ul>${unknown}</ul></details>` : ''}</section>`
}
