import type { Report } from './ui-describe'
import { escape as e } from './ui-forms'
import { money, hours } from './ui-format'

export function portfolioLaborSection(report:Report,base:URLSearchParams) {
 const p=report.portfolio;if(!p)return ''
 const rows=p.labor.rows.map(row=>{
  const params=new URLSearchParams(base);params.set('calculation',`portfolioLabor:${encodeURIComponent(row.key)}:costMinor`)
  return `<tr><th scope="row">${e(row.team)} · ${e(row.service)} · ${e(row.currency)}</th><td data-label="Approved time" class="g-num">${hours(row.seconds)}</td><td data-label="Approved cost" class="g-num"><a href="?${e(params.toString())}#report-evidence">${row.costMinor===null?'Unknown':money(row.costMinor,row.currency)}</a>${row.costMinor===null?`<br><small>known ${money(row.knownCostMinor,row.currency)}</small>`:''}</td></tr>`
 }).join('')
 return `<details class="g-card" id="portfolio-labor"><summary>Additive labor and expense costs by team and service</summary><p>Each approved source counts once, using its worker’s current team and recorded service. Expenses without a service stay in Unassigned expense service. These costs sum across rows within each currency. Fixed and retainer fees stay on their projects and are not allocated here; this table does not claim a team or service margin.</p><div class="g-table"><table><thead><tr><th>Team, service and currency</th><th>Approved time</th><th>Approved cost</th></tr></thead><tbody>${rows}</tbody></table></div></details>`
}
