import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// One public-door recovery journey: independently priced two-project alternatives and unsafe refusals.
const h = await harness({ currency: 'USD', timezone: 'UTC' })
let browser
try {
 const { cmd, owner } = h, asOf = '2030-01-01', projectIds = [], projects = [], bookings = [], tasks = [], milestones = [], plans = []
 const employee = await cmd('save:people', { name: 'Recovery designer', timezone: 'UTC' })
 const contractor = await cmd('save:people', { name: 'Recovery contractor', timezone: 'UTC', employmentType: 'contractor' })
 const unpriced = await cmd('save:people', { name: 'Unpriced recovery contractor', timezone: 'UTC', employmentType: 'contractor' })
 const foreign = await cmd('save:people', { name: 'Other currency contractor', timezone: 'UTC', employmentType: 'contractor' })
 for (const [p, hours] of [[employee, 8], [contractor, 2], [unpriced, 8], [foreign, 8]]) await cmd('save:calendars', { personId: p.id, from: asOf, to: '2030-03-31', dailySeconds: hours * 3600, weekdays: '0,1,2,3,4,5,6', timezone: 'UTC' })
 await cmd('save:rates', { personId: employee.id, service: '*', effective: asOf, costMinor: 9000, billMinor: 15000 })
 await cmd('save:rates', { personId: employee.id, service: '*', effective: '2030-02-01', costMinor: 11000, billMinor: 15000 })
 await cmd('save:rates', { personId: contractor.id, service: '*', effective: asOf, costMinor: 6000, billMinor: 16000 })
 await cmd('save:rates', { personId: foreign.id, service: '*', effective: asOf, costMinor: 8000, billMinor: 16000 })
 const client = await cmd('save:clients', { name: 'Recovery client', paymentTermsDays: 0, collectionPercent: 50, daysLate: 5 })
 for (const name of ['Recovery Alpha', 'Recovery Beta']) {
  const phased = name === 'Recovery Alpha'
  const project = await cmd('save:engagements', { name, clientId: client.id, leadId: employee.id, members: [employee.id], scope: 'Two-day delivery', timezone: 'UTC' }); projects.push(project); projectIds.push(project.id)
  const budget = await cmd('save:budgets', { engagementId: project.id, mode: 'hourly', amountMinor: 200000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Approved delivery scope', phases: phased ? [{ key: 'delivery', name: 'Delivery', service: 'Design', mode: 'hourly', hourBudgetSeconds: 72000, feeBudgetMinor: 200000, expenseBudgetMinor: 0 }, { key: 'handover', name: 'Handover', service: 'Handover', mode: 'fixed', hourBudgetSeconds: 0, feeBudgetMinor: 0, expenseBudgetMinor: 0 }] : [] })
  await cmd('budget:approve', budget)
  const task = await cmd('save:tasks', { engagementId: project.id, name: `${name} design`, assigneeId: employee.id, from: '2030-01-30', to: '2030-01-31', remainingSeconds: 28800, phaseKey: phased ? 'delivery' : undefined }); tasks.push(task)
  const milestone = await cmd('save:milestones', { engagementId: project.id, name: `${name} handover`, due: '2030-02-01', amountMinor: 0, phaseKey: phased ? 'handover' : undefined }); milestones.push(milestone)
  if (phased) await cmd('milestone:approve', milestone)
  // The mixed budget retains an explicit zero-fee client-dated handover.
  const booking = await cmd('save:staffing', { engagementId: project.id, personId: employee.id, service: 'Design', from: '2030-01-30', to: '2030-01-31', dailySeconds: 14400, commitment: 'committed', phaseKey: phased ? 'delivery' : undefined }); bookings.push(booking)
  const preview = await cmd('delivery:preview', { engagementId: project.id, previousId: null, operation: 'baseline', plan: { calendar: { weekdays: [0,1,2,3,4,5,6], holidays: [] }, nodes: [
   { id: task.id, kind: 'task', sourceId: task.id, name: 'Design delivery', start: '2030-01-30', durationDays: 2, predecessors: [], staffingIds: [booking.id] },
   { id: milestone.id, kind: 'milestone', sourceId: milestone.id, name: 'Client handover', start: '2030-02-01', durationDays: 1, predecessors: [task.id], staffingIds: [] }
  ] } })
  const ack = await cmd('delivery:approve', { ...preview.input, fingerprint: preview.fingerprint, acceptEffects: true, reason: 'Approved dated delivery baseline' })
  plans.push({ ...ack, value: { schedule: preview.schedule } })
 }
 const lead = await h.invite('recovery-lead'), fin = await h.invite('recovery-finance'), agent = await h.invite('recovery-agent')
 await cmd('grant', { operatorId: lead.id, personId: employee.id, role: 'lead', enabled: true })
 await cmd('grant', { operatorId: fin.id, personId: contractor.id, role: 'finance', enabled: true })
 await cmd('grant', { operatorId: agent.id, role: 'agent', purpose: 'staffing', engagementIds: projectIds, enabled: true })
 const baseline = () => cmd('recovery:baseline', { asOf, projectIds }, fin.cookie)
 let basis = await baseline()
 const schedules = plans.map((p, n) => ({ id: p.id, revision: p.revision, nodeId: tasks[n].id, delayBusinessDays: 1 }))
 const alternatives = [
  { id: 'dates', name: 'Move dates', schedules },
  { id: 'contractor', name: 'Contractor delivery', schedules, staffing: bookings.map(b => ({ id: b.id, revision: b.revision, personId: contractor.id })) },
  { id: 'scope', name: 'Reduced scope', schedules, tasks: tasks.map(t => ({ id: t.id, revision: t.revision, remainingSeconds: 14400 })), staffing: bookings.map(b => ({ id: b.id, revision: b.revision, dailySeconds: 7200 })), scopes: projects.map(p => ({ id: p.id, revision: p.revision, scope: 'One reviewed component each day' })) },
  { id: 'predecessor', name: 'Unsafe predecessor', schedules: [{ id: plans[0].id, revision: plans[0].revision, starts: [{ nodeId: milestones[0].id, start: '2030-01-30' }] }] }
 ]
 const compare = (options = alternatives, cookie = fin.cookie, expected = 200, captured = basis) => cmd('recovery:preview', { ...captured, alternatives: options }, cookie, expected)
 const before = await h.state(), auditBefore = (await (await h.request('/api/gauge/audit/export', owner)).json()).entries.length
 const first = await compare()
 assert.equal(first.alternatives[3].status, 'refused'); assert.match(first.alternatives[3].refusals.join(' '), /predecessor/)
 const contractorOption = first.alternatives[1]
 assert.equal(contractorOption.status, 'refused'); assert.equal(contractorOption.offered, false)
 assert(contractorOption.capacityCosts.every(c => c.seconds === 21600 && c.amountMinor === 36000), 'Six excess hours cost six times the native hourly cost on each day')
 assert.match(contractorOption.refusals.join(' '), /Unpriced or unnamed capacity excess/)
 const named = alternatives.slice(0, 3).map(option => {
  const outcome = first.alternatives.find(o => o.id === option.id)
  return { ...option, commercialChanges: outcome.requirements.map(r => ({ key: r.key, amountMinor: r.amountMinor, reason: 'Explicitly request the named client decision; not an approval' })), capacityCosts: outcome.capacityCosts.map(c => ({ key: c.key, seconds: c.seconds, amountMinor: c.amountMinor, currency: c.currency })) }
 })
 const result = await compare(named)
 for (const option of result.alternatives) {
  assert.equal(option.offered, true)
  for (const [n, project] of projects.entries()) {
   const b = result.baseline.projects.find(p => p.engagementId === project.id), p = option.scenario.projects.find(p => p.engagementId === project.id), delta = option.deltas.find(d => d.engagementId === project.id)
   const dailyHours = option.id === 'scope' ? 2 : 4, fees = dailyHours * 2 * (option.id === 'contractor' ? 16000 : 15000)
   const costs = option.id === 'contractor' ? dailyHours * 2 * 6000 : dailyHours * (9000 + 11000)
   assert.equal(b.marginMinor, 48000); assert.equal(p.eacFeesMinor, fees); assert.equal(p.eacCostMinor, costs); assert.equal(p.marginMinor, fees - costs)
   assert.equal(delta.marginMinor, fees - costs - 48000)
   const cash = option.scenario.cash.engagements.find(e => e.engagementId === project.id)
   assert.equal(cash.collectionPercent, 50); assert.equal(cash.paymentTermsDays, 0); assert.equal(cash.daysLate, 5)
   const items = cash.items.filter(i => !i.issued)
   assert.equal(items.find(i => i.invoiceDate === '2030-02-01').expectedMinor, Math.round(dailyHours * (option.id === 'contractor' ? 16000 : 15000) / 2))
   assert.equal(items.find(i => i.invoiceDate === '2030-03-01').expectedMinor, Math.round(dailyHours * (option.id === 'contractor' ? 16000 : 15000) / 2))
   assert.equal(option.scenario.dates[n].finish, '2030-02-02')
   assert.equal(option.projectCashDeltas.find(d => d.engagementId === project.id && d.month === '2030-02').expectedMinor, dailyHours * (option.id === 'contractor' ? 16000 : 15000) / 2 - 60000)
   assert.equal(option.scenario.loads.reduce((n, p) => n + p.days.reduce((m, d) => m + d.projectSeconds[project.id], 0), 0), dailyHours * 2 * 3600)
  }
  const expectedPerMonth = (option.id === 'scope' ? 2 : 4) * (option.id === 'contractor' ? 16000 : 15000)
  assert.equal(option.cashDeltas.find(m => m.month === '2030-02').expectedMinor, expectedPerMonth - 120000)
  assert.equal(option.cashDeltas.find(m => m.month === '2030-03').expectedMinor, expectedPerMonth)
  assert(option.cashDeltas.every(m => m.expectedMinor === m.historicalExpectedMinor))
 }
 assert.equal(result.alternatives[1].status, 'conditional')
 assert(result.alternatives[1].capacityCosts.every(c => /Lead acceptance/.test(c.requires) && c.includedInForecast))
 assert.equal(result.alternatives[2].status, 'conditional'); assert.equal(result.alternatives[0].status, 'conditional')
 assert.deepEqual((await h.state()).data, before.data, 'Comparison changes no staffing, terms, invoice, payment or other native record')
 assert.equal((await (await h.request('/api/gauge/audit/export', owner)).json()).entries.length, auditBefore)
 assert(result.sources.some(s => s.kind === 'rates' && s.revision)); assert(result.sources.some(s => s.id === bookings[1].id && s.revision === bookings[1].revision))
 assert(result.assumptions.some(s => /not settlement/.test(s)))
 const unallocated = await compare([{ id: 'unallocated', name: 'Unstaffed remaining scope', staffing: bookings.map(b => ({ id: b.id, revision: b.revision, dailySeconds: 7200 })), commercialChanges: projectIds.map(id => ({ key: `scope:${id}`, amountMinor: 0, reason: 'A named scope change cannot price unallocated remaining effort' })) }])
 assert.equal(unallocated.alternatives[0].status, 'incomplete'); assert.equal(unallocated.alternatives[0].offered, false)
 assert(unallocated.alternatives[0].unknowns.some(s => /no committed priced allocation/.test(s)))
 assert(unallocated.alternatives[0].deltas.every(d => d.marginMinor === null))

 // An omitted native cost and an incompatible declared cost currency remain unknown, never a zero-cost offer.
 for (const person of [unpriced]) {
  const unknown = await compare([{ id: 'unknown', name: 'Unqualified pricing', staffing: bookings.map(b => ({ id: b.id, revision: b.revision, personId: person.id })) }])
  assert.equal(unknown.alternatives[0].status, 'incomplete'); assert.equal(unknown.alternatives[0].offered, false)
  assert(unknown.alternatives[0].deltas.every(d => d.marginMinor === null))
  assert(unknown.alternatives[0].cashDeltas.every(d => d.expectedMinor === null))
  assert(unknown.alternatives[0].unknowns.some(s => person === unpriced ? /cost rate/.test(s) : /CAD/.test(s)))
 }
 const cadClient = await cmd('save:clients', { name: 'Canadian recovery client', billingCurrency: 'CAD' })
 const cadProject = await cmd('save:engagements', { name: 'CAD recovery work', clientId: cadClient.id, leadId: foreign.id, members: [foreign.id], scope: 'Delivery with untranslated cost', timezone: 'UTC' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: cadProject.id, mode: 'hourly', amountMinor: 200000, effortSeconds: 72000, roundingSeconds: 60, reason: 'CAD commercial terms' }))
 await cmd('save:staffing', { engagementId: cadProject.id, personId: foreign.id, service: 'Design', from: '2030-01-30', to: '2030-01-31', dailySeconds: 14400, commitment: 'committed' })
 const cadBasis = await cmd('recovery:baseline', { asOf, projectIds: [projects[0].id, cadProject.id] }, fin.cookie)
 const cad = await compare([{ id: 'cad', name: 'Unconverted CAD comparison' }], fin.cookie, 200, cadBasis)
 assert.equal(cad.alternatives[0].status, 'incomplete'); assert.equal(cad.alternatives[0].offered, false)
 assert.equal(cad.alternatives[0].scenario.projects.find(p => p.engagementId === cadProject.id).currency, 'CAD')
 assert.equal(cad.alternatives[0].deltas.find(p => p.engagementId === cadProject.id).marginMinor, null)
 assert(cad.alternatives[0].unknowns.some(s => /cost declared|no effective bill/.test(s)))
 await cmd('save:rates', { personId: unpriced.id, service: '*', effective: asOf, costMinor: 7000, billMinor: 17000 })
 await compare(named, fin.cookie, 409)
 basis = await baseline()
 const ingested = await compare([{ id: 'priced', name: 'Known native cost', staffing: bookings.map(b => ({ id: b.id, revision: b.revision, personId: unpriced.id })) }])
 assert.equal(ingested.alternatives[0].status, 'feasible'); assert(ingested.alternatives[0].deltas.every(d => d.marginMinor === 32000))
 for (const who of [lead, agent]) {
  await cmd('recovery:baseline', { asOf, projectIds }, who.cookie, 403); await compare(named, who.cookie, 403)
  const page = await h.request('/app/review', who.cookie); assert.equal(page.status, 200); assert(!(await page.text()).includes('id="recovery-comparison"'))
 }
 // Existing client-dated fixed commitments and phase caps must name exact approval exceptions.
 const small = await cmd('save:budgets', { engagementId: projects[0].id, mode: 'hourly', amountMinor: 100000, effortSeconds: 21600, roundingSeconds: 60, reason: 'Approved capped delivery', phases: [{ key: 'delivery', name: 'Delivery', service: 'Design', mode: 'hourly', hourBudgetSeconds: 21600, feeBudgetMinor: 100000, expenseBudgetMinor: 0 }, { key: 'handover', name: 'Handover', service: 'Handover', mode: 'fixed', hourBudgetSeconds: 0, feeBudgetMinor: 0, expenseBudgetMinor: 0 }] })
 await cmd('budget:approve', small)
 await cmd('agency:calendar', { weekdays: [0,1,2,3,4,5,6], holidays: [], reason: 'Reviewed dated calendar for period fees' })
 const terms = { name: 'Held monthly allowance', frequency: 'monthly', unit: 'hours', allowance: 3600, services: ['Design'], consumes: 'all', proration: 'calendar', start: asOf, end: '2030-02-28', renewal: 'automatic', noticeDays: 10, currency: 'USD', feeMinor: 80000, rules: { carryCap: 0, carryPeriods: 0, deficit: false, overage: 'held', overageRate: 20000 } }
 const retainer = await cmd('retainer:preview', { engagementId: projects[1].id, operation: 'terms', terms })
 const savedRetainer = await cmd('retainer:approve', { ...retainer.input, fingerprint: retainer.fingerprint, reason: 'Reviewed held overage terms' })
 const periods = await cmd('retainer:preview', { engagementId: projects[1].id, operation: 'periods', retainerId: savedRetainer.id, from: asOf, to: '2030-02-28' })
 await cmd('retainer:approve', { ...periods.input, fingerprint: periods.fingerprint, reason: 'Reviewed entitlements' })
 basis = await baseline()
 const exceptions = await compare([alternatives[0]])
 const required = exceptions.alternatives[0].requirements
 assert(required.some(r => r.key === `client-date:${milestones[0].id}` && /2030-02-01.*2030-02-02/.test(r.description) && /Client acceptance/.test(r.requires)))
 assert(required.some(r => r.kind === 'budget' && r.key.includes(':delivery:hours') && r.quantity === 7200 && r.amountMinor === 20000))
 const held = required.filter(r => r.kind === 'retainer'); assert.equal(held.length, 2); assert(held.every(r => r.quantity === 10800 && r.amountMinor === 60000))
 const nativePeriods = (await h.state()).data.retainerPeriods.filter(p => p.value.retainerId === savedRetainer.id)
 for (const p of nativePeriods) {
  const exception = held.find(r => r.period?.periodId === p.id)
  assert.deepEqual(exception.period, { retainerId: savedRetainer.id, periodId: p.id, from: p.value.activeStart, to: p.value.activeEnd })
  assert(exception.description.includes(p.value.activeStart) && exception.description.includes(p.value.activeEnd))
 }

 assert.equal(exceptions.alternatives[0].status, 'refused')
 const exceptionsNamed = await compare([{ ...alternatives[0], commercialChanges: required.map(r => ({ key: r.key, amountMinor: r.amountMinor, reason: 'Client must separately accept the exact dated and commercial change' })) }])
 assert.equal(exceptionsNamed.alternatives[0].status, 'conditional')
 assert(exceptionsNamed.alternatives[0].requirements.every(r => /no approval granted/.test(r.requires)))

 // The built page uses labelled native controls for the same comparison; screenshots are proof only.
 browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } }), page = await context.newPage()
 await context.addCookies(fin.cookie.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 await page.goto(h.origin + '/app/review')
 const panel = page.locator('#recovery-comparison')
 await panel.getByLabel('Forecast as of', { exact: true }).fill(asOf)
 await panel.getByLabel('First project').selectOption(projectIds[0]); await panel.getByLabel('Second project').selectOption(projectIds[1])
 await panel.getByRole('button', { name: 'Capture comparison baseline' }).click()
 await panel.getByLabel('Contractor to compare').selectOption(contractor.id)
 for (const n of [0, 1]) { await panel.getByLabel(`Delivery to delay for project ${n + 1}`).selectOption(tasks[n].id); await panel.getByLabel(`Booking to compare for project ${n + 1}`).selectOption(bookings[n].id); await panel.getByLabel(`Remaining task hours for project ${n + 1}`).fill('4') }
 await panel.getByRole('button', { name: 'Compare recovery alternatives' }).click()
 assert.match(await panel.locator('#recovery-results').innerText(), /Client acceptance required/)
 for (const p of nativePeriods) assert((await panel.locator('#recovery-results').innerText()).includes(`Recovery Beta · Change order for ${terms.name}, ${p.value.activeStart} through ${p.value.activeEnd}`))
 assert.match(await panel.locator('[data-recovery-option=contractor]').innerText(), /6.*excess.*360/)
 // Explicitly list the client decisions and priced excess; this grants no native approval.
 for (const box of await panel.locator('input[type=checkbox]').all()) await box.check()
 for (const field of await panel.locator('input[name^="changeReason:"]').all()) await field.fill('Request exact client approval separately')
 await panel.getByRole('button', { name: 'Compare recovery alternatives' }).click()
 assert.match(await panel.locator('[data-recovery-option=contractor]').innerText(), /conditional/)
 const unchanged = (await h.state()).data
 if (process.env.GAUGE_RECOVERY_SHOTS) {
  await mkdir(process.env.GAUGE_RECOVERY_SHOTS, { recursive: true })
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready); await panel.locator('#recovery-results').screenshot({ path: `${process.env.GAUGE_RECOVERY_SHOTS}/recovery-comparison-${width}.png` }) }
 }
 await page.setViewportSize({ width: 1440, height: 1000 })
 assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
 assert(await panel.locator('input,select,button,p,h2,h3,h4,li,label').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).fontSize) >= 13)))
 assert.deepEqual((await h.state()).data, unchanged)
 await context.close()
 await cmd('grant', { operatorId: fin.id, personId: contractor.id, role: 'finance', enabled: false })
 await compare(named, fin.cookie, 403); await cmd('recovery:baseline', { asOf, projectIds }, fin.cookie, 403)
 await cmd('recovery:preview', { ...basis, alternatives: named, adopt: true }, agent.cookie, 403)
 assert.deepEqual((await h.state()).data.staffing, unchanged.staffing, 'Revoked and agent replays cannot staff or approve a comparison')
 await cmd('recovery:adopt', { ...basis, alternatives: named }, owner, 400)
 await cmd('privacy:policy', { personalDays: 0, fileDays: 0, evidenceDays: 0, reason: 'Owner reviewed bounded native erasure' })
 await cmd('privacy:exit', { personId: contractor.id, date: '2020-01-01', reason: 'Contractor engagement ended' })
 const erasure = await cmd('privacy:preview', { personId: contractor.id })
 assert.deepEqual(erasure.blockers, [])
 await cmd('privacy:erase', { personId: contractor.id, fingerprint: erasure.fingerprint, reason: 'Explicit bounded erasure consent', confirm: 'erase-reviewed-native-scope', lawfulReceiptRemoval: 'authorized' })
 await cmd('recovery:preview', { ...basis, alternatives: named }, owner, 409)
 const erasedBasis = await cmd('recovery:baseline', { asOf, projectIds }, owner)
 const erasedComparison = await cmd('recovery:preview', { ...erasedBasis, alternatives: [alternatives[1]] }, owner)
 assert.equal(erasedComparison.alternatives[0].status, 'refused')
 assert(!JSON.stringify(erasedComparison).includes('Recovery contractor'), 'Replayed captures cannot expose the erased profile')
 await compare(named, fin.cookie, 403)

 console.log('PASS native two-project recovery comparison: independent margin and monthly cash, six-hour excess costing and lead condition, predecessor refusal, client-date and phase and retainer exceptions, stale and unauthorized and revoked refusal, unknown costs and currencies, read-only browser comparison at 1440 with 1440 and 390 proof')
} finally { await browser?.close(); await h.dispose() }
