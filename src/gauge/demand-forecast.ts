import { type Row, type Value, charge, sum } from './model'

// RESOURCE-005 resource demand forecast, as of the FINANCE-006 day. Seconds by month for the days after the as-of date:
// committed = committed allocations + open unfilled roles + won opportunities not yet converted (SALES-004 converts
// their demand into open roles, so each won deal counts once); "+ tentative" and "+ weighted pipeline" stay separate.
// Capacity splits employees from contractors by profile. Fees, cost and margin are FINANCE-006's committed figures in the
// agency currency for the as-of month onwards. Owner-approved scenarios for one open opportunity add that deal as won
// (shifted by its delay) and an optional planned hire or contractor; they are computed here and never write a record.
const DAY = 86400000
const nextDay = (day: string) => new Date(Date.parse(day) + DAY).toISOString().slice(0, 10)
const shift = (day: string, n: number) => new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10)
const days = (from: string, to: string) => { const out: string[] = []; for (let ms = Date.parse(from); ms <= Date.parse(to); ms += DAY) out.push(new Date(ms).toISOString().slice(0, 10)); return out }
const monthsBetween = (from: string, to: string) => { const out: string[] = []; const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); while (d.toISOString().slice(0, 7) <= to.slice(0, 7)) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1) } return out }
/** Whole units split evenly; leftovers go to the earliest slots. */
const spread = (total: number, slots: string[]) => slots.map((s, i) => [s, Math.floor(total / slots.length) + (i < total % slots.length ? 1 : 0)] as const)
const weekday = (day: string) => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d >= 1 && d <= 5 }
type Month = { month: string, committedSeconds: number, unfilledSeconds: number, wonSeconds: number, tentativeSeconds: number, weightedPipelineSeconds: number, employeeCapacitySeconds: number, contractorCapacitySeconds: number, committedFeesMinor: number, committedCostMinor: number, tentativeFeesMinor: number, weightedPipelineFeesMinor: number }
const blank = (month: string): Month => ({ month, committedSeconds: 0, unfilledSeconds: 0, wonSeconds: 0, tentativeSeconds: 0, weightedPipelineSeconds: 0, employeeCapacitySeconds: 0, contractorCapacitySeconds: 0, committedFeesMinor: 0, committedCostMinor: 0, tentativeFeesMinor: 0, weightedPipelineFeesMinor: 0 })

