// 10 "October closed. November booked.": the copy on the left beside the expected cash, then the close packet for
// Karen Liu, CPA, beside utilization and the signed backlog.
import { dot, to, nw, done, lock, head } from './parts'

const checks: [string, string][] = [
 ['Missing time', `0${dot}22 of 22 sheets every week`],
 ['Unapproved expenses', '0'],
 ['Retainer usage posted', 'Willamette CU 31.5 of 40'],
 ['Invoices issued', `16${dot}1044–1059${dot}${nw('$248,640.00')}`],
 ['Settled cash', '$231,905.00'],
 ['QuickBooks Online', `16 invoices${dot}1 ACH return reconciled (1039)${dot}0 mismatches`],
 ['Unbilled work', `${nw('$41,300.00')}${to}November drafts`],
]
const packet = '<div class="card packet"><h3 class="serif-title">October 2026&nbsp;· close</h3><p class="card-sub">For Karen Liu, CPA</p>'
 + `<ul class="packet-rows" role="list">${checks.map(([k, v]) => `<li>${done()}<p class="packet-k">${k}</p><p class="packet-v">${v}</p></li>`).join('')}</ul>`
 + `<p class="packet-lock">${lock()}<span>Locked by Jess Alvarez${dot}${nw('4:15 pm')}</span></p></div>`

const months: [string, number, string, string?][] = [['Nov', 318400, '$318,400', 'range $301,200–$318,400'], ['Dec', 296700, '$296,700'], ['Jan', 274900, '$274,900']]
const forecast = `<div class="card cash-fc"><h3 class="card-title">Expected cash${dot}committed${dot}as of ${nw('Mon Nov 2')}</h3><ul class="fc-rows" role="list">`
 + months.map(([m, v, label, range]) => `<li><p class="fc-m">${m}</p><span class="fc-bar" style="--v:${(v / 380000) * 100}%"><i></i></span><p class="fc-v"><b>${label}</b>${range ? `<span>${range}</span>` : ''}</p></li>`).join('')
 + `</ul><p class="fc-pending"><span class="ring-sm" aria-hidden="true"></span><span>Invoice 1047${dot}${nw('$28,800.00')}${dot}ACH pending${dot}expected ${nw('Wed Nov 4')}</span></p></div>`
const utilization = `<div class="card util"><h3 class="card-title">October billable utilization</h3><p class="util-big">78%</p><p class="card-sub">2,265.0 of 2,904.0 available hrs${dot}target 75%${dot}${nw('+3 pts')}</p></div>`
const backlog = `<div class="card backlog"><p><b class="backlog-big">$1.12M</b> <span class="backlog-label">signed backlog${dot}forecast margin 29.4%</span></p><p class="card-sub">+ ${nw('$186,000')} weighted pipeline, shown apart</p></div>`

export function closeSection() {
 return `<section class="band band--white" aria-labelledby="close-title"><div class="wrap close-grid"><div class="close-copy">${head('close-title', 'Close&nbsp;· Mon Nov 2', 'October closed. November booked.', 'Gauge lists October’s loose ends until none are left. Jess locks the month for Karen, the outside accountant, and sees what the next three months bring in.')}</div>`
  + `${forecast}${packet}<div class="close-side">${utilization}${backlog}</div></div></section>`
}
