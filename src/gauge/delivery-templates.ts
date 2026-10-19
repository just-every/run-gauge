import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, integer, money, date, uuid } from './model'
import { type Actor, type Transaction, access, all, finance, get } from './store'
import { type Calendar, normalizeSchedule } from './delivery-engine'

const purposes = ['project', 'client-onboarding']
const DAY = 86_400_000
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)

/** Template items are relative: offsets and durations count business days from the applied start. */
function normalizeItems(raw: unknown, people: Row[]) {
 need(Array.isArray(raw) && raw.length >= 1 && raw.length <= 100, 'A template needs one to 100 items')
 const items = raw.map((item: Value) => {
  need(item && typeof item === 'object', 'Each template item must be an object')
  const kind = item.kind
  need(['phase', 'task', 'milestone'].includes(kind), 'Choose phase, task or milestone')
  const durationDays = integer(item.durationDays, 'Business-day duration', 1, 366)
  need(kind !== 'milestone' || durationDays === 1, 'A milestone lasts exactly one business day')
  const owner = kind === 'task' && item.owner ? (item.owner === 'lead' ? 'lead' : text(item.owner, 'Task owner', 200)) : null
  // People type a name on the page; the API takes an id. Either must name exactly one saved person.
  const named = owner && owner !== 'lead' ? people.filter(p => p.id === owner || p.value.name === owner) : []
  if (owner && owner !== 'lead') need(named.length === 1, 'Task owner must be one saved person or the engagement lead')
  return {
   key: text(item.key, 'Item key', 100), kind, name: text(item.name, 'Item name', 200),
   offsetDays: integer(item.offsetDays ?? 0, 'Business-day offset', 0, 730), durationDays,
   predecessors: (Array.isArray(item.predecessors) ? item.predecessors : []).map((k: unknown) => text(k, 'Predecessor key', 100)),
   owner: owner === 'lead' ? 'lead' : named[0]?.id ?? null, effortSeconds: kind === 'task' ? integer(item.effortSeconds ?? 0, 'Effort seconds') : null,
   amountMinor: kind === 'milestone' ? money(item.amountMinor) : null,
  }
 })
 need(new Set(items.map(i => i.key)).size === items.length, 'Item keys must be unique')
 // The same dependency engine that schedules baselines validates the graph (cycles, unknown keys).
 normalizeSchedule({ calendar: { weekdays: [1, 2, 3, 4, 5], holidays: [] }, nodes: items.map(i => ({ id: i.key, kind: i.kind, sourceId: i.kind === 'phase' ? null : i.key, name: i.name, start: '2026-01-05', durationDays: i.durationDays, predecessors: i.predecessors, staffingIds: [] })) })
 return items
}

/** The business date `offset` working days after `start`; a non-working start moves to the next working day. */
function businessDay(calendar: Calendar, start: string, offset: number) {
 const works = (day: string) => calendar.weekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) && !calendar.holidays.includes(day)
 let day = start, guard = 0
 while (!works(day)) { day = shift(day, 1); need(++guard < 400, 'The calendar has no working days') }
 for (let n = 0; n < offset; n++) { day = shift(day, 1); while (!works(day)) { day = shift(day, 1); need(++guard < 4000, 'The calendar has no working days') } }
 return day
}

