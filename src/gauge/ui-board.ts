// The Staffing board (owner's pick J): one lane per person over five weeks, the first week by day and the next four by
// week. Each allocation is a soft client-tinted bar (dashed when tentative); leave is a claret hatch that strikes the
// committed hours it cancels; an open staffing proposal's alternatives sit as dashed ghost options on their people's
// lanes; and each milestone due in the window flags its column. Every figure comes from the stored records.
import type { Row } from './model'
import { escape as e } from './ui-forms'
import { nameOf } from './ui-format'
import type { Report } from './ui-describe'
import { dayName } from './ui-shell'

const DAY = 86400000
export const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
/** The Monday a board starts on: the date's own work week, a weekend opening the coming one. */
export const mondayOf = (date: string) => shift(date, weekday(date) === 6 ? 2 : weekday(date) === 0 ? 1 : 1 - weekday(date))
/** The five weeks the board reads, Monday to the fifth Sunday. */
export const boardWindow = (date: string): [string, string] => { const m = mondayOf(date); return [m, shift(m, 34)] }
/** Hours as the board writes them: whole or one decimal ("21.6"). */
export const figure = (seconds: number) => String(Math.round(seconds / 360) / 10).replace('-', '−')
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const md = (date: string) => monthDay.format(new Date(`${date}T00:00:00Z`))
/** "Oct 26–30", "Nov 30 – Dec 4". */
const range = (from: string, to: string) => from.slice(0, 7) === to.slice(0, 7) ? `${md(from)}–${Number(to.slice(8))}` : `${md(from)} – ${md(to)}`
const dates = (from: string, to: string) => { const list = []; for (let d = from; d <= to; d = shift(d, 1)) list.push(d); return list }

interface Column { from: string; to: string; head: string; sub: string; day: boolean }
export function columns(monday: string, weeks: boolean): Column[] {
 const days = weeks ? [] : [0, 1, 2, 3, 4].map(n => { const d = shift(monday, n); return { from: d, to: d, head: dayName(d).split(' ')[0]!, sub: md(d), day: true } })
 const later = [0, 1, 2, 3, 4].slice(weeks ? 0 : 1).map(w => ({ from: shift(monday, w * 7), to: shift(monday, w * 7 + 6), head: `Week ${w + 1}`, sub: range(shift(monday, w * 7), shift(monday, w * 7 + 4)), day: false }))
 return [...days, ...later]
}

type Kind = 'booking' | 'tentative' | 'struck' | 'leave' | 'option'
interface Allocation { engagementId: string; commitment: string; dailySeconds: number; ranges: [string, string][] }
interface Segment { start: number; end: number; track: number; kind: Kind; tint: number; name: string; amount: string; when: string; title: string; note?: string; allocation?: Allocation }

/** Allocated seconds and the weeks they fall in, over the dates of `ranges` inside [from, to]. */
function load(a: Allocation, from: string, to: string) {
 let seconds = 0; const weeks = new Set<string>(), days: string[] = []
 for (const [f, t] of a.ranges) for (const d of dates(f > from ? f : from, t < to ? t : to)) { seconds += a.dailySeconds; weeks.add(mondayOf(shift(d, weekday(d) === 6 || weekday(d) === 0 ? -2 : 0))); days.push(d) }
 return { seconds, weeks: weeks.size, first: days[0], last: days.at(-1) }
}
const amount = (seconds: number, weeks: number) => weeks > 1 ? `${figure(seconds / weeks)} hrs/wk` : `${figure(seconds)} hrs`
const span = (first?: string, last?: string) => !first ? '' : first === last ? dayName(first) : `${dayName(first)} – ${dayName(last!)}`

/** Same engagement, commitment and daily hours, the next starting by the Monday after the last ends: one bar. */
function merge(rows: Row[]): Allocation[] {
 const sorted = [...rows].sort((x, y) => `${x.value.engagementId}|${x.value.commitment}|${x.value.dailySeconds}|${x.value.from}`.localeCompare(`${y.value.engagementId}|${y.value.commitment}|${y.value.dailySeconds}|${y.value.from}`))
 const out: Allocation[] = []
 for (const r of sorted) {
  const v = r.value, last = out.at(-1)
  if (last && last.engagementId === v.engagementId && last.commitment === v.commitment && last.dailySeconds === v.dailySeconds && v.from <= shift(last.ranges.at(-1)![1], 3)) last.ranges.push([v.from, v.to])
  else out.push({ engagementId: v.engagementId, commitment: v.commitment, dailySeconds: v.dailySeconds, ranges: [[v.from, v.to]] })
 }
 return out
}

const covered = (cols: Column[], from: string, to: string) => { const hit = cols.map((c, i) => c.from <= to && c.to >= from ? i : -1).filter(i => i >= 0); return hit.length ? [hit[0]!, hit.at(-1)!] as const : null }

