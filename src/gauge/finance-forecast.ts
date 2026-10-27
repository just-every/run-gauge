import { quoteBill } from './quote-pricing'
import { phaseViews } from './budget-phases'
import { type Row, type Value, charge, sum } from './model'
import { explain, activeRates } from './rate-cards'
import { retainerMatches, overageCharge } from './retainer-rules'
import { retainerFees } from './retainer-fees'
import { allocationPricing } from './forecast-allocation-pricing'

// FINANCE-006 committed forecast basis. Every amount is integer cents in the engagement currency.
// Hourly fees: approved actuals at their frozen billMinor + future committed allocation days priced at the
// bill rate effective on each day (RATE-002 precedence, withdrawn cards excluded), including bill-only
// overtime premiums followed by write-downs, round-half-up per allocation day. Allocation seconds are unrounded.
// Fixed fees follow approved milestones by due month; retainer revenue is its forecast overages (the period fee
// is optional on each immutable version, earned ratably in opened periods; missing fees remain incomplete). Cost always uses the allocation formula.
const DAY = 86400000
const month = (day: string) => day.slice(0, 7)
const days = (from: string, to: string) => { const out: string[] = []; for (let ms = Date.parse(from); ms <= Date.parse(to); ms += DAY) out.push(new Date(ms).toISOString().slice(0, 10)); return out }
const nextDay = (day: string) => new Date(Date.parse(day) + DAY).toISOString().slice(0, 10)
const monthsBetween = (from: string, to: string) => { const out: string[] = []; const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); while (d.toISOString().slice(0, 7) <= to.slice(0, 7)) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1) } return out }
/** Integer cents split evenly; leftover cents go to the earliest months. */
const spread = (minor: number, months: string[]) => months.map((m, i) => [m, Math.floor(minor / months.length) + (i < minor % months.length ? 1 : 0)] as const)
type Month = { month: string, actualFeesMinor: number, etcFeesMinor: number, expenseFeesMinor: number, periodFeesMinor: number, committedFeesMinor: number, actualCostMinor: number, etcCostMinor: number, expenseCostMinor: number, committedCostMinor: number, tentativeFeesMinor: number, tentativeCostMinor: number }
const blank = (m: string): Month => ({ month: m, actualFeesMinor: 0, etcFeesMinor: 0, expenseFeesMinor: 0, periodFeesMinor: 0, committedFeesMinor: 0, actualCostMinor: 0, etcCostMinor: 0, expenseCostMinor: 0, committedCostMinor: 0, tentativeFeesMinor: 0, tentativeCostMinor: 0 })

