import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

// REPORT-002: billability targets, utilization to target and realization through the
// command API, state, report CSV and the Staffing page. Called by the utilization journey.
export async function realizationJourney(h, browser) {
 const { cmd, request, owner } = h, hour = 3600, from = '2026-09-07', to = '2026-09-11', zone = 'America/New_York'
 const report = async (cookie = owner) => { const r = await request('/api/gauge/state?' + new URLSearchParams({ from, to }), cookie); assert.equal(r.status, 200); return r.json() }
 const client = await cmd('save:clients', { name: 'Harbor Outfitters', billingCurrency: 'AUD' })
 const ana = await cmd('save:people', { name: 'Ana Ruiz', timezone: zone, role: 'Designer' })
 const lee = await cmd('save:people', { name: 'Lee Park', timezone: zone, role: 'Director' })
 const leadUser = await h.invite('realization-lead'), staffUser = await h.invite('realization-staff')
 await cmd('grant', { operatorId: leadUser.id, personId: lee.id, role: 'lead', enabled: true })
 await cmd('grant', { operatorId: staffUser.id, personId: ana.id, role: 'staff', enabled: true })
 const engagement = await cmd('save:engagements', { name: 'Storefront refresh', clientId: client.id, leadId: lee.id, members: [ana.id], scope: 'Storefront design', timezone: zone })
 const terms = await cmd('save:budgets', { engagementId: engagement.id, mode: 'hourly', amountMinor: 10000000, effortSeconds: 200 * hour, roundingSeconds: 60, reason: 'Signed storefront scope' }); await cmd('budget:approve', terms)
 const task = await cmd('save:tasks', { engagementId: engagement.id, name: 'Design storefront', remainingSeconds: 0 })
 await cmd('save:rates', { personId: ana.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 15000 })
 await cmd('save:calendars', { personId: ana.id, from, to, dailySeconds: 8 * hour, weekdays: '1,2,3,4,5', timezone: zone })
 const approve = async (date, start, end, billable = true) => cmd('time:approve', await cmd('time:submit', await cmd('time:save', { engagementId: engagement.id, taskId: task.id, personId: ana.id, service: 'Design', billable, timezone: zone, start: `${date}T${start}:00-04:00`, end: `${date}T${end}:00-04:00`, notes: 'Storefront design' })))
 // 28 billable of 40 available hours, plus 4 approved nonbillable hours.
 const monday = await approve('2026-09-07', '09:00', '17:00')
 for (const date of ['2026-09-08', '2026-09-09']) await approve(date, '09:00', '17:00')
 const thursday = await approve('2026-09-10', '09:00', '11:00')
 await approve('2026-09-10', '11:00', '13:00')
 await approve('2026-09-10', '13:00', '17:00', false)

 // Finance sets effective-dated targets; leads and staff cannot.
 await cmd('target:set', { scope: 'role', role: 'Designer', percent: '80', effectiveFrom: '2026-08-01' })
 await cmd('target:set', { scope: 'person', personId: ana.id, percent: '90', effectiveFrom: '2026-10-01' })
 for (const cookie of [leadUser.cookie, staffUser.cookie]) await cmd('target:set', { scope: 'person', personId: ana.id, percent: '50', effectiveFrom: '2026-09-01' }, cookie, 403)
 await cmd('target:set', { scope: 'person', personId: ana.id, percent: '101', effectiveFrom: '2026-09-01' }, owner, 400)

 // Ten approved hours billed at standard value, then two hours written down on the billing packet.
 const packet = await cmd('packet:create', { engagementId: engagement.id, title: 'September storefront', sources: [`time:${monday.id}`, `time:${thursday.id}`] })
 await cmd('packet:approve', packet)
 let data = await report()
 const approvedPacket = data.data.packets.find(p => p.id === packet.id)
 const adjustment = await cmd('packet:adjust', { id: packet.id, revision: approvedPacket.revision, sourceKind: 'time', sourceId: monday.id, correctedAmountMinor: 90000, reason: 'Write down two hours of review rework' })
 await cmd('packet:approve', adjustment)

 let browserContext
 try {
  browserContext = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await browserContext.newPage()
  const login = async cookie => { await browserContext.clearCookies(); await browserContext.addCookies(cookie.split('; ').map(part => { const at = part.indexOf('='); return { name: part.slice(0, at), value: part.slice(at + 1), url: h.origin } })) }
  const capture = async name => { if (!process.env.GAUGE_REALIZATION_SHOTS) return; await mkdir(process.env.GAUGE_REALIZATION_SHOTS, { recursive: true }); for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await page.locator('#performance').screenshot({ path: `${process.env.GAUGE_REALIZATION_SHOTS}/${name}-${width}.png` }) } await page.setViewportSize({ width: 1280, height: 720 }) }
  const capacityUrl = (group = 'person') => h.origin + '/app/capacity?' + new URLSearchParams({ from, utilizationFrom: from, utilizationTo: to, performanceGroup: group }) + '#performance'
  // The owner sets Ana's own 75% target on the Staffing page form.
  await login(owner); await page.goto(capacityUrl())
  const targetForm = page.locator('form').filter({ has: page.locator('input[name=action][value="target:set"]') })
  await targetForm.locator('[name=scope]').selectOption('person')
  await targetForm.locator('[name=personId]').selectOption(ana.id)
  await targetForm.locator('[name=percent]').fill('75')
  await targetForm.locator('[name=effectiveFrom]').fill('2026-09-01')
  await targetForm.getByRole('button').click()
  await page.waitForURL(/saved=1/)

  data = await report()
  const person = data.performance.byPerson.find(r => r.id === ana.id)
  assert.equal(person.availableSeconds, 40 * hour); assert.equal(person.billableSeconds, 28 * hour); assert.equal(person.nonbillableSeconds, 4 * hour); assert.equal(person.approvedSeconds, 32 * hour)
  assert.equal(person.utilization.percent, 70, 'REPORT-002: 28 billable of 40 available hours is 70%')
  assert.equal(person.target.percent, 75, 'The person target in force on the last report date takes precedence over the role target')
  assert.equal(person.variancePoints, -5, 'REPORT-002: 70% against a 75% target is a −5 point variance')
  const [m] = person.money
  assert.equal(person.money.length, 1); assert.equal(m.currency, data.agency.currency)
  assert.equal(m.standardMinor, 150000, 'Ten approved hours at the 150.00/h standard rate'); assert.equal(m.billedMinor, 120000, 'Two hours written down on the packet')
  assert.equal(m.writeOffMinor, 30000); assert.equal(m.realizationPercent, 80); assert.equal(m.effectiveRateMinor, 12000, 'Realized rate is 120.00 per billed hour')
  assert.equal(m.unbilledStandardMinor, 18 * 15000, 'Approved billable time not yet billed stays separate')
  const role = data.performance.byRole.find(r => r.id === 'Designer')
  assert.equal(role.target.percent, 80); assert.equal(role.variancePoints, -10); assert.equal(role.utilization.percent, 70)
  const byClient = data.performance.byClient.find(r => r.id === client.id)
  assert.equal(byClient.billableSeconds, 28 * hour); assert.equal(byClient.availableSeconds, null); assert.equal(byClient.money[0].realizationPercent, 80)
  const period = data.performance.byPeriod.find(r => r.id === '2026-09')
  assert(period.billableSeconds >= 28 * hour)
  assert.equal(data.data.time.find(t => t.id === monday.id).value.durationSeconds, 8 * hour, 'A write-down never changes approved time')

  // Every figure is traced and exported (REPORT-005 carries over to the new figures).
  const figure = id => { const f = data.lineage.find(x => x.id === id); assert(f, `Missing figure ${id}`); return f }
  const at = `performance:byPerson:${encodeURIComponent(ana.id)}:`
  assert.equal(figure(at + 'utilizationPercent').value, 70); assert.equal(figure(at + 'variancePoints').value, -5)
  const realized = figure(`${at}${m.currency}:realizationPercent`)
  assert.equal(realized.value, 80); for (const id of [packet.id, adjustment.id, monday.id]) assert(realized.sources.some(s => s.id === id), `Realization cites ${id}`)
  assert(figure(at + 'targetPercent').sources.some(s => s.kind === 'billabilityTargets'))
  const csv = await request('/api/gauge/report.csv?' + new URLSearchParams({ from, to, fingerprint: data.fingerprint }), owner); assert.equal(csv.status, 200)
  const rows = JSON.parse(execFileSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'], { input: await csv.text(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
  for (const f of data.lineage.filter(x => x.id.startsWith('performance:'))) assert.equal(rows.find(r => r.row === 'figure' && r.figure === f.id)?.value, f.value === null ? '' : String(f.value), f.id)

  // A lead sees utilization against target but no amount, rate, cost or salary.
  const leadData = await report(leadUser.cookie), leadRow = leadData.performance.byPerson.find(r => r.id === ana.id)
  assert.equal(leadRow.utilization.percent, 70); assert.equal(leadRow.variancePoints, -5); assert.equal(leadRow.money, 'Restricted to finance')
  assert(!/Minor/.test(JSON.stringify(leadData.performance)), 'No money field reaches a lead')
  assert(!leadData.lineage.some(f => f.id.startsWith('performance:') && f.unit === 'minor'))
  assert(!/costMinor|billMinor|billRateMinor/.test(JSON.stringify(leadData.data.time)), 'Lead time records carry no rate or cost')

  // The Staffing page shows the same figures, regrouped by role.
  await page.goto(capacityUrl())
  const panel = page.locator('details#performance'), anaRow = panel.getByRole('row').filter({ hasText: 'Ana Ruiz' })
  const text = await anaRow.innerText()
  for (const expected of ['70.00%', 'Target 75.00%', '−5.00 points', 'Realization 80.00%']) assert(text.includes(expected), `Owner row shows ${expected}: ${text}`)
  await capture('realization-person')
  await panel.locator('[name=performanceGroup]').selectOption('role'); await panel.getByRole('button', { name: 'Show targets' }).click()
  assert((await page.locator('details#performance').getByRole('row').filter({ hasText: 'Designer' }).innerText()).includes('−10.00 points'))
  await login(leadUser.cookie); await page.goto(capacityUrl())
  const leadText = await page.locator('details#performance').getByRole('row').filter({ hasText: 'Ana Ruiz' }).innerText()
  assert(leadText.includes('70.00%') && leadText.includes('−5.00 points') && leadText.includes('Restricted to finance'))
  assert(!leadText.includes('Realization') && !/\$|A\$/.test(leadText), 'The lead page shows no amounts')
  assert.equal(await page.locator('input[name=action][value="target:set"]').count(), 0, 'Only finance sees the target form')
  await capture('realization-lead')
  console.log('PASS REPORT-002 effective-dated person/role billability targets (finance only), 28/40 = 70% vs 75% = −5 points, 10 h standard then 2 h write-down = 80% realization at 120.00/h, nonbillable and unbilled separate, role/client/period groups, traced CSV, lead view without amounts')
 } finally { await browserContext?.close() }
}
