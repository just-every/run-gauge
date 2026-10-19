import type { Report } from './ui-describe'
import { describeSource } from './ui-describe'
import { escape as e } from './ui-forms'
import { hours, money } from './ui-format'

export function reportEvidence(report: Report, selected?: string) {
 const label = (f: Report['lineage'][number]) => {
  const parts=f.id.split(':'), kind=parts[0]==='economics'?'engagements':parts[0]==='capacity'?'people':parts[0]==='corrections'?'packets':null
  const row=kind?report.data[kind].find(r=>r.id===parts[1]):null
  return [row?.value.name??row?.value.title, parts[0]==='pipeline'?parts[1]:null, /^\d{4}-/.test(parts[2]??'')?parts[2]:null, f.label].filter(Boolean).join(' · ')
 }
 const base = new URLSearchParams({ from: report.from, to: report.to })
 const download = new URLSearchParams({ ...Object.fromEntries(base), fingerprint: report.fingerprint })
 const display = (f: Report['lineage'][number], value = f.value) => value === null ? 'Unknown / incomplete' : f.unit === 'minor' ? money(value, f.currency ?? report.agency.currency) : f.unit === 'seconds' ? hours(value) : String(value)
 const figures = selected ? report.lineage.filter(f => f.id === selected) : []
 const rows = figures.map(f => {
  const links = f.sources.map(s => { const source = describeSource(report.data, `${s.kind}:${s.id}`); return `<li><a href="${e(source.href)}">${e(source.text)}</a> · <a href="/api/gauge/history/${e(s.kind)}/${e(s.id)}">Revision history</a><span class="g-sub">Revision ${e(s.revision)}${s.value.approvedAt ? ` · approved ${e(new Date(s.value.approvedAt).toISOString())}` : ''}${s.value.economics?.rateId ? ` · frozen rate ${e(s.value.economics.rateId)}` : ''}</span></li>` }).join('')
  return `<article class="g-card" id="calculation-${e(f.id)}"><h3>${e(label(f))}</h3><p class="g-summary g-num">${e(display(f))}${!f.complete && f.knownValue !== undefined ? ` · Known subtotal ${e(display(f, f.knownValue))}` : ''}</p><p>${e(f.formula)}</p>${f.unknownSources.length ? `<details><summary>Unknown or restricted sources (${f.unknownSources.length})</summary><ul>${f.unknownSources.map(s=>`<li>${e(s)}</li>`).join('')}</ul></details>` : ''}<details><summary>Source revisions (${f.sources.length})</summary><ul class="g-versions">${links || '<li>No contributing source records.</li>'}</ul></details></article>`
 }).join('')
 return `<details class="g-records" id="report-evidence"${selected ? ' open' : ''}><summary>Report calculations and sources</summary><p class="g-lede">As of ${e(report.asOf)}. Period ${e(report.from)} through ${e(report.to)}; engagement economics cover all approved work. Money is in exact currency cents and durations in whole seconds in the download. Unknown values remain incomplete; known subtotals exclude missing amounts.</p><p><a class="g-link" href="/api/gauge/report.csv?${e(download.toString())}">Download report calculations CSV</a></p><form class="g-form" method="get"><input type="hidden" name="from" value="${e(report.from)}"><input type="hidden" name="to" value="${e(report.to)}"><label class="g-field g-field--wide"><span>Calculation</span><select name="calculation">${report.lineage.map(f => `<option value="${e(f.id)}"${selected === f.id ? ' selected' : ''}>${e(label(f))}</option>`).join('')}</select></label><div class="g-actions"><button class="g-btn g-btn--secondary">Inspect calculation</button></div></form><div class="g-forms">${rows}</div></details>`
}
