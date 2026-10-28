import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Row, type Value, type Kind, kinds, Fault, need, text, date, integer, charge, sum } from './model'
import { type Actor, all, finance, fence } from './store'
import { capacity } from './reports'
import { financeForecast } from './finance-forecast'
import { cashForecast } from './cash-forecast'
import { retainerStatements } from './retainer-statements'
import { retainerMatches, overageCharge } from './retainer-rules'
import { latestBudget } from './budget-caps'
import { phaseViews } from './budget-phases'
import { activeRates, explain } from './rate-cards'
import { normalizeSchedule, reschedule } from './delivery-engine'
import { retainerCandidates } from './retainer-sources'
import { quoteBill } from './quote-pricing'
import { allocationPricing } from './forecast-allocation-pricing'

type Data = Record<Kind, Row[]>
const hash = (value: unknown) => sha256(canonicalJson(value))
const shift = (day: string, n: number) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10)
const days = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = shift(d, 1)) out.push(d); return out }
const list = (value: unknown, label: string, max = 50): Value[] => { need(Array.isArray(value) && value.length <= max, `${label} must be a bounded list`); return value }
const latestPlan = (data: Data, id: string) => data.deliveryPlans.filter(p => p.value.engagementId === id).at(-1)

async function readBasis(env: Bindings, a: Actor, input: Value) {
 need(a.session.kind === 'native' && finance(a), 'Recovery comparisons require a native owner or finance session', 403)
 await fence(env, a)
 const asOf = date(input.asOf), ids = list(input.projectIds, 'Projects', 2).map(id => text(id, 'Project'))
 need(ids.length === 2 && new Set(ids).size === 2, 'Choose two distinct native projects')
 const data = Object.fromEntries(await Promise.all(kinds.map(async k => [k, await all(env, k)]))) as Data
 need(ids.every(id => data.engagements.some(e => e.id === id && e.value.type !== 'internal')), 'Choose two existing client projects', 404)
 const digest = hash({ asOf, ids, data })
 return { data, asOf, ids, digest }
}
function snapshot(data: Data, ids: string[], asOf: string, from: string, to: string) {
 const native = financeForecast(data, asOf, retainerStatements(data, data.time, undefined, data))
 const forecast = { ...native, engagements: native.engagements.map(p => {
  const staffed = sum(data.staffing.filter(s => s.value.engagementId === p.engagementId && s.value.commitment === 'committed').map(s => days(s.value.from > asOf ? s.value.from : shift(asOf, 1), s.value.to).length * s.value.dailySeconds))
  const remaining = sum(data.tasks.filter(t => t.value.engagementId === p.engagementId && t.value.status !== 'done').map(t => t.value.remainingSeconds))
  const missing = remaining > staffed ? [`Project ${p.engagementId}: ${remaining - staffed} remaining task seconds have no committed priced allocation`] : []
  return { ...p, complete: p.complete && !missing.length, incomplete: [...p.incomplete, ...missing] }
 }) }

 const cash = cashForecast(data, { ...forecast, engagements: forecast.engagements.filter(p => ids.includes(p.engagementId)), pipeline: [] })
 return {
  projects: forecast.engagements.filter(p => ids.includes(p.engagementId)).map(p => ({ ...p, marginMinor: p.complete ? p.marginMinor : null, eacFeesMinor: p.complete ? p.eacFeesMinor : null, eacCostMinor: p.complete ? p.eacCostMinor : null })),
  cash: { ...cash, months: cash.months.map(m => ({ ...m, expectedMinor: m.complete ? m.expectedMinor : null, historicalExpectedMinor: m.complete ? m.historicalExpectedMinor : null })) },
  dates: ids.map(engagementId => ({ engagementId, finish: latestPlan(data, engagementId)?.value.schedule.finish ?? null, tasks: data.tasks.filter(t => t.value.engagementId === engagementId).map(t => ({ id: t.id, from: t.value.from, to: t.value.to })), milestones: data.milestones.filter(m => m.value.engagementId === engagementId).map(m => ({ id: m.id, due: m.value.due })) })),
  loads: capacity(data, from, to).filter(p => data.staffing.some(s => s.value.personId === p.personId && ids.includes(s.value.engagementId))).map(p => ({ ...p, days: p.days.map(d => ({ ...d, projectSeconds: Object.fromEntries(ids.map(id => [id, sum(data.staffing.filter(s => s.value.personId === p.personId && s.value.engagementId === id && s.value.commitment === 'committed' && s.value.from <= d.date && s.value.to >= d.date).map(s => s.value.dailySeconds))])) })) }))
 }
}
export async function recoveryBaseline(env: Bindings, a: Actor, input: Value) {
 const { data, asOf, ids, digest } = await readBasis(env, a, input)
 await fence(env, a)
 return { asOf, projectIds: ids, basisDigest: digest, sources: kinds.flatMap(kind => data[kind].map(r => ({ kind, id: r.id, revision: r.revision }))) }
}

