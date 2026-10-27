import { type Value } from './model'
import { type Evidence, Lineage } from './report-lineage-shared'

export function capacityEvidence(c: Lineage, personId: string, days: Value[], fields: ('calendar' | 'leave' | 'committed' | 'tentative')[], unknownCalendar = false): Evidence {
 const e = c.evidence(); c.row(e, 'people', personId)
 for (const day of days) {
  if (fields.includes('calendar')) {
   c.row(e, 'calendars', day.calendarId)
   if (!day.calendarId && unknownCalendar) e.unknown.push(`people:${personId}:${day.date}: working calendar unknown`)
  }
  if (fields.includes('leave')) for (const id of day.leaveSources) c.row(e, 'leave', id)
  if (fields.includes('committed')) for (const id of day.committedSources) c.row(e, 'staffing', id)
  if (fields.includes('tentative')) for (const id of day.tentativeSources) c.row(e, 'staffing', id)
 }
 return e
}

export function capacityLineage(c: Lineage) {
 for (const person of c.report.capacity) {
  const prefix = `capacity:${person.personId}:`, days: Value[] = person.days
  const evidence = (fields: ('calendar' | 'leave' | 'committed' | 'tentative')[], unknown = false, selected = days) => capacityEvidence(c, person.personId, selected, fields, unknown)
  c.add(prefix + 'availableSeconds', 'Available capacity', person.availableSeconds, 'seconds', 'SUM(each day: max(0, calendar working-day seconds − holiday seconds − SUM(leave.dailySeconds))). Any missing calendar makes total unknown; knownValue sums known-calendar days only.', evidence(['calendar', 'leave'], true), null, person.knownAvailableSeconds)
  c.add(prefix + 'committedSeconds', 'Committed staffing', person.committedSeconds, 'seconds', 'SUM(dailySeconds of committed staffing on each inclusive date); independent of calendar availability.', evidence(['committed']))
  c.add(prefix + 'tentativeSeconds', 'Tentative staffing', person.tentativeSeconds, 'seconds', 'SUM(dailySeconds of tentative staffing on each inclusive date); not deducted from remaining capacity.', evidence(['tentative']))
  c.add(prefix + 'remainingSeconds', 'Remaining capacity after commitments', person.remainingSeconds, 'seconds', 'Available seconds − committed seconds. Any missing calendar makes total unknown; knownValue sums (available − committed) on known-calendar days only.', evidence(['calendar', 'leave', 'committed'], true), null, person.knownRemainingSeconds)
  c.add(prefix + 'knownAvailableSeconds', 'Known-calendar available subtotal', person.knownAvailableSeconds, 'seconds', 'SUM(day.availableSeconds for days with known calendars); excludes missing-calendar dates, not a total for the window.', evidence(['calendar', 'leave'], false, days.filter(d => d.calendarId !== null)))
  c.add(prefix + 'knownRemainingSeconds', 'Known-calendar remaining subtotal', person.knownRemainingSeconds, 'seconds', 'SUM(day.availableSeconds − day.committedSeconds for days with known calendars); excludes missing-calendar dates.', evidence(['calendar', 'leave', 'committed'], false, days.filter(d => d.calendarId !== null)))
  c.add(prefix + 'missingCalendarDays', 'Days with unknown availability', person.missingCalendarDays, 'count', 'COUNT(dates in inclusive report window with no covering calendar). The visible person and covering calendar rows establish the window.', evidence(['calendar']))
  for (const day of days) {
   const id = prefix + day.date + ':'
   const e = (fields: ('calendar' | 'leave' | 'committed' | 'tentative')[], unknown = false) => evidence(fields, unknown, [day])
   c.add(id + 'baseSeconds', 'Calendar working seconds', day.baseSeconds, 'seconds', 'The weekday-specific seconds when set; otherwise calendar.dailySeconds on a working weekday, or 0. Missing calendar is unknown.', e(['calendar'], true))
   c.add(id + 'holidaySeconds', 'Holiday seconds', day.holidaySeconds, 'seconds', 'Calendar working seconds when the calendar explicitly lists this date as a holiday, otherwise 0.', e(['calendar']))
   c.add(id + 'leaveSeconds', 'Leave seconds', day.leaveSeconds, 'seconds', 'SUM(leave.dailySeconds for approved or legacy declared records covering this date and person); requested, rejected and cancelled leave is excluded.', e(['leave']))
   c.add(id + 'availableSeconds', 'Available seconds', day.availableSeconds, 'seconds', 'max(0, baseSeconds − holidaySeconds − leaveSeconds); null when calendar is missing.', e(['calendar', 'leave'], true))
   c.add(id + 'committedSeconds', 'Committed seconds', day.committedSeconds, 'seconds', 'SUM(staffing.dailySeconds where commitment = committed and staffing covers date).', e(['committed']))
   c.add(id + 'tentativeSeconds', 'Tentative seconds', day.tentativeSeconds, 'seconds', 'SUM(staffing.dailySeconds where commitment = tentative and staffing covers date).', e(['tentative']))
   c.add(id + 'remainingSeconds', 'Remaining seconds', day.remainingSeconds, 'seconds', 'availableSeconds − committedSeconds; tentative demand remains separate. Missing availability is unknown.', e(['calendar', 'leave', 'committed'], true))
  }
  for (const conflict of person.conflicts) {
   const day = days.find(d => d.date === conflict.date)
   c.add(prefix + conflict.date + ':conflictSeconds', 'Committed capacity conflict', conflict.seconds, 'seconds', 'max(0, day.committedSeconds − day.availableSeconds), only for days with known availability.', evidence(['calendar', 'leave', 'committed'], true, day ? [day] : []))
  }
 }
}