/** Places segments in the lowest track whose last bar ends before they start. */
function pack(items: Omit<Segment, 'track'>[]) {
 const ends: number[] = []
 return items.map(s => { let t = ends.findIndex(end => end < s.start); if (t < 0) { t = ends.length; ends.push(-1) } ends[t] = s.end; return { ...s, track: t } as Segment })
}

export interface Lane { personId: string; name: string; contractor: boolean; load: string; detail: string; tone: 'ok' | 'alert' | 'unknown'; segments: Segment[] }

export function lanes(report: Report, cols: Column[], tintOf: (clientId: string) => number, options: { proposal?: Row }): Lane[] {
 const d = report.data, from = cols[0]!.from, to = cols.at(-1)!.to, week = dates(from, shift(from, 6))
 const client = (engagementId: string) => d.engagements.find(x => x.id === engagementId)?.value.clientId ?? ''
 const label = (engagementId: string) => nameOf(d.clients, client(engagementId), nameOf(d.engagements, engagementId, 'Engagement'))
 return report.capacity.map(person => {
  const own = d.staffing.filter(r => r.value.personId === person.personId && r.value.from <= to && r.value.to >= from)
  const leave = d.leave.filter(r => r.value.personId === person.personId && r.value.from <= to && r.value.to >= from)
  const leaveOn = (date: string) => leave.find(r => r.value.from <= date && r.value.to >= date)
  const bars: Omit<Segment, 'track'>[] = []
  for (const a of merge(own)) {
   const at = covered(cols, a.ranges[0]![0], a.ranges.at(-1)![1]); if (!at) continue
   const total = load(a, from, to), name = label(a.engagementId)
   bars.push({ start: at[0], end: at[1], kind: a.commitment === 'committed' ? 'booking' : 'tentative', tint: tintOf(client(a.engagementId)), name, amount: amount(total.seconds, total.weeks), when: span(total.first, total.last), title: `${name} · ${nameOf(d.engagements, a.engagementId)} · ${a.commitment}`, allocation: a })
  }
  // Leave on a day column with nothing booked under it still shows, on its own.
  for (const r of leave) {
   const days = cols.map((c, i) => c.day && c.from >= r.value.from && c.from <= r.value.to && !own.some(s => s.value.commitment === 'committed' && s.value.from <= c.from && s.value.to >= c.from) ? i : -1).filter(i => i >= 0)
   const weeks = cols.map((c, i) => !c.day && c.from <= r.value.to && c.to >= r.value.from ? i : -1).filter(i => i >= 0)
   for (const run of [days, weeks]) if (run.length) bars.push({ start: run[0]!, end: run.at(-1)!, kind: 'leave', tint: 0, name: r.value.note, amount: '', when: span(r.value.from, r.value.to), title: `Leave · ${r.value.note}` })
  }
  // The open proposal's alternatives: dashed options on the lanes of the people they name.
  options.proposal?.value.plan.alternatives.forEach((alt: any, n: number) => {
   if (alt.personId !== person.personId) return
   const at = covered(cols, alt.from, alt.to); if (!at) return
   const total = load({ engagementId: options.proposal!.value.engagementId, commitment: 'tentative', dailySeconds: alt.dailySeconds, ranges: [[alt.from, alt.to]] }, from, to)
   bars.push({ start: at[0], end: at[1], kind: 'option', tint: tintOf(client(options.proposal!.value.engagementId)), name: `Option ${String.fromCharCode(65 + n)} · takes ${figure(total.seconds)} hrs`, amount: label(options.proposal!.value.engagementId), when: span(total.first, total.last), title: 'Proposed by the agent; not yet approved' })
  })
  const order: Kind[] = ['booking', 'tentative', 'leave', 'option']
  const placed = pack(bars.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || x.start - y.start || y.end - x.end))
  // Committed bars split where leave cancels their day columns: the cancelled run is struck through.
  const segments = placed.flatMap(s => {
   const a = s.allocation
   if (s.kind !== 'booking' || !a) return [s]
   const struck = (i: number) => cols[i]!.day && !!leaveOn(cols[i]!.from) && a.ranges.some(([f, t]) => f <= cols[i]!.from && t >= cols[i]!.from)
   if (![...Array(s.end - s.start + 1).keys()].some(k => struck(s.start + k))) return [s]
   const runs: Segment[] = []
   for (let i = s.start; i <= s.end; i++) {
    const last = runs.at(-1), kind: Kind = struck(i) ? 'struck' : 'booking'
    if (last && last.kind === kind) last.end = i; else runs.push({ ...s, start: i, end: i, kind })
   }
   return runs.map(run => {
    const part = load(a, cols[run.start]!.from, cols[run.end]!.to), note = run.kind === 'struck' ? leaveOn(cols[run.start]!.from)!.value.note : undefined
    return { ...run, amount: amount(part.seconds, part.weeks), when: span(part.first, part.last), note, title: run.kind === 'struck' ? `${run.name} · cancelled by leave (${note})` : run.title }
   })
  })
  const days = person.days.filter(x => week.includes(x.date)), known = days.every(x => x.availableSeconds !== null)
  const committed = days.reduce((n, x) => n + x.committedSeconds, 0), available = days.reduce((n, x) => n + (x.availableSeconds ?? 0), 0), tentative = days.reduce((n, x) => n + x.tentativeSeconds, 0)
  const away = leave.filter(r => r.value.from <= week.at(-1)! && r.value.to >= week[0]!)
  const conflicts = person.conflicts.some(c => week.includes(c.date))
  const weekdays = (from: string, to: string) => from === to ? dayName(from).slice(0, 3) : `${dayName(from).slice(0, 3)}–${dayName(to).slice(0, 3)}`
  const detail = away.length ? away.map(r => `${r.value.note} ${weekdays(r.value.from > week[0]! ? r.value.from : week[0]!, r.value.to < week.at(-1)! ? r.value.to : week.at(-1)!)}`).join(', ') : tentative ? `+ ${figure(tentative)} hrs tentative` : ''
  return { personId: person.personId, name: person.name, contractor: person.contractor, load: !known ? 'Availability unknown' : available || committed ? `${figure(committed)} of ${figure(available)} hrs` : 'No hours this week', detail, tone: !known ? 'unknown' : conflicts || away.length ? 'alert' : 'ok', segments }
 })
}