/** Only explicit future planning fields are changed in memory. No native write planner is called. */
function candidateFor(data: Data, ids: string[], asOf: string, option: Value) {
 need(Object.keys(option).every(k => ['id','name','schedules','staffing','scopes','tasks','commercialChanges','capacityCosts'].includes(k)), 'Unsupported recovery change; use the explicit planning fields')
 const candidate = { ...data }, edits = new Set<string>()
 const put = (kind: Kind, row: Row, value: Value) => { candidate[kind] = candidate[kind].map(r => r.id === row.id ? { ...r, value } : r) }
 const source = (kind: Kind, edit: Value) => {
  const row = data[kind].find(r => r.id === edit.id)
  need(row && row.revision === edit.revision, 'Recovery source changed; capture a new baseline', 409)
  need(ids.includes(kind === 'engagements' ? row.id : row.value.engagementId), 'Alternative source is outside the selected projects', 403)
  need(!edits.has(`${kind}:${row.id}`), 'Change each source once in an alternative'); edits.add(`${kind}:${row.id}`)
  return row
 }
 for (const edit of list(option.schedules ?? [], 'Schedules', 2)) {
  const row = source('deliveryPlans', edit), id = row.value.engagementId
  need(latestPlan(data, id)?.id === row.id, 'Use the latest approved delivery baseline', 409)
  let plan = edit.delayBusinessDays ? reschedule(row.value.schedule, edit.nodeId, edit.delayBusinessDays) : row.value.schedule
  const starts = list(edit.starts ?? [], 'Requested starts')
  need(new Set(starts.map(s => s.nodeId)).size === starts.length, 'Choose each requested start once')
  need(starts.every(s => plan.nodes.some((n: Value) => n.id === s.nodeId)), 'Unknown schedule node')
  if (starts.length) {
   plan = normalizeSchedule({ ...plan, nodes: plan.nodes.map((n: Value) => ({ ...n, start: starts.find(s => s.nodeId === n.id)?.start ?? n.start })) })
   need(starts.every(s => plan.nodes.find((n: Value) => n.id === s.nodeId)!.start === date(s.start)), 'Requested start violates a predecessor or the delivery calendar', 409)
  }
  for (const node of plan.nodes) {
   const old = row.value.schedule.nodes.find((n: Value) => n.id === node.id)!
   if (old.start === node.start && old.end === node.end) continue
   need(old.start > asOf && node.start > asOf, 'Recovery may move only future work', 409)
   if (node.kind !== 'phase') {
    const kind = node.kind === 'task' ? 'tasks' : 'milestones', original = candidate[kind].find(r => r.id === node.sourceId)
    need(original && original.value.engagementId === id, 'Delivery source is missing', 409)
    need(kind === 'tasks' ? original.value.from === old.start && original.value.to === old.end : original.value.due === old.end, 'Delivery source differs from its approved baseline; review the schedule first', 409)
    put(kind, original, kind === 'tasks' ? { ...original.value, from: node.start, to: node.end } : { ...original.value, due: node.end })
   }
   const delta = (Date.parse(node.start) - Date.parse(old.start)) / 86400000
   for (const id of node.staffingIds) {
    const booking = candidate.staffing.find(r => r.id === id)
    need(booking && booking.value.engagementId === row.value.engagementId && booking.value.from > asOf, 'Linked staffing must be future work in this project', 409)
    put('staffing', booking, { ...booking.value, from: shift(booking.value.from, delta), to: shift(booking.value.to, delta) })
   }
  }
  put('deliveryPlans', row, { ...row.value, schedule: plan })
 }
 for (const edit of list(option.staffing ?? [], 'Staffing')) {
  const row = source('staffing', edit), current = candidate.staffing.find(r => r.id === row.id)!
  need(row.value.from > asOf && row.value.commitment === 'committed', 'Compare only future committed staffing', 409)
  const personId = edit.personId === undefined ? current.value.personId : text(edit.personId, 'Replacement person')
  need(data.people.some(p => p.id === personId && !p.value.privacyErased), 'Replacement person is unavailable', 409)
  const dailySeconds = edit.dailySeconds === undefined ? current.value.dailySeconds : integer(edit.dailySeconds, 'Remaining seconds per day', 0, 86400)
  put('staffing', current, { ...current.value, personId, dailySeconds })
 }
 for (const edit of list(option.tasks ?? [], 'Remaining tasks')) {
  const row = source('tasks', edit), current = candidate.tasks.find(t => t.id === row.id)!
  need(row.value.status !== 'done' && row.value.from > asOf, 'Revise remaining effort only on future open tasks', 409)
  put('tasks', current, { ...current.value, remainingSeconds: integer(edit.remainingSeconds, 'Remaining task seconds') })
 }
 for (const edit of list(option.scopes ?? [], 'Revised scopes', 2)) {
  const row = source('engagements', edit)
  put('engagements', row, { ...row.value, scope: text(edit.scope, 'Revised scope') })
 }
 return candidate
}

