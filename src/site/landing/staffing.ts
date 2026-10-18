// 05 "Two sick days, same launch date.": the five-week staffing board as of Fri Oct 23 with both launch lines on their
// Fridays, Diego's struck hours and the agent's pinned callout. Under 900 px the grid becomes a person-first stack.
import { dot, to, nw, avatar, check, flag, done, clientName, type Client, head } from './parts'

type Booking = [Client, number, ('tentative' | 'struck')?]
interface Lane { initials: string; tone: string; name: string; load: string; weeks: Booking[][] }
const weeks = ['Mon Oct 19', 'Mon Oct 26', 'Mon Nov 2', 'Mon Nov 9', 'Mon Nov 16']
const lanes: Lane[] = [
 { initials: 'MC', tone: 'mint', name: 'Maya Chen', load: '32 of 36 hrs', weeks: [
  [['cascade', 24], ['willamette', 4], ['treasure', 4]],
  [['cascade', 28], ['willamette', 4]],
  [['cascade', 28], ['willamette', 4]],
  [['cascade', 16], ['capitol', 16], ['willamette', 4]],
  [['rose', 12], ['capitol', 16], ['willamette', 4]] ] },
 { initials: 'PP', tone: 'sky', name: 'Priya Patel', load: '28 of 32 hrs', weeks: [
  [['cascade', 16], ['pacific', 8], ['willamette', 4]],
  [['cascade', 16], ['pacific', 8], ['willamette', 4]],
  [['cascade', 16], ['pacific', 4], ['willamette', 4]],
  [['cascade', 16], ['pacific', 4], ['willamette', 4]],
  [['pacific', 8], ['willamette', 4], ['cascade', 8, 'tentative']] ] },
 { initials: 'SR', tone: 'sky', name: 'Sam Reyes', load: '32 of 36 hrs', weeks: [
  [['pacific', 28], ['willamette', 4]],
  [['pacific', 28], ['willamette', 4]],
  [['pacific', 28], ['willamette', 4]],
  [['pacific', 28], ['willamette', 4]],
  [['pacific', 24], ['willamette', 4]] ] },
 { initials: 'DR', tone: 'rose', name: 'Diego Ramos', load: nw('out sick Tue–Wed'), weeks: [
  [['cascade', 14, 'struck']],
  [['cascade', 24], ['pacific', 8]],
  [['cascade', 24], ['pacific', 8]],
  [['cascade', 20], ['pacific', 12]],
  [['pacific', 20], ['pacific', 8, 'tentative']] ] },
 { initials: 'TB', tone: 'lilac', name: 'Tom Becker (1099)', load: '20 of 20 hrs', weeks: [
  [['cascade', 6], ['cascade', 14]],
  [['cascade', 6]],
  [['cascade', 6]],
  [['capitol', 12, 'tentative']],
  [['capitol', 12, 'tentative']] ] },
]
const label = (b: Booking, lane: Lane, i: number) => lane.name === 'Tom Becker (1099)' && i === 1 ? '+ Diego’s 14' : `${b[0] === 'pacific' && lane.name === 'Priya Patel' ? 'Pacific Trail UX' : clientName[b[0]]} ${b[1]}`
const bar = (b: Booking, lane: Lane, week: number, i: number) => `<span class="sb sb--${b[0]}${b[2] ? ` sb--${b[2]}` : ''}" style="--h:${week === 0 ? 88 : Math.round(58 + Math.min(b[1] / 28, 1) * 36)}%" title="${clientName[b[0]]} · ${b[1]} hrs${b[2] ? ` · ${b[2] === 'struck' ? 'out sick' : 'tentative'}` : ''}">${week === 0 ? `<span>${label(b, lane, i)}</span>` : ''}</span>`

function board() {
 const headRow = `<div class="sg-corner"></div>${weeks.map((w, i) => `<div class="sg-week"><span>${w}</span>${i === 3 ? `<em class="sg-launch">Cascade Cider launch&nbsp;· ${nw('Fri Nov 13')}</em>` : i === 4 ? `<em class="sg-launch">Pacific Trail launch&nbsp;· ${nw('Fri Nov 20')}</em>` : ''}</div>`).join('')}`
 const body = lanes.map(lane => `<div class="sg-person">${avatar(lane.initials, lane.tone)}<p><b>${lane.name}</b>${dot}${lane.load}</p></div>`
  + lane.weeks.map((bookings, w) => `<div class="sg-cell">${bookings.map((b, i) => bar(b, lane, w, i)).join('')}${lane.name === 'Diego Ramos' && w === 0 ? `<span class="sg-flag">${flag()}</span>` : ''}${lane.name === 'Priya Patel' && w === 0 ? `<p class="sg-request"><span class="hc-dot" aria-hidden="true"></span><span>UX designer${dot}20 hrs${dot}Pacific Trail${to}Priya Patel approved${dot}${nw('Tue Oct 20, 9:48 am')}</span></p>` : ''}</div>`).join('')).join('')
 const placeholder = `<div class="sg-person">${avatar('--', 'sun')}<p>Senior developer${dot}placeholder</p></div>${[0, 1, 2].map(() => '<div class="sg-cell"><span class="sb sb--open"></span></div>').join('')}<div class="sg-cell sg-cell--span"><span class="sb sb--placeholder"><span>Senior developer${dot}placeholder${dot}24 hrs/wk${dot}Capitol Grain from ${nw('Mon Nov 9')}</span></span></div>`
 return `<div class="sg">${headRow}${body}${placeholder}<span class="sg-line sg-line--cascade"></span><span class="sg-line sg-line--pacific"></span></div>`
}

