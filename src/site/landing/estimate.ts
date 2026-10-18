// 03 "Scoped, priced and signed in five days.": Capitol Grain's estimate v1 against v2, the proposal it became and
// the engagement created from it.
import { dot, nw, avatar, check, done, lock, head, section } from './parts'

const rows: [string, string, string, boolean?][] = [
 ['Discovery &amp; brand refresh', '80 hrs', '80 hrs'],
 ['Site design', '120 hrs', '120 hrs'],
 ['Build &amp; online ordering', '168 hrs', `168 hrs${dot}incl. Tom Becker 60`],
 ['Wholesale portal', '40 hrs', 'Phase 2', true],
 ['Project management', '32 hrs', '32 hrs'],
]
const totals: [string, string, string][] = [['Hours', '440', '400'], ['Fixed fee', '$58,400.00', '$52,800.00'], ['Margin', '36%', '34%']]

const estimate = '<div class="card est"><div class="card-head"><h3 class="card-title">Capitol Grain Bakery&nbsp;· Sacramento, CA&nbsp;· Estimate</h3>'
 + `<p class="est-private">${lock()}<span>Costs visible to finance</span></p></div>`
 + `<div class="est-scroll" role="region" aria-label="Estimate versions" tabindex="0"><table class="est-table"><thead><tr><th scope="col"><span class="sr">Line</span></th><th scope="col">v1${dot}<b>${nw('Fri Oct 16')}</b></th><th scope="col">v2${dot}<b>${nw('Mon Oct 19')}</b></th></tr></thead><tbody>`
 + rows.map(([line, v1, v2, moved]) => `<tr${moved ? ' class="is-moved"' : ''}><th scope="row">${line}</th><td>${v1}</td><td>${v2}</td></tr>`).join('')
 + `</tbody><tfoot>${totals.map(([k, a, b]) => `<tr><th scope="row">${k}</th><td>${a}</td><td>${b}</td></tr>`).join('')}</tfoot></table></div></div>`

const step = (body: string, state = '') => `<li class="steps-item${state ? ` is-${state}` : ''}">${state === 'done' ? done() : '<span class="steps-dot" aria-hidden="true"></span>'}<p>${body}</p></li>`
const proposal = '<div class="card prop"><h3 class="card-title">Proposal v2&nbsp;· Capitol Grain&nbsp;· website</h3><ol class="steps">'
 + step(`<b>Sent</b>${dot}${nw('Mon Oct 19')}${dot}${nw('11:30 am')}`)
 + step(`<b>Viewed</b> by Ana Morales${dot}${nw('1:02 pm')}`)
 + step(`<b>Accepted</b>${dot}${nw('Wed Oct 21')}${dot}${nw('10:48 am')}`, 'done')
 + `</ol><p class="pill-note">HubSpot deal${dot}Closed won ${nw('10:49 am')}</p></div>`

const engagement = `<div class="card eng"><h3 class="card-title">Engagement created&nbsp;· ${nw('10:51 am')}</h3><ul class="steps steps--plain">`
 + step(`Start ${nw('Mon Nov 9')}${dot}launch ${nw('Fri Jan 29, 2027')}`)
 + step(`Deposit + 3 milestones${dot}${nw('4 × $13,200.00')} = ${nw('$52,800.00')}`)
 + step(`Invoice 1052${dot}deposit${dot}Net 15${dot}paid by card ${nw('Fri Oct 23')} ${check()}`)
 + `<li class="steps-item is-placeholder"><span class="steps-dot" aria-hidden="true"></span><p>Senior developer${dot}placeholder${dot}24 hrs/wk from ${nw('Mon Nov 9')}</p></li>`
 + `<li class="steps-item is-person">${avatar('MC', 'mint')}<p>Designer${dot}Maya Chen${dot}16 hrs/wk</p></li></ul></div>`

export function estimateSection() {
 return section('estimate-title', 'white', head('estimate-title', 'Estimate&nbsp;· Fri Oct 16 – Wed Oct 21', 'Scoped, priced and signed in five days.', 'Rachel prices the bakery’s new site from role hours and real rates, trims it to fit, and the proposal comes back signed. The deal becomes an engagement with its team requested.')
  + `<div class="est-grid">${estimate}<div class="est-side">${proposal}<span class="est-link" aria-hidden="true"></span>${engagement}</div></div>`)
}
