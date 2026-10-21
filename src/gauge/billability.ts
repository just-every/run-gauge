import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, date, sum } from './model'
import { type Actor, Transaction, finance, get } from './store'
import { correctionReviews } from './billing-corrections'
import type { capacity, visible } from './reports'

type Data = Awaited<ReturnType<typeof visible>>
type Capacity = ReturnType<typeof capacity>

/** Finance records a billability target for one person or one role from an effective date.
 * A later target never rewrites an earlier one; the report picks the one in force. */
export async function targetCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (action !== 'target:set') return null
 need(finance(a), 'Finance sets billability targets', 403)
 need(input.scope === 'person' || input.scope === 'role', 'Choose a person or a role target')
 const raw = String(input.percent ?? '').trim()
 need(/^\d{1,3}(\.\d{1,2})?$/.test(raw) && Number(raw) <= 100, 'Target percent: enter 0 to 100 with up to two decimals')
 const value: Value = { scope: input.scope, personId: null, role: null, basisPoints: Math.round(Number(raw) * 100), effectiveFrom: date(input.effectiveFrom), setBy: a.session.operator.id, setAt: Date.now() }
 if (input.scope === 'person') { const person = await get(env, 'people', text(input.personId, 'Person')); tx.observe('people', person); value.personId = person.id }
 else value.role = text(input.role, 'Role', 200)
 return tx.record('billabilityTargets', value)
}

/** The target in force on a date: the latest effective date on or before it, then the latest set. */
function inForce(targets: Row[], on: string, match: (v: Value) => boolean) {
 return targets.filter(t => match(t.value) && t.value.effectiveFrom <= on).sort((x, y) => y.value.effectiveFrom.localeCompare(x.value.effectiveFrom) || y.value.setAt - x.value.setAt)[0]
}
export function targetFor(targets: Row[], person: Row | undefined, role: string | null, on: string) {
 const personal = person ? inForce(targets, on, v => v.scope === 'person' && v.personId === person.id) : undefined
 return personal ?? (role ? inForce(targets, on, v => v.scope === 'role' && v.role === role) : undefined)
}

const ratio = (numeratorSeconds: number, denominatorSeconds: number | null) => ({ numeratorSeconds, denominatorSeconds, percent: denominatorSeconds === null || denominatorSeconds === 0 ? null : numeratorSeconds / denominatorSeconds * 100 })
const roleOf = (p: Row) => String(p.value.role ?? '').trim() || null

interface Money { currency: string; standardMinor: number; billedMinor: number; billedSeconds: number; unbilledStandardMinor: number; time: string[]; packets: string[]; missingBillRate: string[] }

/** REPORT-002: approved billable utilization against capacity and target, and (finance only) realization of
 * billed approved time against its standard value at the frozen approved bill rate. */
