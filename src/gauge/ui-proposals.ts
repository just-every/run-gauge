import type { Bindings } from '../auth.server'
import { capacity } from './reports'
import { type Actor, finance } from './store'
import { type Row } from './model'
import { canDecide } from './proposals'
import { escape as e, input as i, check, form } from './ui-forms'
import { localValue } from './form-input'
import { hours, money, period, interval, when, chip, nameOf } from './ui-format'
import { type Report, describeSource, proposalLabels } from './ui-describe'
import { alternativesPanel } from './ui-recovery'

// The one summary line under a proposal's title, then whatever the decider needs to weigh.
function planDetails(report: Report, a: Actor, p: Row) {
 const d = report.data, x = p.value.plan
 if (p.value.kind === 'time') return `<p class="g-summary">${[nameOf(d.people, x.personId), nameOf(d.tasks, x.taskId), x.service, interval(x.start, x.end, x.timezone), x.billable ? 'Billable' : 'Not billable'].map(e).join(' · ')}</p>${x.notes ? `<p class="g-note">Notes: ${e(x.notes)}</p>` : ''}${x.ambiguity ? `<p class="g-note">Ambiguity: ${e(x.ambiguity)}</p>` : ''}`
 if (p.value.kind === 'billing') return `<p class="g-summary">${e(x.title)} · ${x.sources.length} source ${x.sources.length === 1 ? 'line' : 'lines'}</p><ul class="g-lines">${x.sources.map((s: string) => `<li>${e(describeSource(d, s).text)}</li>`).join('')}</ul><p class="g-note">Approval drafts the packet with exact amounts; approve that packet on Billing before export.</p>`
 const amount = x.amountMinor === undefined ? [] : [money(x.amountMinor)]
 return `<p class="g-summary">${[x.mode === 'fixed' ? 'Fixed fee' : 'Hourly', ...amount, `${hours(x.effortSeconds)} effort`, `rounded to ${hours(x.roundingSeconds)}`].map(e).join(' · ')}</p><p class="g-note">${e(x.brief)}</p><p class="g-note">Approval drafts the change order; approve its terms on Engagements.</p>`
}

// What the decider may adjust before approving: the confirmed interval for time, the chosen alternative for staffing.
function approveFields(report: Report, p: Row) {
 const x = p.value.plan
 if (p.value.kind === 'time') return `<details class="g-adjust"><summary>Confirm the interval</summary><div class="g-fields"><input type="hidden" name="timezone" value="${e(x.timezone)}">${i('startLocal', `Confirmed start (${x.timezone})`, localValue(x.start, x.timezone), 'datetime-local')}${i('endLocal', `Confirmed end (${x.timezone})`, localValue(x.end, x.timezone), 'datetime-local')}${check('billable', 'Billable', x.billable)}</div></details>`
 return ''
}

const effectLink = (effect: any) => effect ? `<a href="${effect.kind === 'time' ? `/app/time?edit=${e(effect.id)}` : effect.kind === 'packets' ? '/app/billing' : effect.kind === 'staffing' ? '/app/capacity' : '/app/engagements'}">Open the ${e({ time: 'time entry', staffing: 'allocation', packets: 'packet', budgets: 'change order' }[effect.kind as string] ?? 'record')}</a>` : ''

export async function proposalSection(env: Bindings, a: Actor, report: Report) {
 const rows = report.data.proposals, open = rows.filter(r => r.value.status === 'proposed'), decided = rows.filter(r => r.value.status !== 'proposed')
 if (!rows.length) return `<section class="g-block"><h2>Agent proposals</h2><p class="g-empty">No agent proposals${a.role === 'agent' ? ' prepared by you' : ' for you to decide'}.</p></section>`
 const cards = []
 for (const p of open) {
  const decide = await canDecide(env, a, p)
  if (p.value.kind === 'staffing') { cards.push(alternativesPanel(report, a, p, decide, 'g-card')); continue }
  const actions = decide ? `<div class="g-proposal-actions">${form('proposal:approve', `Approve ${proposalLabels[p.value.kind].toLowerCase()}`, approveFields(report, p), p, 'Approve exact proposal', 'g-bare')}<details class="g-reveal">${'<summary class="g-btn g-btn--quiet">Decline proposal</summary>'}${form('proposal:decline', 'Decline', i('reason', 'Reason'), p, 'Decline proposal', 'g-bare')}</details></div>`
   : a.role === 'agent' ? form('proposal:withdraw', 'Withdraw', '', p, 'Withdraw proposal', 'g-bare') : '<p class="g-note">Awaiting the person, lead or finance this proposal needs.</p>'
  cards.push(`<article class="g-card g-proposal" id="${e(p.id)}"><h3>${e(proposalLabels[p.value.kind])} · ${e(nameOf(report.data.engagements, p.value.engagementId))}</h3>${planDetails(report, a, p)}<p class="g-evidence">${p.value.evidence.map((x: any) => `Evidence: ${e(x.source)} · ${e(x.summary)}`).join('<br>')}</p><p class="g-note">${e(p.value.assumptions)}</p>${actions}</article>`)
 }
 const timeZone = (p: Row) => report.data.engagements.find(r => r.id === p.value.engagementId)?.value.timezone
 const history = decided.length ? `<div class="g-table"><table><thead><tr><th scope="col">Proposal</th><th scope="col">Status</th><th scope="col">Decided</th><th scope="col">Effect</th></tr></thead><tbody>${decided.map(p => `<tr id="${e(p.id)}"><td data-label="Proposal">${e(proposalLabels[p.value.kind])} · ${e(nameOf(report.data.engagements, p.value.engagementId))}</td><td data-label="Status" class="g-decision">${chip(p.value.status)}${p.value.reason ? ` <span class="g-note">${e(p.value.reason)}</span>` : ''}</td><td data-label="Decided" class="g-num">${e(when(p.value.decidedAt, timeZone(p)))}</td><td data-label="Effect">${effectLink(p.value.effect)}</td></tr>`).join('')}</tbody></table></div>` : ''
 return `<section class="g-block"><h2>Agent proposals</h2><p class="g-lede">An agent prepared these from cited evidence. Nothing changes until the right person approves the exact revision.</p>${cards.join('') || '<p class="g-empty">No open proposals.</p>'}${history ? `<h3 class="g-subhead">Decided</h3><div class="g-card g-card--table">${history}</div>` : ''}</section>`
}
