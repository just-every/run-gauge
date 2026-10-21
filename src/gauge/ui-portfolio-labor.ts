import type { Report } from './ui-describe'
import { escape as e } from './ui-forms'
import { money, hours } from './ui-format'

export function portfolioLaborSection(report:Report,base:URLSearchParams) {
 const p=report.portfolio;if(!p)return ''
 const link=(id:string,value:string)=>{const params=new URLSearchParams(base);params.set('calculation',id);return `<a href="?${e(params.toString())}#report-evidence">${value}</a>`}
 const rows=p.labor.rows.map(row=>{
  const prefix=`portfolioLabor:${encodeURIComponent(row.key)}:`
  const amount=(field:'laborCostMinor'|'hourlyBillableMinor'|'expenseCostMinor',known:number)=>link(prefix+field,row[field]===null?'Unknown':money(row[field],row.currency))+(row[field]===null?`<br><small>known ${money(known,row.currency)}</small>`:'')
  return `<tr><th scope="row">${e(row.team)} · ${e(row.service)} · ${e(row.currency)}</th><td data-label="Approved time" class="g-num">${link(prefix+'seconds',hours(row.seconds))}</td><td data-label="Labor cost" class="g-num">${amount('laborCostMinor',row.knownLaborCostMinor)}</td><td data-label="Expense cost" class="g-num">${amount('expenseCostMinor',row.expenseCostMinor)}</td><td data-label="Hourly billable value" class="g-num">${amount('hourlyBillableMinor',row.knownHourlyBillableMinor)}</td></tr>`
 }).join('')
 const fees=p.unattributedFees.map(row=>`<li>${e(row.currency)} · Unattributed fixed and retainer fees: ${link(`portfolioFees:${row.currency}`,row.minor===null?'Unknown':money(row.minor,row.currency))}${row.minor===null?` · known ${money(row.knownMinor,row.currency)}`:''}. Earned on their contractual calendar or working-day basis, recorded on the source version; never split between teams or services.</li>`).join('')
 return `<details class="g-card" id="portfolio-labor"><summary>Additive labor and expense costs by team and service</summary><p>Each approved source counts once, using its worker’s current team and recorded service. Expenses without a service stay in Unassigned expense service. These costs and hourly billable values sum across rows within each currency. Fixed and retainer fees stay unattributed below; this table does not claim a team or service margin.</p><div class="g-table"><table><thead><tr><th>Team, service and currency</th><th>Approved time</th><th>Labor cost</th><th>Expense cost</th><th>Hourly billable value</th></tr></thead><tbody>${rows}</tbody></table></div><ul>${fees}</ul></details>`
}
