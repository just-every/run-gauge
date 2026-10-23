import { moveInPackage, sourceSeconds, sourceNumber, sourceInstant, type MoveInSpec } from './scoro-common'
import { type Value, need, date } from './model'

/** Uploaded source snapshots only. Deletion evidence never erases native work. */
export const floatSpec: MoveInSpec = {
 provider: 'float', name: 'Float', versions: ['v3'],
 objects: {
  clients: ['name'], people: ['name'], projects: ['name', 'clientId'],
  phases: ['projectId', 'name'],
  rates: ['personId', 'projectId', 'effective', 'billRateMinor', 'costRateMinor', 'currency'],
  budgets: ['projectId', 'phaseId', 'date', 'amountMinor', 'currency'],
  allocations: ['projectId', 'personId', 'phaseId', 'from', 'to', 'daily', 'unit', 'budgetId', 'phaseBudgetMinor', 'currency'],
  time: ['projectId', 'personId', 'phaseId', 'workDate', 'duration', 'billable', 'unit', 'rateId', 'billMinor', 'costMinor', 'currency'],
  workweeks: ['personId', 'from', 'to', 'weekdays', 'unit'],
  leave: ['personId', 'from', 'to', 'daily', 'unit', 'currency'],
  deletions: ['entity', 'recordId', 'sequence', 'auditTimestamp']
 },
 normalize(kind, v, m) {
  if (kind === 'allocations' || kind === 'leave') {
   need(v.unit === 'hours-per-day' && m.units?.allocations === v.unit, 'Float daily quantities need explicit hours-per-day units')
   const daily = typeof v.daily === 'string' ? JSON.parse(v.daily) : v.daily
   need(Array.isArray(daily) && daily.length > 0 && daily.length <= 366, 'Retain exact original daily allocations')
   const dates = new Set<string>()
   v.daily = daily.map((d: Value) => {
    const day = date(d.date)
    need(day >= v.from && day <= v.to && !dates.has(day), 'Daily source dates must be unique and inside their allocation')
    dates.add(day)
    return { date: day, hours: String(d.hours), seconds: sourceSeconds(d.hours, 'hours', 'Float daily hours') }
   })
   v.seconds = v.daily.reduce((n: number, d: Value) => n + d.seconds, 0)
   need(Number.isSafeInteger(v.seconds), 'Float allocation exceeds exact seconds')
   need(v.from.slice(0, 7) === v.to.slice(0, 7), 'Split source allocations at month boundaries without inventing daily quantities')
  }
  if (kind === 'time') {
   need(v.unit === m.units?.time, 'Declare captured Float actual units')
   v.rawSeconds = sourceSeconds(v.duration, v.unit, 'Float actual time')
   v.billableSeconds = sourceSeconds(v.billable, v.unit, 'Float billable time')
   need(v.rawSeconds > 0, 'Float actual time must be positive')
   v.billed = false
  }
  if (kind === 'workweeks') {
   need(v.unit === 'hours-per-weekday', 'Float workweeks require explicit weekday units')
   const weekdays = typeof v.weekdays === 'string' ? JSON.parse(v.weekdays) : v.weekdays
   need(weekdays && !Array.isArray(weekdays) && Object.keys(weekdays).length === 7 && Object.keys(weekdays).every(k => /^[0-6]$/.test(k)), 'Retain all seven source weekday capacities')
   v.weekdays = Object.fromEntries(Object.entries(weekdays).map(([day, hours]) => [day, sourceSeconds(hours, 'hours', 'Float weekday capacity')]))
  }
  if (kind === 'deletions') {
   need(['allocations', 'time', 'leave'].includes(v.entity), 'Only captured Float allocation, actual or leave deletion evidence is supported')
   v.sequence = sourceNumber(v.sequence, 'Float deletion sequence', 1)
   v.auditTimestamp = sourceInstant(v.auditTimestamp, 'Float deletion timestamp')
  }
 },
 validate(r, m, findings) {
  const issue = (kind: string, id: string, reason: string) => findings.push({kind, sourceId: id, reason})
  if (m.nativeDrafts === true) issue('native', 'adoption', 'Float source comparison does not yet adopt native workweeks, allocations, leave or deletion effects')
  const coverage = m.deletionCoverage
  if (!coverage || coverage.complete !== true) issue('coverage', 'deletions', 'Deletion coverage is incomplete; supply a fresh full source comparison')
  if (coverage?.missed === true) {
   const full = coverage.fullComparison
   const originals = ['allocations', 'time', 'leave', 'people', 'projects', 'phases', 'rates', 'workweeks', 'budgets'].flatMap(k => m.objects[k].flatMap((c: Value) => c.format === 'json' ? c.pages.map((p: Value) => p.artifact) : [c.artifact]))
   if (!full || full.complete !== true || !Number.isFinite(Date.parse(full.asOf)) || !Number.isFinite(Date.parse(coverage.missedAt)) || Date.parse(full.asOf) <= Date.parse(coverage.missedAt) || !Array.isArray(full.artifacts) || !originals.every(n => full.artifacts.includes(n))) issue('coverage', 'comparison', 'Missed deletion coverage requires a fresh full comparison with every original source object')
  }
  const events = [...r.deletions].sort((a, b) => a.sequence - b.sequence)
  if (!coverage || !Number.isSafeInteger(coverage.fromSequence) || !Number.isSafeInteger(coverage.toSequence) || coverage.fromSequence < 1 || coverage.toSequence < coverage.fromSequence || events.length !== coverage.toSequence - coverage.fromSequence + 1 || events.some((e, i) => e.sequence !== coverage.fromSequence + i)) issue('coverage', 'sequence', 'Captured deletion sequence has a gap or duplicate sequence identity')
  for (const event of events) {
   const row = r[event.entity].find(v => v.id === event.recordId)
   if (!row) issue('deletions', event.id, 'Deletion needs its retained original source record for comparison')
   else row.sourceDeleted = true
  }
  for (const a of r.allocations) {
   const b = r.budgets.find(b => b.id === a.budgetId)
   if (!b || b.phaseId !== a.phaseId || b.projectId !== a.projectId || b.amountMinor !== a.phaseBudgetMinor) issue('allocations', a.id, 'Repeated phase budget must match one independently retained budget identity')
  }
  for (const w of r.workweeks) if (r.workweeks.some(other => other.id !== w.id && other.personId === w.personId && other.from <= w.to && other.to >= w.from)) issue('workweeks', w.id, 'Effective-dated source workweeks overlap')
  for (const t of r.time) {
   const matches = r.rates.filter(rate => rate.personId === t.personId && rate.projectId === t.projectId && rate.effective <= t.workDate).sort((a, b) => b.effective.localeCompare(a.effective))
   const rate = matches[0]
   if (!rate || rate.id !== t.rateId) issue('time', t.id, 'Actuals need the effective historical cost and retained project bill rate')
   else {
    const charge = (seconds: number, minor: number) => Number((BigInt(seconds) * BigInt(minor) + 1800n) / 3600n)
    if (charge(t.rawSeconds, rate.costRateMinor) !== t.costMinor || charge(t.billableSeconds, rate.billRateMinor) !== t.billMinor) issue('time', t.id, 'Float actuals disagree with historical source rate economics')
   }
   if (!r.workweeks.some(w => w.personId === t.personId && w.from <= t.workDate && w.to >= t.workDate)) issue('time', t.id, 'Actual work has no captured effective weekday capacity')
  }
 }
}
export const floatPackage = (pkg: Value, currency: string) => moveInPackage(floatSpec, pkg, currency)
