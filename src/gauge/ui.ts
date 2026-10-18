import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import { finance, fence } from './store'
import { reports } from './reports'
import { type Kind, type Value, need, workDate } from './model'
import { escape as e } from './ui-forms'
import { hours, money, when, chip } from './ui-format'
import { type Report, describeSource } from './ui-describe'
import { artDefs, lockup } from './ui-art'
import { operations } from './ui-operations'
import { reviewSection } from './ui-review'
import { engagementsSection } from './ui-engagements'
import { timeSection } from './ui-time'

const tabLabels: Record<string, string> = { review: 'Review', engagements: 'Engagements', time: 'Time', expenses: 'Expenses', capacity: 'Capacity', rates: 'Rates', billing: 'Billing', imports: 'Imports', access: 'Access' }
export const tabsFor = (a: Actor) => a.role === 'agent' ? ['review'] : ['review', 'engagements', 'time', 'expenses', 'capacity', ...(finance(a) ? ['rates', 'billing', 'imports'] : []), ...(a.role === 'owner' ? ['access'] : [])]
const fonts = '<link rel="preload" href="/fonts/mona-sans/mona-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous"><link rel="stylesheet" href="/fonts/fonts.css">'

/** The app document: top bar, the cyanotype brand strip, the tab row (the current tab marked) and the page. */
export function shell(a: Actor, section: string, title: string, body: string, currency = a.currency) {
 const tabs = tabsFor(a).map(t => `<a href="/app/${t}"${section === t ? ' aria-current="page"' : ''}>${tabLabels[t]}</a>`).join('')
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · Gauge</title><link rel="icon" href="/favicon.ico" sizes="16x16 32x32"><link rel="apple-touch-icon" href="/apple-touch-icon.png">${fonts}<link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/cyanotype.css"><link rel="stylesheet" href="/gauge.css"></head>`
  + `<body class="g-app">${artDefs}<header class="g-top">${lockup('/app', 'Gauge').replace('<span>', '<span data-rer-name>')}<p class="g-who"><span>${e(a.session.operator.displayName)}<span class="g-who-role"> · ${e(a.role)}</span></span>${a.role === 'owner' ? '<a href="/auth/settings/identity">Account</a>' : ''}</p></header><div class="g-strip" aria-hidden="true"></div>`
  + `<nav class="g-tabs" aria-label="Workspace">${tabs}</nav><main class="g-main">${body}</main><footer class="g-foot">Owner-run agency operations · ${e(currency)} · Billing preparation only</footer></body></html>`
}

// Reporting periods follow the timezone chosen for the agency.
const workspaceZone=(a:Actor)=>a.timezone
const shift=(date:string,days:number)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10)
/** Today in the workspace timezone, its Monday–Sunday week and the next calendar month. */
export function periods(zone:string,now=Date.now()) {
 const today=workDate(now,zone),monday=shift(today,-((new Date(`${today}T00:00:00Z`).getUTCDay()+6)%7)),[y,m]=today.split('-').map(Number)
 return {today,week:[monday,shift(monday,6)],month:[new Date(Date.UTC(y,m,1)).toISOString().slice(0,10),new Date(Date.UTC(y,m+1,0)).toISOString().slice(0,10)]}
}

export async function appPage(env:Bindings,a:Actor,section:string,options:Value={}) {
 const {today,week,month}=periods(workspaceZone(a)),[from,to]=section==='capacity'?month:week
 const report=await reports(env,a,options.from??from,options.to??to)
 need(tabsFor(a).includes(section),'Page unavailable',404)
 let body=options.error?`<p class="g-alert" role="alert">${e(options.error)}</p>`:options.saved?'<p class="g-saved" role="status">Saved.</p>':''
 if(section==='review')body+=await reviewSection(env,a,report)
 if(section==='engagements')body+=engagementsSection(a,report,options,today)
 if(section==='time')body+=timeSection(a,report,options)
 body+=await operations(env,a,section,{...options,today},report)
 await fence(env,a)
 return shell(a,section,tabLabels[section],body,report.agency.currency)
}

const sectionOf: Partial<Record<Kind, string>> = { time: 'time', expenses: 'expenses', proposals: 'review', rates: 'rates', packets: 'billing', archives: 'imports', calendars: 'capacity', leave: 'capacity', staffing: 'capacity' }
const actions: Record<string, string> = { create: 'Created', update: 'Saved', approve: 'Approved', 'time:save': 'Saved', 'time:submit': 'Submitted', 'time:return': 'Returned', 'time:approve': 'Approved', 'time:correct': 'Reopened for correction', 'timer:stop': 'Timer stopped', 'expense:save': 'Saved', 'expense:file': 'Receipt added', 'expense:submit': 'Submitted', 'expense:return': 'Returned', 'expense:approve': 'Approved', 'proposal:approve': 'Approved', 'proposal:decline': 'Declined', 'proposal:withdraw': 'Withdrawn' }
const summary = (v: Value, currency: string) => [v.name ?? v.title ?? v.description, v.durationSeconds != null ? hours(v.durationSeconds) : null, v.amountMinor != null ? money(v.amountMinor, v.currency ?? currency) : null, v.reviewNote ?? v.reason].filter(Boolean).map(x => e(x)).join(' · ')

/** A record's revision history as a page, for people following "Review revision history"; the same route answers JSON to programs. */
export async function historyPage(env: Bindings, a: Actor, k: Kind, id: string, data: Report['data'], history: { revision: string; value: Value; actor: string; action: string; at: number }[]) {
 const names = new Map((await env.DB.prepare('SELECT id,display_name FROM oa_operators').all<{ id: string; display_name: string }>()).results.map(o => [o.id, o.display_name]))
 const zone = history.find(h => h.value.timezone)?.value.timezone ?? a.timezone
 const rows = history.map(h => `<tr><td data-label="Changed">${e(when(h.at, zone))}</td><td data-label="Change">${e(actions[h.action] ?? h.action.replace(/^[a-z-]+:/, '').replace(/^\w/, c => c.toUpperCase()))}</td><td data-label="By">${e(names.get(h.actor) ?? 'Unknown operator')}</td><td data-label="Earlier revision">${h.value.status ? chip(h.value.status) : ''} ${summary(h.value, data.engagements.find(r => r.id === h.value.engagementId)?.value.currency ?? a.currency)}</td></tr>`).join('')
 const back = sectionOf[k] ?? 'engagements'
 const body = `<nav class="g-crumbs" aria-label="Breadcrumb"><a href="/app/${back}">${e(tabLabels[back])}</a><span aria-hidden="true">/</span><span aria-current="page">Revision history</span></nav><h1>Revision history</h1><p class="g-summary">${e(describeSource(data, `${k}:${id}`).text)}</p><p class="g-lede">Each row keeps the revision as it was before the change, who changed it and when.</p>`
  + `<section class="g-card g-card--table"><h2>Earlier revisions</h2>${rows ? `<div class="g-table"><table><thead><tr><th scope="col">Changed</th><th scope="col">Change</th><th scope="col">By</th><th scope="col">Earlier revision</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="g-empty">No earlier revisions: this record has not changed since it was created.</p>'}</section>`
 await fence(env, a)
 return shell(a, back, 'Revision history', body)
}