export function financeForecastBase(data: Record<string, Row[]>, asOf: string, retainerBalances: Value[] = [],pricingData=data) {
 const rates = activeRates(data.rates ?? [], data.rateWithdrawals ?? []), people = new Map((data.people ?? []).map(p => [p.id, p]))
 const priceAllocation = allocationPricing(pricingData, asOf),periodFees=retainerFees(data,asOf)
 // Index threshold evidence once. A person's future source superset is retained
 // when overtime is priced, including competing projects and nonbillable work.
 const thresholdSources = new Map<string, { staffing: Row[], time: Row[] }>()
 for (const kind of ['staffing', 'time'] as const) for (const row of data[kind] ?? []) {
  const v = row.value
  if (kind === 'time' ? v.status !== 'approved' || v.workDate <= asOf : v.to <= asOf) continue
  let group = thresholdSources.get(v.personId)
  if (!group) { group = { staffing: [], time: [] }; thresholdSources.set(v.personId, group) }
  group[kind].push(row)
 }
 const engagements = (data.engagements ?? []).filter(e => e.value.type !== 'internal').map(e => {
  const currency = e.value.currency, mine = (k: string) => (data[k] ?? []).filter(r => r.value.engagementId === e.id)
  const terms = mine('budgets').filter(r => r.value.status === 'approved').sort((x, y) => y.value.approvedAt - x.value.approvedAt)[0]
  const families = mine('retainers'), basis = families.length ? 'retainer' : terms?.value.mode === 'fixed' ? 'fixed' : 'hourly'
  const months = new Map<string, Month>(), at = (m: string) => { if (!months.has(m)) months.set(m, blank(m)); return months.get(m)! }
  const incomplete: string[] = [], unpriced: Value[] = [], sources: Record<string, string[]> = { time: [], expenses: [], staffing: [], rates: [], budgets: terms ? [terms.id] : [], milestones: [], retainerPeriods: [], rateWithdrawals: (data.rateWithdrawals ?? []).map(w => w.id) }
  const tracedPeople = new Set<string>()
  const pricedFees = (staffing: Row, day: string, card: Row) => {
   const personId = staffing.value.personId
   if (card.value.overtimeAfterSeconds !== undefined && !tracedPeople.has(personId)) {
    tracedPeople.add(personId)
    const add = (kind: string, id: string) => { const ids = sources[kind] ??= []; if (!ids.includes(id)) ids.push(id) }
    add('people', personId)
    const group = thresholdSources.get(personId)
    for (const kind of ['staffing', 'time'] as const) for (const row of group?.[kind] ?? []) {
     add(kind, row.id); add('engagements', row.value.engagementId)
    }
   }
   return priceAllocation(staffing, day, card).billMinor
  }
  // Actuals: approved time and expenses in their work month.
  for (const t of mine('time').filter(r => r.value.status === 'approved')) {
   const x = t.value.economics ?? {}, m = at(month(t.value.workDate)); sources.time.push(t.id)
   if (basis === 'hourly' && t.value.billable) { if (x.billMinor == null) incomplete.push(`time:${t.id}: frozen billMinor unknown`); else m.actualFeesMinor += x.billMinor }
   if (x.costMinor == null) incomplete.push(`time:${t.id}: frozen costMinor unknown`)
   else if ((x.costCurrency ?? x.currency) !== currency) incomplete.push(`time:${t.id}: cost declared in ${x.costCurrency}; SETUP-003 exchange rates convert it`)
   else m.actualCostMinor += x.costMinor
  }
  const spent = mine('expenses').filter(r => r.value.status === 'approved')
  for (const x of spent) { const m = at(month(x.value.date)); sources.expenses.push(x.id); m.actualCostMinor += x.value.amountMinor; if (x.value.clientBillable??x.value.reimbursable) m.actualFeesMinor += x.value.clientRecoveryMinor??x.value.amountMinor }
  // ETC: future allocation days, priced at the rate effective on each day.
  const committedDays: string[] = []
  for (const s of mine('staffing')) {
   const person = people.get(s.value.personId); if (!sources.staffing.includes(s.id)) sources.staffing.push(s.id)
   for (const day of days(s.value.from > asOf ? s.value.from : nextDay(asOf), s.value.to)) {
    const x = person ? explain(rates, person, e, s.value.service ?? 'Unspecified', day) : undefined, bill = x?.bill?.level==='project'?x.bill.chosen:quoteBill(data,e.id,terms,s.value)??x?.bill?.chosen, cost = x?.cost?.chosen
    for (const r of [bill, cost])if(r){const kind=r.value.estimateId?'estimates':'rates',ids=sources[kind]??=[];if(!ids.includes(r.id))ids.push(r.id);sources[kind]=ids}
    const m = at(month(day)), tentative = s.value.commitment === 'tentative'
    if (!tentative) committedDays.push(day)
    if (basis === 'hourly' && s.value.billable !== false) {
     if (bill?.value.billMinor == null) { unpriced.push({ staffingId: s.id, date: day, missing: 'bill rate' }); if (!tentative) incomplete.push(`staffing:${s.id}: no effective bill rate on ${day}`) }
     else if (tentative) m.tentativeFeesMinor += pricedFees(s, day, bill)
     else m.etcFeesMinor += pricedFees(s, day, bill)
    }
    if (cost?.value.costMinor == null) { unpriced.push({ staffingId: s.id, date: day, missing: 'cost rate' }); if (!tentative) incomplete.push(`staffing:${s.id}: no effective cost rate on ${day}`) }
    else if ((cost.value.costCurrency ?? cost.value.currency) !== currency) { if (!tentative) incomplete.push(`staffing:${s.id}: cost declared in ${cost.value.costCurrency}; SETUP-003 exchange rates convert it`) }
    else if (tentative) m.tentativeCostMinor += charge(s.value.dailySeconds, cost.value.costMinor)
    else m.etcCostMinor += charge(s.value.dailySeconds, cost.value.costMinor)
   }
  }
  // Remaining billable expense budget: billed and costed at the same pass-through amount.
  const expenseBudgetMinor = terms?.value.expenseBudgetMinor ?? 0, remainingExpenseMinor = Math.max(0, expenseBudgetMinor - sum(spent.filter(x => (x.value.clientBillable??x.value.reimbursable)).map(x => x.value.amountMinor)))
  if (remainingExpenseMinor) {
   const planEnd = committedDays.sort().at(-1) ?? asOf
   for (const [m, minor] of terms!.value.expenseDate ? [[month(terms!.value.expenseDate), remainingExpenseMinor] as const] : spread(remainingExpenseMinor, monthsBetween(nextDay(asOf), planEnd > asOf ? planEnd : nextDay(asOf)))) { at(m).expenseFeesMinor += minor; at(m).expenseCostMinor += minor }
  }
  // Fixed-fee revenue follows approved milestones; an unscheduled remainder has no month yet (INVOICE-002 adds percentage schedules).
  let unscheduledMinor = 0
  if (basis === 'fixed') {
   const milestones = mine('milestones').filter(r => r.value.status === 'approved')
   for (const ms of milestones) { sources.milestones.push(ms.id); const m = at(month(ms.value.due)); if (ms.value.due <= asOf) m.actualFeesMinor += ms.value.amountMinor; else m.etcFeesMinor += ms.value.amountMinor }
   unscheduledMinor = terms!.value.amountMinor - sum(milestones.map(r => r.value.amountMinor))
   if (unscheduledMinor > 0) incomplete.push(`budgets:${terms!.id}: ${unscheduledMinor} cents of the fixed fee have no approved milestone`)
  }
  // Retainer revenue: realised overage in its period month plus committed eligible demand beyond the remaining allowance.
  if (basis === 'retainer') {
   const feePeriods=periodFees.filter(p=>p.engagementId===e.id)
   if(!feePeriods.length)incomplete.push(`engagements:${e.id}: no opened retainer period fee`)
   for(const fee of feePeriods){
    sources.retainerPeriods.push(fee.periodId);(sources.retainers??=[]).push(fee.retainerId)
    if(fee.totalMinor===null){incomplete.push(`retainers:${fee.retainerId}: period fee not recorded`);continue}
    for(const m of fee.months){at(m.month).actualFeesMinor+=m.actualMinor!;at(m.month).etcFeesMinor+=m.etcMinor!;at(m.month).periodFeesMinor+=m.totalMinor!}
   }
   for (const b of retainerBalances.filter(b => b.engagementId === e.id)) {
    const period = (data.retainerPeriods ?? []).find(p => p.id === b.periodId), family = families.find(r => r.id === b.retainerId)
    if (!period || !family) continue
    sources.retainerPeriods.push(period.id); const t = family.value.terms, end = month(period.value.periodEnd)
    if (t.rules.overage !== 'bill') continue
    if (b.overageMinor != null) at(end).actualFeesMinor += b.overageMinor
    if (b.remaining == null) { incomplete.push(`retainerPeriods:${period.id}: consumption unknown`); continue }
    let demand = 0
    for (const s of mine('staffing').filter(s => s.value.commitment === 'committed' && retainerMatches(t, { service: s.value.service ?? 'Unspecified', billable: s.value.billable !== false }))) {
     for (const day of days([s.value.from, nextDay(asOf), period.value.activeStart].sort().at(-1)!, s.value.to < period.value.activeEnd ? s.value.to : period.value.activeEnd)) {
      if (t.unit === 'hours') { demand += s.value.dailySeconds; continue }
      const native=people.get(s.value.personId)&&explain(rates,people.get(s.value.personId)!,e,s.value.service??'Unspecified',day).bill,bill=native?.level==='project'?native.chosen:quoteBill(data,e.id,terms,s.value)??native?.chosen
      if (bill?.value.billMinor == null) incomplete.push(`staffing:${s.id}: no effective bill rate on ${day}`); else demand += pricedFees(s, day, bill)
     }
    }
    const excess = Math.max(0, demand - Math.max(0, b.remaining))
    if (excess) at(end).etcFeesMinor += overageCharge(excess, t.unit, t.rules.overageRate)
   }
  }
  const list = [...months.values()].sort((x, y) => x.month.localeCompare(y.month))
  for (const m of list) { m.committedFeesMinor = m.actualFeesMinor + m.etcFeesMinor + m.expenseFeesMinor; m.committedCostMinor = m.actualCostMinor + m.etcCostMinor + m.expenseCostMinor }
  const total = (k: keyof Month) => sum(list.map(m => m[k] as number))
  const actualFeesMinor = total('actualFeesMinor'), etcFeesMinor = total('etcFeesMinor'), eacFeesMinor = actualFeesMinor + etcFeesMinor + remainingExpenseMinor
  const actualCostMinor = total('actualCostMinor'), etcCostMinor = total('etcCostMinor'), eacCostMinor = actualCostMinor + etcCostMinor + remainingExpenseMinor
  const tentativeFeesMinor = total('tentativeFeesMinor'), tentativeCostMinor = total('tentativeCostMinor')
  return { engagementId: e.id, name: e.value.name, currency, basis, complete: incomplete.length === 0, incomplete: [...new Set(incomplete)], unpriced, unscheduledMinor, remainingExpenseMinor,
   actualFeesMinor, etcFeesMinor, eacFeesMinor, tentativeFeesMinor, eacFeesWithTentativeMinor: eacFeesMinor + tentativeFeesMinor,
   actualCostMinor, etcCostMinor, eacCostMinor, tentativeCostMinor, eacCostWithTentativeMinor: eacCostMinor + tentativeCostMinor,
   marginMinor: eacFeesMinor - eacCostMinor, months: list, sources }
 })
 // "+ weighted pipeline": each open opportunity's probability-weighted value spread evenly over the months of its proposed dates.
 const pipeline: Record<string, Record<string, number>> = {}
 for (const o of (data.opportunities ?? []).filter(r => !['won', 'lost'].includes(r.value.stage))) {
  const weighted = Number((BigInt(o.value.amountMinor) * BigInt(o.value.probability) + 50n) / 100n), bucket = pipeline[o.value.currency] ??= {}
  for (const [m, minor] of spread(weighted, monthsBetween(o.value.from, o.value.to))) bucket[m] = (bucket[m] ?? 0) + minor
 }
 // Totals stay per currency: SETUP-003 exchange rates convert other currencies before any cross-currency total.
 const totals = [...new Set(engagements.map(e => e.currency))].map(currency => { const group = engagements.filter(e => e.currency === currency); return { currency, complete: group.every(e => e.complete), eacFeesMinor: sum(group.map(e => e.eacFeesMinor)), eacCostMinor: sum(group.map(e => e.eacCostMinor)), marginMinor: sum(group.map(e => e.marginMinor)), tentativeFeesMinor: sum(group.map(e => e.tentativeFeesMinor)) } })
 return { asOf, labels: { committed: 'committed', tentative: '+ tentative', pipeline: '+ weighted pipeline' }, engagements, totals, pipeline: Object.entries(pipeline).map(([currency, byMonth]) => ({ currency, months: Object.entries(byMonth).sort().map(([month, weightedMinor]) => ({ month, weightedMinor })) })) }
}

