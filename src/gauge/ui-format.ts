// How Gauge shows stored values to people, in US formats: whole seconds as hours,
// integer cents as dollars ("$1,234.50"), YYYY-MM-DD dates as "Oct 6, 2026" and
// instants on a 12-hour clock in the work timezone, record ids as the names they
// point to. Stored values, including each record's currency, never change here.
import type { Row } from './model'
import { escape as e } from './ui-forms'

const number = (value: number, digits = 2) => value.toLocaleString('en-US', { maximumFractionDigits: digits })
// A no-break space keeps a number with its unit and a date in one piece when a line wraps.
export const hours = (seconds: number | null | undefined) => seconds == null ? 'Unknown' : `${seconds < 0 ? '−' : ''}${number(Math.abs(seconds) / 3600)}\u00a0h`
export function money(minor: number | null | undefined) {
 if (minor == null) return 'Unknown'
 const dollars = Math.abs(minor) / 100, digits = minor % 100 ? 2 : 0
 return `${minor < 0 ? '−' : ''}$${dollars.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`
}
const calendar = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const day = (date: string | null | undefined) => date ? calendar.format(new Date(`${date}T00:00:00Z`)).replace(/ /g, '\u00a0') : '—'
const monthDay = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** An inclusive period: "Nov 1–30, 2026", "Oct 28 – Nov 3, 2026". */
export function period(from: string, to: string) {
 if (from === to) return day(from)
 const [a, b] = [new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)], short = (d: Date) => monthDay.format(d).replace(/ /g, '\u00a0')
 if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${day(from)} – ${day(to)}`
 if (a.getUTCMonth() === b.getUTCMonth()) return `${short(a)}–${b.getUTCDate()},\u00a0${b.getUTCFullYear()}`
 return `${short(a)} – ${short(b)},\u00a0${b.getUTCFullYear()}`
}
/** An instant in a work timezone: "Oct 6, 2026, 10:00 AM". */
export const when = (ms: number | null | undefined, timeZone = 'America/Los_Angeles') => ms == null ? '—' : new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(ms)
const clock = (ms: number, timeZone: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(ms)
/** A worked interval: "Tue, Oct 6, 9:00 AM → 11:00 AM". */
export function interval(start: string | number, end: string | number, timeZone: string) {
 const [a, b] = [new Date(start).getTime(), new Date(end).getTime()]
 const date = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(a)
 return `${date}, ${clock(a, timeZone)} → ${clock(b, timeZone)}`
}
const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const weekdays = (list: string) => list.split(',').map(n => weekdayNames[Number(n)] ?? n).join(', ')
export const yesNo = (value: unknown) => value ? 'Yes' : 'No'
export const nameOf = (rows: Row[], id: unknown, missing = '—') => rows.find(r => r.id === id)?.value.name ?? missing
const tones: Record<string, string> = { approved: 'approved', returned: 'warn', declined: 'warn', 'capacity conflict': 'warn', overspend: 'warn', 'over estimate': 'warn', 'availability missing': 'warn', 'unbilled work missing bill rate': 'warn' }
// Stored statuses keep their values; a few read in US spelling.
const spoken: Record<string, string> = { cancelled: 'canceled' }
export const chip = (label: string) => `<span class="g-chip${tones[label] ? ` g-chip--${tones[label]}` : ''}">${e(spoken[label] ?? label)}</span>`
