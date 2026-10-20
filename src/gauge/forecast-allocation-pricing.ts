import { type Row, sum } from './model'
import { billPricing } from './rate-cards'

const DAY = 86400000
const key = (id: string, day: string) => JSON.stringify([id, day])

/** Daily raw seconds before each allocation, shared across every project.
 * Approved work comes first, then committed bookings ordered by engagement/id,
 * then tentative bookings. Even internal, nonbillable and unpriced work consumes
 * the threshold. Tentative work never changes a committed allocation's price.
 */
export function allocationPricing(data: Record<string, Row[]>, asOf: string) {
 const totals = new Map<string, number>(), before = new Map<string, number>()
 for (const row of data.time ?? []) {
  const v = row.value
  if (v.status !== 'approved' || v.workDate <= asOf) continue
  const dayKey = key(v.personId, v.workDate)
  totals.set(dayKey, sum([totals.get(dayKey) ?? 0, v.durationSeconds]))
 }
 const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
 const bookings = [...(data.staffing ?? [])].sort((a, b) =>
  Number(a.value.commitment === 'tentative') - Number(b.value.commitment === 'tentative') ||
  lexical(a.value.engagementId, b.value.engagementId) || lexical(a.id, b.id))
 for (const row of bookings) {
  const v = row.value, start = Math.max(Date.parse(v.from), Date.parse(asOf) + DAY), end = Date.parse(v.to)
  for (let ms = start; ms <= end; ms += DAY) {
   const day = new Date(ms).toISOString().slice(0, 10), dayKey = key(v.personId, day), seconds = totals.get(dayKey) ?? 0
   before.set(key(row.id, day), seconds)
   totals.set(dayKey, sum([seconds, v.dailySeconds]))
  }
 }
 return (staffing: Row, day: string, card: Row) => {
  const seconds = staffing.value.dailySeconds, v = card.value
  const overtime = v.overtimeAfterSeconds === undefined ? 0 : Math.min(seconds, Math.max(0, (before.get(key(staffing.id, day)) ?? 0) + seconds - v.overtimeAfterSeconds))
  // Allocation days retain their exact allocation seconds: no time-entry billing
  // increment is introduced. Premium and write-down use actual approval's formula.
  return billPricing(seconds, v.billMinor, overtime, v.overtimeBps, v.writeDownBps ?? 0)
 }
}
