// 07 "Checkout grew 36 hours. Margin recovered." (the one dark band): the case, the costed options and the refused
// one, Rachel's decision, the client's signature and the agent's verification, then three result tiles.
import { dot, nw, check, flag, head } from './parts'

const option = (letter: string, body: string, state: '' | 'picked' | 'refused' = '') => `<li class="opt${state ? ` is-${state}` : ''}"><span class="radio" aria-hidden="true"></span><p>${letter ? `${letter}${dot}` : ''}${body}</p></li>`
const caseCard = '<div class="card rc"><h3 class="card-title card-title--big">Pacific Trail Outfitters&nbsp;· checkout rebuild</h3>'
 + `<p class="card-sub">${nw('$63,900.00')} fixed fee${dot}signed at 27% margin${dot}launch ${nw('Fri Nov 20')}</p>`
 + `<div class="rc-alert">${flag()}<p>${nw('Mon Oct 19')}${dot}${nw('2:40 pm')}${dot}${nw('PT-212')} Afterpay at checkout + ${nw('PT-214')} In-store pickup${dot}+36 hrs (UX 20${dot}development 16)</p><span class="rc-badge">Forecast margin ${nw('27% → 22%')}</span></div>`
 + `<ul class="options" role="list">${option('A', `<b>Change order</b>${dot}${nw('36 hrs × $175 = $6,300')}${dot}launch ${nw('Fri Nov 20')} holds${dot}margin 29%`, 'picked')}`
 + option('B', `<b>Absorb the work</b>${dot}launch holds${dot}margin 22%`)
 + option('', '<s>Not offered: build starts before UX sign-off</s>', 'refused') + '</ul></div>'

const event = (when: string, what: string) => `<li><p class="rt-when">${when}</p><p>${what}</p></li>`
const timeline = '<ol class="rt" role="list">'
 + event(`${nw('Mon Oct 19')}${dot}${nw('3:10 pm')}`, 'Case opened')
 + event(`${nw('Tue Oct 20')}${dot}${nw('9:05 am')}`, 'Rachel Kim picked A')
 + event(`${nw('Tue Oct 20')}${dot}${nw('9:52 am')}`, 'Change order v2 sent to Ben Halvorsen via Inkwell')
 + event(`${nw('Thu Oct 22')}${dot}${nw('2:14 pm')}`, 'Ben Halvorsen e-signed')
 + `<li class="rt-verified"><span class="rt-check">${check()}</span><div><p class="rt-when">Verified${dot}${nw('Fri Oct 23')}${dot}${nw('9:00 am')}</p><p>Priya 20 hrs + Sam 16 hrs committed${dot}launch ${nw('Fri Nov 20')} holds${dot}case closed</p></div></li></ol>`

const tile = (eyebrow: string, value: string) => `<div class="tile"><p class="tile-eyebrow">${eyebrow}</p><p class="tile-value">${value}</p></div>`

export function recoverySection() {
 return `<section class="band band--navy" aria-labelledby="recovery-title"><div class="wrap">${head('recovery-title', 'Recovery&nbsp;· Pacific Trail&nbsp;· Mon Oct 19 – Fri Oct 23', 'Checkout grew 36 hours. Margin recovered.', 'When the checkout grew, the agent priced the fixes against the team’s real capacity and the signed terms. Rachel picked one, the client signed, and the agent checked that it held.')}`
  + `<div class="rc-grid">${caseCard}${timeline}</div><div class="tiles">${tile('Margin', `22%&nbsp;→ 29%`)}${tile('Launch', `${nw('Fri Nov 20')}&nbsp;· ${nw(`held ${check()}`)}`)}${tile('December cash', '+$6,300')}</div></div></section>`
}
