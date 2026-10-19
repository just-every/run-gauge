import { type Value, sum } from './model'
import { capacityEvidence } from './report-lineage-capacity'
import { Lineage } from './report-lineage-shared'

export function exceptionLineage(c: Lineage) {
 for (const [index, exception] of c.report.exceptions.entries()) {
  const prefix = `exceptions:${index}:`, e = c.evidence()
  const [kind, sourceId] = String(exception.source ?? '').split(':')
  const source = sourceId ? c.row(e, kind, sourceId) : undefined
  const person = c.report.capacity.find(p => p.personId === exception.personId)
  if (exception.type === 'capacity conflict') {
   const day = person?.days.find((d: Value) => d.date === exception.date)
   const evidence = capacityEvidence(c, exception.personId, day ? [day] : [], ['calendar', 'leave', 'committed'], true)
   if (!day) evidence.unknown.push(`people:${exception.personId}:${exception.date}: capacity day unavailable`)
   c.add(prefix + 'seconds', 'Capacity conflict seconds', exception.seconds, 'seconds', 'Committed staffing seconds − available calendar seconds on the conflict date; only known-calendar conflicts are reported.', evidence)
  } else if (exception.type === 'availability missing') {
   const evidence = capacityEvidence(c, exception.personId, person?.days ?? [], ['calendar'])
   if (!person) evidence.unknown.push(`people:${exception.personId}: capacity unavailable`)
   c.add(prefix + 'days', 'Days with missing availability', exception.days, 'count', 'COUNT(person report dates without a covering working calendar); missing days are unknown availability, never zero capacity.', evidence)
   const demand = capacityEvidence(c, exception.personId, exception.demand, ['committed', 'tentative'])
   c.add(prefix + 'demandSeconds', 'Demand on dates with missing availability', sum(exception.demand.map((d: Value) => d.committedSeconds + d.tentativeSeconds)), 'seconds', 'SUM(committedSeconds + tentativeSeconds on dates without a calendar and with positive staffing demand); no availability is inferred.', demand)
  } else if (exception.type === 'missing time') {
   const days: Value[] = person?.days ?? [], expected = capacityEvidence(c, exception.personId, days, ['calendar', 'leave'], true)
   const recorded = c.evidence(); c.row(recorded, 'people', exception.personId)
   const visible = c.rows('time').filter(r => r.value.personId === exception.personId && r.value.workDate >= c.report.from && r.value.workDate <= c.report.to)
   visible.forEach(r => c.row(recorded, 'time', r.id))
   const known = sum(visible.map(r => r.value.durationSeconds ?? 0))
   if (known !== exception.recordedSeconds) recorded.unknown.push('Recorded seconds include time outside this viewer’s source-row visibility; restricted records are not disclosed.')
   if (!person) expected.unknown.push(`people:${exception.personId}: capacity unavailable`)
   c.add(prefix + 'expectedSeconds', 'Expected time from working calendars', exception.expectedSeconds, 'seconds', 'SUM(availableSeconds on known-calendar dates in report window). If any calendar is missing, only knownValue is established.', expected, null, exception.expectedSeconds)
   c.add(prefix + 'recordedSeconds', 'Recorded time in report window', exception.recordedSeconds, 'seconds', 'SUM(all time.durationSeconds for person and inclusive workDate window, all statuses; ongoing timers contribute 0). A viewer-visible subtotal cannot establish a global total when source rows are restricted.', recorded, null, known)
   const combined = { sources: [...expected.sources, ...recorded.sources], unknown: [...expected.unknown, ...recorded.unknown] }
   c.add(prefix + 'missingSeconds', 'Time missing against known calendars', exception.expectedSeconds - exception.recordedSeconds, 'seconds', 'expectedSeconds − recordedSeconds; incomplete if working calendars or globally counted source rows are unavailable.', combined)
  } else if (exception.type === 'overspend') {
   const economics = c.report.economics.find(r => r.engagementId === sourceId)
   if (economics) {
    c.row(e, 'budgets', economics.budgetId)
    for (const row of c.rows('time').filter(r => r.value.engagementId === sourceId && r.value.status === 'approved')) {
     c.timeEvidence(e, row)
     if (row.value.economics?.costMinor == null) e.unknown.push(`time:${row.id}: frozen costMinor unknown`)
    }
    for (const row of c.rows('expenses').filter(r => r.value.engagementId === sourceId && r.value.status === 'approved')) c.row(e, 'expenses', row.id)
   } else e.unknown.push(`engagements:${sourceId}: economics unavailable`)
   c.add(prefix + 'amountMinor', 'Approved cost above budget', exception.amountMinor, 'minor', 'Approved actual cost − latest approved budget.amountMinor; reported only when positive. Unknown actual costs prevent a complete overspend amount.', e, exception.currency, exception.incomplete ? exception.amountMinor : undefined)
  } else {
   if (kind === 'time' && source) c.timeEvidence(e, source)
   c.add(prefix + 'count', exception.type, 1, 'count', 'One visible exception for the linked source revision. Eligibility/status is evaluated by the report handler at asOf; unbilled checks also exclude existing billing reservations.', e)
  }
 }
}
