// 04 "31.5 hours used, 8.5 carried over.": Willamette CU's October statement, September's overage invoice and the
// client portal on a phone showing the same numbers. The people bar uses neutral tints, never client colours.
import { dot, to, nw, avatar, check, swatch, head, section } from './parts'

const used = [['MC', 'Maya Chen', 12.0], ['SR', 'Sam Reyes', 10.0], ['PP', 'Priya Patel', 7.5], ['MB', 'Marcus Bell', 2.0]] as const
const row = (label: string, value: string, extra = '') => `<div class="st-row${extra}"><dt>${label}</dt><dd>${value}</dd></div>`

const statement = `<div class="card st"><div class="st-head">${swatch('willamette')}<div><h3 class="card-title card-title--big">Willamette CU&nbsp;· October statement</h3>`
 + `<p class="card-sub">${nw('$12,000.00')} a month${dot}40 hrs included${dot}overage ${nw('$300.00/hr')}${dot}up to 10 unused hrs roll over</p></div></div><dl class="st-rows">`
 + row('Included', '40.0 hrs')
 + row('Carried from September', `0.0 hrs${dot}<span class="quiet">September ran over</span>`)
 + `<div class="st-row st-row--used"><dt>Used</dt><dd>31.5 hrs</dd><div class="st-bar" role="img" aria-label="31.5 of 40 hours used: Maya Chen 12.0, Sam Reyes 10.0, Priya Patel 7.5, Marcus Bell 2.0">${used.map(([, , h], i) => `<span class="st-seg st-seg--${i}" style="--w:${(h / 40) * 100}%"></span>`).join('')}</div>`
 + `<ul class="st-people">${used.map(([i, n, h], k) => `<li>${avatar(i, `n${k}`)}${n} ${h.toFixed(1)}</li>`).join('')}</ul></div>`
 + row('Remaining', `8.5 hrs <span class="tag-soft">${to.trim()} carried into November</span>`)
 + row('November opens', `48.5 hrs${dot}8.5 expire ${nw('Mon Nov 30')}`)
 + `</dl><div class="agent-line"><p class="agent-name">Agent</p><p>Priya’s 2.0 hrs from ${nw('Fri Oct 30')} were waiting for approval${dot}Marcus approved ${nw('Mon Nov 2, 9:10 am')}${dot}statement posted</p></div>`
 + `<div class="st-notes"><p>September${dot}43.0 hrs${dot}3 overage hrs × ${nw('$300.00')} = ${nw('$900.00')}${dot}invoice 1044${dot}${nw('$12,900.00')}${dot}paid ${check()}</p><p>Invoice 1060${dot}${nw('$12,000.00')}${dot}issued ${nw('Mon Nov 2')}</p></div></div>`

const portalRow = (text: string, ok = true) => `<li>${ok ? `<span class="ph-check">${check()}</span>` : '<span class="ph-dot" aria-hidden="true"></span>'}<span>${text}</span></li>`
const phone = '<figure class="phone-wrap"><div class="phone" role="img" aria-label="Willamette CU’s client portal on a phone: October retainer, 31.5 of 40 hours used"><div class="phone-screen">'
 + '<p class="ph-status"><span>10:14</span><span class="ph-island" aria-hidden="true"></span><span class="ph-icons" aria-hidden="true"><i></i><i></i><i></i></span></p>'
 + `<p class="ph-client">${swatch('willamette')}<span><b>Willamette CU</b>${dot}Client portal</span></p><p class="ph-title">October retainer</p><span class="ph-bar" aria-hidden="true"><i></i></span><p class="ph-used">31.5 of 40 hrs used</p>`
 + `<ul class="ph-list">${portalRow('8.5 hrs roll into November')}${portalRow(`November${dot}48.5 hrs available`)}${portalRow(`Invoice 1060${dot}${nw('$12,000.00')}${dot}issued ${nw('Mon Nov 2')}`, false)}${portalRow(`September${dot}invoice 1044${dot}paid`)}</ul>`
 + `</div></div><figcaption>Viewed by Helen Ostrander${dot}${nw('Mon Nov 2, 10:14 am')}</figcaption></figure>`

export function retainerSection() {
 return section('retainer-title', 'pale', head('retainer-title', 'Retainer&nbsp;· Willamette CU&nbsp;· October', '31.5 hours used, 8.5 carried over.', 'The retainer counts every approved hour against its own rules. Unused time rolls forward, overage bills at the agreed rate, and the client sees the same statement.')
  + `<div class="st-grid">${statement}${phone}</div>`)
}
