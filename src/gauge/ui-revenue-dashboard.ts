import type { Report } from './ui-describe'
import { escape as e } from './ui-forms'
import { hours, money, nameOf } from './ui-format'

/** Reuses the approved Review table/card language; no new page or visual system. */
export function revenueDashboardSection(report: Report) {
 const dashboard = report.revenueDashboard
 if (!dashboard) return ''
 const link = (id: string, value: number | null, currency: string) => `<a href="?${e(new URLSearchParams({from:report.from,to:report.to,asOf:dashboard.asOf,calculation:id}).toString())}#report-evidence">${money(value,currency)}</a>`
 const rows = dashboard.wip.map(w => {
  const p = report.pipeline.find(p => p.currency === w.currency)
  return `<tr><th scope="row">${e(w.currency)}</th><td data-label="Weighted open pipeline">${link(`pipeline:${w.currency}:weightedMinor`,p?.weightedMinor??0,w.currency)}</td><td data-label="Signed value before billing">${link(`pipeline:${w.currency}:bookedMinor`,p?.bookedMinor??0,w.currency)}</td><td data-label="Hourly WIP and expenses">${link(`revenue:${w.currency}:wipMinor`,w.amountMinor,w.currency)}${w.amountMinor===null?`<br><small>Known subtotal ${money(w.knownMinor,w.currency)}</small>`:''}</td></tr>`
 }).join('')
 const balances = report.retainerBalances.map(b => {
  const period = report.data.retainerPeriods.find(p => p.id === b.periodId)!
  const value = b.unit === 'hours' ? hours(b.remaining) : money(b.remaining,b.currency)
  return `<li><a href="/app/engagements?${e(new URLSearchParams({edit:b.engagementId,calculation:`retainer:${b.periodId}:remaining`}).toString())}#report-evidence">${e(nameOf(report.data.engagements,b.engagementId))} · ${e(report.data.retainers.find(r=>r.id===b.retainerId)!.value.terms.name)} · ${e(period.value.periodStart)} → ${e(period.value.periodEnd)} · ${value}</a>${b.closed?' · Closed snapshot':''}</li>`
 }).join('')
 return `<section class="g-block" id="revenue-dashboard"><h2>Pipeline to cash</h2><p class="g-lede">Snapshot ${e(report.asOf)}; WIP through ${e(dashboard.asOf)}. Signed value is the latest approved budget or won opportunity, counted once before billing. Hourly WIP is approved, not source-billed hourly work outside retainers plus reimbursable expenses, including work in billing packets. Fixed fees and retainer allowances are excluded from hourly WIP. These overlapping measures are not additive.</p>${rows?`<section class="g-card g-card--table"><div class="g-table"><table><thead><tr><th>Source currency</th><th>Weighted open pipeline</th><th>Signed value before billing</th><th>Hourly WIP and expenses · pre-tax</th></tr></thead><tbody>${rows}</tbody></table></div></section>`:'<p>No pipeline or engagement records yet.</p>'}<section class="g-card"><h3>Retainer balances</h3><p>Current saved-period statements, including approved work and linked adjustments; pending work affects only their provisional projection. These balances are not cash.</p>${balances?`<ul>${balances}</ul>`:'<p>No opened retainer periods.</p>'}</section><section class="g-card"><h3>Accounting and collection state</h3><ul><li>${e(dashboard.invoiceState)}</li><li>${e(dashboard.collectionState)}</li><li>${e(dashboard.connectorState)}</li>${dashboard.reconciliation.map(x=>`<li>${e(x)}</li>`).join('')}</ul><p>${report.cash?.months.length?'<a href="#cash-forecast">Expected invoices and cash by month</a> · ':''}<a href="/app/engagements#pipeline-title">Opportunity sources</a> · <a href="/app/billing">Billing preparation</a></p></section></section>`
}
