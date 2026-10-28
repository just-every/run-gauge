import { capacityEvidence } from './report-lineage-capacity'
import { type Evidence, Lineage } from './report-lineage-shared'

// REPORT-002 / REPORT-007: every utilization-to-target and realization figure names its approved time, target, calendar and packet rows.
export function performanceLineage(c: Lineage) {
 const p = c.report.performance
 if (!p) return
 for (const dimension of ['byPerson', 'byRole', 'byClient', 'byPeriod'] as const) for (const row of p[dimension]) {
  const prefix = `performance:${dimension}:${encodeURIComponent(row.id)}:`
  const time = (ids: string[] = row.sources.time): Evidence => { const e = c.evidence(); for (const id of ids) { const r = c.row(e, 'time', id); if (r) { c.row(e, 'engagements', r.value.engagementId); c.row(e, 'people', r.value.personId) } } return e }
  const capacity = (): Evidence => {
   const e = time(), month = dimension === 'byPeriod' ? row.id : undefined
   const personIds = dimension === 'byPerson' ? [row.id] : dimension === 'byRole' ? c.rows('people').filter(r => (String(r.value.role ?? '').trim()) === row.id).map(r => r.id) : c.rows('people').map(r => r.id)
   for (const personId of personIds) { const cap = c.report.capacity.find(x => x.personId === personId); if (cap) { const days = month ? cap.days.filter((d: any) => d.date.startsWith(month)) : cap.days, ev = capacityEvidence(c, personId, days, ['calendar', 'leave'], true); e.sources.push(...ev.sources); e.unknown.push(...ev.unknown) } }
   return e
  }
  const target = (): Evidence => { const e = capacity(); if (row.target) c.row(e, 'billabilityTargets', row.target.id); return e }
  c.add(prefix + 'approvedSeconds', `${row.name}: approved hours`, row.approvedSeconds, 'seconds', 'SUM(approved time whole seconds with a work date inside the reporting dates).', time())
  c.add(prefix + 'billableSeconds', `${row.name}: approved billable hours`, row.billableSeconds, 'seconds', 'SUM(approved billable seconds). Internal work is never billable.', time())
  c.add(prefix + 'nonbillableSeconds', `${row.name}: approved nonbillable hours`, row.nonbillableSeconds, 'seconds', 'Approved seconds − approved billable seconds.', time())
  if (dimension !== 'byClient') {
   c.add(prefix + 'availableSeconds', `${row.name}: net available hours`, row.availableSeconds, 'seconds', 'SUM(net workable calendar seconds after holidays and leave, per person and date in the group). Missing calendars make it unknown.', capacity())
   c.add(prefix + 'utilizationPercent', `${row.name}: billable utilization`, row.utilization.percent, 'percent', `${row.utilization.numeratorSeconds} approved billable seconds ÷ ${row.utilization.denominatorSeconds ?? 'unknown'} net available seconds × 100.`, capacity())
  }
  if (row.target) {
   c.add(prefix + 'targetPercent', `${row.name}: billability target`, row.target.percent, 'percent', `Finance ${row.target.scope} target in force on ${p.asOf} (latest effective date on or before the last report date; a person target takes precedence over their role's).`, target())
   c.add(prefix + 'variancePoints', `${row.name}: variance to target`, row.variancePoints, 'percent', 'Billable utilization percent − target percent, in percentage points.', target())
  }
  if (!Array.isArray(row.money)) continue
  for (const m of row.money) {
   const money = (): Evidence => { const e = c.evidence(); for (const id of m.time) { const r = c.row(e, 'time', id); if (r) c.timeEvidence(e, r) } for (const id of m.packets){const packet=c.row(e,'packets',id);for(const line of packet?.value.lines??[])if(line.kind==='timeSlices')c.row(e,'timeSlices',line.sourceId)} for (const id of m.missingBillRate) e.unknown.push(`time:${id}: approved billable time has no bill rate`); return e }
   const at = `${prefix}${m.currency}:`
   c.add(at + 'standardMinor', `${row.name}: standard value of billed time`, m.standardMinor, 'minor', 'SUM(frozen approved bill value of each billed hourly entry or exact not-to-exceed portion).', money(), m.currency)
   c.add(at + 'billedMinor', `${row.name}: billed value`, m.billedMinor, 'minor', 'SUM(current approved billing amount of each billed entry after every approved correction on its packet branch).', money(), m.currency)
   c.add(at + 'writeOffMinor', `${row.name}: write-offs`, m.writeOffMinor, 'minor', 'Standard value − billed value (negative is a write-up).', money(), m.currency)
   c.add(at + 'realizationPercent', `${row.name}: realization`, m.realizationPercent, 'percent', 'Billed value ÷ frozen standard value × 100, over billed entries and exact portions only.', money(), m.currency)
   c.add(at + 'effectiveRateMinor', `${row.name}: effective bill rate per hour`, m.effectiveRateMinor, 'minor', 'Billed value × 3600 ÷ billed approved seconds, rounded half up to a cent.', money(), m.currency)
   c.add(at + 'unbilledStandardMinor', `${row.name}: approved standard value not yet billed`, m.unbilledStandardMinor, 'minor', 'SUM(frozen approved bill amount of approved billable hourly entries in no approved packet).', money(), m.currency)
  }
 }
}
