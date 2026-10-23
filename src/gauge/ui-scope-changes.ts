import type { Actor } from './store'
import { finance } from './store'
import type { Row } from './model'
import { escape as e, input as i, amount, area, form, decision, table, select, choices } from './ui-forms'
import { hours, money, nameOf } from './ui-format'
import { acceptanceChannels, acceptanceNotice } from './estimate-attestation'
import type { Report } from './ui-describe'

/** The current standing of one scope-change version, read from its append-only events. */
export function scopeStanding(change: Row, versions: Row[], events: Row[]) {
 const latest = versions.filter(v => v.value.rootId === change.value.rootId).at(-1)
 const mine = events.filter(x => x.value.changeId === change.id).map(x => x.value.type)
 if (latest?.id !== change.id) return `Superseded by version ${latest?.value.number}`
 if (mine.includes('client-accepted')) return 'Accepted by client (reported); budget change order prepared'
 if (mine.includes('client-declined')) return 'Declined by client'
 if (mine.includes('review-rejected')) return 'Rejected internally'
 if (mine.includes('review-approved')) return 'Reviewed internally; awaiting the client'
 return 'Proposed; needs internal review'
}

/** SALES-005 on Engagements: propose, review and record the client's decision on extra work. */
export function scopeChangesSection(a: Actor, report: Report) {
 if (!finance(a) && a.role !== 'lead') return ''
 const versions = report.data.scopeChanges as Row[], events = report.data.scopeEvents as Row[], engagements = (report.data.engagements as Row[]).filter(x => x.value.type !== 'internal')
 const standing = (r: Row) => scopeStanding(r, versions, events), mine = (r: Row) => events.filter(x => x.value.changeId === r.id)
 const open = versions.filter(r => versions.filter(v => v.value.rootId === r.value.rootId).at(-1)?.id === r.id)
 let html = `<h2 class="g-section-title" id="scope-changes">Scope changes</h2><p class="g-note">A proposed change never consumes approved client budget or authorizes billing. Only a version reviewed internally and reported accepted by the client prepares a draft budget change order, which still needs its own exact approval.</p>`
 html += form('scope:propose', 'Propose extra work', select('engagementId', 'Engagement', engagements) + i('title', 'Change title') + area('description', 'What the client asked for')
  + amount('addedFeeDollars', 'Added fee', 0) + i('addedEffortHours', 'Added hours', '0', 'number') + i('scheduleDays', 'Schedule impact (days later)', '0', 'number')
  + (finance(a) ? amount('addedCostDollars', 'Added cost (finance only, for margin)', '', false) : '') + i('phaseKey', 'Phase key (only when the approved terms have phases)', '', 'text', false) + area('reason', 'Reason for the change'), undefined, 'Propose change')
 html += table('Scope change versions', open, [
  { label: 'Change', line: 1, wrap: true, cell: r => `${e(r.value.title)} · version ${r.value.number}` },
  { label: 'Engagement', cell: r => e(nameOf(report.data.engagements as Row[], r.value.engagementId)) },
  { label: 'Added', wrap: true, line: 2, cell: r => e(`${money(r.value.delta.feeMinor, r.value.currency)} fee · ${hours(r.value.delta.effortSeconds)} · ${r.value.impact.scheduleDays} days later`) },
  ...(finance(a) ? [{ label: 'Margin impact', num: true, cell: (r: Row) => r.value.impact.marginMinor === null ? 'Cost unknown' : e(money(r.value.impact.marginMinor, r.value.currency)) }] : []),
  { label: 'Standing', wrap: true, line: 3, cell: r => e(standing(r)) },
  { label: 'Client evidence', wrap: true, cell: r => { const x = mine(r).find(y => y.value.type === 'client-accepted'); return x ? e(`${x.value.acceptorName} via ${x.value.channel} on ${x.value.acceptanceDate}${x.value.evidenceRef ? ` (${x.value.evidenceRef})` : ''}; ${acceptanceNotice}`) : '—' } },
 ], r => {
  const events = mine(r); if (standing(r).startsWith('Superseded') || events.some(x => ['client-accepted', 'client-declined', 'review-rejected'].includes(x.value.type))) return ''
  return events.length ? '' : decision('scope:approve', 'Approve internally', r, true) + decision('scope:reject', 'Reject internally', r, true, 'quiet')
 }, 'No scope changes yet.')
 if (finance(a)) for (const r of open.filter(x => standing(x) === 'Reviewed internally; awaiting the client'))
  html += form('scope:decide', `Record the client's decision: ${r.value.title} v${r.value.number}`, choices('outcome', 'Client decision', ['accepted', 'declined']) + i('acceptorName', 'Reported acceptor name', '', 'text', false) + i('acceptorContact', 'Reported acceptor contact', '', 'text', false) + i('acceptanceDate', 'Acceptance date', '', 'date', false) + choices('channel', 'Channel', acceptanceChannels) + i('evidenceRef', 'Evidence reference', '', 'text', false) + area('reason', 'Reason'), r, 'Record decision')
 return html
}