export async function templateCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action === 'template:save') {
  need(finance(a), 'Owner or finance maintains agency delivery templates', 403)
  const templates = await all(env, 'deliveryTemplates')
  const previous = input.previousId ? templates.find(t => t.id === input.previousId) : undefined
  need(!input.previousId || previous, 'Template version not found', 404)
  if (previous) {
   const latest = templates.filter(t => t.value.rootId === previous.value.rootId).sort((x, y) => y.value.number - x.value.number)[0]
   need(latest.id === previous.id, 'A newer template version exists; reload before revising', 409)
   tx.observe('deliveryTemplates', previous)
  }
  const purpose = input.purpose ?? previous?.value.purpose ?? 'project'
  need(purposes.includes(purpose), 'Choose a project or client-onboarding template')
  const id = uuid(), number = (previous?.value.number ?? 0) + 1
  const value = { rootId: previous?.value.rootId ?? id, number, previousId: previous?.id ?? null, name: text(input.name ?? previous?.value.name, 'Template name', 200), purpose, currency: a.currency, items: normalizeItems(input.items, await all(env, 'people')), reason: text(input.reason, 'Version reason'), savedBy: a.session.operator.id, savedAt: Date.now() }
  return tx.record('deliveryTemplates', value, undefined, id, 'template:save')
 }
 if (action !== 'template:apply') return null
 const template = await get(env, 'deliveryTemplates', text(input.templateId, 'Template version'))
 tx.observe('deliveryTemplates', template)
 const engagement = await access(env, a, text(input.engagementId, 'Engagement'), true); tx.observe('engagements', engagement)
 const t = template.value, start = date(input.start)
 const plans = await all(env, 'deliveryPlans')
 need(!plans.some(p => p.value.engagementId === engagement.id), 'This engagement already has a delivery baseline; templates start new projects only', 409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_deliveryPlans WHERE json_extract(data,'$.engagementId')=?)", engagement.id)
 const milestones = t.items.filter((i: Value) => i.kind === 'milestone')
 need(!milestones.length || engagement.value.type !== 'internal', 'Internal work has no commercial terms or milestones')
 need(!milestones.length || t.currency === engagement.value.currency, 'Template fees use a different currency from the engagement; no implicit FX')
 const calendars = await all(env, 'agencyCalendars'), agency = calendars.at(-1)
 if (agency) tx.observe('agencyCalendars', agency)
 tx.guard('(SELECT COUNT(*) FROM g_agencyCalendars)=?', calendars.length)
 const calendar: Calendar = agency ? agency.value.calendar : { weekdays: [1, 2, 3, 4, 5], holidays: [] }
 const ids = new Map<string, string>(t.items.filter((i: Value) => i.kind !== 'phase').map((i: Value) => [i.key, uuid()]))
 const schedule = normalizeSchedule({ calendar, nodes: t.items.map((i: Value) => ({ id: i.key, kind: i.kind, sourceId: ids.get(i.key) ?? null, name: i.name, start: businessDay(calendar, start, i.offsetDays), durationDays: i.durationDays, predecessors: i.predecessors, staffingIds: [] })) })
 for (const item of t.items as Value[]) {
  const node = schedule.nodes.find(n => n.id === item.key)!
  if (item.kind === 'task') {
   const assigneeId = item.owner === 'lead' ? engagement.value.leadId : item.owner
   if (assigneeId) need(assigneeId === engagement.value.leadId || engagement.value.members?.includes(assigneeId), 'A template task owner is not on this engagement; add them first')
   await tx.record('tasks', { name: item.name, engagementId: engagement.id, remainingSeconds: item.effortSeconds, estimateSeconds: item.effortSeconds, assigneeId: assigneeId ?? null, parentId: null, priority: 'normal', from: node.start, to: node.end, billable: engagement.value.type !== 'internal', checklist: [], repeatEveryDays: 0, repeatUntil: null, status: 'todo', templateItem: item.key }, undefined, ids.get(item.key), 'template:apply')
  }
  if (item.kind === 'milestone') await tx.record('milestones', { engagementId: engagement.id, currency: engagement.value.currency, name: item.name, due: node.end, amountMinor: item.amountMinor, status: 'draft', templateItem: item.key }, undefined, ids.get(item.key), 'template:apply')
 }
 return tx.record('deliveryPlans', { engagementId: engagement.id, previousId: null, number: 1, schedule, reason: text(input.reason, 'Template application reason'), approvedBy: a.session.operator.id, approvedAt: Date.now(), template: { id: template.id, rootId: t.rootId, number: t.number, name: t.name, start } }, undefined, undefined, 'template:apply')
}