const callout = `<div class="card sg-callout"><p class="sg-when">${flag()}<span>${nw('Tue Oct 20')}${dot}${nw('7:40 am')}</span></p><p class="sg-what"><b>Diego Ramos out sick ${nw('Tue–Wed')}</b>${dot}14 committed hrs on Cascade Cider</p>`
 + `<p class="sg-agent">Agent${dot}${nw('7:46 am')}</p><ul class="options" role="list"><li class="opt is-picked"><span class="radio" aria-hidden="true"></span><p>A${dot}Tom Becker (1099) takes 14 hrs${dot}cost +$238${dot}margin 31% holds${dot}launch ${nw('Fri Nov 13')} ${check()}</p></li>`
 + `<li class="opt"><span class="radio" aria-hidden="true"></span><p>B${dot}Sam Reyes takes 14 hrs${dot}Pacific Trail loses 14 hrs${dot}launch ${nw('Fri Nov 20')} at risk</p></li></ul>`
 + `<p class="sg-approved">Owen Park approved A${dot}${nw('8:20 am')}${dot}Tom confirmed ${nw('8:31 am')}</p><p class="sg-held">${done()}<span>Launch still ${nw('Fri Nov 13')} ${check()}</span></p></div>`

/** The 390 plan: one card per person (this week's load and its bar), then the callout, the launches and November. */
function stack() {
 const person = (lane: Lane) => `<li class="card sp"><div class="sp-head">${avatar(lane.initials, lane.tone)}<p><b>${lane.name}</b>${dot}${lane.load}</p>${lane.name === 'Diego Ramos' ? flag() : ''}</div>`
  + `<p class="sp-bar">${lane.weeks[0].map(b => `<span class="sb sb--${b[0]}${b[2] ? ` sb--${b[2]}` : ''}" style="--grow:${b[1]}"></span>`).join('')}</p>`
  + `<p class="sp-list">${lane.weeks[0].map((b, i) => `<span class="${b[2] === 'struck' ? 'is-struck' : ''}">${label(b, lane, i)}</span>`).join(dot)}</p></li>`
 return `<div class="sp-stack"><p class="sp-week">Week of ${nw('Mon Oct 19')}${dot}as of ${nw('Fri Oct 23')}</p><ul class="sp-people" role="list">${lanes.map(person).join('')}</ul>${callout.replace('card sg-callout', 'card sg-callout sg-callout--stack')}`
  + `<ul class="card sp-facts" role="list"><li><span class="sp-line sp-line--cascade"></span><span>Cascade Cider launch${dot}${nw('Fri Nov 13')}</span></li><li><span class="sp-line sp-line--pacific"></span><span>Pacific Trail launch${dot}${nw('Fri Nov 20')}</span></li>`
  + `<li><span class="sb sb--placeholder sp-mini"></span><span>Senior developer${dot}placeholder${dot}24 hrs/wk${dot}Capitol Grain from ${nw('Mon Nov 9')}</span></li><li><span class="sb sb--rose sp-mini"></span><span>Rose City Running Co.${dot}retainer${dot}Maya from ${nw('Mon Nov 16')}</span></li>`
  + `<li><span class="hc-dot" aria-hidden="true"></span><span>UX designer${dot}20 hrs${dot}Pacific Trail${to}Priya Patel approved${dot}${nw('Tue Oct 20, 9:48 am')}</span></li></ul></div>`
}

export function staffingSection() {
 const top = `<div class="sg-top"><div>${head('staffing-title', 'Staffing&nbsp;· Week of Mon Oct 19', 'Two sick days, same launch date.')}</div><p class="lede">Every person’s committed, tentative and open hours, five weeks out. When Diego calls in sick, the agent finds who can take his hours and the launch date holds.</p></div>`
 const legend = '<ul class="sg-legend" role="list"><li><span class="lgd lgd--solid"></span>Committed</li><li><span class="lgd lgd--tentative"></span>Tentative</li><li><span class="lgd lgd--open"></span>Open</li></ul>'
 const card = `<div class="card sg-card"><div class="sg-bar"><p class="sg-title"><b>Staffing</b>${dot}as of ${nw('Fri Oct 23')}</p>${legend}</div><div class="sg-scroll" role="img" aria-label="Staffing board as of Fri Oct 23, weeks of Oct 19 to Nov 16. Maya Chen 32 of 36 hours, Priya Patel 28 of 32, Sam Reyes 32 of 36, Diego Ramos out sick Tuesday and Wednesday with 14 Cascade Cider hours struck, Tom Becker 20 of 20 including Diego’s 14. Cascade Cider launches Fri Nov 13 and Pacific Trail Fri Nov 20.">${board()}</div>${callout}</div>`
 return `<section class="band band--white band--staffing" aria-labelledby="staffing-title"><div class="wrap">${top}${card}${stack()}</div></section>`
}
