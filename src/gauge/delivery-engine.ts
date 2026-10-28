import { integer, need, text } from './model'

export interface Calendar { weekdays: number[]; holidays: string[] }
export interface Node {
  id: string
  kind: 'phase' | 'task' | 'milestone'
  sourceId: string | null
  name: string
  start: string
  durationDays: number
  predecessors: string[]
  staffingIds: string[]
}
export interface Plan { calendar: Calendar; nodes: Node[] }
export interface ScheduledNode extends Node { end: string; critical: boolean; slackDays: number }
export interface Schedule { calendar: Calendar; nodes: ScheduledNode[]; finish: string }

const DAY = 86_400_000
const horizonMessage = 'Schedule exceeds the three-year date horizon'
const dayNumber = (value: string) => Date.parse(`${value}T00:00:00Z`) / DAY
const dayText = (value: number) => new Date(value * DAY).toISOString().slice(0, 10)

function object(value: unknown, name: string): Record<string, unknown> {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`)
  return value as Record<string, unknown>
}

function exactDate(value: unknown): string {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use a valid YYYY-MM-DD date')
  const day = dayNumber(value)
  need(Number.isFinite(day) && dayText(day) === value, 'Use a valid YYYY-MM-DD date')
  return value
}

function identifier(value: unknown, name: string): string {
  need(typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value), `${name} must be a plain identifier of 1 to 64 letters, numbers, underscores or hyphens`)
  return value
}

function identifiers(value: unknown, name: string): string[] {
  need(Array.isArray(value), `${name} must be a list`)
  const result = Array.from(value, id => text(id, name, 200))
  need(new Set(result).size === result.length, `${name} must be unique`)
  return result
}

function readPlan(input: unknown): Plan {
  const value = object(input, 'Schedule'), calendar = object(value.calendar, 'Calendar')
  need(Array.isArray(calendar.weekdays) && calendar.weekdays.length > 0 && calendar.weekdays.length <= 7, 'Choose one to seven weekdays')
  const weekdays = Array.from(calendar.weekdays, day => {
    need(typeof day === 'number', 'Weekdays must be numbers from 0 (Sunday) to 6 (Saturday)')
    return integer(day, 'Weekday', 0, 6)
  })
  need(new Set(weekdays).size === weekdays.length, 'Weekdays must be unique')
  need(Array.isArray(calendar.holidays) && calendar.holidays.length <= 366, 'Calendar allows at most 366 holidays')
  const holidays = Array.from(calendar.holidays, exactDate)
  need(new Set(holidays).size === holidays.length, 'Holidays must be unique')
  need(Array.isArray(value.nodes) && value.nodes.length >= 1 && value.nodes.length <= 100, 'Schedule needs one to 100 nodes')
  const nodes: Node[] = Array.from(value.nodes, (raw): Node => {
    const node = object(raw, 'Schedule node')
    need(node.kind === 'phase' || node.kind === 'task' || node.kind === 'milestone', 'Choose phase, task or milestone')
    const sourceId = node.sourceId === null ? null : text(node.sourceId, 'Source ID', 200)
    need(sourceId !== null || node.kind === 'phase', 'Tasks and milestones require a source ID')
    const durationDays = integer(node.durationDays, 'Business-day duration', 1, 366)
    need(node.kind !== 'milestone' || durationDays === 1, 'A milestone lasts exactly one business day')
    return {
      id: identifier(node.id, 'Node ID'), kind: node.kind, sourceId,
      name: text(node.name, 'Node name', 200), start: exactDate(node.start), durationDays,
      predecessors: identifiers(node.predecessors, 'Predecessor IDs'),
      staffingIds: identifiers(node.staffingIds, 'Staffing IDs'),
    }
  })
  need(new Set(nodes.map(node => node.id)).size === nodes.length, 'Node IDs must be unique')
  const sources = nodes.flatMap(node => node.sourceId === null ? [] : [node.sourceId])
  need(new Set(sources).size === sources.length, 'Schedule source references must be unique')
  return { calendar: { weekdays: weekdays.sort((a, b) => a - b), holidays: holidays.sort() }, nodes }
}

/** A bounded UTC business-day index makes forward and backward passes calendar-consistent. */
function businessDates(calendar: Calendar, starts: string[]): number[] {
  const first = Math.min(...starts.map(dayNumber)), last = new Date(first * DAY)
  const month = last.getUTCMonth()
  last.setUTCFullYear(last.getUTCFullYear() + 3)
  if (last.getUTCMonth() !== month) last.setUTCDate(0) // Clamp a leap-day anniversary.
  const end = Math.min(last.getTime() / DAY, dayNumber('9999-12-31'))
  need(starts.every(start => dayNumber(start) <= end), horizonMessage)
  const holidays = new Set(calendar.holidays), weekdays = new Set(calendar.weekdays), days: number[] = []
  for (let day = first; day <= end; day++) {
    if (weekdays.has(new Date(day * DAY).getUTCDay()) && !holidays.has(dayText(day))) days.push(day)
  }
  return days
}

function dependencyOrder(nodes: Node[]): { order: Node[]; successors: Map<string, string[]> } {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const successors = new Map(nodes.map(node => [node.id, [] as string[]]))
  const remaining = new Map(nodes.map(node => [node.id, node.predecessors.length]))
  for (const node of nodes) for (const predecessor of node.predecessors) {
    need(predecessor !== node.id, 'A node cannot depend on itself')
    need(byId.has(predecessor), `Unknown predecessor: ${predecessor}`)
    successors.get(predecessor)!.push(node.id)
  }
  const order = nodes.filter(node => node.predecessors.length === 0)
  for (let index = 0; index < order.length; index++) for (const id of successors.get(order[index].id)!) {
    const count = remaining.get(id)! - 1
    remaining.set(id, count)
    if (count === 0) order.push(byId.get(id)!)
  }
  need(order.length === nodes.length, 'Schedule dependencies must not contain a cycle')
  return { order, successors }
}

/** Starts are minimum dates; durations and slack count only the supplied business days. */
export function normalizeSchedule(input: unknown): Schedule {
  const plan = readPlan(input), { order, successors } = dependencyOrder(plan.nodes)
  const days = businessDates(plan.calendar, plan.nodes.map(node => node.start))
  const starts = new Map<string, number>(), ends = new Map<string, number>()
  for (const node of order) {
    const minimum = days.findIndex(day => day >= dayNumber(node.start))
    need(minimum >= 0, horizonMessage)
    const start = Math.max(minimum, ...node.predecessors.map(id => ends.get(id)! + 1))
    const end = start + node.durationDays - 1
    need(end < days.length, horizonMessage)
    starts.set(node.id, start)
    ends.set(node.id, end)
  }
  const finish = Math.max(...ends.values()), latest = new Map<string, number>()
  for (const node of [...order].reverse()) {
    const lastEnd = Math.min(finish, ...successors.get(node.id)!.map(id => latest.get(id)! - 1))
    latest.set(node.id, lastEnd - node.durationDays + 1)
  }
  const nodes = plan.nodes.map(node => {
    const slackDays = latest.get(node.id)! - starts.get(node.id)!
    return { ...node, start: dayText(days[starts.get(node.id)!]), end: dayText(days[ends.get(node.id)!]), critical: slackDays === 0, slackDays }
  })
  return { calendar: plan.calendar, nodes, finish: dayText(days[finish]) }
}

/** Delays the target's actual start; other current starts remain minimum dates. No input is mutated. */
export function reschedule(plan: unknown, nodeId: unknown, delayBusinessDays: unknown): Schedule {
  const schedule = normalizeSchedule(plan), id = text(nodeId, 'Node ID', 200)
  const delay = integer(delayBusinessDays, 'Business-day delay', 1, 366)
  const node = schedule.nodes.find(item => item.id === id)
  need(node, 'Schedule node not found')
  const days = businessDates(schedule.calendar, schedule.nodes.map(item => item.start))
  const index = days.indexOf(dayNumber(node.start)) + delay
  need(index < days.length, horizonMessage)
  return normalizeSchedule({ calendar: schedule.calendar, nodes: schedule.nodes.map(item => item.id === id ? { ...item, start: dayText(days[index]) } : item) })
}
