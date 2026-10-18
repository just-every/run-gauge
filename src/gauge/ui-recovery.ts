// The agent's place in the app (owner's pick J): the strip under the top bar naming what waits for this person, the
// staffing alternatives as costed options with one approval each, and the worklog of what the agent prepared. The agent
// proposes; a person decides. Every row is computed from the records: capacity before and after, the cost against the
// person the alternative covers for (finance only), and the milestones a new conflict puts at risk.
import type { Bindings } from '../auth.server'
import { capacity } from './reports'
import { type Actor, finance } from './store'
import type { Row } from './model'
import { canDecide } from './proposals'
import { escape as e, input as i, form, decision } from './ui-forms'
import { money, nameOf } from './ui-format'
import { type Report, proposalLabels } from './ui-describe'
import { agentStrip, dayName } from './ui-shell'
import { figure, shift } from './ui-board'

const letter = (n: number) => String.fromCharCode(65 + n)
const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five']
const clientOf = (d: Report['data'], engagementId: string) => nameOf(d.clients, d.engagements.find(x => x.id === engagementId)?.value.clientId, nameOf(d.engagements, engagementId, 'Engagement'))
const clock = (ms: number, zone: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(ms).replace(/\s(AM|PM)$/, '\u00a0$1')
const local = (ms: number, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(ms)
/** "Today 7:46 AM" or "Fri Oct 16, 3:10 PM", in the workspace calendar. */
export const stamp = (ms: number, zone: string, today: string) => local(ms, zone) === today ? `Today ${clock(ms, zone)}` : `${dayName(local(ms, zone))}, ${clock(ms, zone)}`
async function operatorNames(env: Bindings) { return new Map((await env.DB.prepare('SELECT id,display_name FROM oa_operators').all<{ id: string; display_name: string }>()).results.map(o => [o.id, o.display_name])) }
const what = (d: Report['data'], p: Row) => p.value.kind === 'staffing' ? `${p.value.plan.alternatives.length} options for ${clientOf(d, p.value.engagementId)}` : `${{ billing: 'a billing packet', 'change-order': 'a change order', time: 'a time draft' }[p.value.kind as string]} for ${clientOf(d, p.value.engagementId)}`

/** The strip: the newest proposal this person may decide, and how many wait in all. Empty when nothing waits. */
export async function agentNotice(env: Bindings, a: Actor, report: Report, zone: string, today: string) {
 const waiting: Row[] = []
 for (const p of report.data.proposals) if (p.value.status === 'proposed' && await canDecide(env, a, p)) waiting.push(p)
 const latest = waiting.sort((x, y) => y.value.preparedAt - x.value.preparedAt)[0]
 if (!latest) return ''
 const agent = (await operatorNames(env)).get(latest.value.preparedBy) ?? 'Agent'
 return agentStrip(agent, `Prepared ${what(report.data, latest)} at ${stamp(latest.value.preparedAt, zone, today).replace(/^Today /, '')}`, waiting.length, latest.value.kind === 'staffing' ? `/app/capacity#${latest.id}` : `/app/review#${latest.id}`)
}

type Tone = 'ok' | 'risk' | ''
/** What one alternative would do if approved: hours, cost against the covered person, open hours and the milestones. */
export function alternativeEffect(report: Report, a: Actor, p: Row, alt: any) {
 const d = report.data, proposed = { id: 'proposed', revision: '', value: { ...alt, engagementId: p.value.engagementId, commitment: 'committed' } }
 const window = (data: Report['data']) => capacity({ ...data, people: data.people.filter(x => x.id === alt.personId) }, alt.from, alt.to)[0]
 const before = window(d), after = window({ ...d, staffing: [...d.staffing, proposed] })
 const person = d.people.find(x => x.id === alt.personId)
 if (!before || !after || !person) return { title: 'Capacity unknown', rows: [] as [string, string, Tone][] }
 const demand = after.days.length * alt.dailySeconds, rows: [string, string, Tone][] = [['Hours', `${figure(demand)} hrs · ${alt.from === alt.to ? dayName(alt.from) : `${dayName(alt.from)} – ${dayName(alt.to)}`}`, '']]
 if (finance(a)) {
  const rate = (personId: string) => d.rates.filter(r => r.value.personId === personId && r.value.service === '*' && r.value.effective <= alt.from).sort((x, y) => y.value.effective.localeCompare(x.value.effective))[0]?.value.costMinor ?? null
  // The person the alternative covers for: on leave in its window with committed hours on this engagement.
  const covered = d.people.filter(x => x.id !== alt.personId).map(x => {
   let seconds = 0
   for (let day = alt.from; day <= alt.to; day = shift(day, 1)) if (d.leave.some(r => r.value.personId === x.id && r.value.from <= day && r.value.to >= day)) seconds += d.staffing.filter(r => r.value.personId === x.id && r.value.engagementId === p.value.engagementId && r.value.commitment === 'committed' && r.value.from <= day && r.value.to >= day).reduce((n, r) => n + r.value.dailySeconds, 0)
   return { person: x, seconds, rate: rate(x.id) }
  }).filter(x => x.seconds > 0)
  const own = rate(alt.personId), known = own !== null && covered.every(x => x.rate !== null)
  const cost = known ? Math.round(demand * own! / 3600) - covered.reduce((n, x) => n + Math.round(Math.min(x.seconds, demand) * x.rate! / 3600), 0) : null
  rows.push([covered.length ? 'Additional cost' : 'Cost', cost === null ? 'Unknown: no cost rate' : `${cost > 0 && covered.length ? '+' : ''}${money(cost)}`, ''])
 }
 const first = person.value.name.split(' ')[0]
 rows.push([`${first}’s open hours`, before.remainingSeconds === null || after.remainingSeconds === null ? 'Unknown' : `${figure(before.remainingSeconds)} → ${figure(after.remainingSeconds)}`, after.remainingSeconds !== null && after.remainingSeconds < 0 ? 'risk' : ''])
 // A new conflict date takes hours from whatever else is committed that day; its next milestone is at risk.
 const fresh = after.conflicts.filter(c => !before.conflicts.some(b => b.date === c.date)).map(c => c.date)
 const hit = [...new Set(d.staffing.filter(r => r.value.personId === alt.personId && r.value.commitment === 'committed' && r.value.engagementId !== p.value.engagementId && fresh.some(day => r.value.from <= day && r.value.to >= day)).map(r => r.value.engagementId))]
 const next = (engagementId: string) => d.milestones.filter(m => m.value.engagementId === engagementId && m.value.due >= alt.from).sort((x, y) => x.value.due.localeCompare(y.value.due))[0]
 for (const id of hit) { const m = next(id); if (m) rows.push([`${clientOf(d, id)} · ${m.value.name}`, dayName(m.value.due), 'risk']) }
 if (fresh.length && !hit.some(next)) rows.push(['Conflict dates', `${before.conflicts.length} → ${after.conflicts.length}`, 'risk'])
 if (!fresh.length) { const m = next(p.value.engagementId); if (m) rows.push([`${clientOf(d, p.value.engagementId)} · ${m.value.name}`, dayName(m.value.due), 'ok']) }
 return { title: `${person.value.name}${person.value.contractor ? ' (1099)' : ''} takes ${figure(demand)} hrs`, rows }
}

const toneText: Record<Tone, string> = { ok: 'still on', risk: 'at risk', '': '' }
/** One staffing proposal as its lettered, costed options; each option approves itself when this person may decide. */
export function alternativesPanel(report: Report, a: Actor, p: Row, decide: boolean, className = '', page = '') {
 const d = report.data, alternatives = p.value.plan.alternatives as any[]
 const options = alternatives.map((alt, n) => {
  const effect = alternativeEffect(report, a, p, alt)
  const rows = effect.rows.map(([label, value, tone]) => `<div><dt>${e(label)}</dt><dd>${e(value)}${tone ? ` <span class="g-${tone}">${e(toneText[tone])}</span>` : ''}</dd></div>`).join('')
  const approve = decide ? decision('proposal:approve', `Approve ${letter(n)}`, p, false, n ? 'secondary' : 'primary', `<input type="hidden" name="choice" value="${n}">${page ? `<input type="hidden" name="page" value="${e(page)}">` : ''}`) : ''
  return `<article class="g-option${n ? '' : ' g-option--first'}"><h3><span class="g-letter" aria-hidden="true">${letter(n)}</span><span><span class="g-hide">Alternative ${letter(n)}: </span>${e(effect.title)}</span></h3><p class="g-option-why">${e(alt.rationale)}</p><dl class="g-metrics">${rows}</dl>${approve}</article>`
 }).join('')
 const decline = decide ? `<details class="g-reveal g-recovery-decline"><summary class="g-btn g-btn--quiet">Decline proposal</summary>${form('proposal:decline', 'Decline', i('reason', 'Reason'), p, 'Decline proposal', 'g-bare')}</details>` : `<p class="g-note">Awaiting the person, lead or finance this proposal needs.</p>`
 return `<section class="g-recovery${className ? ` ${className}` : ''}" id="${e(p.id)}" aria-labelledby="${e(p.id)}-title"><h2 id="${e(p.id)}-title">${words[alternatives.length] ?? alternatives.length} staffing alternatives</h2><p class="g-recovery-for">${e(clientOf(d, p.value.engagementId))} · ${e(nameOf(d.engagements, p.value.engagementId))}</p><p class="g-recovery-why">${e(p.value.assumptions)}</p>${options}<p class="g-evidence">${p.value.evidence.map((x: any) => `Evidence: ${e(x.source)} · ${e(x.summary)}`).join('<br>')}</p>${decline}</section>`
}

/** The staffing page's side panel: the newest open staffing proposal, else the last one decided. */
export async function recoveryPanel(env: Bindings, a: Actor, report: Report, zone: string, today: string) {
 const staffing = report.data.proposals.filter(p => p.value.kind === 'staffing').sort((x, y) => y.value.preparedAt - x.value.preparedAt)
 const open = staffing.find(p => p.value.status === 'proposed')
 if (open) return alternativesPanel(report, a, open, await canDecide(env, a, open), '', 'capacity')
 const last = staffing[0]
 if (!last) return `<section class="g-recovery g-recovery--empty"><h2>Staffing alternatives</h2><p class="g-empty">No agent proposals${a.role === 'agent' ? ' prepared by you' : ' for you to decide'}.</p></section>`
 const names = await operatorNames(env), chosen = last.value.choice != null ? last.value.plan.alternatives[last.value.choice] : null
 const outcome = last.value.status === 'approved' && chosen ? `${letter(last.value.choice)} · ${nameOf(report.data.people, chosen.personId)} takes ${figure(chosen.dailySeconds * (1 + (Date.parse(chosen.to) - Date.parse(chosen.from)) / 86400000))} hrs` : last.value.reason ?? ''
 return `<section class="g-recovery" id="${e(last.id)}"><h2>Staffing alternatives</h2><p class="g-recovery-for">${e(clientOf(report.data, last.value.engagementId))} · ${e(nameOf(report.data.engagements, last.value.engagementId))}</p><p class="g-decided"><span class="g-chip${last.value.status === 'approved' ? ' g-chip--approved' : ''}">${e(last.value.status)}</span> ${e(outcome)}</p><p class="g-note">${e(names.get(last.value.decidedBy) ?? 'Someone')} · ${e(stamp(last.value.decidedAt, zone, today))}</p>${last.value.effect?.kind === 'staffing' ? '<p class="g-note">The approved alternative is a tentative allocation below; change its commitment there to commit it.</p>' : ''}</section>`
}

/** The worklog: what the agent prepared and what became of it, then the week's booked share of available hours. */
export async function worklog(env: Bindings, report: Report, zone: string, today: string, week: string[]) {
 const d = report.data, names = await operatorNames(env)
 const rows = [...d.proposals].sort((x, y) => y.value.preparedAt - x.value.preparedAt).slice(0, 4).map(p => {
  const v = p.value, outcome = v.status === 'proposed' ? 'Waiting for a decision' : `${v.status.charAt(0).toUpperCase()}${v.status.slice(1)} by ${names.get(v.decidedBy) ?? 'someone'}${v.choice != null ? ` (option ${letter(v.choice)})` : ''}${v.reason ? `: ${v.reason}` : ''}`
  return `<li><span class="g-log-icon" aria-hidden="true"><img src="/brand/mark.svg" alt="" width="16" height="16"></span><p><b>${e(proposalLabels[v.kind])} · ${e(clientOf(d, v.engagementId))}</b><span>${e(outcome)}</span></p><time datetime="${new Date(v.preparedAt).toISOString()}">${e(stamp(v.preparedAt, zone, today))}</time></li>`
 })
 let committed = 0, available = 0, tentative = 0, people = 0
 for (const c of report.capacity) { const days = c.days.filter(x => week.includes(x.date) && x.availableSeconds !== null); if (!days.length) continue; people++; for (const x of days) { committed += x.committedSeconds; available += x.availableSeconds!; tentative += x.tentativeSeconds } }
 if (available) rows.push(`<li><span class="g-log-icon g-log-icon--plain" aria-hidden="true">%</span><p><b>Booked ${Math.round(committed / available * 100)}% of available hours</b><span>${figure(committed)} of ${figure(available)} hrs committed across ${people} ${people === 1 ? 'person' : 'people'}${tentative ? `; ${figure(tentative)} hrs tentative` : ''}</span></p><time>Week of ${e(dayName(week[0]!).slice(4))}</time></li>`)
 return `<section class="g-worklog" aria-labelledby="g-worklog-title"><h2 id="g-worklog-title">Worklog</h2>${rows.length ? `<ul role="list">${rows.join('')}</ul>` : '<p class="g-empty">No agent proposals yet.</p>'}</section>`
}
