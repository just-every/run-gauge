import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { receivablesJourney } from './gauge-invoices.mjs'
import { revenueDashboardJourney, captureRevenueDashboard } from './gauge-revenue-dashboard.mjs'

// FINANCE-002 revenue and cash forecast as of 20 October 2026, through the command, state and Week in review doors:
// a milestone delayed two weeks through the delivery plan moves expected cash exactly as an independent FINANCE-007
// recomputation, month by month, while booked revenue and settled cash stay distinct.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 await captureRevenueDashboard(h,'empty')
 const { cmd, request, owner } = h, asOf = '2026-10-20'
 const read = async (cookie = owner) => { const r = await request(`/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=${asOf}`, cookie); assert.equal(r.status, 200); return r.json() }
 const worker = await cmd('save:people', { name: 'Ada Ruiz', timezone: 'America/New_York' })
 const client = await cmd('save:clients', { name: 'Northwind', paymentTermsDays: 30 })
 await cmd('save:rates', { personId: worker.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 15000 })
 const fixed = await cmd('save:engagements', { name: 'Fixed launch', clientId: client.id, leadId: worker.id, members: [worker.id], scope: 'Launch', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: fixed.id, mode: 'fixed', amountMinor: 2000000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Fixed fee' }))
 const launch = await cmd('save:milestones', { engagementId: fixed.id, name: 'Launch', due: '2026-10-26', amountMinor: 1000000 }); await cmd('milestone:approve', launch)
 const handover = await cmd('save:milestones', { engagementId: fixed.id, name: 'Handover', due: '2026-12-15', amountMinor: 1000000 }); await cmd('milestone:approve', handover)
 const hourly = await cmd('save:engagements', { name: 'Hourly support', clientId: client.id, leadId: worker.id, members: [worker.id], scope: 'Support', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: hourly.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Support SOW' }))
 const task = await cmd('save:tasks', { engagementId: hourly.id, name: 'Support', remainingSeconds: 28800 })
 const entry = await cmd('time:save', { personId: worker.id, engagementId: hourly.id, taskId: task.id, service: 'Support', notes: 'Support', timezone: 'America/New_York', billable: true, start: '2026-10-05T09:00:00-04:00', end: '2026-10-05T13:00:00-04:00' })
 await cmd('time:approve', await cmd('time:submit', entry))
 await cmd('save:staffing', { personId: worker.id, engagementId: hourly.id, service: 'Support', from: '2026-11-02', to: '2026-11-03', dailySeconds: 14400, commitment: 'committed' })

 // Independent FINANCE-007 recomputation from the inputs above: milestones invoice on their due date, hourly fees on the 1st
 // of the next month; receipt = invoice + Net days (+ approved days late); never before the as-of day; cash × probability.
 const plus = (day, n) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10)
 const recompute = (invoices, { net = 30, late = 0, percent = 100 } = {}) => {
  const out = {}
  for (const [invoiceDate, minor] of invoices) { const receipt = plus(invoiceDate, net + late), month = (receipt < asOf ? asOf : receipt).slice(0, 7); out[month] = (out[month] ?? 0) + Math.floor((minor * percent + 50) / 100) }
  return out
 }
 const curve = (data, field) => Object.fromEntries(data.cash.months.filter(m => m[field]).map(m => [m.month, m[field]]))
 const hourlyInvoices = [['2026-11-01', 60000], ['2026-12-01', 120000]]
 let data = await read()
 assert.deepEqual(curve(data, 'expectedMinor'), recompute([['2026-10-26', 1000000], ['2026-12-15', 1000000], ...hourlyInvoices]))
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 1000000, '2026-12': 180000, '2027-01': 1000000 })
 assert.deepEqual(curve(data, 'invoicesMinor'), { '2026-10': 1000000, '2026-11': 60000, '2026-12': 1120000 })
 assert(data.cash.months.every(m => m.complete))
 // Booked revenue, backlog, issued receivables and settled cash are distinct figures.
 const support = data.cash.engagements.find(x => x.engagementId === hourly.id)
 assert.equal(support.bookedRevenueMinor, 60000); assert.equal(support.backlogMinor, 120000)
 assert.equal(data.cash.issuedReceivables, 'None issued'); assert.equal(data.cash.settledCash, 'No payments recorded'); assert.equal(data.cash.pendingCash, 'No payments recorded')
 assert.equal(data.cash.months.find(m => m.month === '2026-10').revenueMinor, 1060000, 'October revenue is booked; its cash arrives later')

 // Delay the launch milestone two weeks (10 business days) through the approved delivery plan.
 const plan = { calendar: { weekdays: [1, 2, 3, 4, 5], holidays: [] }, nodes: [{ id: 'launch', kind: 'milestone', sourceId: launch.id, name: 'Launch', start: '2026-10-26', durationDays: 1, predecessors: [], staffingIds: [] }] }
 const approve = async input => { const preview = await cmd('delivery:preview', input); return cmd('delivery:approve', { ...preview.input, fingerprint: preview.fingerprint, acceptEffects: true, reason: 'Client moved launch' }) }
 const baseline = await approve({ engagementId: fixed.id, previousId: null, operation: 'baseline', plan })
 await approve({ engagementId: fixed.id, previousId: baseline.id, revision: baseline.revision, operation: 'delay', nodeId: 'launch', delayBusinessDays: 10 })
 data = await read()
 assert.equal(data.data.milestones.find(m => m.id === launch.id).value.due, '2026-11-09')
 const delayed = [['2026-11-09', 1000000], ['2026-12-15', 1000000], ...hourlyInvoices]
 assert.deepEqual(curve(data, 'expectedMinor'), recompute(delayed))
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-12': 1180000, '2027-01': 1000000 })
 assert.equal(data.cash.months.find(m => m.month === '2026-10').revenueMinor, 60000, 'The delayed milestone leaves October revenue')

 // Approved days late add the historical-timing curve and range; a collection probability scales expected cash beside the full open amount.
 const saved = data.data.clients.find(c => c.id === client.id)
 await cmd('save:clients', { id: client.id, revision: saved.revision, name: 'Northwind', paymentTermsDays: 30, daysLate: 10, collectionPercent: 50 })
 data = await read()
 assert.deepEqual(curve(data, 'expectedMinor'), recompute(delayed, { percent: 50 }))
 assert.deepEqual(curve(data, 'historicalExpectedMinor'), recompute(delayed, { late: 10, percent: 50 }))
 assert.deepEqual(curve(data, 'openMinor'), recompute(delayed))
 const december = data.cash.months.find(m => m.month === '2026-12')
 assert.equal(december.rangeLowMinor, Math.min(december.expectedMinor, december.historicalExpectedMinor)); assert.equal(december.rangeHighMinor, Math.max(december.expectedMinor, december.historicalExpectedMinor)); assert(december.rangeLowMinor < december.rangeHighMinor)
 const terms = data.cash.engagements.find(x => x.engagementId === fixed.id)
 assert.equal(terms.termsLabel, 'Net 30'); assert.equal(terms.daysLate, 10); assert(terms.daysLateApprovedBy); assert.equal(terms.collectionPercent, 50)
 // Each month's cash traces to its milestone, client terms and as-of day.
 const figure = data.lineage.find(x => x.id === 'cash:USD:2026-12:expectedMinor')
 assert.equal(figure.value, december.expectedMinor); assert(figure.sources.some(s => s.kind === 'milestones' && s.id === launch.id)); assert(figure.sources.some(s => s.kind === 'clients' && s.id === client.id)); assert.match(figure.formula, /As of 2026-10-20/)
 // A client without payment terms is placed on "Net 30 assumed", labelled, while its terms are unset.
 const bare = await cmd('save:clients', { name: 'Termless' })
 const termless = await cmd('save:engagements', { name: 'Termless fixed', clientId: bare.id, leadId: worker.id, members: [worker.id], scope: 'Fixed', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: termless.id, mode: 'fixed', amountMinor: 500000, effortSeconds: 3600, roundingSeconds: 60, reason: 'Fixed fee' }))
 const due = await cmd('save:milestones', { engagementId: termless.id, name: 'Report', due: '2026-11-16', amountMinor: 500000 }); await cmd('milestone:approve', due)
 data = await read()
 const assumed = data.cash.engagements.find(x => x.engagementId === termless.id)
 assert.equal(assumed.termsLabel, 'Net 30 assumed'); assert.equal(assumed.paymentTermsDays, 30); assert.equal(assumed.collectionPercent, 100); assert.equal(assumed.complete, true)
 assert.deepEqual(curve(data, 'openMinor'), recompute([...delayed, ['2026-11-16', 500000]]))
 assert(data.cash.months.every(m => m.complete))
 // Cash figures and client cash assumptions stay with finance.
 const lead = await h.invite('Ada'); await cmd('grant', { operatorId: lead.id, personId: worker.id, role: 'lead', enabled: true })
 const leadView = await read(lead.cookie)
 assert.equal(leadView.cash, null); assert(!leadView.lineage.some(x => x.id.startsWith('cash:')))
 assert(leadView.data.clients.every(c => c.value.daysLate === undefined && c.value.collectionPercent === undefined && c.value.paymentTermsDays === undefined))

 await revenueDashboardJourney(h,{read,worker,client,hourly,entry,asOf})

 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage(), shots = process.env.GAUGE_CASH_SHOTS
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 await page.goto(h.origin + `/app/review?from=2026-10-01&to=2026-10-31&asOf=${asOf}`)
 const section = page.locator('#cash-forecast'), text = await section.innerText()
 for (const label of [/issued receivables/i, /user-recorded/i, /historical timing/i, /weighted pipeline/i]) assert.match(text, label)
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Cash forecast fits ${width}`)
  if (shots) { await mkdir(shots, { recursive: true }); await section.screenshot({ path: `${shots}/cash-${width}.png` }); await page.locator('#project-margin').screenshot({path:`${shots}/margin-${width}.png`}); await page.locator('#revenue-dashboard').screenshot({path:`${shots}/REPORT-003-${width}.png`}) }
  const dashboard=page.locator('#revenue-dashboard');assert(await dashboard.isVisible());assert.match(await dashboard.innerText(),/Unverified|unverified/);assert.match(await dashboard.innerText(),/Unknown/)
 }
 await page.setViewportSize({ width: 1440, height: 1000 })
 await page.locator('#revenue-dashboard').getByRole('row',{name:/USD/}).locator('a[href*="wipMinor"]').click()
 assert.match(await page.locator('#report-evidence article').first().innerText(),/Hourly WIP and reimbursable expenses/)
 await section.getByRole('row', { name: /2027-01/ }).getByRole('link').nth(1).click()
 assert((await page.locator('#report-evidence article').first().innerText()).includes('Expected cash on terms'))
 // Add receivables fixtures after the existing cash/WIP controls have reconciled.
 await receivablesJourney(h,worker)
 console.log('PASS FINANCE-002 milestone delay moves expected cash as an independent FINANCE-007 recomputation; days-late range, collection probability, unset terms Net 30 assumed, booked revenue and settled cash distinct, finance-only')
} finally { await browser?.close(); await h.dispose() }
