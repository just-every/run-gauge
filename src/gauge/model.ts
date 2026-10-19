export const kinds = ['clients', 'people', 'engagements', 'budgets', 'tasks', 'milestones', 'rates', 'calendars', 'leave', 'staffing', 'time', 'expenses', 'packets', 'archives', 'proposals', 'opportunities', 'resourceRequests', 'timeFavorites', 'timePolicies'] as const
export type Kind = typeof kinds[number]
export type Value = Record<string, any>
export interface RecordRow { id: string; revision: string; data: string }
export interface Row { id: string; revision: string; value: Value }
export class Fault extends Error { constructor(message: string, public status = 400) { super(message) } }
export const requireValue = (ok: unknown, message: string, status = 400): asserts ok => { if (!ok) throw new Fault(message, status) }
export function need(ok: unknown, message: string, status = 400): asserts ok { if (!ok) throw new Fault(message, status) }
export function kind(value: string): Kind { need(kinds.includes(value as Kind), 'Unknown record type'); return value as Kind }
export function text(value: unknown, name: string, max = 2000): string { need(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name} is required (maximum ${max} characters)`); return value.trim() }
export function integer(value: unknown, name: string, min = 0, max = 1e12): number { const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value; need(typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max, `${name} must be an integer from ${min} to ${max}`); return n }
export function date(value: unknown): string { const d = text(value, 'Date'); need(/^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0,10) === d, 'Use a valid YYYY-MM-DD date'); return d }
export function zone(value: unknown): string { const z = text(value, 'Work timezone'); try { new Intl.DateTimeFormat('en', { timeZone: z }).format() } catch { throw new Fault('Unknown IANA timezone') }; return z }
export function instant(value: unknown): number { const n = typeof value === 'number' ? value : Date.parse(String(value)); need(Number.isSafeInteger(n) && n > 0, 'Use an ISO timestamp with offset'); if (typeof value === 'string') need(/(?:Z|[+-]\d\d:\d\d)$/.test(value), 'Timestamp needs an explicit UTC offset'); return n }
export function workDate(ms: number, timezone: string): string { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms) }
export const flag = (v: unknown) => v === true || v === 'true' || v === 'on'
export const money = (v: unknown) => integer(v, 'Amount in currency cents')
export function charge(seconds: number, rate: number, rounding = 1): number { const rounded = Math.ceil(seconds / rounding) * rounding; const n = (BigInt(rounded) * BigInt(rate) + 1800n) / 3600n; need(n <= BigInt(Number.MAX_SAFE_INTEGER), 'Amount too large'); return Number(n) }
export function sum(values:number[]):number { let total=0;for(const value of values){need(Number.isSafeInteger(value),'Non-integral quantity');total+=value;need(Number.isSafeInteger(total),'Aggregate exceeds exact integer range')}return total }
export const uuid = () => crypto.randomUUID()
export const decode = (r: RecordRow): Row => ({ id: r.id, revision: r.revision, value: JSON.parse(r.data) })
export const csv = (rows: unknown[][]) => rows.map(row => row.map(v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"` }).join(',')).join('\r\n') + '\r\n'