export function financeForecast(data:Record<string,Row[]>,asOf:string,retainerBalances:Value[]=[]){
 const base=financeForecastBase(data,asOf,retainerBalances),views=phaseViews(data),phaseForecasts=views.map(p=>({engagementId:p.engagementId,phaseKey:p.phase.key,forecast:financeForecastBase(p.data,asOf,[],data).engagements.find(f=>f.engagementId===p.engagementId)!}))
 const engagements=base.engagements.map(original=>{
  const parts=phaseForecasts.filter(p=>p.engagementId===original.engagementId).map(p=>p.forecast);if(!parts.length)return original
  const combined={...original,basis:parts.every(p=>p.basis===parts[0].basis)?parts[0].basis:'mixed',complete:parts.every(p=>p.complete),incomplete:[...new Set(parts.flatMap(p=>p.incomplete))],unpriced:parts.flatMap(p=>p.unpriced),sources:Object.fromEntries([...new Set(parts.flatMap(p=>Object.keys(p.sources)))].map(k=>[k,[...new Set(parts.flatMap(p=>p.sources[k]??[]))]])),months:[...new Set(parts.flatMap(p=>p.months.map(m=>m.month)))].sort().map(month=>{const rows=parts.flatMap(p=>p.months.filter(m=>m.month===month)),r=blank(month);for(const key of Object.keys(r).filter(k=>k!=='month') as (keyof Omit<Month,'month'>)[])r[key]=sum(rows.map(m=>m[key]));return r})}
  for(const key of Object.keys(original).filter(k=>typeof original[k as keyof typeof original]==='number'))(combined as Value)[key]=sum(parts.map(p=>(p as Value)[key]))
  return combined
 })
 // Recompute currency totals from the composed projects; keep weighted pipeline separate.
 const totals=base.totals.map(t=>{const rows=engagements.filter(e=>e.currency===t.currency),r={...t,complete:rows.every(e=>e.complete)};for(const key of Object.keys(t).filter(k=>typeof (t as Value)[k]==='number')){if(rows.every(e=>typeof (e as Value)[key]==='number'))(r as Value)[key]=sum(rows.map(e=>(e as Value)[key]))}return r})
 return {...base,engagements,totals,phaseForecasts}
}
