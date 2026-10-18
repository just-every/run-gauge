import { charge, type Kind, type Value } from './gauge/model'
import { historicalInvoice } from './demo-archive'
import { people, calendars, projects, weeks, tomWeekZero } from './demo-world'

export interface DemoRecord { kind: Kind; id: string; value: Value }

const timezone = 'America/Los_Angeles'
const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const named = (date: string) => short.format(new Date(`${date}T00:00:00Z`)).replace(',', '')

/** Northbound Studio's working month in native records (src/demo-world.ts has the roster and bookings). Dates move
 * with the demo's clock: week 0 is the Pacific work week the demo opens in (a weekend opens the coming week). */
export function demoRecords(now: Date, ownerId: string, agentId: string): DemoRecord[] {
 const records: DemoRecord[] = []
 const add = (kind: Kind, id: string, value: Value) => records.push({ kind, id: `demo-${id}`, value })
 const at = now.getTime(), today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at)
 const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(), monday = Date.parse(`${today}T00:00:00Z`) + (weekday === 6 ? 2 : weekday === 0 ? 1 : 1 - weekday) * 86400000
 const day = (offset: number) => new Date(monday + offset * 86400000).toISOString().slice(0, 10)
 // The work timezone's UTC offset on a date ("-07:00" in summer, "-08:00" in winter), for local clock times.
 const offset = (date: string) => new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(new Date(`${date}T12:00:00Z`)).find(part => part.type === 'timeZoneName')!.value.replace('GMT', '') || '+00:00'
 const clock = (date: string, time: string) => Date.parse(`${date}T${time}:00${offset(date)}`)
 const seconds = (hours: number) => Math.round(hours * 3600)
 const project = (id: string) => projects.find(p => p.id === id)!

 for (const p of people) {
  add('people', p.id, { name: p.name, timezone, contractor: !!p.contractor })
  add('rates', `rate-${p.id}`, { personId: `demo-${p.id}`, service: '*', effective: day(-91), costMinor: p.cost, billMinor: p.bill, currency: 'AUD' })
  for (const [n, [from, to, hours]] of (calendars[p.id] ?? [[-35, 70, p.dailyHours]]).entries())
   add('calendars', `calendar-${p.id}-${n}`, { personId: `demo-${p.id}`, from: day(from), to: day(to), dailySeconds: seconds(hours), weekdays: '1,2,3,4,5', timezone })
 }
 const staffed = (id: string) => [...new Set([...weeks.flat().filter(b => b[1] === id).map(b => b[0]), ...(id === 'cascade' ? ['tom'] : [])])]
 for (const p of projects) {
  add('clients', `client-${p.id}`, { name: p.client })
  add('engagements', p.id, { clientId: `demo-client-${p.id}`, leadId: `demo-${p.lead}`, name: p.name, scope: p.scope, timezone, currency: 'AUD', members: staffed(p.id).filter(m => m !== p.lead).map(m => `demo-${m}`) })
  add('budgets', `budget-${p.id}`, { engagementId: `demo-${p.id}`, mode: p.mode, amountMinor: p.fee, effortSeconds: seconds(p.effortHours), roundingSeconds: 900, reason: p.reason, currency: 'AUD', createdAt: at - 30 * 86400000, ...(p.approved ? { status: 'approved', approvedAt: at - 29 * 86400000, approvedBy: ownerId } : { status: 'draft' }) })
  p.tasks.forEach((name, i) => add('tasks', `${p.id}-task-${i}`, { engagementId: `demo-${p.id}`, name, remainingSeconds: (i + 2) * 28800 }))
 }
 // Launch milestones on their Fridays: Cascade Cider in week 3, Pacific Trail in week 4.
 add('milestones', 'cascade-launch', { engagementId: 'demo-cascade', name: 'Launch', due: day(25), amountMinor: 2880000, status: 'draft' })
 add('milestones', 'pacific-launch', { engagementId: 'demo-pacific', name: 'Launch', due: day(32), amountMinor: 2130000, status: 'draft' })

 // One Mon–Fri allocation per person, engagement and week; tentative work is pipeline (Capitol Grain, Rose City).
 weeks.forEach((bookings, w) => bookings.forEach(([person, engagement, hours, tentative], n) => add('staffing', `staffing-${w}-${n}`, { personId: `demo-${person}`, engagementId: `demo-${engagement}`, from: day(w * 7), to: day(w * 7 + 4), dailySeconds: seconds(hours / 5), commitment: tentative ? 'tentative' : 'committed' })))
 tomWeekZero.forEach(([from, to, hours], n) => add('staffing', `staffing-tom-${n}`, { personId: 'demo-tom', engagementId: 'demo-cascade', from: day(from), to: day(to), dailySeconds: seconds(hours), commitment: 'committed' }))
 add('leave', 'diego-sick', { personId: 'demo-diego', from: day(1), to: day(2), dailySeconds: seconds(7.2), note: 'Sick' })

 // Last week's time: approved, submitted for the leads and two drafts.
 const entries: [string, string, number, number, number, string, string?][] = [
  ['maya', 'treasure', 0, -3, 2, 'approved'], ['owen', 'treasure', 1, -3, 1.5, 'approved'], ['maya', 'willamette', 0, -4, 3, 'approved'], ['priya', 'willamette', 0, -4, 2, 'approved'],
  ['sam', 'willamette', 1, -5, 1, 'approved'], ['sam', 'pacific', 0, -3, 6, 'approved'], ['diego', 'cascade', 0, -3, 7, 'approved'], ['priya', 'pacific', 1, -3, 4, 'submitted'],
  ['maya', 'cascade', 1, -3, 5, 'submitted', '11:30'], ['diego', 'cascade', 0, -4, 6.5, 'submitted'], ['sam', 'pacific', 0, -4, 3.5, 'draft'], ['tom', 'cascade', 1, -7, 3, 'draft'],
 ]
 entries.forEach(([who, id, task, offsetDays, hours, status, startsAt = '09:00'], i) => {
  const p = project(id), person = people.find(x => x.id === who)!, workDate = day(offsetDays), start = clock(workDate, startsAt), durationSeconds = seconds(hours)
  add('time', `time-${i}`, { personId: `demo-${who}`, engagementId: `demo-${id}`, taskId: `demo-${id}-task-${task}`, service: p.services[task], notes: p.notes[task], billable: true, start, end: start + durationSeconds * 1000, durationSeconds, timezone, workDate, status, source: null,
   ...(status === 'approved' ? { approvedBy: ownerId, approvedAt: at - 3600000, economics: { rateId: `demo-rate-${who}`, budgetId: `demo-budget-${id}`, mode: p.mode, roundingSeconds: 900, costMinor: charge(durationSeconds, person.cost), billRateMinor: person.bill, roundedBillingSeconds: durationSeconds, billMinor: charge(durationSeconds, person.bill, 900), currency: 'AUD' } } : {}) })
 })
 const expenses: [string, string, number, string, number, string][] = [['maya', 'cascade', -4, 'Client workshop materials', 8650, 'approved'], ['priya', 'pacific', -5, 'Usability test participant gift cards', 24000, 'approved'], ['maya', 'cascade', -3, 'Launch photo license', 12500, 'submitted']]
 expenses.forEach(([who, id, offsetDays, description, amountMinor, status], i) => add('expenses', `expense-${i}`, { engagementId: `demo-${id}`, personId: `demo-${who}`, date: day(offsetDays), description, amountMinor, currency: 'AUD', reimbursable: true, attachmentIds: i === 0 ? ['demo-receipt'] : [], status, ...(status === 'approved' ? { approvedBy: ownerId, approvedAt: at - 3600000 } : {}) }))

 // A draft packet of Treasure Valley's approved hours, ready for finance to approve and download.
 const lines = ['demo-time-0', 'demo-time-1'].map(id => records.find(r => r.id === id)!).map(t => ({ kind: 'time', sourceId: t.id, sourceRevision: `${t.id}-v1`, description: t.value.notes, amountMinor: t.value.economics.billMinor, currency: 'AUD', durationSeconds: t.value.durationSeconds, billRateMinor: t.value.economics.billRateMinor, roundedBillingSeconds: t.value.durationSeconds, roundingSeconds: 900, roundingPolicy: 'ceil duration to increment; round amount half-up to cents', rateUnit: 'AUD cents per hour', rateId: t.value.economics.rateId, budgetId: t.value.economics.budgetId }))
 add('packets', 'packet-treasure', { engagementId: 'demo-treasure', title: 'Treasure Valley · last week’s hours', status: 'draft', currency: 'AUD', createdAt: at - 1800000, createdBy: ownerId, totalMinor: lines.reduce((n, l) => n + l.amountMinor, 0), lines })

 // The recovery agent's morning: Diego's sick days with two costed alternatives, a billing packet and Pacific Trail's
 // change order waiting, and last week's declined Treasure Valley request.
 const evidence = (source: string, summary: string) => [{ source, summary }]
 const [tue, wed, launch, ptLaunch] = [day(1), day(2), day(25), day(32)].map(named)
 add('proposals', 'proposal-recovery', { kind: 'staffing', engagementId: 'demo-cascade', status: 'proposed', preparedBy: agentId, preparedAt: at - 20 * 60000,
  assumptions: `Diego Ramos called in sick for ${tue} – ${wed}; his 14 committed Cascade Cider hours on those dates need cover before the ${launch} launch.`,
  evidence: evidence('Leave · Diego Ramos', `Sick ${tue} – ${wed}; 7 committed Cascade Cider hours on each date.`), plan: { commitment: 'tentative', alternatives: [
   { personId: 'demo-tom', from: day(1), to: day(2), dailySeconds: seconds(7), rationale: 'Tom Becker (1099) already builds the taproom finder, and his supplied availability keeps Tuesday and Wednesday open.' },
   { personId: 'demo-sam', from: day(1), to: day(2), dailySeconds: seconds(7), rationale: 'Sam Reyes moves 14 hrs from Pacific Trail’s checkout to cover Diego’s work.' }] } })
 add('proposals', 'proposal-billing', { kind: 'billing', engagementId: 'demo-willamette', status: 'proposed', preparedBy: agentId, preparedAt: at - 3 * 3600000, assumptions: 'Last week’s approved retainer hours are not yet in a packet.',
  evidence: evidence('Time · Willamette CU', 'Three approved entries, 6 hrs, from Maya, Priya and Sam.'), plan: { title: 'Willamette CU · last week’s retainer hours', sources: ['time:demo-time-2', 'time:demo-time-3', 'time:demo-time-4'] } })
 add('proposals', 'proposal-change-order', { kind: 'change-order', engagementId: 'demo-pacific', status: 'proposed', preparedBy: agentId, preparedAt: at - 18 * 3600000, assumptions: 'PT-212 and PT-214 add 36 hrs to checkout (UX 20, development 16); the signed fee covers neither.',
  evidence: evidence('Linear · PT-212, PT-214', 'Both issues accepted by the client in Monday’s review.'), plan: { mode: 'fixed', amountMinor: 630000, effortSeconds: seconds(36), roundingSeconds: 900, brief: 'Change order for the checkout additions: 36 hrs × $175 = $6,300, keeping the launch on ' + ptLaunch + '.' } })
 add('proposals', 'proposal-treasure', { kind: 'change-order', engagementId: 'demo-treasure', status: 'declined', preparedBy: agentId, preparedAt: clock(day(-4), '15:10'), decidedBy: ownerId, decidedAt: clock(day(-3), '10:30'), reason: 'The $10,000 cap is reached; the clinic will send a new purchase order first.',
  assumptions: 'The clinic asked for three more location pages.', evidence: evidence('Email · Treasure Valley', 'Request for three location pages.'), plan: { mode: 'hourly', amountMinor: 180000, effortSeconds: seconds(12), roundingSeconds: 900, brief: 'Three clinic location pages: 12 hrs at current rates.' } })

 const invoice = 'pacific-trail-invoice-1039.pdf'
 add('archives', 'archive-pacific-1039', { name: invoice, mediaType: 'application/pdf', semantics: 'Historical document only; no editable invoice or active authority', source: { namespace: 'harvest', externalId: invoice },
  base64: historicalInvoice(['Invoice 1039 (Harvest)', 'Pacific Trail', `Issued ${named(day(-41))}, Net 30`, 'Checkout discovery and design · 95.0 h × $150.00 = $14,250.00', 'Total $14,250.00', 'Kept from Harvest as a historical document.']) })
 return records
}
