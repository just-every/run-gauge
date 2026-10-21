import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, integer, money, date, zone, flag } from './model'
import { type Actor, Transaction, finance, access, get } from './store'
import { catalog } from './catalog'
import { timeCommand } from './time'
import { assertAdHocTime } from './retainer-eligibility'
import { requireAgentScope } from './agent-grants'
import { captureSources, validateCitations, fenceProposal } from './proposal-sources'
import { billingCommand } from './billing'

// Agent preparation: an agent grant prepares evidence-backed
// proposals; only the person with the authority each kind needs approves or declines
// the exact revision. Approval writes the effect through the ordinary command in the
// same transaction, so every guard of that command still applies to the approver.
export const proposalKinds = ['time', 'staffing', 'billing', 'change-order'] as const

const evidenceList = (value: unknown) => {
 need(Array.isArray(value) && value.length > 0 && value.length <= 20, 'Cite between 1 and 20 evidence items')
 return value.map(item => ({ source: text(item?.source, 'Evidence source', 200), summary: text(item?.summary, 'Evidence summary'), ...(item?.record?{record:{kind:text(item.record.kind,'Source kind'),id:text(item.record.id,'Source id'),revision:text(item.record.revision,'Source revision')}}:{}) }))
}
const sourceList = (value: unknown) => {
 const sources = Array.isArray(value) ? value.map(String) : []
 need(sources.length > 0 && sources.length <= 100, 'Select between 1 and 100 approved source lines')
 need(new Set(sources).size === sources.length, 'A source line appears twice')
 return sources
}

// Who may decide: the person whose time it is, the engagement lead or finance for
// staffing and change orders, finance for billing. Never an agent, never the preparer.
export async function canDecide(env: Bindings, a: Actor, p: Row) {
 if (a.role === 'agent' || a.session.operator.id === p.value.preparedBy) return false
 if (p.value.kind === 'time') return a.personId === p.value.plan.personId
 if (p.value.kind === 'billing') return finance(a)
 return access(env, a, p.value.engagementId, true).then(() => true, () => false)
}

async function plan(env: Bindings, tx: Transaction, kind: string, engagement: Row, input: Value) {
 const p = input.plan ?? {}
 if (kind === 'time') {
  need(engagement.value.type!=='internal'||!flag(p.billable),'Internal time cannot be billable')
  const person = await get(env, 'people', text(p.personId, 'Person')); tx.observe('people', person)
  need(engagement.value.leadId === person.id || (engagement.value.members ?? []).includes(person.id), 'That person is not assigned to this engagement')
  const task = await get(env, 'tasks', text(p.taskId, 'Task')); need(task.value.engagementId === engagement.id, 'Task belongs to another engagement'); tx.observe('tasks', task)
  for (const field of ['start', 'end']) need(typeof p[field] === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(p[field]) && Number.isFinite(Date.parse(p[field])), 'Start and end need ISO instants with an explicit UTC offset')
  need(Date.parse(p.end) > Date.parse(p.start) && Date.parse(p.end) - Date.parse(p.start) <= 86400000, 'A drafted entry spans more than zero and at most 24 hours')
  return { personId: person.id, taskId: task.id, service: text(p.service, 'Service', 200), start: p.start, end: p.end, timezone: zone(p.timezone), notes: String(p.notes ?? '').slice(0, 4000), billable: flag(p.billable), ambiguity: p.ambiguity ? text(p.ambiguity, 'Ambiguity note') : null }
 }
 if (kind === 'staffing') {
  need(Array.isArray(p.alternatives) && p.alternatives.length > 0 && p.alternatives.length <= 5, 'Offer between 1 and 5 staffing alternatives')
  need(p.commitment === undefined || p.commitment === 'tentative', 'Agents propose tentative staffing only; a lead commits it')
  const alternatives = []
  for (const alternative of p.alternatives) {
   const person = await get(env, 'people', text(alternative.personId, 'Person')); tx.observe('people', person)
   const from = date(alternative.from), to = date(alternative.to); need(to >= from && Date.parse(to) - Date.parse(from) <= 366 * 86400000, 'Use a period of at most one year')
   alternatives.push({ personId: person.id, from, to, dailySeconds: integer(alternative.dailySeconds, 'Allocation seconds per day', 1, 86400), rationale: text(alternative.rationale, 'Rationale') })
  }
  return { alternatives, commitment: 'tentative' }
 }
 if (kind === 'billing') {
  need(engagement.value.type!=='internal','Internal work cannot be billed')
  // Check eligibility now so an agent learns about missing rates or repeated
  // allocations before finance reviews; amounts stay private to finance.
  const sources = sourceList(p.sources)
  for (const source of sources) {
   const [k, id] = source.split(':'); need(['time', 'expenses', 'milestones'].includes(k), 'Unknown source type')
   const row = await get(env, k as 'time', id), v = row.value
   need(v.engagementId === engagement.id && v.status === 'approved', `${source} is not approved work for this engagement`)
   need(!(await env.DB.prepare('SELECT 1 FROM g_billing_sources WHERE kind=? AND source_id=?').bind(k, id).first()), `${source} is already allocated to a billing packet`)
   if (k === 'time') await assertAdHocTime(env,tx,v)
   if (k === 'time') need(v.billable && v.economics?.mode === 'hourly' && v.economics.billMinor !== null, `${source} lacks hourly terms or a bill rate`)
   if (k === 'expenses') need(v.reimbursable, `${source} is not reimbursable`)
  }
  return { title: text(p.title, 'Packet title', 200), sources }
 }
 need(engagement.value.type!=='internal','Internal work has no commercial terms')
 need(['hourly', 'fixed'].includes(p.mode), 'Choose hourly or fixed terms')
 return { mode: p.mode, amountMinor: money(p.amountMinor), effortSeconds: integer(p.effortSeconds, 'Estimated effort seconds'), roundingSeconds: integer(p.roundingSeconds, 'Billing rounding seconds', 1, 3600), brief: text(p.brief, 'Change-order brief') }
}