type Requirement = { key: string; engagementId: string; kind: string; description: string; amountMinor: number | null; currency: string; quantity?: number }
function commercialRequirements(data: Data, candidate: Data, ids: string[], asOf: string, projected: ReturnType<typeof snapshot>) {
 const requirements: Requirement[] = [], unknowns: string[] = ids.filter(id => !latestPlan(candidate, id)).map(id => `Project ${id}: approved delivery baseline unavailable`)
 const add = (key: string, id: string, kind: string, description: string, amountMinor: number | null, quantity?: number) => requirements.push({ key, engagementId: id, kind, description, amountMinor, currency: data.engagements.find(e => e.id === id)!.value.currency, ...(quantity === undefined ? {} : { quantity }) })
 for (const id of ids) {
  const project = candidate.engagements.find(e => e.id === id)!, original = data.engagements.find(e => e.id === id)!
  if (project.value.scope !== original.value.scope || candidate.tasks.some(t => t.value.engagementId === id && t.value.remainingSeconds !== data.tasks.find(b => b.id === t.id)!.value.remainingSeconds) || candidate.staffing.some(s => s.value.engagementId === id && s.value.dailySeconds !== data.staffing.find(b => b.id === s.id)!.value.dailySeconds)) add(`scope:${id}`, id, 'scope', 'Client change order for the explicitly revised scope', 0)
  for (const m of candidate.milestones.filter(m => m.value.engagementId === id && m.value.status === 'approved')) {
   const before = data.milestones.find(b => b.id === m.id)!
   if (before.value.due !== m.value.due) add(`client-date:${m.id}`, id, 'client-date', `Client acceptance required: ${m.value.name} moves from ${before.value.due} to ${m.value.due}; approved milestone amount remains ${m.value.amountMinor}`, 0)
  }
  const budget = latestBudget(data.budgets, id)
  if (!budget) { unknowns.push(`Project ${id}: approved budget unavailable`); continue }
  const groups = [{ key: '', data: candidate, cap: { hourBudgetSeconds: budget.value.effortSeconds, feeBudgetMinor: budget.value.amountMinor, expenseBudgetMinor: budget.value.expenseBudgetMinor ?? 0, mode: budget.value.mode } }, ...phaseViews(candidate).filter(v => v.engagementId === id).map(v => ({ key: v.phase.key, data: v.data as Data, cap: v.phase }))]
  for (const group of groups) {
   const f = financeForecast(group.data, asOf, retainerStatements(group.data, group.data.time, undefined, group.data)).engagements.find(p => p.engagementId === id)!
   const actualHours = sum(group.data.time.filter(t => t.value.engagementId === id && t.value.status === 'approved').map(t => t.value.durationSeconds)) + sum(group.data.staffing.filter(s => s.value.engagementId === id && s.value.commitment === 'committed').map(s => days(s.value.from > asOf ? s.value.from : shift(asOf, 1), s.value.to).length * s.value.dailySeconds))
   const remainingHours = sum(group.data.tasks.filter(t => t.value.engagementId === id && t.value.status !== 'done').map(t => t.value.remainingSeconds))
   const actualSeconds = sum(group.data.time.filter(t => t.value.engagementId === id && t.value.status === 'approved').map(t => t.value.durationSeconds))
   const hours = Math.max(actualHours, actualSeconds + remainingHours)
   const prefix = `budget:${budget.id}:${group.key || 'project'}`
   if (hours > group.cap.hourBudgetSeconds) add(`${prefix}:hours`, id, 'budget', `Change order for ${group.key || 'project'} effort above approved ${group.cap.hourBudgetSeconds} seconds`, f.complete ? Math.max(0, f.eacFeesMinor - group.cap.feeBudgetMinor) : null, hours - group.cap.hourBudgetSeconds)
   if (f.complete && f.eacFeesMinor > group.cap.feeBudgetMinor) add(`${prefix}:fees`, id, 'budget', `Change order for ${group.key || 'project'} fees above approved ${group.cap.feeBudgetMinor}`, f.eacFeesMinor - group.cap.feeBudgetMinor)
   if (!f.complete) unknowns.push(...f.incomplete)
   const expense = sum(group.data.expenses.filter(x => x.value.engagementId === id && x.value.status === 'approved').map(x => x.value.amountMinor)) + f.remainingExpenseMinor
   if (expense > group.cap.expenseBudgetMinor) add(`${prefix}:expenses`, id, 'budget', `Change order for ${group.key || 'project'} expense cap`, expense - group.cap.expenseBudgetMinor)
  }
 }
 const price = allocationPricing(candidate, asOf), rates = activeRates(candidate.rates, candidate.rateWithdrawals), demand: Row[] = []
 for (const booking of candidate.staffing.filter(s => ids.includes(s.value.engagementId) && s.value.commitment === 'committed')) {
  const project = candidate.engagements.find(e => e.id === booking.value.engagementId)!, families = candidate.retainers.filter(r => r.value.engagementId === project.id)
  if (!families.length) continue
  for (const day of days(booking.value.from > asOf ? booking.value.from : shift(asOf, 1), booking.value.to)) {
   const value: Value = { ...booking.value, service: booking.value.service ?? 'Unspecified', billable: booking.value.billable !== false, workDate: day, status: 'approved', durationSeconds: booking.value.dailySeconds }
   const eligible = retainerCandidates(candidate, value).filter(p => !value.retainerRootId || p.value.rootId === value.retainerRootId)
   if (!eligible.length) {
    // Work excluded by a retainer's service policy stays ad hoc; eligible work outside an opened period is unknown.
    if (families.some(f => retainerMatches(f.value.terms, value))) unknowns.push(`Project ${project.id}: no opened retainer entitlement for ${day}`)
    continue
   }
   if (eligible.length !== 1) { unknowns.push(`Staffing ${booking.id}: select one retainer family for ${day}`); continue }
   const period = eligible[0], family = families.find(f => f.id === period.value.retainerId)!, person = candidate.people.find(p => p.id === booking.value.personId)!
   const native = explain(rates, person, project, value.service, day).bill, card = native?.level === 'project' ? native.chosen : quoteBill(candidate, project.id, latestBudget(candidate.budgets, project.id), value) ?? native?.chosen
   const billMinor = card && card.value.currency === project.value.currency ? price(booking, day, card).billMinor : null
   if (family.value.terms.unit === 'value' && billMinor === null) unknowns.push(`Retainer ${family.id}: value demand unpriced on ${day}`)
   demand.push({ id: `recovery-demand:${booking.id}:${day}`, revision: booking.revision, value: { ...value, retainerRootId: period.value.rootId, economics: { billMinor } } })
  }
 }
 const balances = retainerStatements(candidate, [...candidate.time, ...demand], undefined, candidate)
 for (const balance of balances.filter(b => ids.includes(b.engagementId))) {
  const family = candidate.retainers.find(r => r.id === balance.retainerId)!, t = family.value.terms
  const period = candidate.retainerPeriods.find(p => p.id === balance.periodId)!
  if (balance.closed && demand.some(d => d.value.retainerRootId === period.value.rootId && d.value.workDate >= period.value.activeStart && d.value.workDate <= period.value.activeEnd)) unknowns.push(`Retainer ${family.id}: closed period cannot absorb proposed future work`)
  if (balance.remaining === null) { unknowns.push(`Retainer ${family.id}: projected allowance unknown`); continue }
  const excess = Math.max(0, -balance.remaining)
  if (excess && balance.overagePolicy !== 'bill') add(`retainer:${period.id}`, balance.engagementId, 'retainer', `Change order for ${excess} ${t.unit === 'hours' ? 'seconds' : 'minor units'} beyond retainer allowance; ${balance.overagePolicy} overage remains held`, t.rules.overageRate > 0 ? overageCharge(excess, t.unit, t.rules.overageRate) : null, excess)
 }
 unknowns.push(...projected.projects.flatMap(p => p.incomplete), ...projected.cash.engagements.flatMap(p => p.incomplete))
 return { requirements, unknowns: [...new Set(unknowns)] }
}