const initials = (name: string) => name.replace(/\(.*\)/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
const flagIcon = '<svg class="g-flag-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3.5 14.5v-12M3.5 2.5h8.5l-2 3 2 3H3.5"/></svg>'

/** The board itself: the head row (today marked, milestones flagged) and one lane per person. */
export function board(report: Report, cols: Column[], rows: Lane[], today: string) {
 const d = report.data, from = cols[0]!.from, to = cols.at(-1)!.to, n = cols.length
 const flags = d.milestones.filter(m => m.value.due >= from && m.value.due <= to).map(m => {
  const engagement = d.engagements.find(x => x.id === m.value.engagementId)
  return { col: cols.findIndex(c => c.from <= m.value.due && c.to >= m.value.due), client: nameOf(d.clients, engagement?.value.clientId, nameOf(d.engagements, m.value.engagementId)), name: m.value.name as string, due: dayName(m.value.due) }
 })
 const now = cols.findIndex(c => c.day && c.from === today)
 const head = `<div class="g-lane g-lane--head" role="row"><div class="g-lane-who" role="columnheader">People</div>${cols.map((c, i) => `<div class="g-col${i === now ? ' is-today' : ''}${c.day ? '' : ' g-col--week'}" role="columnheader"${i === now ? ' aria-current="date"' : ''}><b>${e(c.head)}</b><span>${e(c.sub)}</span>${flags.filter(f => f.col === i).map(f => `<span class="g-flag">${flagIcon}<span><b>${e(f.name)} ${e(f.due.slice(4))}</b><br>${e(f.client)}</span></span>`).join('')}</div>`).join('')}</div>`
 const lane = (l: Lane) => {
  const tracks = Math.max(1, ...l.segments.map(s => s.track + 1))
  const cells = cols.map((c, i) => `<span class="g-cell g-at-${i + 1}${i === now ? ' is-today' : ''}" aria-hidden="true"></span>`).join('')
  const bars = l.segments.map(s => `<span class="g-bar g-bar--${s.kind}${s.tint ? ` g-tint-${s.tint}` : ''} g-at-${s.start + 1} g-span-${s.end - s.start + 1} g-track-${s.track + 1}" title="${e(s.title)}"><b>${e(s.name)}</b>${s.amount ? `<span>${e(s.amount)}</span>` : ''}${s.note ? `<em>${e(s.note)}</em>` : ''}<span class="g-bar-when">${e(s.when)}</span></span>`).join('')
  return `<div class="g-lane g-tracks-${Math.min(tracks, 8)}" role="row"><div class="g-lane-who" role="rowheader"><span class="g-avatar g-tone-${(rows.indexOf(l) % 6) + 1}" aria-hidden="true">${e(initials(l.name))}</span><p><b>${e(l.name)}</b>${l.contractor ? '<span class="g-tag-1099" title="Contractor">1099</span>' : ''}<span class="g-status g-status--${l.tone}" aria-hidden="true"></span><span class="g-load">${e(l.load)}</span>${l.detail ? `<span class="g-load-note${l.tone === 'alert' ? ' is-alert' : ''}">${e(l.detail)}</span>` : ''}</p></div>${cells}${bars}${l.segments.length ? '' : '<span class="g-bar-none">Nothing booked</span>'}</div>`
 }
 const launches = flags.length ? `<ul class="g-launches" role="list">${flags.map(f => `<li>${flagIcon}<span>${e(f.client)} · ${e(f.name)} · ${e(f.due)}</span></li>`).join('')}</ul>` : ''
 return `<div class="g-board g-board--${n}" role="table" aria-label="Staffing, ${e(dayName(from))} to ${e(dayName(shift(from, 32)))}">${head}${rows.map(lane).join('')}</div>${launches}`
}
