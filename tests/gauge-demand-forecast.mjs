import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// RESOURCE-005 / RESOURCE-008 resource demand forecast as of 20 October 2026, through the command and state doors and Week in review.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 const { cmd, request, owner } = h, zone = 'America/New_York', hour = 3600
 const read = async (cookie = owner) => { const r = await request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-20', cookie); assert.equal(r.status, 200); return r.json() }
 const weekdays = (from, to) => { let n = 0; for (let ms = Date.parse(from); ms <= Date.parse(to); ms += 86400000) { const d = new Date(ms).getUTCDay(); if (d >= 1 && d <= 5) n++ } return n }
 const client = await cmd('save:clients', { name: 'Northwind Outfitters' })
 const ada = await cmd('save:people', { name: 'Ada Ruiz', timezone: zone })
 const cy = await cmd('save:people', { name: 'Cy Freelance', timezone: zone, employmentType: 'contractor' })
 for (const [from, to] of [['2026-10-01', '2027-09-30'], ['2027-10-01', '2027-12-31']]) await cmd('save:calendars', { personId: ada.id, from, to, dailySeconds: 8 * hour, weekdays: '1,2,3,4,5', timezone: zone })
 for (const [from, to] of [['2026-10-01', '2027-09-30'], ['2027-10-01', '2027-12-31']]) await cmd('save:calendars', { personId: cy.id, from, to, dailySeconds: 4 * hour, weekdays: '1,2,3,4,5', timezone: zone })
 await cmd('save:rates', { personId: ada.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 15000 })
 const eng = await cmd('save:engagements', { name: 'Outfitters site', clientId: client.id, leadId: ada.id, members: [ada.id], scope: 'Site build', timezone: zone })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: eng.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 360000, roundingSeconds: 60, reason: 'Signed SOW' }))
 // Committed: 20 hours 2–6 November; an unfilled role of 10 hours 9–13 November; open pipeline of 40 hours at 50%, 16–20 November.
 await cmd('save:staffing', { personId: ada.id, engagementId: eng.id, service: 'Build', from: '2026-11-02', to: '2026-11-06', dailySeconds: 4 * hour, commitment: 'committed' })
 await cmd('save:resourceRequests', { engagementId: eng.id, role: 'QA tester', skill: 'QA', minProficiency: 2, from: '2026-11-09', to: '2026-11-13', dailySeconds: 2 * hour, service: 'QA' })
 let deal = await cmd('save:opportunities', { name: 'Winter launch', clientId: client.id, ownerId: ada.id, stage: 'proposal', probability: 50, from: '2026-11-16', to: '2026-11-20', services: 'Design, Research', amountMinor: 1000000, demandSeconds: 40 * hour })

 let data = await read(), f = data.demandForecast
 const month = (rows, m) => rows.find(r => r.month === m)
 assert.equal(f.asOf, '2026-10-20'); assert.deepEqual(f.labels, { committed: 'committed', tentative: '+ tentative', pipeline: '+ weighted pipeline' })
 let nov = month(f.baseline.months, '2026-11')
 assert.equal(nov.committedSeconds, 20 * hour); assert.equal(nov.unfilledSeconds, 10 * hour); assert.equal(nov.committedDemandSeconds, 30 * hour)
 assert.equal(nov.weightedPipelineSeconds, 20 * hour, 'Weighted pipeline demand is a labelled addition outside committed demand')
 assert.equal(nov.employeeCapacitySeconds, 21 * 8 * hour); assert.equal(nov.contractorCapacitySeconds, 21 * 4 * hour, 'Contractor capacity is shown apart from employees')
 assert.equal(month(f.baseline.months, '2026-10').employeeCapacitySeconds, weekdays('2026-10-21', '2026-10-31') * 8 * hour, 'Capacity counts only days after the as-of date')
 // Priced on the FINANCE-006 / FINANCE-018 / FINANCE-019 basis: November committed fees and cost equal the committed forecast month; pipeline fees stay separate.
 const forecastNov = data.forecast.engagements.find(x => x.engagementId === eng.id).months.find(m => m.month === '2026-11')
 assert.equal(nov.committedFeesMinor, 300000); assert.equal(nov.committedFeesMinor, forecastNov.committedFeesMinor); assert.equal(nov.committedCostMinor, 180000); assert.equal(nov.marginMinor, 120000)
 assert.equal(nov.weightedPipelineFeesMinor, 500000)
 assert(f.incomplete.some(x => x.includes('Unfilled roles')), 'Unpriced unfilled roles are named, never priced at zero silently')
 const baseline = JSON.stringify(f.baseline)

 // Finance prepares three scenarios; leads cannot, and only the owner approves.
 const finance = await h.invite('finance'), financePerson = await cmd('save:people', { name: 'Fin Lee', timezone: zone }); await cmd('grant', { operatorId: finance.id, personId: financePerson.id, role: 'finance', enabled: true })
 const lead = await h.invite('lead'); await cmd('grant', { operatorId: lead.id, personId: ada.id, role: 'lead', enabled: true })
 const scenario = (name, extra) => ({ opportunityId: deal.id, name, reason: 'Staffing the Winter launch', ...extra })
 await cmd('save:demandScenarios', scenario('Lead try', { costPerHourMinor: 9000 }), lead.cookie, 403)
 const contractor = await cmd('save:demandScenarios', scenario('Contractor', { costPerHourMinor: 10000, supply: { type: 'contractor', label: 'Freelance designer', from: '2026-11-16', to: '2026-11-20', dailySeconds: 8 * hour } }), finance.cookie)
 const hire = await cmd('save:demandScenarios', scenario('Planned hire', { costPerHourMinor: 6000, supply: { type: 'hire', label: 'Designer hire', from: '2026-11-16', dailySeconds: 8 * hour } }), finance.cookie)
 const delayed = await cmd('save:demandScenarios', scenario('Delayed start', { costPerHourMinor: 9000, delayDays: 28 }), finance.cookie)
 data = await read(); f = data.demandForecast
 assert(f.scenarios.every(s => !s.compared && s.reason === 'Awaiting owner approval'), 'Drafts are not compared until the owner approves')
 await cmd('demandScenario:approve', contractor, finance.cookie, 403)
 for (const s of [contractor, hire, delayed]) await cmd('demandScenario:approve', s)
 const approvedRow = (await read()).data.demandScenarios.find(r => r.id === contractor.id)
 await cmd('save:demandScenarios', { ...approvedRow.value, id: approvedRow.id, revision: approvedRow.revision }, finance.cookie, 409)
 data = await read(); f = data.demandForecast
 assert.equal(JSON.stringify(f.baseline), baseline, 'Preparing and approving scenarios never changes the baseline')
 assert.equal(data.data.staffing.length, 1); assert.equal(data.data.people.length, 3)
 const s = id => f.scenarios.find(x => x.id === id)
 assert.deepEqual(s(contractor.id).delta, { capacitySeconds: 40 * hour, demandSeconds: 40 * hour, feesMinor: 1000000, costMinor: 400000, marginMinor: 600000 })
 assert.equal(month(s(contractor.id).months, '2026-11').gapSeconds, nov.capacitySeconds - nov.committedDemandSeconds, 'The contractor covers exactly the deal hours')
 const hireSeconds = weekdays('2026-11-16', '2027-10-21') * 8 * hour
 assert.deepEqual(s(hire.id).delta, { capacitySeconds: hireSeconds, demandSeconds: 40 * hour, feesMinor: 1000000, costMinor: hireSeconds / hour * 6000, marginMinor: 1000000 - hireSeconds / hour * 6000 })
 assert.deepEqual(s(delayed.id).delta, { capacitySeconds: 0, demandSeconds: 40 * hour, feesMinor: 1000000, costMinor: 360000, marginMinor: 640000 })
 assert.equal(s(delayed.id).from, '2026-12-14'); assert.equal(month(s(delayed.id).months, '2026-12').dealDemandSeconds, 40 * hour); assert.equal(month(s(delayed.id).months, '2026-11').dealDemandSeconds, 0)
 // REPORT-005: every month and scenario figure drills to its formula and source rows, and the exported CSV reconciles to the screen.
 const figure = (id) => data.lineage.find(x => x.id === id)
 for (const m of f.baseline.months) for (const k of ['committedDemandSeconds', 'unfilledSeconds', 'tentativeSeconds', 'weightedPipelineSeconds', 'employeeCapacitySeconds', 'contractorCapacitySeconds', 'committedFeesMinor', 'marginMinor']) assert.equal(figure(`demand:${m.month}:${k}`).value, m[k], `${m.month} ${k} equals its screen figure`)
 const novFigure = k => figure(`demand:2026-11:${k}`), kinds = (x, kind) => x.sources.filter(r => r.kind === kind).map(r => r.id)
 assert.equal(kinds(novFigure('committedSeconds'), 'staffing').length, 1); assert.equal(kinds(novFigure('unfilledSeconds'), 'resourceRequests').length, 1)
 assert.deepEqual(kinds(novFigure('weightedPipelineSeconds'), 'opportunities'), [deal.id]); assert.deepEqual(kinds(novFigure('committedFeesMinor'), 'engagements'), [eng.id])
 assert(kinds(novFigure('contractorCapacitySeconds'), 'calendars').length > 0 && kinds(novFigure('contractorCapacitySeconds'), 'people').includes(cy.id))
 for (const id of [contractor.id, hire.id, delayed.id]) for (const k of ['capacitySeconds', 'demandSeconds', 'feesMinor', 'costMinor', 'marginMinor']) {
  const x = figure(`demand:scenario:${id}:${k}`); assert.equal(x.value, s(id).delta[k]); assert(kinds(x, 'demandScenarios').includes(id) && kinds(x, 'opportunities').includes(deal.id), 'a scenario delta names its scenario and deal')
 }
 const exported = await request('/api/gauge/report.csv?' + new URLSearchParams({ from: data.from, to: data.to, asOf: f.asOf, fingerprint: data.fingerprint }), owner); assert.equal(exported.status, 200)
 const rows = JSON.parse(execFileSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'], { input: await exported.text(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
 const exportedValue = id => Number(rows.find(r => r.row === 'figure' && r.figure === id).value)
 assert.equal(exportedValue('demand:2026-11:committedSeconds') + exportedValue('demand:2026-11:unfilledSeconds') + exportedValue('demand:2026-11:wonSeconds'), exportedValue('demand:2026-11:committedDemandSeconds'), 'Exported components reconcile to the exported committed demand')
 assert.equal(exportedValue('demand:2026-11:committedFeesMinor') - exportedValue('demand:2026-11:committedCostMinor'), exportedValue('demand:2026-11:marginMinor'))
 assert.equal(exportedValue(`demand:scenario:${contractor.id}:marginMinor`), 600000)
 assert(rows.some(r => r.row === 'source' && r.figure === 'demand:2026-11:unfilledSeconds' && r['source kind'] === 'resourceRequests'), 'Exported figures carry their source rows')
 const leadView = await read(lead.cookie)
 assert.equal(leadView.demandForecast, null); assert.equal(leadView.data.demandScenarios.length, 0)
 assert.equal((await request(`/api/gauge/history/demandScenarios/${hire.id}`, lead.cookie)).status, 403)

 // Finance and the owner read it on Week in review at desktop and phone widths.
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage(), shots = process.env.GAUGE_DEMAND_SHOTS
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 await page.goto(h.origin + '/app/review')
 const section = page.locator('#demand-forecast'), text = await section.innerText()
 for (const label of ['Contractor capacity', '+ weighted pipeline', 'Planned hire', 'Delayed start', 'Margin vs baseline']) assert(text.includes(label), `Review shows ${label}`)
 await section.getByRole('row').filter({ hasText: '2026-11' }).getByRole('link').first().click()
 const drilled = page.locator('#report-evidence'); await drilled.waitFor()
 assert((await drilled.innerText()).includes('Committed') && (await drilled.locator('a[href*="/api/gauge/history/"]').count()) > 0, 'A month figure opens its formula and source rows')
 await page.goto(h.origin + '/app/review')
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Demand forecast fits ${width}`)
  if (shots) { await mkdir(shots, { recursive: true }); await section.screenshot({ path: `${shots}/demand-${width}.png` }) }
 }

 // Closing the deal as won moves its demand into committed once: first as won backlog, then as converted open roles.
 const row = (await read()).data.opportunities.find(r => r.id === deal.id)
 await cmd('save:opportunities', { ...row.value, id: row.id, revision: row.revision, stage: 'won', probability: 100 })
 f = (await read()).demandForecast; nov = month(f.baseline.months, '2026-11')
 assert.equal(nov.wonSeconds, 40 * hour); assert.equal(nov.committedDemandSeconds, 70 * hour); assert.equal(nov.weightedPipelineSeconds, 0)
 assert(f.scenarios.every(x => !x.compared && /won/.test(x.reason)), 'A won deal is committed backlog; its scenarios no longer add it')
 const won = (await read()).data.opportunities.find(r => r.id === deal.id)
 await cmd('opportunity:convert', won); await cmd('opportunity:convert', won)
 f = (await read()).demandForecast; nov = month(f.baseline.months, '2026-11')
 assert.equal(nov.wonSeconds, 0); assert.equal(nov.unfilledSeconds, 50 * hour); assert.equal(nov.committedDemandSeconds, 70 * hour, 'Converted demand counts once, as open roles')
 assert.deepEqual(f.unplaced, [])
 console.log('PASS RESOURCE-005 / RESOURCE-008 monthly committed, unfilled, contractor and weighted pipeline demand on the FINANCE-006 / FINANCE-018 / FINANCE-019 basis, owner-approved hire/contractor/delayed-start scenarios beside an untouched baseline, won demand moving to committed once')
} finally { await browser?.close(); await h.dispose() }