function capacityRequirements(candidate: Data, ids: string[], from: string, to: string) {
 const rates = activeRates(candidate.rates, candidate.rateWithdrawals), costs: Value[] = [], unknowns: string[] = []
 const people = new Set(candidate.staffing.filter(s => ids.includes(s.value.engagementId)).map(s => s.value.personId))
 for (const p of capacity(candidate, from, to).filter(p => people.has(p.personId))) {
  for (const d of p.days.filter(d => d.committedSeconds > 0 && d.availableSeconds === null)) unknowns.push(`Person ${p.personId}: dated capacity unknown on ${d.date}`)
  for (const conflict of p.conflicts) {
   let available = p.days.find(d => d.date === conflict.date)!.availableSeconds!, amount = 0, currency: string | null = null, complete = true
   const bookings = candidate.staffing.filter(s => s.value.personId === p.personId && s.value.commitment === 'committed' && s.value.from <= conflict.date && s.value.to >= conflict.date).sort((a, b) => a.value.engagementId.localeCompare(b.value.engagementId) || a.id.localeCompare(b.id))
   const lines = bookings.flatMap(s => {
    const covered = Math.min(available, s.value.dailySeconds); available -= covered
    const seconds = s.value.dailySeconds - covered
    if (!seconds) return []
    const project = candidate.engagements.find(e => e.id === s.value.engagementId)!, person = candidate.people.find(r => r.id === p.personId)!, card = explain(rates, person, project, s.value.service ?? 'Unspecified', conflict.date).cost?.chosen
    const c = card?.value.costCurrency ?? card?.value.currency
    if (!card || card.value.costMinor == null || c !== project.value.currency || (currency && currency !== c)) complete = false
    currency ??= c ?? project.value.currency
    const minor = complete ? charge(seconds, card!.value.costMinor) : null
    if (minor !== null) amount += minor
    return [{ engagementId: project.id, staffingId: s.id, seconds, rateMinor: card?.value.costMinor ?? null, amountMinor: minor, rateId: card?.id ?? null, rateRevision: card?.revision ?? null }]
   })
   costs.push({ key: `capacity:${p.personId}:${conflict.date}`, personId: p.personId, date: conflict.date, seconds: conflict.seconds, currency, amountMinor: complete ? amount : null, lines, requires: 'Lead acceptance of priced over-allocation; this comparison grants no approval', includedInForecast: true })
  }
 }
 return { costs, unknowns }
}

