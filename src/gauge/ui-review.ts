// Home: Week in review. The week's exceptions, each linked to its source; agent
// proposals to decide; and each engagement's approved hours on its estimate.
import type { Bindings } from '../auth.server'
import { type Actor, finance } from './store'
import { escape as e, input as i } from './ui-forms'
import { hours, money, chip } from './ui-format'
import { meter } from './ui-meter'
import { type Report, describeException, unbilledByEngagement } from './ui-describe'
import { timeReviewSection } from './ui-time-policy'
import { proposalSection } from './ui-proposals'
import { forecastSection } from './ui-forecast'
import { marginSection } from './ui-margin'
import { cashSection } from './ui-cash'
import { revenueDashboardSection } from './ui-revenue-dashboard'
import { portfolioSection } from './ui-portfolio'
import { demandSection } from './ui-demand'

/** The latest approved estimate per engagement (lead and finance see terms). */
export const estimateOf = (report: Report, budgetId: string | null) => report.data.budgets.find(b => b.id === budgetId)?.value.effortSeconds ?? null

export function economicsCard(report: Report, a: Actor, x: Report['economics'][number], title = true) {
 const estimate = estimateOf(report, x.budgetId), label = estimate === null ? `${hours(x.approvedSeconds)} approved` : `${hours(x.approvedSeconds)} approved of ${hours(estimate)}`
 // On fixed-fee terms the client pays the fee, so hours at bill rates are a comparison, not what is billable.
 const fixed = report.data.budgets.find(b => b.id === x.budgetId)?.value.mode === 'fixed'
 const billable = finance(a) && 'billableMinor' in x ? `<p class="g-aside g-num">${fixed ? 'Time at bill rates' : 'Billable'} ${x.billableMinor===null?`Unknown · known subtotal ${money(x.knownBillableMinor, x.currency)}`:money(x.billableMinor as number, x.currency)}</p>` : ''
 const scale = estimate === null ? '' : meter(x.approvedSeconds, estimate, label)
 return `<article class="g-card g-econ">${title ? `<header class="g-card-head"><h3><a href="/app/engagements?edit=${e(x.engagementId)}">${e(x.name)}</a></h3>${billable}</header>` : billable}<p class="g-reading-line g-num">${e(label)}</p>${scale}<a class="g-link" href="/app/engagements?edit=${e(x.engagementId)}&amp;calculation=${e(`economics:${x.engagementId}:${finance(a)?'costMinor':'approvedSeconds'}`)}#report-evidence">Calculation and sources</a></article>`
}

export async function reviewSection(env: Bindings, a: Actor, report: Report) {
 const d = report.data
 const head = `<div class="g-titlebar"><h1>Week in review</h1><form class="g-period" method="get">${i('from', 'From', report.from, 'date')}${i('to', 'Through', report.to, 'date')}<button class="g-btn g-btn--secondary">Review period</button></form></div>`
 const nothing = !d.engagements.length && !d.proposals.length && !report.exceptions.length
 if (nothing) return head + revenueDashboardSection(report) + `<section class="g-card g-empty-state"><img src="/brand/mark.svg" alt="" width="40" height="40"><h2>No agent proposals${a.role === 'agent' ? ' prepared by you' : ' for you to decide'}.</h2><p>Create an engagement and approved terms to begin.</p>${a.role === 'agent' ? '' : '<p><a class="g-btn g-btn--primary" href="/app/engagements">Engagements</a></p>'}</section>`
 // Each exception keeps its own row and link, except unbilled approved work: one row per engagement, its lines listed on Billing.
 const unbilled = report.exceptions.filter(x => x.type === 'unbilled approved work')
 const rows = [...report.exceptions.filter(x => x.type !== 'unbilled approved work').map(x => describeException(report, x)), ...unbilledByEngagement(report, unbilled)]
 const exceptions = `<section class="g-block"><h2>Decisions and exceptions</h2>${rows.length ? `<ul class="g-card g-exceptions">${rows.map(x => `<li>${chip(x.type)}<a href="${e(x.href)}">${e(x.text.replaceAll(' · ', '\u00a0· '))}</a></li>`).join('')}</ul>` : '<p class="g-empty">No exceptions in the selected period. Missing calendars mean expected time is unknown.</p>'}</section>`
 const economics = `<section class="g-block"><h2>Engagement economics</h2>${report.economics.length ? `<div class="g-econ-grid">${report.economics.map(x => economicsCard(report, a, x)).join('')}</div>` : '<p class="g-empty">Create an engagement and approved terms to begin.</p>'}</section>`
 return head + `<div class="g-review">${await proposalSection(env, a, report)}${exceptions}</div>${timeReviewSection(report)}${economics}${revenueDashboardSection(report)}${portfolioSection(report)}${forecastSection(report)}${marginSection(report)}${cashSection(report)}${demandSection(report, a.role === 'owner')}<p class="g-footnote">Exceptions come from your approved records. Operational economics are not accounting revenue.</p>`
}