export function targetPerformance(data: Data, cap: Capacity, from: string, to: string, money: boolean) {
 const engagement = (id: string) => data.engagements.find(e => e.id === id)
 const billable = (r: Row) => engagement(r.value.engagementId)?.value.type !== 'internal' && r.value.billable !== false
 const approved = data.time.filter(r => r.value.status === 'approved' && r.value.workDate >= from && r.value.workDate <= to && r.value.durationSeconds)
 // The current approved amount of each billed time source, after every approved correction on its branch.
 const billed = new Map<string, { amountMinor: number; standardMinor?:number;seconds?:number;packets: string[] }>()
 if (money) for (const review of correctionReviews(data.packets)) for (const s of review.sources) if (s.kind === 'time') billed.set(s.sourceId, { amountMinor: s.currentAmountMinor, packets: [...new Set([review.originalPacketId, review.packetId])] });else if(s.kind==='timeSlices'){const slice=data.timeSlices.find(r=>r.id===s.sourceId);if(slice){const id=slice.value.sourceId,old=billed.get(id)??{amountMinor:0,standardMinor:0,seconds:0,packets:[]};billed.set(id,{amountMinor:sum([old.amountMinor,s.currentAmountMinor]),standardMinor:sum([old.standardMinor??0,slice.value.amountMinor]),seconds:sum([old.seconds??0,slice.value.durationSeconds]),packets:[...new Set([...old.packets,review.originalPacketId,review.packetId])]})}}
 const people = new Map(data.people.map(p => [p.id, p]))
 const months: string[] = []
 for (let m = from.slice(0, 7); m <= to.slice(0, 7);) { months.push(m); const [y, mo] = m.split('-').map(Number); m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}` }
 const available = (personIds: string[], month?: string) => {
  let total = 0
  for (const c of cap.filter(p => personIds.includes(p.personId))) for (const d of c.days) if (!month || d.date.startsWith(month)) { if (d.availableSeconds === null) return null; total += d.availableSeconds }
  return total
 }
 const group = (dimension: string, id: string, name: string, rows: Row[], availableSeconds: number | null, target?: Row) => {
  const billableRows = rows.filter(billable), approvedSeconds = sum(rows.map(r => r.value.durationSeconds)), billableSeconds = sum(billableRows.map(r => r.value.durationSeconds))
  const utilization = ratio(billableSeconds, availableSeconds), targetPercent = target ? target.value.basisPoints / 100 : null
  const result: Value = { dimension, id, name, approvedSeconds, billableSeconds, nonbillableSeconds: approvedSeconds - billableSeconds, availableSeconds, utilization, billableShare: ratio(billableSeconds, approvedSeconds),
   target: target ? { id: target.id, percent: targetPercent, scope: target.value.scope, effectiveFrom: target.value.effectiveFrom } : null,
   variancePoints: targetPercent === null || utilization.percent === null ? null : utilization.percent - targetPercent, sources: { time: rows.map(r => r.id) } }
  if (!money) return { ...result, money: 'Restricted to finance' }
  const buckets = new Map<string, Money>()
  for (const r of billableRows) {
   const e = r.value.economics
   if (e?.mode !== 'hourly') continue
   const currency: string = e.currency, b: Money = buckets.get(currency) ?? { currency, standardMinor: 0, billedMinor: 0, billedSeconds: 0, unbilledStandardMinor: 0, time: [], packets: [], missingBillRate: [] }
   buckets.set(currency, b); b.time.push(r.id)
   if (e.billMinor == null) { b.missingBillRate.push(r.id); continue }
   const line = billed.get(r.id)
   if (!line) { b.unbilledStandardMinor = sum([b.unbilledStandardMinor, e.billMinor]); continue }
   b.standardMinor = sum([b.standardMinor, line.standardMinor??e.billMinor]);if(line.standardMinor!==undefined)b.unbilledStandardMinor=sum([b.unbilledStandardMinor,Math.max(0,e.billMinor-line.standardMinor)]); b.billedMinor = sum([b.billedMinor, line.amountMinor]); b.billedSeconds = sum([b.billedSeconds, line.seconds??r.value.durationSeconds])
   for (const p of line.packets) if (!b.packets.includes(p)) b.packets.push(p)
  }
  result.money = [...buckets.values()].sort((x, y) => x.currency.localeCompare(y.currency)).map(b => ({ ...b, writeOffMinor: b.standardMinor - b.billedMinor,
   realizationPercent: b.standardMinor === 0 ? null : b.billedMinor / b.standardMinor * 100,
   effectiveRateMinor: b.billedSeconds === 0 ? null : Math.round(b.billedMinor * 3600 / b.billedSeconds) }))
  return result
 }
 const roles = [...new Set(data.people.map(roleOf))].sort((x, y) => (x ?? '').localeCompare(y ?? ''))
 const clients = [...new Set(approved.map(r => engagement(r.value.engagementId)?.value.clientId).filter(Boolean))] as string[]
 return {
  asOf: to,
  byPerson: data.people.map(p => group('person', p.id, p.value.name, approved.filter(r => r.value.personId === p.id), available([p.id]), targetFor(data.billabilityTargets, p, roleOf(p), to))),
  byRole: roles.map(role => { const ids = data.people.filter(p => roleOf(p) === role).map(p => p.id); return group('role', role ?? '', role ?? 'No role', approved.filter(r => ids.includes(r.value.personId)), available(ids), role ? targetFor(data.billabilityTargets, undefined, role, to) : undefined) }),
  byClient: clients.map(id => group('client', id, data.clients.find(c => c.id === id)?.value.name ?? 'Client', approved.filter(r => engagement(r.value.engagementId)?.value.clientId === id), null)),
  byPeriod: months.map(m => group('period', m, m, approved.filter(r => r.value.workDate.startsWith(m)), available([...people.keys()], m))),
 }
}