export async function recoveryPreview(env: Bindings, a: Actor, input: Value) {
 const { data, asOf, ids, digest } = await readBasis(env, a, input)
 need(input.basisDigest === digest, 'Recovery baseline changed; capture and review a fresh baseline', 409)
 const options = list(input.alternatives, 'Alternatives', 5)
 need(options.length > 0 && new Set(options.map(o => o.id)).size === options.length, 'Choose one to five distinct alternatives')
 const candidates = options.map(option => { try { return { option, candidate: candidateFor(data, ids, asOf, option) } } catch (error) { if (!(error instanceof Fault)) throw error; return { option, error: error.message } } })
 const dates = [data, ...candidates.flatMap(c => c.candidate ? [c.candidate] : [])].flatMap(d => d.staffing.filter(s => ids.includes(s.value.engagementId) && s.value.to > asOf).flatMap(s => [s.value.from > asOf ? s.value.from : shift(asOf, 1), s.value.to]))
 const from = dates.sort()[0] ?? shift(asOf, 1), to = dates.at(-1) ?? from
 need(Date.parse(to) - Date.parse(from) <= 366 * 86400000, 'Recovery compares a window of at most one year')
 const baseline = snapshot(data, ids, asOf, from, to)
 const alternatives = candidates.map(({ option, candidate, error }) => {
  const id = text(option.id, 'Alternative ID'), name = text(option.name, 'Alternative name')
  if (!candidate) return { id, name, status: 'refused', offered: false, refusals: [error!] }
  const scenario = snapshot(candidate, ids, asOf, from, to), commercial = commercialRequirements(data, candidate, ids, asOf, scenario), cap = capacityRequirements(candidate, ids, from, to)
  const named = list(option.commercialChanges ?? [], 'Named commercial changes'), priced = list(option.capacityCosts ?? [], 'Named capacity costs'), refusals: string[] = []
  const requirements = commercial.requirements.map(r => {
   const declaration = named.find(d => d.key === r.key), amount = r.amountMinor ?? (declaration && integer(declaration.amountMinor, 'Proposed change order amount'))
   const acknowledged = !!declaration && amount !== undefined && amount !== null && declaration.amountMinor === amount && typeof declaration.reason === 'string' && declaration.reason.trim().length > 0
   if (!acknowledged) refusals.push(`Name the required commercial change and amount: ${r.key}`)
   return { ...r, amountMinor: amount ?? null, amountBasis: r.amountMinor === null ? 'Human-proposed amount; commercial pricing remains unknown' : 'Native forecast against approved terms', named: acknowledged, requires: r.kind === 'client-date' ? 'Client acceptance required; no approval granted' : 'Client change order required; no approval granted' }
  })
  for (const cost of cap.costs) {
   const declaration = priced.find(d => d.key === cost.key)
   if (cost.amountMinor === null || !declaration || declaration.amountMinor !== cost.amountMinor || declaration.seconds !== cost.seconds || declaration.currency !== cost.currency) refusals.push(`Unpriced or unnamed capacity excess: ${cost.key}`)
  }
  const unknowns = [...new Set([...baseline.projects.flatMap(p => p.incomplete), ...baseline.cash.engagements.flatMap(p => p.incomplete), ...commercial.unknowns, ...cap.unknowns, ...requirements.filter(r => r.amountBasis.startsWith('Human')).map(r => `${r.key}: commercial price is a proposal, not approved terms`)])]
  const deltas = scenario.projects.map(p => { const before = baseline.projects.find(b => b.engagementId === p.engagementId)!; return { engagementId: p.engagementId, currency: p.currency, marginMinor: before.marginMinor === null || p.marginMinor === null ? null : p.marginMinor - before.marginMinor, costMinor: before.eacCostMinor === null || p.eacCostMinor === null ? null : p.eacCostMinor - before.eacCostMinor, feesMinor: before.eacFeesMinor === null || p.eacFeesMinor === null ? null : p.eacFeesMinor - before.eacFeesMinor } })
  const months = [...new Set([...baseline.cash.months, ...scenario.cash.months].map(m => `${m.currency}:${m.month}`))].sort().map(key => {
   const [currency, month] = key.split(':'), before = baseline.cash.months.find(m => m.currency === currency && m.month === month), after = scenario.cash.months.find(m => m.currency === currency && m.month === month)
   const complete = baseline.cash.engagements.filter(p => p.currency === currency).every(p => p.complete) && scenario.cash.engagements.filter(p => p.currency === currency).every(p => p.complete)
   return { currency, month, expectedMinor: complete ? (after?.expectedMinor ?? 0) - (before?.expectedMinor ?? 0) : null, historicalExpectedMinor: complete ? (after?.historicalExpectedMinor ?? 0) - (before?.historicalExpectedMinor ?? 0) : null }
  })
  const projectCashDeltas = ids.flatMap(engagementId => {
   const before = baseline.cash.engagements.find(p => p.engagementId === engagementId)!, after = scenario.cash.engagements.find(p => p.engagementId === engagementId)!
   const months = [...new Set([...before.items, ...after.items].flatMap(i => [i.cashMonth, i.historicalMonth ?? i.cashMonth]))].sort()
   return months.map(month => {
    const total = (p: typeof before, historical: boolean) => sum(p.items.filter(i => (historical ? i.historicalMonth ?? i.cashMonth : i.cashMonth) === month).map(i => i.expectedMinor))
    return { engagementId, currency: after.currency, month, expectedMinor: before.complete && after.complete ? total(after, false) - total(before, false) : null, historicalExpectedMinor: before.complete && after.complete ? total(after, true) - total(before, true) : null }
   })
  })
  return { id, name, status: refusals.length ? 'refused' : unknowns.length ? 'incomplete' : requirements.length || cap.costs.length ? 'conditional' : 'feasible', offered: !refusals.length && !unknowns.length, scenario, deltas, cashDeltas: months, projectCashDeltas, requirements, capacityCosts: cap.costs, unknowns, refusals }
 })
 await fence(env, a)
 return { asOf, from, to, projectIds: ids, basisDigest: digest, baseline, alternatives, sources: kinds.flatMap(kind => data[kind].map(r => ({ kind, id: r.id, revision: r.revision }))), assumptions: ['Read-only human-triggered native comparison; no staffing, terms, invoices or payments change', 'FINANCE-006 allocation pricing; capacity excess costs are already included, never added twice', 'FINANCE-007 supported expected receipts by currency and month; collection and timing assumptions are not settlement', 'Moved approved milestone dates require separate client acceptance; named exceptions grant no approval', 'Connected source completeness, model execution and provider settlement qualification remain unknown'] }
}