async function effect(env: Bindings, a: Actor, tx: Transaction, p: Row, input: Value): Promise<{ kind: string, row: Row | Value }> {
 const v = p.value, x = v.plan
 if (v.kind === 'time') {
  // The person confirms the actual interval and billability; the draft stays theirs to submit.
  const row = await timeCommand(env, a, tx, 'time:save', { personId: x.personId, engagementId: v.engagementId, taskId: x.taskId, service: x.service, timezone: x.timezone, notes: x.notes, start: input.start || x.start, end: input.end || x.end, billable: input.billable === undefined ? x.billable : flag(input.billable) })
  return { kind: 'time', row: row! }
 }
 if (v.kind === 'staffing') {
  const choice = integer(input.choice ?? 0, 'Alternative', 0, x.alternatives.length - 1), chosen = x.alternatives[choice]
  return { kind: 'staffing', row: (await catalog(env, a, tx, 'save:staffing', { engagementId: v.engagementId, personId: chosen.personId, from: chosen.from, to: chosen.to, dailySeconds: chosen.dailySeconds, commitment: 'tentative' }))! }
 }
 if (v.kind === 'billing') return { kind: 'packets', row: (await billingCommand(env, a, tx, 'packet:create', { engagementId: v.engagementId, title: x.title, sources: x.sources }))! }
 return { kind: 'budgets', row: (await catalog(env, a, tx, 'save:budgets', { engagementId: v.engagementId, mode: x.mode, amountMinor: x.amountMinor, effortSeconds: x.effortSeconds, roundingSeconds: x.roundingSeconds, reason: x.brief }))! }
}

export async function proposalCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (!action.startsWith('proposal:')) return null
 if (action === 'proposal:prepare') {
  need(a.role === 'agent', 'Proposals are prepared by an agent grant; people act directly', 403)
  const kind = text(input.kind, 'Proposal kind'); need((proposalKinds as readonly string[]).includes(kind), 'Choose time, staffing, billing or change-order')
  requireAgentScope(a,kind,text(input.engagementId,'Engagement'))
  const engagement = await get(env, 'engagements', input.engagementId); tx.observe('engagements', engagement)
  const evidence=evidenceList(input.evidence);await validateCitations(env,a,evidence)
  const value={ kind, engagementId: engagement.id, status: 'proposed', preparedBy: a.session.operator.id, agentGrantVersion:a.grantVersion, preparedAt: Date.now(), assumptions: text(input.assumptions, 'Assumptions'), evidence, plan: await plan(env, tx, kind, engagement, input) }
  return tx.record('proposals', {...value,sources:await captureSources(env,value,tx)})
 }
 const p = await get(env, 'proposals', text(input.id, 'Proposal')); need(p.revision === input.revision, 'Proposal changed; review the current version', 409); need(p.value.status === 'proposed', 'Proposal already decided', 409)
 if (action === 'proposal:withdraw') {
  need(a.role === 'agent' && p.value.preparedBy === a.session.operator.id, 'Only the preparing agent withdraws its proposal', 403)
  requireAgentScope(a,p.value.kind,p.value.engagementId)
  return tx.record('proposals', { ...p.value, status: 'withdrawn', decidedBy: a.session.operator.id, decidedAt: Date.now() }, p, undefined, action)
 }
 need(['proposal:approve', 'proposal:decline'].includes(action), 'Unknown proposal command')
 need(await canDecide(env, a, p), 'This proposal needs a decision from its own person, the engagement lead or finance', 403)
 await fenceProposal(env,a,tx,p)
 const decision = { decidedBy: a.session.operator.id, decidedAt: Date.now() }
 if (action === 'proposal:decline') return tx.record('proposals', { ...p.value, ...decision, status: 'declined', reason: text(input.reason, 'Decline reason') }, p, undefined, action)
 const result = await effect(env, a, tx, p, input), row = result.row as Row
 return tx.record('proposals', { ...p.value, ...decision, status: 'approved', choice: p.value.kind === 'staffing' ? Number(input.choice ?? 0) : null, effect: { kind: result.kind, id: row.id, revision: row.revision } }, p, undefined, action)
}
