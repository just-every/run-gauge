import type { Actor } from './store'
import { finance } from './store'
import { reviewSettings, policyFlags } from './time-review'
import type { Report } from './ui-describe'
import type { AnalystAnswer } from './analyst-types'
import { cite } from './analyst-types'

export function timePolicyAnswer(answer: AnalystAnswer, r: Report, a: Actor, projectId: string) {
 const policy = r.data.timePolicies[0], settings = reviewSettings(policy)
 const entries = r.data.time.filter(t => t.value.engagementId === projectId && t.value.workDate >= r.from && t.value.workDate <= r.to)
 answer.subject = 'time-policy'; answer.status = 'answered'
 answer.summary = `Reviewed ${entries.length} project time entries against the current time policy. Historical approvals retain the policy revision used at submission.`
 answer.observations = [`Entry duration must be at most ${settings.maxEntrySeconds} seconds; each person's day at most ${settings.maxDaySeconds} seconds; notes at least ${settings.minimumNotes} characters. Review requires ${settings.reviewLevels} level(s)${settings.separation ? ' with a separate reviewer' : ''}.`, policy ? `Current policy revision ${policy.revision}; timesheets ${policy.value.lockThrough ? `through ${policy.value.lockThrough} are locked` : 'are unlocked'}.` : 'No saved policy: native defaults apply; no policy record was created.']
 for (const entry of entries) {
  const v = entry.value, flags = policyFlags(entry, settings, r.data.time)
  const visibleDay = r.data.time.filter(t => t.value.personId === v.personId && t.value.workDate === v.workDate)
  // A lead may lack other-project time. Never present that subtotal as a complete day-policy check.
  const checks = flags.filter(f => f !== 'Day exceeds maximum hours')
  if (flags.includes('Day exceeds maximum hours')) checks.push('Visible day exceeds maximum hours')
  if (v.reviewPolicyRevision !== undefined && v.reviewPolicyRevision !== (policy?.revision ?? null) && v.status === 'submitted') checks.push('Policy changed since submission; return and resubmit before approval')
  if (v.status === 'approved' && checks.length) checks.push('Current-policy findings do not reverse a historical approval')
  const f = { id: `time-policy:${entry.id}:durationSeconds`, label: `${v.workDate} · ${v.status}: ${checks.join('; ') || 'no visible entry-rule discrepancy'}`, value: v.durationSeconds ?? null, unit: 'seconds' as const, currency: null, formula: 'Entry durationSeconds compared with current maxEntrySeconds; notes length compared with minimumNotes. Visible same-person work-date durations are summed for the day check.', complete: v.durationSeconds !== null, sources: [{ kind: 'time', ...entry }, ...(policy ? [{ kind: 'timePolicies', ...policy }] : []), ...visibleDay.filter(t => t.id !== entry.id).map(t => ({ kind: 'time', ...t }))], unknownSources: v.durationSeconds === null ? ['Running timer has no final duration.'] : [], asOf: r.asOf }
  answer.figures.push({ ...f, period: 'current', sources: f.sources.map(({ kind, id, revision }) => ({ kind, id, revision })) })
  if (checks.length || v.status !== 'approved') answer.actions.push({ label: `Review ${v.workDate} time`, href: `/app/time?edit=${encodeURIComponent(entry.id)}`, requires: 'The time owner edits drafts or returned entries. The authorized reviewer returns submitted work or reopens an approved exact revision with an audited reason. Locks, billing reservations and independent review still apply.', sources: [{ kind: 'time', id: entry.id, revision: entry.revision }, ...(policy ? [{ kind: 'timePolicies', id: policy.id, revision: policy.revision }] : [])] })
 }
 answer.unknowns.push(`${finance(a) ? 'Day totals include retained native time.' : 'Day totals use only visible work. Other-project records may be withheld; the ordinary submission and approval commands check complete day totals.'} Service billability is a default for new entries, not a retroactive override. This review does not certify legal compliance.`)
 if (!entries.length) { answer.status = 'incomplete'; answer.unknowns.push('No project time in the selected period; absence is not evidence of policy compliance.') }
 answer.suggestion = { label: 'Review project time', href: '/app/time', requires: 'Policy changes and reopening locked periods require finance and an audited reason under Settings. Suggested corrections make no writes; use the ordinary time workflow.' }
}