/** Translate the existing page's labelled native selections into the same public comparison input. */
export async function recoveryFormPreview(env: Bindings, a: Actor, input: Value) {
 if (!input.recoveryForm) return recoveryPreview(env, a, input)
 const { data, ids } = await readBasis(env, a, input)
 const schedules = ids.map((id, n) => { const plan = latestPlan(data, id); need(plan, 'Approve a delivery baseline for each selected project first', 409); return { id: plan.id, revision: plan.revision, nodeId: input[`node${n}`], delayBusinessDays: integer(input.delayBusinessDays, 'Business-day delay', 1, 366) } })
 const bookings = ids.map((id, n) => { const row = data.staffing.find(s => s.id === input[`booking${n}`] && s.value.engagementId === id); need(row, 'Choose a booking on each selected project'); return row })
 const tasks = ids.map((id, n) => {
  const node = latestPlan(data, id)!.value.schedule.nodes.find((node: Value) => node.id === input[`node${n}`])
  const row = data.tasks.find(t => t.id === node?.sourceId)
  need(row, 'Select a delivery task for each project')
  return { id: row.id, revision: row.revision, remainingSeconds: integer(input[`taskSeconds${n}`], 'Revised remaining task seconds') }
 })
 const alternatives = [
  { id: 'dates', name: 'Move delivery dates', schedules },
  { id: 'contractor', name: 'Use the selected contractor', schedules, staffing: bookings.map(b => ({ id: b.id, revision: b.revision, personId: input.contractorId })) },
  { id: 'scope', name: 'Revise remaining scope', schedules, tasks, staffing: bookings.map((b, n) => ({ id: b.id, revision: b.revision, dailySeconds: integer(input[`scopeSeconds${n}`], 'Remaining scope seconds', 0, 86400) })), scopes: ids.map((id, n) => ({ id, revision: data.engagements.find(e => e.id === id)!.revision, scope: input[`scope${n}`] })) }
 ].map(option => ({ ...option, commercialChanges: input.declarations?.[option.id]?.commercialChanges ?? [], capacityCosts: input.declarations?.[option.id]?.capacityCosts ?? [] }))
 return recoveryPreview(env, a, { ...input, alternatives })
}
