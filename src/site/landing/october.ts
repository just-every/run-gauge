// 02 "Five clients, one October.": Northbound Studio's month on one true-scale axis, Thu Oct 1 to Mon Nov 2. Every
// stop sits on its date; three claret exceptions each resolve in a check. Under 1100 px the axis turns vertical.
import { chip, check, dot, to, nw, head, section, type Client } from './parts'

const DAYS = 32 // Oct 1 → Nov 2
const at = (day: number) => (day / DAYS) * 100
interface Stop { day: number; date: string; rows: { client: Client; text: string }[]; side: 'up' | 'down'; slot: number; kind?: 'exception' | 'resolved'; align?: 'end'; max?: number }
// slot: where the label starts, as a share of the axis (the label sits clear of its neighbours; a leader runs to the dot).
const stops: Stop[] = [
 { day: 0, date: 'Thu Oct 1', side: 'up', slot: -1, rows: [{ client: 'willamette', text: `Sep retainer${dot}invoice 1044${dot}${nw('$12,900.00')}` }] },
 { day: 1, date: 'Fri Oct 2', side: 'down', slot: 3.6, rows: [{ client: 'cascade', text: 'Milestone 2 accepted by Lena Ortiz' }] },
 { day: 4, date: 'Mon Oct 5', side: 'up', slot: 18.2, max: 250, rows: [{ client: 'cascade', text: `Invoice 1047${dot}${nw('$28,800.00')}${dot}Net 30` }] },
 { day: 11, date: 'Mon Oct 12', side: 'down', slot: 29.6, kind: 'exception', rows: [{ client: 'pacific', text: `ACH returned${to}card ${nw('Wed Oct 14')} ${check()}` }] },
 { day: 18, date: 'Mon Oct 19', side: 'up', slot: 47.4, kind: 'exception', rows: [{ client: 'pacific', text: 'Checkout +36 hrs' }] },
 { day: 19, date: 'Tue Oct 20', side: 'down', slot: 48.6, kind: 'exception', max: 172, rows: [{ client: 'cascade', text: `Diego out sick${to}Tom Becker covers ${check()}` }] },
 { day: 20, date: 'Wed Oct 21', side: 'up', slot: 62.6, rows: [{ client: 'capitol', text: 'Proposal signed' }] },
 { day: 21, date: 'Thu Oct 22', side: 'down', slot: 65.4, kind: 'resolved', max: 220, rows: [{ client: 'pacific', text: `Change order ${nw('$6,300')} e-signed${dot}margin ${nw('22% → 29%')} ${check()}` }] },
 { day: 25, date: 'Mon Oct 26', side: 'up', slot: 79.6, max: 240, rows: [{ client: 'studio', text: '22 of 22 timesheets approved' }] },
 { day: 32, date: 'Mon Nov 2', side: 'down', slot: 100, align: 'end', max: 140, rows: [{ client: 'studio', text: `October closed${dot}locked 4:15 pm` }, { client: 'treasure', text: `Not-to-exceed reached${dot}50 min held` }] },
]
const mondays = [[0, 'Oct 1'], [4, 'Oct 5'], [11, 'Oct 12'], [18, 'Oct 19'], [25, 'Oct 26'], [32, 'Nov 2']] as const

const label = (s: Stop) => `<div class="tl-stop tl-stop--${s.side}${s.align ? ' tl-stop--end' : ''}" style="--slot:${s.slot}%${s.max ? `;--max:${s.max}px` : ''}"><p class="tl-date">${s.date}</p>`
 + s.rows.map(r => `<div class="tl-row">${chip(r.client)}<p>${r.text}</p></div>`).join('') + '</div>'

function axis() {
 const ticks = Array.from({ length: DAYS + 1 }, (_, d) => `<line x1="${at(d)}%" x2="${at(d)}%" y1="${mondays.some(m => m[0] === d) ? 194 : 197}" y2="${mondays.some(m => m[0] === d) ? 206 : 203}" class="tl-tick"/>`).join('')
 // a leader: straight from the label's anchor, then an elbow to the dot on the axis
 const leaders = stops.map(s => {
  const anchor = s.align === 'end' ? s.slot - 1.2 : s.slot + 1.6, x = at(s.day), up = s.side === 'up'
  // a leader from below ends under its Monday label when the stop has one, else at the dot
  const labelled = mondays.some(m => m[0] === s.day), y0 = up ? 130 : 270, y1 = up ? 160 : 252, y2 = up ? 194 : labelled ? 236 : 206
  return `<line x1="${anchor}%" x2="${anchor}%" y1="${y0}" y2="${y1}"/><line x1="${anchor}%" x2="${x}%" y1="${y1}" y2="${y2}"/>`
 }).join('')
 const dots = stops.map(s => `<circle cx="${at(s.day)}%" cy="200" r="7" class="tl-dot${s.kind === 'exception' ? ' tl-dot--exception' : ''}"/>`).join('')
 return `<svg class="tl-axis" width="100%" height="400" aria-hidden="true"><line x1="0" x2="100%" y1="200" y2="200" class="tl-base"/>${ticks}<g class="tl-leaders">${leaders}</g>${dots}</svg>`
  + mondays.map(([d, l]) => `<span class="tl-day" style="--at:${at(d)}%">${l}</span>`).join('')
}

/** Under 1100 px: the same stops down a vertical line, in date order. */
const vertical = () => `<ol class="tl-list">${stops.map(s => `<li class="${s.kind === 'exception' ? 'is-exception' : ''}"><p class="tl-date">${s.date}</p>${s.rows.map(r => `<div class="tl-row">${chip(r.client)}<p>${r.text}</p></div>`).join('')}</li>`).join('')}</ol>`

export function october() {
 const card = `<div class="card tl" role="group" aria-label="Northbound Studio, October 1 to November 2"><div class="tl-wide" aria-hidden="true"><div class="tl-track">${axis()}${stops.map(label).join('')}</div></div>${vertical()}`
  + `<div class="tl-foot"><p>${nw('Oct 1 → Nov 2')}${dot}16 invoices${dot}${nw('$248,640.00')}</p><p class="tl-closed">October closed ${check()}</p></div></div>`
 return section('october-title', 'pale', head('october-title', 'Northbound Studio&nbsp;· Oct 1 – Nov 2', 'Five clients, one October.', 'One 22-person studio in Portland, followed through a month: a new client won, a retainer counted, a launch kept, a project rescued and a returned payment collected.') + card, 'band--october')
}
