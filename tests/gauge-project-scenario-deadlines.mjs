import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const dayAfter = (date, days = 1) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)
const weekday = day => ![0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())
const nextWeekday = day => { do { day = dayAfter(day) } while (!weekday(day)); return day }
const previousWeekday = day => { do { day = dayAfter(day, -1) } while (!weekday(day)); return day }

// FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 deadline alternative: actual native schedule, fixed-fee cash timing,
// effective dated cost and global capacity, without touching the prepared baseline.
export async function deadlineScenarioJourney(h, browser) {
 const { cmd, owner, request } = h, asOf = new Date().toISOString().slice(0, 10)
 const monthEnd = new Date(`${asOf}T00:00:00Z`)
 monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 3, 0)
 let due = monthEnd.toISOString().slice(0, 10)
 while (!weekday(due)) due = dayAfter(due, -1)
 const start = previousWeekday(due), holiday = nextWeekday(due), movedStart = nextWeekday(holiday), movedDue = nextWeekday(movedStart)
 const client = await cmd('save:clients', { name: 'Northstar Launch Partners', paymentTermsDays: 0, collectionPercent: 100 })
 const person = await cmd('save:people', { name: 'Jamie Launch Designer', timezone: 'UTC' })
 const manager = await h.invite('deadline-lead')
 await cmd('grant', { operatorId: manager.id, personId: person.id, role: 'lead', enabled: true })
 const project = await cmd('save:engagements', { name: 'Northstar client launch', clientId: client.id, leadId: person.id, members: [person.id], scope: 'Design handover and client launch', timezone: 'UTC' })
 const other = await cmd('save:engagements', { name: 'Northstar launch support', clientId: client.id, leadId: person.id, members: [person.id], scope: 'Parallel support commitment', timezone: 'UTC' })
 const terms = await cmd('save:budgets', { engagementId: project.id, mode: 'fixed', amountMinor: 250000, effortSeconds: 21600, roundingSeconds: 60, reason: 'Agreed launch fee' })
 await cmd('budget:approve', terms)
 await cmd('save:rates', { personId: person.id, service: '*', effective: asOf, costMinor: 5000, billMinor: 12000 })
 await cmd('save:rates', { personId: person.id, service: '*', effective: movedStart, costMinor: 7000, billMinor: 14000 })
 await cmd('save:calendars', { personId: person.id, from: start, to: movedDue, dailySeconds: 28800, weekdays: '1,2,3,4,5', holidays: [holiday], timezone: 'UTC' })
 const task = await cmd('save:tasks', { engagementId: project.id, name: 'Final launch design', assigneeId: person.id, from: start, to: start, remainingSeconds: 21600 })
 const milestone = await cmd('save:milestones', { engagementId: project.id, name: 'Client launch handover', due, amountMinor: 250000 })
 await cmd('milestone:approve', milestone)
 const booking = await cmd('save:staffing', { engagementId: project.id, personId: person.id, service: 'Design', from: start, to: start, dailySeconds: 21600, commitment: 'committed' })
 await cmd('save:staffing', { engagementId: other.id, personId: person.id, service: 'Support', from: movedStart, to: movedStart, dailySeconds: 10800, commitment: 'committed' })
 const nativeInput = { engagementId: project.id, previousId: null, operation: 'baseline', plan: { calendar: { weekdays: [1, 2, 3, 4, 5], holidays: [holiday] }, nodes: [
  { id: task.id, kind: 'task', sourceId: task.id, name: 'Final launch design', start, durationDays: 1, predecessors: [], staffingIds: [booking.id] },
  { id: milestone.id, kind: 'milestone', sourceId: milestone.id, name: 'Client launch handover', start: due, durationDays: 1, predecessors: [task.id], staffingIds: [] },
 ] } }
 const native = await cmd('delivery:preview', nativeInput, manager.cookie)
 const baselineAck = await cmd('delivery:approve', { ...native.input, fingerprint: native.fingerprint, acceptEffects: true, reason: 'Approved client launch baseline' }, manager.cookie)
 const read = async () => { const r = await request(`/api/gauge/state?from=${start}&to=${movedDue}&asOf=${asOf}`, owner); assert.equal(r.status, 200); return r.json() }
 const before = (await read()).data, baseline = before.deliveryPlans.find(p => p.id === baselineAck.id)
 assert(baseline)
 const change = { type: 'deadline', id: baseline.id, revision: baseline.revision, nodeId: task.id, delayBusinessDays: 2 }, input = { asOf, changes: [change] }
 const preview = await cmd('projectScenario:preview', input)
 const b = preview.baseline.projects.find(p => p.engagementId === project.id), s = preview.scenario.projects.find(p => p.engagementId === project.id)
 assert.equal(b.etcCostMinor, 6 * 5000); assert.equal(s.etcCostMinor, 6 * 7000)
 assert.equal(b.eacFeesMinor, 250000); assert.equal(s.eacFeesMinor, 250000)
 assert.equal(s.marginMinor, 250000 - 6 * 7000)
 assert.equal(preview.deltas.find(p => p.engagementId === project.id).etcCostMinor, 6 * 2000)
 const baseDates = preview.baseline.dates.find(p => p.engagementId === project.id), candidateDates = preview.scenario.dates.find(p => p.engagementId === project.id)
 assert.equal(baseDates.finish, due); assert.equal(candidateDates.finish, movedDue)
 assert.deepEqual(baseDates.tasks.find(t => t.id === task.id), { id: task.id, from: start, to: start })
 assert.deepEqual(candidateDates.tasks.find(t => t.id === task.id), { id: task.id, from: movedStart, to: movedStart })
 assert.deepEqual(candidateDates.milestones.find(m => m.id === milestone.id), { id: milestone.id, due: movedDue })
 assert.deepEqual(candidateDates.staffing.find(r => r.id === booking.id), { id: booking.id, personId: person.id, from: movedStart, to: movedStart, dailySeconds: 21600, commitment: 'committed' })
 const alternative = preview.alternatives.find(a => a.id === baseline.id)
 assert.equal(alternative.type, 'deadline'); assert.equal(alternative.input.operation, 'delay')
 assert.equal(alternative.schedule.nodes.find(n => n.id === task.id).start, movedStart)
 assert.equal(alternative.schedule.nodes.find(n => n.id === milestone.id).start, movedDue)
 assert(alternative.changes.some(c => c.kind === 'staffing' && c.id === booking.id && c.after.from === movedStart))
 assert(!('fingerprint' in alternative))
 const baseCash = preview.baseline.cash.engagements.find(p => p.engagementId === project.id).items.find(i => i.source === `milestones:${milestone.id}`)
 const scenarioCash = preview.scenario.cash.engagements.find(p => p.engagementId === project.id).items.find(i => i.source === `milestones:${milestone.id}`)
 assert.equal(baseCash.cashMonth, due.slice(0, 7)); assert.equal(scenarioCash.cashMonth, movedDue.slice(0, 7))
 assert.notEqual(baseCash.cashMonth, scenarioCash.cashMonth)
 assert.equal(baseCash.expectedMinor, 250000); assert.equal(scenarioCash.expectedMinor, 250000)
 const baseCapacity = preview.baseline.capacity.find(p => p.personId === person.id), candidateCapacity = preview.scenario.capacity.find(p => p.personId === person.id)
 let availableDays = 0
 for (let day = start; day <= movedDue; day = dayAfter(day)) if (weekday(day) && day !== holiday) availableDays++
 assert.equal(candidateCapacity.availableSeconds, availableDays * 28800)
 assert.equal(baseCapacity.committedSeconds, 9 * 3600); assert.equal(candidateCapacity.committedSeconds, 9 * 3600)
 assert(!baseCapacity.conflicts.some(c => c.date === movedStart))
 assert.equal(candidateCapacity.conflicts.find(c => c.date === movedStart).seconds, 3600)
 assert.equal(candidateCapacity.utilizationPercent, 100 * 9 * 3600 / (availableDays * 28800))
 const prepared = await cmd('projectScenario:prepare', { ...input, fingerprint: preview.fingerprint, name: 'Launch date alternative', reason: 'Review holiday cascade and revised cost' })
 const isolated = (await read()).data
 for (const kind of ['tasks', 'milestones', 'staffing', 'deliveryPlans', 'budgets', 'rates']) assert.deepEqual(isolated[kind], before[kind], `Deadline preparation preserves native ${kind}`)
 await cmd('projectScenario:preview', input, manager.cookie, 403)
 await cmd('projectScenario:adopt', { ...prepared, asOf, selectedIds: [baseline.id], fingerprint: preview.fingerprint, reason: 'Lead cannot adopt private financial scenario' }, manager.cookie, 403)
 const selection = { ...prepared, asOf, selectedIds: [baseline.id] }, selected = await cmd('projectScenario:preview', selection)
 await cmd('projectScenario:adopt', { ...selection, fingerprint: selected.fingerprint, reason: 'Approve Northstar launch delay and its displayed effects' })
 const after = (await read()).data, approvedPlan = after.deliveryPlans.filter(p => p.value.engagementId === project.id).at(-1)
 assert.deepEqual(after.deliveryPlans.find(p => p.id === baseline.id), baseline)
 assert.equal(approvedPlan.value.previousId, baseline.id); assert.equal(approvedPlan.value.number, baseline.value.number + 1)
 assert.equal(approvedPlan.value.schedule.finish, movedDue); assert(approvedPlan.value.approvedAt > 0)
 const session = await (await request('/auth/session', owner)).json()
 assert.equal(approvedPlan.value.approvedBy, session.operator.id)
 assert.equal(after.tasks.find(t => t.id === task.id).value.from, movedStart)
 assert.equal(after.staffing.find(t => t.id === booking.id).value.from, movedStart)
 const withoutDue = value => { const { due: _due, ...rest } = value; return rest }
 assert.deepEqual(withoutDue(after.milestones.find(m => m.id === milestone.id).value), withoutDue(before.milestones.find(m => m.id === milestone.id).value), 'Native commercial amount and approval survive deadline adoption')
 assert.deepEqual(after.budgets, before.budgets)
 const adopted = after.projectScenarios.find(p => p.id === prepared.id)
 assert.equal(adopted.value.adoptedBy, session.operator.id); assert.deepEqual(adopted.value.selectedIds, [baseline.id])
 assert.deepEqual(adopted.value.approvedComparison.scenario.dates, selected.scenario.dates)
 const historyResponse = await request(`/api/gauge/history/milestones/${milestone.id}`, owner)
 assert.equal(historyResponse.status, 200)
 assert((await historyResponse.json()).history.some(r => r.value.due === due && r.value.amountMinor === 250000 && r.value.status === 'approved'))
 const nativeDelay = { engagementId: project.id, previousId: approvedPlan.id, revision: approvedPlan.revision, operation: 'delay', nodeId: task.id, delayBusinessDays: 1 }
 assert.equal((await cmd('delivery:preview', nativeDelay, manager.cookie)).previousId, approvedPlan.id, 'Lead retains native project planning')
 await cmd('projectScenario:preview', input, owner, 409)

 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 try {
  await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 }); await page.goto(`${h.origin}/app/engagements?edit=${project.id}`)
   await page.evaluate(() => document.fonts.ready)
   const scheduleText = await page.locator('#delivery-schedule').innerText()
   assert(scheduleText.includes(movedStart)); assert(scheduleText.includes(movedDue))
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Deadline schedule fits ${width}`)
   if (process.env.GAUGE_SCENARIO_SHOTS) { await mkdir(process.env.GAUGE_SCENARIO_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.GAUGE_SCENARIO_SHOTS}/deadline-adopted-${width}.png`, fullPage: true }) }
  }
 } finally { await context.close() }

 const laterInput = { asOf, changes: [{ ...change, id: approvedPlan.id, revision: approvedPlan.revision }] }, laterPreview = await cmd('projectScenario:preview', laterInput)
 const stale = await cmd('projectScenario:prepare', { ...laterInput, fingerprint: laterPreview.fingerprint, name: 'Later launch alternative', reason: 'Review next possible delay' })
 const staleSelection = { ...stale, asOf, selectedIds: [approvedPlan.id] }, stalePreview = await cmd('projectScenario:preview', staleSelection)
 await cmd('save:staffing', { engagementId: other.id, personId: person.id, service: 'New support', from: movedDue, to: movedDue, dailySeconds: 3600, commitment: 'tentative' })
 await cmd('projectScenario:adopt', { ...staleSelection, fingerprint: stalePreview.fingerprint, reason: 'Stale capacity review' }, owner, 409)
 assert.equal((await read()).data.projectScenarios.find(p => p.id === stale.id).value.status, 'prepared')

 // A delivery baseline can contain historical work; a scenario must leave it intact.
 const pastProject = await cmd('save:engagements', { name: 'Completed launch review', clientId: client.id, leadId: person.id, members: [person.id], scope: 'Preserve previous work', timezone: 'UTC' })
 const pastTask = await cmd('save:tasks', { engagementId: pastProject.id, name: 'Review already started', assigneeId: person.id, from: asOf, to: asOf, remainingSeconds: 3600 })
 const pastNative = await cmd('delivery:preview', { engagementId: pastProject.id, previousId: null, operation: 'baseline', plan: { calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [] }, nodes: [{ id: pastTask.id, kind: 'task', sourceId: pastTask.id, name: 'Review already started', start: asOf, durationDays: 1, predecessors: [], staffingIds: [] }] } })
 const pastPlan = await cmd('delivery:approve', { ...pastNative.input, fingerprint: pastNative.fingerprint, acceptEffects: true, reason: 'Retain started work' })
 await cmd('projectScenario:preview', { asOf, changes: [{ type: 'deadline', id: pastPlan.id, revision: pastPlan.revision, nodeId: pastTask.id, delayBusinessDays: 1 }] }, owner, 409)
 assert.equal((await read()).data.tasks.find(t => t.id === pastTask.id).value.from, asOf)
 const futureTask = await cmd('save:tasks', { engagementId: pastProject.id, name: 'Future review with previous preparation', assigneeId: person.id, from: start, to: start, remainingSeconds: 3600 })
 const historicalBooking = await cmd('save:staffing', { engagementId: pastProject.id, personId: person.id, service: 'Preparation', from: asOf, to: asOf, dailySeconds: 3600, commitment: 'committed' })
 const linkedNative = await cmd('delivery:preview', { engagementId: pastProject.id, previousId: pastPlan.id, operation: 'baseline', plan: { calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [] }, nodes: [
  ...pastNative.schedule.nodes,
  { id: futureTask.id, kind: 'task', sourceId: futureTask.id, name: 'Future review with previous preparation', start, durationDays: 1, predecessors: [], staffingIds: [historicalBooking.id] },
 ] } })
 const linkedPlan = await cmd('delivery:approve', { ...linkedNative.input, fingerprint: linkedNative.fingerprint, acceptEffects: true, reason: 'Retain earlier linked preparation' })
 await cmd('projectScenario:preview', { asOf, changes: [{ type: 'deadline', id: linkedPlan.id, revision: linkedPlan.revision, nodeId: futureTask.id, delayBusinessDays: 1 }] }, owner, 409)
 assert.equal((await read()).data.staffing.find(s => s.id === historicalBooking.id).value.from, asOf)
 console.log('PASS FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 deadline scenario: holiday DAG cascade, fixed-fee cash month, effective cost, global capacity, native history, selected human adoption, lead planning, stale and past-work refusals; browser 1440/390')
}