export function demandForecast(data: Record<string, Row[]>, asOf: string, currency: string, forecast: Value, capacity: Value[]) {
 const months = new Map<string, Month>(), at = (day: string) => { const m = day.slice(0, 7); if (!months.has(m)) months.set(m, blank(m)); return months.get(m)! }
 const future = (from: string, to: string) => days(from > asOf ? from : nextDay(asOf), to)
 const sources: Record<string, string[]> = { staffing: [], resourceRequests: [], opportunities: [], people: [], calendars: [] }
 for (const s of data.staffing ?? []) for (const day of future(s.value.from, s.value.to)) { if (!sources.staffing.includes(s.id)) sources.staffing.push(s.id); if (s.value.commitment === 'tentative') at(day).tentativeSeconds += s.value.dailySeconds; else at(day).committedSeconds += s.value.dailySeconds }
 for (const r of (data.resourceRequests ?? []).filter(r => r.value.status === 'open')) for (const day of future(r.value.from, r.value.to)) { if (!sources.resourceRequests.includes(r.id)) sources.resourceRequests.push(r.id); at(day).unfilledSeconds += r.value.dailySeconds }
 const dealDays = (o: Value, delay = 0) => days(shift(o.from, delay), shift(o.to, delay))
 const placeDemand = (seconds: number, all: string[], add: (day: string, s: number) => void) => { for (const [day, s] of spread(seconds, all)) if (day > asOf && s) add(day, s) }
 const opportunities = data.opportunities ?? [], open = opportunities.filter(o => !['won', 'lost'].includes(o.value.stage))
 // Won but not converted: its whole demand is committed backlog until conversion places it on open roles.
 for (const o of opportunities.filter(o => o.value.stage === 'won' && !o.value.engagementId)) { sources.opportunities.push(o.id); placeDemand(o.value.demandSeconds, dealDays(o.value), (day, s) => { at(day).wonSeconds += s }) }
 for (const o of open) { sources.opportunities.push(o.id); placeDemand(Number((BigInt(o.value.demandSeconds) * BigInt(o.value.probability) + 50n) / 100n), dealDays(o.value), (day, s) => { at(day).weightedPipelineSeconds += s }) }
 const unplaced = opportunities.filter(o => o.value.conversion?.unplacedSeconds > 0).map(o => ({ opportunityId: o.id, seconds: o.value.conversion.unplacedSeconds }))
 const contractors = new Set((data.people ?? []).filter(p => (p.value.employmentType ?? (p.value.contractor ? 'contractor' : 'employee')) === 'contractor').map(p => p.id))
 let missingCalendarDays = 0
 for (const c of capacity) for (const d of c.days.filter((d: Value) => d.date > asOf)) {
  if (d.availableSeconds === null) { missingCalendarDays++; continue }
  if (d.calendarId && !sources.calendars.includes(d.calendarId)) sources.calendars.push(d.calendarId)
  if (contractors.has(c.personId)) at(d.date).contractorCapacitySeconds += d.availableSeconds; else at(d.date).employeeCapacitySeconds += d.availableSeconds
 }
 const asOfMonth = asOf.slice(0, 7)
 for (const e of (forecast?.engagements ?? []).filter((e: Value) => e.currency === currency)) for (const m of e.months.filter((m: Value) => m.month >= asOfMonth)) { const row = months.get(m.month) ?? (months.set(m.month, blank(m.month)), months.get(m.month)!); row.committedFeesMinor += m.committedFeesMinor; row.committedCostMinor += m.committedCostMinor; row.tentativeFeesMinor += m.tentativeFeesMinor }
 for (const p of (forecast?.pipeline ?? []).filter((p: Value) => p.currency === currency)) for (const m of p.months.filter((m: Value) => m.month >= asOfMonth)) { const row = months.get(m.month) ?? (months.set(m.month, blank(m.month)), months.get(m.month)!); row.weightedPipelineFeesMinor += m.weightedMinor }
 const incomplete = [...(forecast?.engagements ?? []).filter((e: Value) => e.currency === currency && !e.complete).map((e: Value) => `engagements:${e.engagementId}: FINANCE-006 forecast incomplete`), ...(missingCalendarDays ? [`${missingCalendarDays} person-days have no working calendar; capacity is a known minimum`] : []), ...(sources.resourceRequests.length ? ['Unfilled roles have no named person, so no rate prices them; their cost is outside committed cost'] : [])]
 const baselineMonths = [...months.values()].filter(m => m.month >= asOfMonth).sort((x, y) => x.month.localeCompare(y.month)).map(m => ({ ...m, committedDemandSeconds: m.committedSeconds + m.unfilledSeconds + m.wonSeconds, capacitySeconds: m.employeeCapacitySeconds + m.contractorCapacitySeconds, marginMinor: m.committedFeesMinor - m.committedCostMinor }))
 const total = (rows: Value[], k: string) => sum(rows.map(r => r[k]))
 const baseline = { months: baselineMonths, capacitySeconds: total(baselineMonths, 'capacitySeconds'), committedDemandSeconds: total(baselineMonths, 'committedDemandSeconds'), feesMinor: total(baselineMonths, 'committedFeesMinor'), costMinor: total(baselineMonths, 'committedCostMinor'), marginMinor: total(baselineMonths, 'marginMinor') }
 const scenarios = (data.demandScenarios ?? []).map(s => {
  const v = s.value, o = opportunities.find(r => r.id === v.opportunityId), head = { id: s.id, revision: s.revision, name: v.name, opportunityId: v.opportunityId, status: v.status, delayDays: v.delayDays, supply: v.supply, costPerHourMinor: v.costPerHourMinor }
  if (!o || ['won', 'lost'].includes(o.value.stage)) return { ...head, compared: false, reason: o ? `Opportunity ${o.value.stage}: its demand is ${o.value.stage === 'won' ? 'committed backlog' : 'gone'}, so the scenario no longer adds it` : 'Opportunity unavailable' }
  if (v.status !== 'approved') return { ...head, compared: false, reason: 'Awaiting owner approval' }
  if (o.value.currency !== currency) return { ...head, compared: false, reason: `Opportunity in ${o.value.currency}; SETUP-003 exchange rates convert it` }
  const deal = new Map<string, { demand: number, capacity: number, fees: number, cost: number }>(), dm = (m: string) => { if (!deal.has(m)) deal.set(m, { demand: 0, capacity: 0, fees: 0, cost: 0 }); return deal.get(m)! }
  const shifted = dealDays(o.value, v.delayDays)
  placeDemand(o.value.demandSeconds, shifted, (day, s) => { dm(day.slice(0, 7)).demand += s })
  for (const [m, minor] of spread(o.value.amountMinor, monthsBetween(shifted[0], shifted.at(-1)!))) if (m >= asOfMonth) dm(m).fees += minor
  // A planned hire with no end date runs to the end of the forecast year (the last capacity day, as-of day + 366).
  const horizonEnd = [...capacity.flatMap(c => c.days.map((d: Value) => d.date as string)), shifted.at(-1)!].sort().at(-1)!
  if (v.supply) for (const day of future(v.supply.from, v.supply.to ?? horizonEnd)) if (weekday(day)) dm(day.slice(0, 7)).capacity += v.supply.dailySeconds
  // A planned hire costs every hour of its capacity; a contractor or the existing team costs only the deal hours worked.
  for (const x of deal.values()) x.cost = charge(v.supply?.type === 'hire' ? x.capacity : x.demand, v.costPerHourMinor)
  const all = [...new Set([...baselineMonths.map(m => m.month), ...deal.keys()])].sort()
  const rows = all.map(month => { const b = baselineMonths.find(m => m.month === month), x = deal.get(month) ?? { demand: 0, capacity: 0, fees: 0, cost: 0 }, capacitySeconds = (b?.capacitySeconds ?? 0) + x.capacity, demandSeconds = (b?.committedDemandSeconds ?? 0) + x.demand, feesMinor = (b?.committedFeesMinor ?? 0) + x.fees, costMinor = (b?.committedCostMinor ?? 0) + x.cost
   return { month, capacitySeconds, demandSeconds, gapSeconds: capacitySeconds - demandSeconds, dealDemandSeconds: x.demand, addedCapacitySeconds: x.capacity, dealFeesMinor: x.fees, dealCostMinor: x.cost, feesMinor, costMinor, marginMinor: feesMinor - costMinor } })
  const t = { capacitySeconds: total(rows, 'capacitySeconds'), demandSeconds: total(rows, 'demandSeconds'), feesMinor: total(rows, 'feesMinor'), costMinor: total(rows, 'costMinor'), marginMinor: total(rows, 'marginMinor') }
  return { ...head, compared: true, from: shifted[0], to: shifted.at(-1), months: rows, ...t, delta: { capacitySeconds: t.capacitySeconds - baseline.capacitySeconds, demandSeconds: t.demandSeconds - baseline.committedDemandSeconds, feesMinor: t.feesMinor - baseline.feesMinor, costMinor: t.costMinor - baseline.costMinor, marginMinor: t.marginMinor - baseline.marginMinor } }
 })
 return { asOf, currency, labels: { committed: 'committed', tentative: '+ tentative', pipeline: '+ weighted pipeline' }, complete: incomplete.length === 0, incomplete, unplaced, baseline, scenarios, sources }
}
