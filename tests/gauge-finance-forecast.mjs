import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// FINANCE-006 committed forecast basis, the acceptance drill as of 20 October 2026, and the FINANCE-001 margin drill on
// the same basis, through the command, state and Week in review doors.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 const { cmd, request, owner } = h
 const forecast = async (cookie = owner) => { const r = await request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-20', cookie); assert.equal(r.status, 200); return r.json() }
 const worker = await cmd('save:people', { name: 'Ada Ruiz', timezone: 'America/New_York' })
 const client = await cmd('save:clients', { name: 'Harbor Goods' })
 const eng = await cmd('save:engagements', { name: 'Hourly rebuild', clientId: client.id, leadId: worker.id, members: [worker.id], scope: 'Site rebuild', timezone: 'America/New_York' })
 const task = await cmd('save:tasks', { engagementId: eng.id, name: 'Build', remainingSeconds: 72000 })
 const terms = await cmd('save:budgets', { engagementId: eng.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 144000, roundingSeconds: 60, reason: 'Signed SOW', expenseBudgetMinor: 50000, expenseDate: '2026-11-15' })
 await cmd('budget:approve', terms)
 await cmd('save:rates', { personId: worker.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 15000 })
 const november = await cmd('save:rates', { personId: worker.id, service: '*', effective: '2026-11-01', costMinor: 9000, billMinor: 17500 })
 // 10 approved hours worked 1–17 October.
 for (const [day, hours] of [['2026-10-01', 4], ['2026-10-09', 3], ['2026-10-17', 3]]) {
  const entry = await cmd('time:save', { personId: worker.id, engagementId: eng.id, taskId: task.id, service: 'Build', notes: 'Rebuild work', timezone: 'America/New_York', billable: true, start: `${day}T09:00:00-04:00`, end: `${day}T${String(9 + hours).padStart(2, '0')}:00:00-04:00` })
  await cmd('time:approve', await cmd('time:submit', entry))
 }
 // Committed: 12 hours on 21–31 October (an allocation crossing the as-of date counts only its future days), 8 on 3–7 November; 8 tentative November hours.
 const october = await cmd('save:staffing', { personId: worker.id, engagementId: eng.id, service: 'Build', from: '2026-10-19', to: '2026-10-23', dailySeconds: 14400, commitment: 'committed' })
 await cmd('save:staffing', { personId: worker.id, engagementId: eng.id, service: 'Build', from: '2026-11-03', to: '2026-11-06', dailySeconds: 7200, commitment: 'committed' })
 await cmd('save:staffing', { personId: worker.id, engagementId: eng.id, service: 'Build', from: '2026-11-10', to: '2026-11-11', dailySeconds: 14400, commitment: 'tentative' })
 // A $20,000 fixed fee with two $10,000 milestones; its allocations never move revenue.
 const fixed = await cmd('save:engagements', { name: 'Fixed brand system', clientId: client.id, leadId: worker.id, members: [worker.id], scope: 'Brand system', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: fixed.id, mode: 'fixed', amountMinor: 2000000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Fixed fee' }))
 for (const due of ['2026-11-30', '2027-01-29']) await cmd('milestone:approve', await cmd('save:milestones', { engagementId: fixed.id, name: `Milestone ${due}`, due, amountMinor: 1000000 }))
 await cmd('save:staffing', { personId: worker.id, engagementId: fixed.id, service: 'Design', from: '2026-10-26', to: '2026-12-18', dailySeconds: 3600, commitment: 'committed' })
 // Open pipeline appears only as a labelled addition.
 await cmd('save:opportunities', { name: 'Spring campaign', clientId: client.id, ownerId: worker.id, stage: 'proposal', probability: 50, from: '2026-11-01', to: '2026-12-31', services: 'Campaign', amountMinor: 1000000, demandSeconds: 36000 })

 const data = await forecast(), f = data.forecast, hourly = f.engagements.find(x => x.engagementId === eng.id)
 assert.equal(f.asOf, '2026-10-20'); assert.deepEqual(f.labels, { committed: 'committed', tentative: '+ tentative', pipeline: '+ weighted pipeline' })
 assert.equal(hourly.basis, 'hourly'); assert.equal(hourly.complete, true)
 assert.equal(hourly.actualFeesMinor, 150000); assert.equal(hourly.etcFeesMinor, 320000); assert.equal(hourly.eacFeesMinor, 520000)
 assert.equal(hourly.eacFeesWithTentativeMinor, 660000)
 assert.equal(hourly.eacCostMinor, 320000); assert.equal(hourly.actualCostMinor, 90000); assert.equal(hourly.etcCostMinor, 180000); assert.equal(hourly.remainingExpenseMinor, 50000)
 assert.equal(hourly.marginMinor, 200000)
 const month = (x, m) => x.months.find(r => r.month === m)
 assert.equal(month(hourly, '2026-10').committedFeesMinor, 330000); assert.equal(month(hourly, '2026-11').committedFeesMinor, 190000)
 assert.equal(month(hourly, '2026-11').tentativeFeesMinor, 140000); assert.equal(month(hourly, '2026-10').tentativeFeesMinor, 0)
 // Each figure links to its formula and source rows (REPORT-005).
 const eac = data.lineage.find(x => x.id === `forecast:${eng.id}:eacFeesMinor`)
 assert.equal(eac.value, 520000); assert.equal(eac.complete, true); assert.match(eac.formula, /remaining billable expense budget/)
 assert(eac.sources.some(s => s.kind === 'staffing' && s.id === october.id)); assert(eac.sources.some(s => s.kind === 'rates' && s.id === november.id)); assert(eac.sources.some(s => s.kind === 'budgets' && s.id === terms.id))
 const fixedFigure = f.engagements.find(x => x.engagementId === fixed.id)
 assert.equal(fixedFigure.basis, 'fixed'); assert.equal(fixedFigure.complete, true)
 assert.deepEqual(fixedFigure.months.filter(m => m.committedFeesMinor > 0).map(m => [m.month, m.committedFeesMinor]), [['2026-11', 1000000], ['2027-01', 1000000]])
 assert(fixedFigure.etcCostMinor > 0, 'Fixed-fee cost still follows its allocations')
 assert.deepEqual(f.pipeline, [{ currency: 'USD', months: [{ month: '2026-11', weightedMinor: 250000 }, { month: '2026-12', weightedMinor: 250000 }] }])
 assert.equal(f.totals[0].eacFeesMinor, 520000 + 2000000, 'Committed totals never include tentative or pipeline additions')
 // FINANCE-001 margin reads on the same basis: a complete engagement shows actual and forecast margin; nothing billed or paid yet.
 const margin = data.margin.find(x => x.engagementId === eng.id)
 assert.equal(margin.complete, true); assert.equal(margin.earnedValueMinor, 150000); assert.equal(margin.approvedCostMinor, 90000)
 assert.equal(margin.actualMarginMinor, 60000); assert.equal(margin.forecastMarginMinor, 200000); assert.equal(margin.billedMinor, 0)
 assert.equal(margin.paidCashMinor, null); assert.equal(margin.paidCashLabel, 'No payments recorded')

 // Withdrawing the 1 November rate reprices November committed work at $150/h.
 const card = await h.db.prepare('SELECT revision FROM g_rates WHERE id=?').bind(november.id).first()
 const lead = await h.invite('Ada'); await cmd('grant', { operatorId: lead.id, personId: worker.id, role: 'lead', enabled: true })
 await cmd('rate:withdraw', { id: november.id, revision: card.revision, reason: 'Rate increase not agreed' }, lead.cookie, 403)
 await cmd('rate:withdraw', { id: november.id, revision: card.revision, reason: 'Rate increase not agreed' })
 const withdrawn = (await forecast()).forecast.engagements.find(x => x.engagementId === eng.id)
 assert.equal(withdrawn.complete, true)
 assert.equal(month(withdrawn, '2026-11').committedFeesMinor, 170000); assert.equal(withdrawn.eacFeesMinor, 500000)
 const leadView = await forecast(lead.cookie)
 assert.equal(leadView.forecast, null, 'Forecast fees and costs stay with finance')
 assert(!leadView.lineage.some(x => x.id.startsWith('forecast:')))
 // An allocation day with no effective rate is unpriced and makes the figure incomplete, never zero.
 const newcomer = await cmd('save:people', { name: 'Unpriced Lee', timezone: 'America/New_York' })
 const unpriced = await cmd('save:staffing', { personId: newcomer.id, engagementId: eng.id, service: 'Build', from: '2026-10-27', to: '2026-10-27', dailySeconds: 3600, commitment: 'committed' })
 const gap = (await forecast()).forecast.engagements.find(x => x.engagementId === eng.id)
 assert.equal(gap.complete, false); assert(gap.unpriced.some(u => u.staffingId === unpriced.id && u.missing === 'bill rate'))
 assert.equal((await forecast()).lineage.find(x => x.id === `forecast:${eng.id}:eacFeesMinor`).value, null)

 // FINANCE-001 acceptance: approve time and expenses, leave one cost unknown, bill half the project, and trace
 // actual/forecast margin and its incomplete flag to source records. Margin, billing and lineage stay finance-only.
 const kim = await cmd('save:people', { name: 'Kim Bill-only', timezone: 'America/New_York' })
 await cmd('save:rates', { personId: kim.id, service: '*', effective: '2026-01-01', billMinor: 15000 })
 const drill = await cmd('save:engagements', { name: 'Margin drill', clientId: client.id, leadId: worker.id, members: [worker.id, kim.id], scope: 'Margin drill', timezone: 'America/New_York' })
 const drillTask = await cmd('save:tasks', { engagementId: drill.id, name: 'Deliver', remainingSeconds: 36000 })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: drill.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Margin SOW' }))
 const work = async (personId, day, hours, approve = true) => {
  const entry = await cmd('time:save', { personId, engagementId: drill.id, taskId: drillTask.id, service: 'Build', notes: 'Drill work', timezone: 'America/New_York', billable: true, start: `${day}T09:00:00-04:00`, end: `${day}T${String(9 + hours).padStart(2, '0')}:00:00-04:00` })
  const submitted = await cmd('time:submit', entry); return approve ? cmd('time:approve', submitted) : submitted
 }
 const adaFour = await work(worker.id, '2026-10-05', 4), adaTwo = await work(worker.id, '2026-10-06', 2), kimTwo = await work(kim.id, '2026-10-07', 2)
 const pending = await work(worker.id, '2026-10-12', 2, false)
 const spend = async (amountMinor, approve) => { const submitted = await cmd('expense:submit', await cmd('expense:save', { personId: worker.id, engagementId: drill.id, date: '2026-10-08', description: 'Travel', amountMinor, reimbursable: true })); return approve ? cmd('expense:approve', submitted) : submitted }
 const travel = await spend(60000, true), pendingExpense = await spend(5000, false)
 const drillStaffing = await cmd('save:staffing', { personId: worker.id, engagementId: drill.id, service: 'Build', from: '2026-10-26', to: '2026-10-27', dailySeconds: 14400, commitment: 'committed' })
 // Earned value $1,800 (6 h + 2 h at $150 + $600 pass-through travel); bill half: Ada's 4 hours and Kim's 2 hours, then credit $50 on Kim's line.
 const packet = await cmd('packet:create', { engagementId: drill.id, title: 'October half', sources: [`time:${adaFour.id}`, `time:${kimTwo.id}`] })
 await cmd('packet:approve', packet)
 const approvedPacket = (await forecast()).data.packets.find(p => p.id === packet.id)
 const credit = await cmd('packet:adjust', { id: packet.id, revision: approvedPacket.revision, sourceKind: 'time', sourceId: kimTwo.id, correctedAmountMinor: 25000, reason: 'Goodwill credit' })
 await cmd('packet:approve', credit)
 const read = await forecast(), m = read.margin.find(x => x.engagementId === drill.id), figure = id => read.lineage.find(x => x.id === `margin:${drill.id}:${id}`)
 assert.equal(m.earnedValueMinor, 180000); assert.equal(m.earnedLabel, 'Operational value, not recognized revenue')
 assert.equal(m.approvedCostMinor, null, "Kim's unknown cost makes approved cost unknown, never zero"); assert.equal(m.knownApprovedCostMinor, 54000 + 60000)
 assert.equal(m.approvedLaborCostMinor, 54000); assert.equal(m.approvedExpenseCostMinor, 60000)
 assert.equal(m.provisionalCostMinor, 18000 + 5000, 'Submitted time at the effective cost rate plus submitted expenses')
 assert.equal(m.billedMinor, 85000); assert.equal(m.creditsMinor, -5000); assert.equal(m.billedLabel, 'Billing prepared, not invoiced')
 assert.equal(m.paidCashMinor, null); assert.equal(m.paidCashLabel, 'No payments recorded')
 assert.equal(m.remainingTaskSeconds, 36000); assert.equal(m.committedFutureSeconds, 28800)
 assert.equal(m.etcFeesMinor, 120000); assert.equal(m.eacFeesMinor, 300000); assert.equal(m.etcCostMinor, 72000)
 assert.equal(m.actualMarginMinor, null); assert.equal(m.knownActualMarginMinor, 180000 - 114000); assert.equal(m.forecastMarginMinor, null); assert.equal(m.complete, false)
 // The incomplete flag traces to Kim's approved time; each figure lists its source rows.
 const unknownCost = `time:${kimTwo.id}: frozen costMinor unknown`
 for (const id of ['approvedCostMinor', 'actualMarginMinor', 'forecastMarginMinor']) { const x = figure(id); assert.equal(x.value, null); assert.equal(x.complete, false); assert(x.unknownSources.includes(unknownCost), `${id} names the unknown cost`); assert(x.sources.some(s => s.kind === 'time' && s.id === kimTwo.id)) }
 assert.equal(figure('actualMarginMinor').knownValue, 66000); assert.match(figure('actualMarginMinor').label, /incomplete/)
 assert(figure('actualMarginMinor').sources.some(s => s.kind === 'expenses' && s.id === travel.id)); assert(figure('forecastMarginMinor').sources.some(s => s.kind === 'staffing' && s.id === drillStaffing.id))
 assert.equal(figure('billedMinor').value, 85000); assert.deepEqual(figure('billedMinor').sources.filter(s => s.kind === 'packets').map(s => s.id).sort(), [packet.id, credit.id].sort())
 assert.deepEqual(figure('creditsMinor').sources.filter(s => s.kind === 'packets').map(s => s.id), [credit.id])
 assert.equal(figure('earnedValueMinor').value, 180000); assert.match(figure('earnedValueMinor').formula, /not recognized revenue/)
 const provisional = figure('provisionalCostMinor'); assert.equal(provisional.value, 23000); assert(provisional.sources.some(s => s.kind === 'time' && s.id === pending.id)); assert(provisional.sources.some(s => s.kind === 'expenses' && s.id === pendingExpense.id))
 assert(!figure('approvedCostMinor').sources.some(s => s.id === pending.id), 'Submitted time is provisional, never approved cost')
 const leadMargin = await forecast(lead.cookie)
 assert.equal(leadMargin.margin, null, 'Margin stays with finance'); assert(!leadMargin.lineage.some(x => x.id.startsWith('margin:')))

 // Finance reads the same forecast on Week in review, each figure opening its calculation, at desktop and phone widths.
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage(), shots = process.env.GAUGE_FORECAST_SHOTS
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 await page.goto(h.origin + '/app/review')
 const section = page.locator('section.g-block').filter({ has: page.getByRole('heading', { name: 'Committed forecast' }) })
 assert((await section.innerText()).includes('+ tentative')); assert((await section.innerText()).includes('weighted pipeline'))
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Review forecast fits ${width}`)
  if (shots) { await mkdir(shots, { recursive: true }); await section.screenshot({ path: `${shots}/forecast-${width}.png` }) }
 }
 const marginBlock = page.locator('#project-margin'), marginText = await marginBlock.innerText()
 for (const label of [/not recognized revenue/i, /billing prepared, not invoiced/i, /no payments recorded/i, /incomplete/i]) assert.match(marginText, label)
 await marginBlock.locator('summary').click(); assert.match(await marginBlock.locator('details').innerText(), /Kim Bill-only[^\n]*cost unknown/)
 if (shots) for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await marginBlock.screenshot({ path: `${shots}/margin-${width}.png` }) }
 await page.setViewportSize({ width: 1440, height: 1000 })
 await marginBlock.getByRole('row', { name: /Margin drill/ }).getByRole('link', { name: /Unknown/ }).last().click()
 assert((await page.locator('#report-evidence article').first().innerText()).includes('Forecast margin'))
 await page.goto(h.origin + '/app/review')
 await section.getByRole('row', { name: /Hourly rebuild/ }).first().getByRole('link').nth(2).click()
 assert(await page.locator('#report-evidence').getAttribute('open') !== null)
 assert((await page.locator('#report-evidence article').first().innerText()).includes('Committed EAC fees'))
 console.log('PASS FINANCE-001 actual/forecast margin with unknown cost traced to sources, billed net of credits not invoiced, no payments recorded; FINANCE-006 committed ETC/EAC at effective rates, monthly split, tentative and weighted pipeline additions, unpriced incompleteness, fixed-fee milestone schedule, rate withdrawal and finance-only lineage')
} finally { await browser?.close(); await h.dispose() }