export function billingAnswer(answer: AnalystAnswer, r: Report, a: Actor, projectId: string) {
 answer.subject = 'billing'
 if (!finance(a)) {
  answer.status = 'restricted'; answer.summary = 'Billing reconciliation and private amounts require finance authority in its own native session.'
  answer.unknowns = ['No private billing records, rates, costs or amounts are disclosed.']; return
 }
 answer.status = 'answered'; answer.summary = 'Reconciled earned operational value, prepared billing, native invoices and recorded receipts. Differences are review signals, not permission to change a charge.'
 for (const field of ['earnedValueMinor', 'billedMinor', 'paidCashMinor', 'creditsMinor']) {
  const f = cite(r, `margin:${projectId}:${field}`); if (f) answer.figures.push(f)
 }
 for (const review of r.correctionReviews.filter(x => r.data.packets.some(p => p.id === x.packetId && (p.value.engagementId === projectId || p.value.engagementIds?.includes(projectId))))) {
  const packet = r.data.packets.find(p => p.id === review.packetId)!
  // A consolidated packet is wider than the selected project; show only its project-tagged lines.
  for (const source of review.sources.filter((s: any) => (s.engagementId ?? packet.value.engagementId) === projectId)) {
   const f = cite(r, `corrections:${review.packetId}:${source.kind}:${source.sourceId}:currentAmountMinor`); if (f) answer.figures.push(f)
  }
  answer.actions.push({ label: 'Review billing adjustment', href: `/app/billing#${encodeURIComponent(review.packetId)}`, requires: 'Finance selects the exact approved packet revision and source line, enters the reviewed replacement amount and a reason, then separately approves the draft delta. Original artifacts remain unchanged; independent approval and closed-period rules still apply.', sources: [{ kind: 'packets', id: review.packetId, revision: review.revision }] })
 }
 for (const [index, exception] of r.exceptions.entries()) {
  if (!['unbilled approved work', 'unbilled work missing bill rate', 'retainer billing held'].includes(exception.type)) continue
  const [kind, id] = exception.source.split(':')
  if (!r.data[kind as keyof Report['data']]?.some(t => t.id === id && t.value.engagementId === projectId)) continue
  const f = cite(r, `exceptions:${index}:count`); if (f) answer.figures.push(f)
  answer.actions.push({ label: exception.type, href: `/app/billing#unbilled-${encodeURIComponent(projectId)}`, requires: 'Finance must resolve the named eligibility issue and select exact currently approved sources to prepare a draft packet. Separate approval and invoice issuance remain required.', sources: f?.sources ?? [] })
 }
 const value = (field: string) => answer.figures.find(f => f.id === `margin:${projectId}:${field}`)?.value ?? null
 const earned = value('earnedValueMinor'), billed = value('billedMinor')
 answer.observations = ['Earned operational value is not recognized accounting revenue. Billing is native invoice totals net of credits when issued invoices exist, otherwise approved packet totals; draft packets are excluded. Recorded receipts are user-recorded and do not establish provider settlement.', 'A billing difference can reflect preparation, invoice timing, credits, commercial terms or missing rates. No causal reason or replacement amount is invented.']
 if (earned !== null && billed !== null) answer.observations.push(`Billed − earned operational value = ${billed - earned} integer minor units. This difference is not automatically an error or an amount to collect.`)
 answer.unknowns = [...new Set(answer.figures.flatMap(f => f.unknownSources))]
 if (answer.figures.length < 4 || answer.figures.some(f => !f.complete)) answer.status = 'incomplete'
 if (value('paidCashMinor') === null) answer.unknowns.push('No receipts are recorded; absent payment evidence is unknown, never zero collected cash.')
 answer.unknowns.push('Processor settlement, tax and accounting recognition require their own authoritative evidence. Review invoice-specific corrections on the ordinary invoice door; never alter an issued artifact.')
 answer.suggestion = { label: 'Review billing sources', href: '/app/billing', requires: 'Only finance can prepare and approve billing or linked corrections. Asking, repeating and following a review link perform no correction and grant no authority.' }
}
