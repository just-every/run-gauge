// How Gauge shows stored values to people: whole seconds as hours, integer minor
// units in their stored currency, YYYY-MM-DD dates and instants in the work timezone, record
// ids as the names they point to. Stored values never change here.
import type { Row } from './model'
import { escape as e } from './ui-forms'

const number = (value: number, digits = 2) => value.toLocaleString('en-AU', { maximumFractionDigits: digits })
// A no-break space keeps a number with its unit and a date in one piece when a line wraps.
export const hours = (seconds: number | null | undefined) => seconds == null ? 'Unknown' : `${seconds < 0 ? '−' : ''}${number(Math.abs(seconds) / 3600)}\u00a0h`
export function money(minor: number | null | undefined, currency = 'USD') {
 if (minor == null) return 'Unknown'
 const cents = BigInt(Math.abs(minor)), fraction = String(cents % 100n).padStart(2, '0')
 const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(cents / 100n).map(p => p.type === 'fraction' ? fraction : p.value).join('')
 return `${minor < 0 ? '−' : ''}${amount}`
}
const calendar = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const day = (date: string | null | undefined) => date ? calendar.format(new Date(`${date}T00:00:00Z`)).replace(/ /g, '\u00a0') : '—'
/** An inclusive period: "1–30 Nov 2026", "28 Oct – 3 Nov 2026". */
export function period(from: string, to: string) {
 if (from === to) return day(from)
 const [a, b] = [new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)]
 if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${day(to)}`
 return `${a.getUTCFullYear() === b.getUTCFullYear() ? day(from).replace(`\u00a0${a.getUTCFullYear()}`, "") : day(from)} – ${day(to)}`
}
/** An instant in a work timezone: "6 Oct 2026, 10:00". */
export const when = (ms: number | null | undefined, timeZone = 'UTC') => ms == null ? '—' : new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(ms)
const clock = (ms: number, timeZone: string) => new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(ms)
/** A worked interval: "Tue 6 Oct, 09:00 → 11:00". */
export function interval(start: string | number, end: string | number, timeZone: string) {
 const [a, b] = [new Date(start).getTime(), new Date(end).getTime()]
 const date = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(a)
 return `${date}, ${clock(a, timeZone)} → ${clock(b, timeZone)}`
}
const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const weekdays = (list: string) => list.split(',').map(n => weekdayNames[Number(n)] ?? n).join(', ')
export const yesNo = (value: unknown) => value ? 'Yes' : 'No'
export const nameOf = (rows: Row[], id: unknown, missing = '—') => rows.find(r => r.id === id)?.value.name ?? missing
const tones: Record<string, string> = { approved: 'approved', returned: 'warn', declined: 'warn', 'capacity conflict': 'warn', overspend: 'warn', 'over estimate': 'warn', 'availability missing': 'warn', 'unbilled work missing bill rate': 'warn' }
export const chip = (label: string) => `<span class="g-chip${tones[label] ? ` g-chip--${tones[label]}` : ''}">${e(label)}</span>`
