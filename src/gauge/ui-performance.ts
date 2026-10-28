import type { Report } from './ui-describe'
import { escape as e, input as i, select as s, form, table } from './ui-forms'
import { hours, money } from './ui-format'
import type { Value } from './model'

const percent = (v: number | null) => v === null ? 'Unknown' : `${v.toFixed(2)}%`
const points = (v: number | null) => v === null ? 'No target' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)} points`

/** REPORT-002 / REPORT-007: billable utilization against target for everyone who sees utilization; realization for finance only. */
export function performanceSection(report: Report, options: Value, canSetTargets: boolean) {
 const dimensions = { person: 'byPerson', role: 'byRole', client: 'byClient', period: 'byPeriod' } as const
 const selected = options.performanceGroup in dimensions ? options.performanceGroup as keyof typeof dimensions : 'person'
 const rows = report.performance[dimensions[selected]].map(r => ({ id: r.id || 'none', revision: '', value: r }))
 const realization = (r: Value) => typeof r.money === 'string' ? `<p>${e(r.money)}</p>` : r.money.length ? r.money.map((m: Value) => `<p><strong>Realization ${e(percent(m.realizationPercent))}</strong> · billed ${e(money(m.billedMinor, m.currency))} of ${e(money(m.standardMinor, m.currency))} standard</p><p>Write-offs ${e(money(m.writeOffMinor, m.currency))} · effective rate ${e(money(m.effectiveRateMinor, m.currency))}/h over ${e(hours(m.billedSeconds))} billed</p><p>Approved, not yet billed ${e(money(m.unbilledStandardMinor, m.currency))}${m.missingBillRate.length ? ` · ${m.missingBillRate.length} entries missing a bill rate` : ''}</p>`).join('') : '<p>No approved billable hourly time.</p>'
 const params = new URLSearchParams({ utilizationFrom: report.from, utilizationTo: report.to })
 let html = `<details class="g-records" id="performance" open><summary>Billability targets and realization</summary><p class="g-lede">${e(report.from)} through ${e(report.to)}. Billable utilization is approved billable hours ÷ net available hours after holidays and leave. The target is the one in force on ${e(report.performance.asOf)}; a person’s own target takes precedence over their role’s. Realization compares billed amounts, after approved corrections, with the standard value at each entry’s frozen approved bill rate. Clients have no capacity denominator. Costs and pay never appear here.</p>`
  + `<form class="g-form" method="get" action="/app/capacity#performance">${['from', 'utilizationFrom', 'utilizationTo'].map(k => `<input type="hidden" name="${k}" value="${e(k === 'from' ? options.from ?? report.from : k === 'utilizationFrom' ? report.from : report.to)}">`).join('')}<label class="g-field"><span>Group targets by</span><select name="performanceGroup">${Object.keys(dimensions).map(k => `<option value="${k}"${selected === k ? ' selected' : ''}>${e(k.charAt(0).toUpperCase() + k.slice(1))}</option>`).join('')}</select></label><div class="g-actions"><button class="g-btn g-btn--secondary">Show targets</button></div></form>`
  + table('Billability to target', rows, [
   { label: 'Group', line: 1, wrap: true, cell: r => e(r.value.name) },
   { label: 'Hours', line: 2, wrap: true, cell: r => `<p>Approved ${hours(r.value.approvedSeconds)} · billable ${hours(r.value.billableSeconds)} · nonbillable ${hours(r.value.nonbillableSeconds)}</p>` },
   { label: 'Utilization to target', line: 3, wrap: true, cell: r => `<p><strong>${e(percent(r.value.utilization.percent))}</strong> · ${e(hours(r.value.utilization.numeratorSeconds))} / ${r.value.availableSeconds === null ? (r.value.dimension === 'client' ? 'no capacity denominator' : 'unknown capacity (missing calendar)') : e(hours(r.value.availableSeconds))}</p><p>Target ${r.value.target ? `${e(percent(r.value.target.percent))} (${e(r.value.target.scope)}, from ${e(r.value.target.effectiveFrom)})` : 'not set'} · ${e(points(r.value.variancePoints))}</p>` },
   { label: 'Realization', line: 3, wrap: true, cell: r => realization(r.value) },
  ], undefined, 'No people in this period.')
 if (canSetTargets) html += form('target:set', 'Set a billability target', s('scope', 'Target for', [{ id: 'person', revision: '', value: { name: 'One person' } }, { id: 'role', revision: '', value: { name: 'Everyone in a role' } }], 'person') + s('personId', 'Person', report.data.people, undefined, true) + i('role', 'Role', '', 'text', false) + i('percent', 'Billable target percent', '', 'text') + i('effectiveFrom', 'Effective from', report.from, 'date') + `<input type="hidden" name="utilizationFrom" value="${e(report.from)}"><input type="hidden" name="utilizationTo" value="${e(report.to)}">`)
 return html + `<p><a href="/app/capacity?${e(params.toString())}#utilization">Utilization sources</a></p></details>`
}
