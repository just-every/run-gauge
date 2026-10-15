import { charge, type Kind, type Value } from './gauge/model'

export interface DemoRecord { kind: Kind; id: string; value: Value }

/** A small agency's current week, using the native record shapes in the Harvest
 * fixtures and Gauge's public-door flows. Dates move with the demo's clock. */
export function demoRecords(now: Date, ownerId: string): DemoRecord[] {
 const records: DemoRecord[] = []
 const add = (kind: Kind, id: string, value: Value) => records.push({ kind, id: `demo-${id}`, value })
 const at = now.getTime(), day = (offset: number) => new Date(at + offset * 86400000).toISOString().slice(0, 10)
 const timezone = 'Australia/Brisbane', from = day(-35), to = day(70)
 const people = [
  { id: 'maya', name: 'Maya Chen', contractor: false, cost: 7800, bill: 18500 },
  { id: 'noah', name: 'Noah Williams', contractor: false, cost: 6500, bill: 16500 },
  { id: 'ella', name: 'Ella Patel', contractor: false, cost: 7200, bill: 17500 },
  { id: 'sam', name: 'Sam Brooks', contractor: true, cost: 11000, bill: 19500 },
 ]
 for (const p of people) {
  add('people', p.id, { name: p.name, timezone, contractor: p.contractor })
  add('rates', `rate-${p.id}`, { personId: `demo-${p.id}`, service: '*', effective: day(-90), costMinor: p.cost, billMinor: p.bill, currency: 'AUD' })
  add('calendars', `calendar-${p.id}`, { personId: `demo-${p.id}`, from, to, dailySeconds: p.contractor ? 21600 : 28800, weekdays: '1,2,3,4,5', timezone })
 }
 const projects = [
  { id: 'harbour', client: 'Harbour Coffee', name: 'Online store refresh', scope: 'Accessible storefront, product discovery and checkout handover.', lead: 'maya', mode: 'hourly', budget: 2400000, effort: 432000, tasks: ['Storefront design', 'Checkout implementation'], services: ['Design', 'Development'], notes: ['Responsive product catalogue and design handover', 'Checkout validation, keyboard navigation and accessibility fixes'] },
  { id: 'banksia', client: 'Banksia Health', name: 'Patient portal discovery', scope: 'Research interviews, service blueprint and a tested portal prototype.', lead: 'ella', mode: 'fixed', budget: 1800000, effort: 360000, tasks: ['Research synthesis', 'Portal prototype'], services: ['Research', 'Design'], notes: ['Research synthesis and interview themes', 'Portal prototype interaction review and usability changes'] },
  { id: 'northline', client: 'Northline Studio', name: 'Launch campaign', scope: 'Campaign landing page, creative assets and launch measurement.', lead: 'maya', mode: 'hourly', budget: 950000, effort: 180000, tasks: ['Campaign creative', 'Launch analytics'], services: ['Design', 'Analytics'], notes: ['Campaign concepts and stakeholder review', 'Launch reporting setup and campaign measurement'] },
 ]
 for (const p of projects) {
  add('clients', `client-${p.id}`, { name: p.client })
  add('engagements', p.id, { clientId: `demo-client-${p.id}`, leadId: `demo-${p.lead}`, name: p.name, scope: p.scope, timezone, currency: 'AUD', members: people.map(p => `demo-${p.id}`) })
  add('budgets', `budget-${p.id}`, { engagementId: `demo-${p.id}`, mode: p.mode, amountMinor: p.budget, effortSeconds: p.effort, roundingSeconds: 900, reason: 'Agreed delivery scope and weekly review', status: 'approved', currency: 'AUD', createdAt: at - 21 * 86400000, approvedAt: at - 20 * 86400000, approvedBy: ownerId })
  p.tasks.forEach((name, i) => add('tasks', `${p.id}-task-${i}`, { engagementId: `demo-${p.id}`, name, remainingSeconds: (i + 2) * 28800 }))
  if (p.mode === 'fixed') {
   add('milestones', 'banksia-discovery', { engagementId: 'demo-banksia', name: 'Research and service blueprint', due: day(-2), amountMinor: 900000, status: 'approved', approvedBy: ownerId, approvedAt: at - 86400000 })
   add('milestones', 'banksia-prototype', { engagementId: 'demo-banksia', name: 'Tested portal prototype', due: day(12), amountMinor: 900000, status: 'draft' })
  }
 }
 const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
 const monday = nextMonth.getTime() + ((8 - nextMonth.getUTCDay()) % 7) * 86400000
 const allocationDay = (offset: number) => new Date(monday + offset * 86400000).toISOString().slice(0, 10)
 people.forEach((p, i) => add('staffing', `staffing-${p.id}`, { personId: `demo-${p.id}`, engagementId: `demo-${projects[i % 3].id}`, from: allocationDay(0), to: allocationDay(4), dailySeconds: i === 3 ? 10800 : 14400, commitment: i === 3 ? 'tentative' : 'committed' }))
 add('leave', 'ella-leave', { personId: 'demo-ella', from: allocationDay(3), to: allocationDay(4), dailySeconds: 28800, note: 'Annual leave' })
 for (let i = 0; i < 12; i++) {
  const p = people[i % 4], project = projects[i % 3], workDate = day(-1 - Math.floor(i / 4))
  const start = Date.parse(`${workDate}T09:00:00+10:00`), durationSeconds = (i % 3 + 2) * 3600
  const status = i < 7 ? 'approved' : i < 10 ? 'submitted' : 'draft'
  add('time', `time-${i}`, { personId: `demo-${p.id}`, engagementId: `demo-${project.id}`, taskId: `demo-${project.id}-task-${i % 2}`, service: project.services[i % 2], notes: project.notes[i % 2], billable: true, start, end: start + durationSeconds * 1000, durationSeconds, timezone, workDate, status, source: null,
   ...(status === 'approved' ? { approvedBy: ownerId, approvedAt: at - 3600000, economics: { rateId: `demo-rate-${p.id}`, budgetId: `demo-budget-${project.id}`, mode: project.mode, roundingSeconds: 900, costMinor: charge(durationSeconds, p.cost), billRateMinor: p.bill, roundedBillingSeconds: durationSeconds, billMinor: charge(durationSeconds, p.bill, 900), currency: 'AUD' } } : {}) })
 }
 for (const [i, description, amountMinor] of [[0, 'Client workshop materials', 8650], [1, 'Research participant vouchers', 24000], [2, 'Launch photo licence', 12500]] as const) {
  add('expenses', `expense-${i}`, { engagementId: `demo-${projects[i].id}`, personId: `demo-${people[i].id}`, date: day(-i - 1), description, amountMinor, currency: 'AUD', reimbursable: true, attachmentIds: i === 0 ? ['demo-receipt'] : [], status: i === 2 ? 'submitted' : 'approved', ...(i < 2 ? { approvedBy: ownerId, approvedAt: at - 3600000 } : {}) })
 }
 const time = records.find(r => r.id === 'demo-time-0')!, v = time.value, economics = v.economics
 add('packets', 'packet-harbour', { engagementId: 'demo-harbour', title: 'Harbour Coffee · weekly delivery', status: 'draft', currency: 'AUD', createdAt: at - 1800000, createdBy: ownerId, totalMinor: economics.billMinor, lines: [{ kind: 'time', sourceId: time.id, sourceRevision: `${time.id}-v1`, description: v.notes, amountMinor: economics.billMinor, currency: 'AUD', durationSeconds: v.durationSeconds, billRateMinor: economics.billRateMinor, roundedBillingSeconds: v.durationSeconds, roundingSeconds: 900, roundingPolicy: 'ceil duration to increment; round amount half-up to cents', rateUnit: 'AUD cents per hour', rateId: economics.rateId, budgetId: economics.budgetId }] })
 return records
}
