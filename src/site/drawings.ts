// The homepage drawings: Gauge's real cards printed white on cyanotype sheets. Every string is a real label or a
// value the product shows; the sheet, lines and scales are decoration.
import { sheet } from '../gauge/ui-art'
import { ruler } from '../gauge/ui-ruler'

const h = (n: number) => `${n} h`
const download = '<svg class="w-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m-4-4 4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const arrow = '<svg class="w-arrow" viewBox="0 0 32 16" aria-hidden="true"><path d="M2 8h26m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const chip = (label: string) => `<span class="w-chip">${label}</span>`

/** The hero 1-2-3: time approved → on budget → ready to bill. */
export function heroDrawing() {
 const step = (n: number, title: string, card: string) => `<li class="w-step"><p class="w-step-head"><span class="w-num" aria-hidden="true">${n}</span>${title}</p><div class="w-card">${card}</div></li>`
 const steps = [
  step(1, 'Time approved', `<p class="w-row"><span>Mia Chen · Brand refresh</span><span class="g-num">6.5 h</span>${chip('approved')}</p>`),
  step(2, 'On budget', `<p class="w-title">Brand refresh</p><p class="g-num">42 h approved of 60 h</p>${ruler({ value: 42, end: 60, format: h, label: '42 h approved of 60 h', light: true, marker: 'bar' })}`),
  step(3, 'Ready to bill', `<p class="w-row"><span>Brand refresh · October</span>${chip('approved')}</p><p class="w-button">${download}Download approved CSV</p>`),
 ]
 return sheet(`<ol class="w-steps">${steps.join(`<li class="w-join">${arrow}</li>`)}</ol>`, 'w-hero', true, 'Gauge: time approved, engagement on budget, billing packet ready to bill')
}

const card = (content: string) => `<div class="w-card">${content}</div>`
const lines = '<span class="w-lines" aria-hidden="true"><i></i><i></i><i></i></span>'

export const drawings: Record<string, () => string> = {
 free: () => sheet(card(`<div class="w-licence"><svg class="w-doc" viewBox="0 0 48 64" aria-hidden="true"><path d="M2 2h30l14 14v46H2z M32 2v14h14 M10 30h26M10 38h26M10 46h26M10 54h16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><div><p class="w-title w-title--big">MIT License</p><p class="w-mono">Permission is hereby granted, free of charge,</p>${lines}</div></div>`), '', true, 'The MIT License: permission is hereby granted, free of charge'),
 agents: () => sheet(card(`<p class="w-title w-title--big">Time draft · Brand refresh</p><p class="w-rule">Evidence: calendar · Brand review</p>${lines}<p class="w-button">Approve exact proposal</p>`), '', true, 'An agent proposal, Time draft · Brand refresh, with its evidence and Approve exact proposal'),
 capacity: () => sheet(card(`<p class="w-title">Mia Chen</p><p class="g-num">Available 152 h · committed 120 h · remaining 32 h</p>${ruler({ value: 120, end: 152, format: h, label: 'Available 152 h · committed 120 h · remaining 32 h', light: true, marker: 'bar' })}`), '', true, 'Mia Chen: available 152 h, committed 120 h, remaining 32 h'),
 billing: () => sheet(card(`<p class="w-title w-rule">October · approved</p><p class="w-rule g-num">Mia Chen · 6.5 h</p><p class="w-rule g-num">Leo Park · 4 h</p><p class="w-button">${download}Download approved CSV</p>`), '', true, 'The October packet, approved: Mia Chen 6.5 h, Leo Park 4 h, Download approved CSV'),
 rates: () => {
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'], at = (m: number) => `${m * 20}%`, ticks = []
  for (let i = 0; i <= 50; i++) ticks.push(`<line x1="${i * 2}%" x2="${i * 2}%" y1="58" y2="${i % 10 ? 52 : 46}"/>`)
  const pin = (m: number, label: string, anchor: string) => `<line x1="${at(m)}" x2="${at(m)}" y1="30" y2="58" class="w-pin"/><circle cx="${at(m)}" cy="30" r="4"/><text x="${at(m)}" y="16" text-anchor="${anchor}">${label}</text>`
  return sheet(`<svg class="w-dates" aria-hidden="true" width="100%" height="96"><line x1="0" x2="100%" y1="58" y2="58"/>${ticks.join('')}${pin(1, 'Mia Chen · from 1 Jul', 'middle')}${pin(4, 'Mia Chen · from 1 Oct', 'middle')}${months.map((m, i) => `<text class="w-month" x="${at(i)}" y="84" text-anchor="${i === 0 ? 'start' : i === 5 ? 'end' : 'middle'}">${m}</text>`).join('')}</svg>`, 'w-sheet--dates', false, 'Two rate versions for Mia Chen on a dated scale: from 1 Jul and from 1 Oct')
 },
 'move-in': () => sheet(card(`<p class="w-title w-title--big w-centre w-rule">Harvest move-in</p><p class="w-centre">Reconciled preview</p><p class="w-button">Apply first bounded batch</p>`), '', false, 'Harvest move-in: Reconciled preview, Apply first bounded batch'),
}
