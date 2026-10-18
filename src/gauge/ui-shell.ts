// The app's frame from the owner's pick (desk-gauge/app, option J): the ink rail with the mark, the serif wordmark and
// one labelled link per workspace page; the top bar with today's date in the workspace calendar, its timezone and the
// signed-in person (no sync status: Gauge syncs nothing); and the agent strip, which names the agent and what waits for this person's decision.
import type { Actor } from './store'
import { escape as e } from './ui-forms'

export const tabLabels: Record<string, string> = { review: 'Review', engagements: 'Engagements', capacity: 'Staffing', time: 'Time', expenses: 'Expenses', billing: 'Billing', rates: 'Rates', imports: 'Imports', access: 'Access' }

// 24 px line icons, drawn in the rail's ink and the active tab's turquoise.
const paths: Record<string, string> = {
 review: '<path d="M4 5h16M4 12h10M4 19h7"/><path d="m15 17 2 2 4-4"/>',
 engagements: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/>',
 capacity: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.4-.2 4.1 1.3 4.6 4.4"/>',
 time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 expenses: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6"/>',
 billing: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/>',
 rates: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
 imports: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 16v4h16v-4"/>',
 access: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.4-6 7-6s6.2 2.2 7 6"/>',
}
export const icon = (name: string) => `<svg class="g-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${paths[name] ?? ''}</svg>`

/** The brand lockup: the picked mark and the serif name. */
export const lockup = (href: string, name: string) => `<a class="g-brand" href="${href}"><img src="/brand/mark.svg" alt="" width="28" height="28"><span data-rer-name>${name}</span></a>`

/** The rail. Under 900 px it folds into a top bar whose links open from Menu (no script: the app's CSP allows none). */
export function rail(tabs: string[], section: string) {
 const links = tabs.map(t => `<li><a href="/app/${t}"${section === t ? ' aria-current="page"' : ''}>${icon(t)}<span>${tabLabels[t]}</span></a></li>`).join('')
 return `<nav class="g-rail" aria-label="Workspace">${lockup('/app', 'Gauge')}<details class="g-menu"><summary>Menu</summary><ul role="list">${links}</ul></details></nav>`
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
const zoneName = (zone: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'long' }).formatToParts(Date.now()).find(p => p.type === 'timeZoneName')?.value ?? zone
const weekdayDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
/** "Tue Oct 20" for a YYYY-MM-DD date. */
export const dayName = (date: string) => weekdayDate.format(new Date(`${date}T00:00:00Z`)).replace(',', '')

/** The top bar: today in the workspace calendar, the calendar's timezone and who is signed in. */
export function topBar(a: Actor, today: string, zone: string) {
 const name = a.session.operator.displayName, role = a.role.charAt(0).toUpperCase() + a.role.slice(1)
 return `<header class="g-top"><p class="g-today"><span>Today</span> <b>${e(dayName(today))}</b></p><p class="g-zone">${icon('time')}<span>Dates and times in ${e(zoneName(zone))}</span></p>`
  + `<p class="g-who"><span class="g-avatar" aria-hidden="true">${e(initials(name))}</span><span class="g-who-name">${e(name)}<span class="g-who-role">${e(role)}</span></span>${a.role === 'owner' ? '<a href="/auth/settings/identity">Account</a>' : ''}</p></header>`
}

/** The agent strip: the agent's name, its latest proposal waiting on this person, and how many wait in all. */
export function agentStrip(agent: string, what: string, waiting: number, href: string) {
 return `<aside class="g-agent" aria-label="${e(agent)}"><img src="/brand/mark.svg" alt="" width="22" height="22"><div><h2>${e(agent)}</h2><p>${e(what)}; ${waiting} awaiting your approval.</p></div><a href="${e(href)}">View details</a></aside>`
}
