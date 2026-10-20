// RESOURCE-005 on Week in review: finance's monthly demand against capacity, priced on the FINANCE-006 basis,
// and the owner-approved scenarios beside the untouched baseline.
import { escape as e, decision } from './ui-forms'
import { money, hours } from './ui-format'
import type { Report } from './ui-describe'

export function demandSection(report: Report, owner: boolean) {
 const f = report.demandForecast
 if (!f || (!f.baseline.months.length && !f.scenarios.length)) return ''
 const td = (label: string, html: string, num = true) => `<td data-label="${e(label)}"${num ? ' class="g-num"' : ''}>${html}</td>`
 const plus = (s: number) => s ? `+ ${hours(s)}` : '—'
 const months = f.baseline.months.map(m => `<tr><th scope="row">${e(m.month)}</th>${td('Committed demand', hours(m.committedDemandSeconds))}${td('Unfilled roles', hours(m.unfilledSeconds))}${td('+ tentative', plus(m.tentativeSeconds))}${td('+ weighted pipeline', plus(m.weightedPipelineSeconds))}${td('Employee capacity', hours(m.employeeCapacitySeconds))}${td('Contractor capacity', hours(m.contractorCapacitySeconds))}${td('Committed fees', money(m.committedFeesMinor, f.currency))}${td('Committed margin', money(m.marginMinor, f.currency))}</tr>`).join('')
 const scenario = (s: (typeof f.scenarios)[number]) => {
  const what = [s.delayDays ? `start delayed ${s.delayDays} days` : '', s.supply ? `${s.supply.type === 'hire' ? 'planned hire' : 'contractor'} ${s.supply.label}, ${hours(s.supply.dailySeconds)} a weekday from ${s.supply.from}${s.supply.to ? ` to ${s.supply.to}` : ''}` : ''].filter(Boolean).join('; ') || 'deal as proposed'
  const line = (label: string, value: string) => `<p class="g-aside g-num">${e(label)} ${value}</p>`
  const body = 'delta' in s && s.compared ? [line('Capacity vs baseline', hours(s.delta.capacitySeconds)), line('Demand vs baseline', hours(s.delta.demandSeconds)), line('Fees vs baseline', money(s.delta.feesMinor, f.currency)), line('Cost vs baseline', money(s.delta.costMinor, f.currency)), line('Margin vs baseline', money(s.delta.marginMinor, f.currency))].join('') : `<p class="g-empty">${e('reason' in s ? s.reason : '')}</p>`
  return `<section class="g-card" id="scenario-${e(s.id)}"><h3>${e(s.name)}</h3><p>${e(what)} · cost ${money(s.costPerHourMinor, f.currency)}/h</p>${body}${owner && s.status === 'draft' && !s.compared && 'reason' in s && s.reason === 'Awaiting owner approval' ? decision('demandScenario:approve', 'Approve scenario', { id: s.id, revision: s.revision, value: {} }) : ''}</section>`
 }
 return `<section class="g-block" id="demand-forecast"><h2>Resource demand forecast</h2><p class="g-lede">As of ${e(f.asOf)}. Committed demand is committed allocations, unfilled roles and won deals not yet converted; tentative work and weighted pipeline are separate additions. Scenarios add one open deal as won and never change the baseline.</p><section class="g-card g-card--table"><div class="g-table"><table><thead><tr><th>Month</th><th>Committed demand</th><th>Unfilled roles</th><th>+ tentative</th><th>+ weighted pipeline</th><th>Employee capacity</th><th>Contractor capacity</th><th>Committed fees</th><th>Committed margin</th></tr></thead><tbody>${months}</tbody></table></div></section>${f.incomplete.length ? `<ul class="g-footnote">${f.incomplete.map(x => `<li>${e(x)}</li>`).join('')}</ul>` : ''}${f.scenarios.length ? `<h3>Scenarios</h3><div class="g-econ-grid">${f.scenarios.map(scenario).join('')}</div>` : ''}</section>`
}
