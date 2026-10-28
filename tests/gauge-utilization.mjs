import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { appApiJourney } from './gauge-app-api.mjs'
import { realizationJourney } from './gauge-realization.mjs'

// RESOURCE-004: one journey through real commands, the emitted Worker and its forms.
const h = await harness(), from = '2026-10-05', to = '2026-10-11', hour = 3600
let browser
try {
 const { cmd, request, owner } = h
 const report = async (cookie = owner, start = from, end = to) => {
  const response = await request('/api/gauge/state?' + new URLSearchParams({ from: start, to: end }), cookie)
  assert.equal(response.status, 200)
  return response.json()
 }
 const row = (rows, id) => { const found = rows.find(r => r.id === id); assert(found, `Missing utilization group ${id}`); return found }
 const ratio = (r, key, numerator, denominator) => {
  assert.equal(r.ratios[key].numeratorSeconds, numerator * hour, key)
  assert.equal(r.ratios[key].denominatorSeconds, denominator === null ? null : denominator * hour, key)
  if (denominator === null || denominator === 0) assert.equal(r.ratios[key].percent, null, key)
  else assert(Math.abs(r.ratios[key].percent - numerator / denominator * 100) < 1e-8, key)
 }
 const client = await cmd('save:clients', { name: 'Cascade Cider' })
 const person = await cmd('save:people', { name: 'Mia Chen', timezone: 'Australia/Brisbane' })
 const zero = await cmd('save:people', { name: 'Zero availability', timezone: 'Australia/Brisbane' })
 const missing = await cmd('save:people', { name: 'Unsupplied calendar', timezone: 'Australia/Brisbane' })
 const other = await cmd('save:people', { name: 'Unrelated lead', timezone: 'Australia/Brisbane' })
 const staff = await h.invite('utilization-staff')
 await cmd('grant', { operatorId: staff.id, personId: person.id, role: 'staff', enabled: true })
 const engagement = await cmd('save:engagements', { name: 'Launch delivery', clientId: client.id, leadId: person.id, members: [person.id], scope: 'Campaign delivery', timezone: 'Australia/Brisbane' })
 const task = await cmd('save:tasks', { engagementId: engagement.id, name: 'Deliver campaign', remainingSeconds: 0 })
 const terms = await cmd('save:budgets', { engagementId: engagement.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 40 * hour, roundingSeconds: 60, reason: 'Signed delivery scope' })
 await cmd('budget:approve', terms)
 await cmd('save:rates', { personId: person.id, service: '*', effective: '2026-01-01', costMinor: 8000, billMinor: 15000 })
 // This person's explicit six-day week is 48h gross, less 8h holiday and 8h leave.
 const calendar = await cmd('save:calendars', { personId: person.id, from, to, dailySeconds: 8 * hour, weekdays: '1,2,3,4,5,6', holidays: ['2026-10-05'], timezone: 'Australia/Brisbane' })
 const leave = await cmd('save:leave', { personId: person.id, from: '2026-10-06', to: '2026-10-06', dailySeconds: 8 * hour, note:'Personal time' })
 await cmd('leave:decide',{...leave,outcome:'approved'})
 await cmd('save:calendars', { personId: zero.id, from, to, dailySeconds: 0, weekdays: '1,2,3,4,5', holidays: '2026-10-05, 2026-10-06', timezone: 'Australia/Brisbane' })
 await cmd('save:calendars', { personId: zero.id, from: '2026-10-12', to: '2026-10-12', dailySeconds: 0, weekdays: '1', holidays: ['2026-10-11'], timezone: 'Australia/Brisbane' }, owner, 400)
 const strategy = await cmd('save:staffing', { engagementId: engagement.id, personId: person.id, from: '2026-10-07', to: '2026-10-10', dailySeconds: 6 * hour, commitment: 'committed', service: 'Strategy' })
 const design = await cmd('save:staffing', { engagementId: engagement.id, personId: person.id, from: '2026-10-06', to: '2026-10-06', dailySeconds: 6 * hour, commitment: 'committed', service: 'Design', billable: true })
 const tentative = await cmd('save:staffing', { engagementId: engagement.id, personId: person.id, from: '2026-10-07', to: '2026-10-07', dailySeconds: 4 * hour, commitment: 'tentative', service: 'Strategy', billable: true })
 const saveTime = async (eng, workTask, date, start, end, service, billable = true) => cmd('time:save', { engagementId: eng.id, taskId: workTask.id, personId: person.id, service, billable, timezone: 'Australia/Brisbane', start: `${date}T${start}:00+10:00`, end: `${date}T${end}:00+10:00`, notes: 'Utilization source' })
 const approved = []
 for (const [date, service] of [['2026-10-07', 'Strategy'], ['2026-10-08', 'Strategy'], ['2026-10-09', 'Design']]) {
  const entry = await saveTime(engagement, task, date, '09:00', '17:00', service)
  approved.push(await cmd('time:approve', await cmd('time:submit', entry)))
 }
 const pending = await cmd('time:submit', await saveTime(engagement, task, '2026-10-10', '09:00', '13:00', 'Design'))
 let data = await report(), utilization = data.utilization, baseline = row(utilization.byPerson, person.id)
 assert.equal(data.data.engagements.find(r => r.id === engagement.id).value.type, 'client', 'Existing client commands default to client work')
 assert.equal(data.data.staffing.find(r => r.id === strategy.id).value.billable, true)
 assert.equal(baseline.availableSeconds, 32 * hour)
 assert.equal(baseline.missingCalendarDays, 0)
 assert.equal(baseline.varianceSeconds, -2 * hour, 'Variance compares recorded with committed scheduled hours')
 for (const [key, hours] of Object.entries({ scheduledSeconds: 30, scheduledBillableSeconds: 30, tentativeSeconds: 4, tentativeBillableSeconds: 4, recordedSeconds: 28, recordedBillableSeconds: 28, submittedSeconds: 4, submittedBillableSeconds: 4, approvedSeconds: 24, approvedBillableSeconds: 24 })) assert.equal(baseline[key], hours * hour, key)
 for (const [key, numerator, denominator] of [['scheduledBillableCapacity', 30, 32], ['scheduledTotalCapacity', 30, 32], ['recordedBillableCapacity', 28, 32], ['recordedTotalCapacity', 28, 32], ['submittedBillableCapacity', 4, 32], ['submittedTotalCapacity', 4, 32], ['approvedBillableCapacity', 24, 32], ['approvedTotalCapacity', 24, 32], ['approvedBillableScheduled', 24, 30], ['approvedBillableScheduledIncludingTentative', 24, 34]]) ratio(baseline, key, numerator, denominator)
 assert.deepEqual(new Set(baseline.sources.staffing), new Set([strategy.id, design.id, tentative.id]))
 assert.deepEqual(new Set(baseline.sources.time), new Set([...approved.map(r => r.id), pending.id]))
 const capacity = row(data.capacity.map(r => ({ ...r, id: r.personId })), person.id)
 assert.equal(capacity.days.find(d => d.date === '2026-10-05').availableSeconds, 0)
 assert.equal(capacity.days.find(d => d.date === '2026-10-06').availableSeconds, 0)
 assert(capacity.days.find(d => d.date === '2026-10-06').leaveSources.includes(leave.id))

 browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}), headless: true, args: ['--use-mock-keychain', '--password-store=basic',...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?['--no-sandbox']:[])] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 const capture = async name => {
  if (!process.env.GAUGE_UTILIZATION_SHOTS) return
  await mkdir(process.env.GAUGE_UTILIZATION_SHOTS, { recursive: true })
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits ${width}`)
   await page.screenshot({ path: `${process.env.GAUGE_UTILIZATION_SHOTS}/${name}-${width}.png`, fullPage: true })
   const focus=page.locator(name.startsWith('utilization-key')?'#api-keys':name.startsWith('internal')?'form:has(input[value="save:engagements"])':'#utilization')
   await focus.scrollIntoViewIfNeeded(); await page.screenshot({path:`${process.env.GAUGE_UTILIZATION_SHOTS}/${name}-viewport-${width}.png`})
  }
 }
 await page.goto(h.origin + '/app/engagements')
 const form = page.locator('form').filter({ has: page.locator('input[name=action][value="save:engagements"]') })
 await form.getByLabel('Engagement name', { exact: true }).fill('Internal training')
 await form.locator('[name=type]').selectOption('internal')
 await form.locator('[name=internalCategory]').selectOption('training')
 await form.locator('[name=clientId]').selectOption('')
 await form.locator('[name=leadId]').selectOption(person.id)
 await form.locator(`[name=members][value="${person.id}"]`).check()
 await form.getByLabel('Agreed scope', { exact: true }).fill('Professional development')
 await capture('internal-engagement-form')
 await form.getByRole('button', { name: 'Save', exact: true }).click()
 data = await report()
 const internal = data.data.engagements.find(r => r.value.name === 'Internal training')
 assert(internal, 'The real engagement form creates internal work without a client')
 assert.equal(internal.value.type, 'internal'); assert.equal(internal.value.internalCategory, 'training'); assert(!internal.value.clientId)
 await cmd('save:engagements', { ...internal.value, id: internal.id, revision: internal.revision, type: 'client', clientId: client.id }, owner, 400)
 await cmd('save:engagements', { ...internal.value, name: 'Invalid internal client', clientId: client.id }, owner, 400)
 const internalTask = await cmd('save:tasks', { engagementId: internal.id, name: 'Skills workshop', remainingSeconds: 0 })
 await cmd('save:staffing', { engagementId: internal.id, personId: person.id, from: '2026-10-10', to: '2026-10-10', dailySeconds: 2 * hour, commitment: 'committed', service: 'Training', billable: true }, owner, 400)
 const trainingAllocation = await cmd('save:staffing', { engagementId: internal.id, personId: person.id, from: '2026-10-10', to: '2026-10-10', dailySeconds: 2 * hour, commitment: 'committed', service: 'Training', billable: false })
 await cmd('time:save', { personId: person.id, engagementId: internal.id, taskId: internalTask.id, service: 'Training', billable: true, timezone: 'Australia/Brisbane', start: '2026-10-10T14:00:00+10:00', end: '2026-10-10T16:00:00+10:00' }, owner, 400)
 const training = await cmd('time:approve', await cmd('time:submit', await saveTime(internal, internalTask, '2026-10-10', '14:00', '16:00', 'Training', false)))
 data = await report(); utilization = data.utilization
 const actual = row(utilization.byPerson, person.id)
 assert.equal(actual.scheduledSeconds, 32 * hour); assert.equal(actual.recordedSeconds, 30 * hour); assert.equal(actual.approvedSeconds, 26 * hour)
 assert.equal(actual.varianceSeconds, -2 * hour)
 assert.equal(actual.scheduledBillableSeconds, baseline.scheduledBillableSeconds); assert.equal(actual.recordedBillableSeconds, baseline.recordedBillableSeconds); assert.equal(actual.approvedBillableSeconds, baseline.approvedBillableSeconds)
 ratio(actual, 'approvedTotalCapacity', 26, 32); ratio(actual, 'approvedBillableCapacity', 24, 32)
 assert.equal(data.data.budgets.filter(r => r.value.engagementId === internal.id).length, 0, 'Internal approval needs no commercial terms')
 assert.equal(row(utilization.byProject, engagement.id).availableSeconds, 32 * hour, 'Two services share one person capacity denominator')
 for (const [service, scheduled, recorded, submitted, approvedHours] of [['Strategy', 24, 16, 0, 16], ['Design', 6, 12, 4, 8], ['Training', 2, 2, 0, 2]]) {
  const group = row(utilization.byService, service)
  assert.deepEqual([group.scheduledSeconds, group.recordedSeconds, group.submittedSeconds, group.approvedSeconds, group.availableSeconds], [scheduled, recorded, submitted, approvedHours, 32].map(n => n * hour))
 }
 const detail = utilization.details.find(r => r.personId === person.id && r.engagementId === internal.id && r.service === 'Training')
 assert(detail); assert.deepEqual(detail.sources.time, [training.id]); assert.deepEqual(detail.sources.staffing, [trainingAllocation.id])

 // Zero is a known denominator; a missing calendar remains unknown even with demand.
 const edge = await cmd('save:engagements', { name: 'Capacity edge work', clientId: client.id, leadId: other.id, members: [zero.id, missing.id], scope: 'Availability planning', timezone: 'Australia/Brisbane' })
 for (const p of [zero, missing]) await cmd('save:staffing', { engagementId: edge.id, personId: p.id, from: '2026-10-07', to: '2026-10-07', dailySeconds: hour, commitment: 'committed' })
 data = await report(); utilization = data.utilization
 const zeroRow = row(utilization.byPerson, zero.id), unknownRow = row(utilization.byPerson, missing.id)
 assert.equal(zeroRow.availableSeconds, 0); assert.equal(zeroRow.missingCalendarDays, 0); ratio(zeroRow, 'scheduledBillableCapacity', 1, 0)
 assert.equal(unknownRow.availableSeconds, null); assert.equal(unknownRow.missingCalendarDays, 7); ratio(unknownRow, 'scheduledBillableCapacity', 1, null)
 assert.equal(row(utilization.byProject, edge.id).availableSeconds, null)
 const unspecified = row(utilization.byService, 'Unspecified')
 assert.equal(unspecified.scheduledBillableSeconds, 2 * hour); assert.equal(unspecified.availableSeconds, null)

 // Recorded includes completed drafts, but only authorized sources enter a scoped report.
 const hidden = await cmd('save:engagements', { name: 'Restricted planning', clientId: client.id, leadId: other.id, members: [], scope: 'Private planning', timezone: 'Australia/Brisbane' })
 const hiddenTask = await cmd('save:tasks', { engagementId: hidden.id, name: 'Private review', remainingSeconds: 0 })
 const hiddenTime = await saveTime(hidden, hiddenTask, '2026-10-05', '09:00', '10:00', 'Strategy')
 data = await report()
 assert.equal(row(data.utilization.byPerson, person.id).recordedSeconds, 31 * hour, 'Completed draft contributes recorded hours')
 const scoped = await report(staff.cookie), scopedPerson = row(scoped.utilization.byPerson, person.id)
 assert.equal(scopedPerson.recordedSeconds, 30 * hour)
 assert(!JSON.stringify(scoped.utilization).includes(hidden.id)); assert(!JSON.stringify(scoped.utilization).includes(hiddenTime.id))
 assert(!JSON.stringify(scoped).includes('costMinor')); assert.deepEqual(scoped.data.rates, [])
 const csvPath = r => '/api/gauge/report.csv?' + new URLSearchParams({ from: r.from, to: r.to, fingerprint: r.fingerprint })
 const csv = await request(csvPath(data), owner); assert.equal(csv.status, 200)
 const rows = JSON.parse(execFileSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'], { input: await csv.text(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
 const utilizationFigures = data.lineage.filter(f => f.id.startsWith('utilization:'))
 assert(utilizationFigures.length > 0, 'Utilization exports use the same report evidence')
 for (const figure of utilizationFigures) {
  const exported = rows.find(r => r.row === 'figure' && r.figure === figure.id)
  assert(exported); assert.equal(exported.value, figure.value === null ? '' : String(figure.value))
  for (const source of figure.sources) assert(rows.some(r => r.row === 'source' && r.figure === figure.id && r['source id'] === source.id && r['source revision'] === source.revision))
 }
 for (const id of [calendar.id, leave.id, strategy.id, design.id, tentative.id, pending.id, approved[0].id, training.id]) assert(rows.some(r => r.row === 'source' && r.figure.startsWith('utilization:') && r['source id'] === id), `Export includes utilization source ${id}`)
 assert.equal((await request(csvPath(data), staff.cookie)).status, 409)
 const scopedCsv = await request(csvPath(scoped), staff.cookie); assert.equal(scopedCsv.status, 200)
 const scopedText = await scopedCsv.text(); assert(!/costMinor|billRateMinor/.test(scopedText)); assert(!scopedText.includes(hiddenTime.id))

 const capacityUrl = group => h.origin + '/app/capacity?' + new URLSearchParams({ from: '2026-11-02', utilizationFrom: from, utilizationTo: to, utilizationGroup: group }) + '#utilization'
 for (const [group, name] of [['person', 'Mia Chen'], ['service', 'Training'], ['project', 'Launch delivery'], ['detail', 'Training']]) {
  if (group === 'person') await page.goto(capacityUrl(group))
  else {
   const filters = page.locator('#utilization form').filter({ has: page.locator('[name=utilizationGroup]') })
   await filters.locator('[name=utilizationGroup]').selectOption(group)
   await filters.getByRole('button').click()
  }
  const panel = page.locator('details#utilization')
  assert.notEqual(await panel.getAttribute('open'), null)
  assert.equal(await panel.locator('[name=utilizationFrom]').inputValue(), from)
  assert.equal(await panel.locator('[name=utilizationTo]').inputValue(), to)
  assert.equal(await panel.locator('[name=utilizationGroup]').inputValue(), group)
  assert(await panel.getByRole('row').filter({ hasText: name }).count() > 0, `${group} table has the selected dimension`)
  if (group === 'person') {
   const personRow = panel.getByRole('row').filter({ hasText: 'Mia Chen' })
   const text = await personRow.innerText()
   for (const hours of [32, 31, 4, 26]) assert(new RegExp(`\\b${hours}(?:\\.0+)?\\s*h\\b`).test(text), `Person table displays ${hours} hours`)
   for (const [numerator, denominator] of [[30, 32], [24, 32], [24, 36]]) assert(new RegExp(`\\b${numerator}\\s*h\\s*/\\s*${denominator}\\s*h\\b`).test(text), `Visible ratio states ${numerator}/${denominator}, including tentative scheduling`)
   const calendarForm = page.locator('form').filter({ has: page.locator('input[name=action][value="save:calendars"]') })
   assert(await calendarForm.getByLabel('Holiday dates (comma-separated)', { exact: true }).isVisible())
   const staffingForm = page.locator('form').filter({ has: page.locator('input[name=action][value="save:staffing"]') })
   assert(await staffingForm.getByLabel('Service', { exact: true }).isVisible())
   assert(await staffingForm.getByLabel('Billable allocation', { exact: true }).isVisible())
   await capture('utilization-person')
  }
  if (group === 'detail') {
   for (const summary of await panel.getByText('Source records', { exact: true }).all()) await summary.click()
   for (const [kind, ids] of [['staffing', [strategy.id, design.id, tentative.id]], ['time', [pending.id, approved[0].id, training.id]]]) for (const id of ids) {
    const link = panel.locator(`a[href*="edit=${id}"]`).first()
    assert(await link.isVisible(), `Visible ${kind} drill-through ${id}`)
    const url = new URL(await link.getAttribute('href'), h.origin)
    assert.equal(url.pathname, kind === 'staffing' ? '/app/capacity' : '/app/time')
    assert.equal((await request(url.pathname + url.search, owner)).status, 200)
   }
   await capture('utilization-detail-sources')
   await panel.locator(`a[href*="edit=${training.id}"]`).first().click()
   await page.waitForURL(`**/app/time?edit=${training.id}`)
   assert(await page.locator(`[id="${training.id}"]`).isVisible(), 'Drill opens the actual approved time record')
  }
 }
 await cmd('leave:decide',{...await cmd('save:leave', { personId: person.id, from: '2026-10-07', to: '2026-10-07', dailySeconds: hour, note:'Personal time' }),outcome:'approved'})
 assert.equal((await request(csvPath(data), owner)).status, 409, 'Changed utilization denominator refuses an old export snapshot')
 assert.equal(row((await report()).utilization.byPerson, person.id).availableSeconds, 31 * hour)
 // CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032 utilization key (ct 19 Oct 12:43Z): owner-created, shown once, SHA-256 at rest, read-only,
 // scoped to the aggregate state answer, audited and revocable.
 const keyed = (token, path = '/api/gauge/state?' + new URLSearchParams({ from, to }), options = {}) => request(path, '', { ...options, headers: { authorization: `Bearer ${token}`, ...options.headers } })
 await cmd('apikey:create', { label: 'Staff attempt' }, staff.cookie, 403)
 await page.goto(h.origin + '/app/access')
 const keyForm = page.locator('form').filter({ has: page.locator('input[name=action][value="apikey:create"]') })
 await keyForm.getByLabel('Key label (where it is used)', { exact: true }).fill('Easel revenue model')
 await keyForm.getByRole('button', { name: 'Create key', exact: true }).click()
 const token = await page.getByLabel('New utilization key', { exact: true }).inputValue()
 assert.match(token, /^gauge_util_[A-Za-z0-9_-]{43}$/)
 await capture('utilization-key-created')
 await page.reload(); assert.equal(await page.getByLabel('New utilization key', { exact: true }).count(), 0, 'Reloading never shows the key again')
 const stored = await h.db.prepare('SELECT id,hash,label,scope FROM g_api_keys').all()
 assert.equal(stored.results.length, 1); assert.equal(stored.results[0].hash, createHash('sha256').update(token).digest('hex')); assert.equal(stored.results[0].scope, 'utilization:read')
 for (const table of ['g_api_keys', 'g_api_key_audit', 'g_receipts', 'g_history']) assert(!JSON.stringify((await h.db.prepare(`SELECT * FROM ${table}`).all()).results).includes(token), `${table} never stores the key`)
 const requestKey = randomUUID(), first = await h.post('/api/gauge/command', { key: requestKey, action: 'apikey:create', label: 'Replay check' }, owner), firstBody = await first.json()
 assert.equal(first.status, 200); assert.match(firstBody.token, /^gauge_util_/)
 const replay = await (await h.post('/api/gauge/command', { key: requestKey, action: 'apikey:create', label: 'Replay check' }, owner)).json()
 assert.equal(replay.id, firstBody.id); assert.equal(replay.token, undefined, 'A replayed create never shows the key again')
 const owned = await report(), keyResponse = await keyed(token)
 assert.equal(keyResponse.status, 200); const aggregate = await keyResponse.json()
 assert.deepEqual(Object.keys(aggregate).sort(), ['approvedBillableSeconds', 'asOf', 'availableSeconds', 'from', 'knownAvailableSeconds', 'missingCalendarDays', 'participantCount', 'scope', 'to'])
 assert.equal(aggregate.participantCount, owned.data.people.length); assert.equal(aggregate.participantCount, 4)
 assert.equal(aggregate.knownAvailableSeconds, owned.capacity.reduce((n, c) => n + c.knownAvailableSeconds, 0)); assert.equal(aggregate.knownAvailableSeconds, 31 * hour)
 assert.equal(aggregate.missingCalendarDays, 14); assert.equal(aggregate.availableSeconds, null, 'A missing calendar leaves available capacity unknown, never zero')
 assert.equal(aggregate.approvedBillableSeconds, owned.utilization.details.reduce((n, d) => n + d.approvedBillableSeconds, 0)); assert.equal(aggregate.approvedBillableSeconds, 24 * hour, 'Approved internal training is not billable; drafts and submitted time do not count')
 for (const p of owned.data.people) assert(!JSON.stringify(aggregate).includes(p.value.name) && !JSON.stringify(aggregate).includes(p.id), 'Aggregate names no person')
 assert(!/Minor|rate|cost|pay/i.test(JSON.stringify(aggregate)), 'Aggregate carries no pay, rate or cost')
 for (const p of [missing, other]) await cmd('save:calendars', { personId: p.id, from, to, dailySeconds: 4 * hour, weekdays: '1,2,3,4,5', holidays: [], timezone: 'Australia/Brisbane' })
 const known = await (await keyed(token)).json()
 assert.equal(known.missingCalendarDays, 0); assert.equal(known.availableSeconds, (31 + 2 * 5 * 4) * hour); assert.equal(known.availableSeconds, (await report()).capacity.reduce((n, c) => n + c.availableSeconds, 0))
 assert.equal((await keyed(token, '/api/gauge/state?from=2026-10-01')).status, 400, 'A keyed read names its inclusive window')
 assert.equal((await keyed(token, '/api/gauge/report.csv?' + new URLSearchParams({ from, to }))).status, 403)
 assert.equal((await keyed(token, '/api/gauge/history/people/' + person.id)).status, 403)
 assert.equal((await keyed(token, '/api/gauge/command', { method: 'POST', headers: { origin: h.origin, 'content-type': 'application/json' }, body: JSON.stringify({ key: randomUUID(), action: 'save:clients', name: 'Keyed write' }) })).status, 403, 'A key never writes')
 assert.equal((await keyed('gauge_util_' + 'x'.repeat(43))).status, 401)
 const listed = (await h.db.prepare('SELECT id FROM g_api_keys WHERE label=?').bind('Easel revenue model').first()).id
 await cmd('apikey:revoke', { id: listed }, staff.cookie, 403)
 await page.goto(h.origin + '/app/access')
 const keyRow = page.locator(`tr[id="${listed}"]`)
 assert(/active/i.test(await keyRow.innerText()))
 await keyRow.getByRole('button', { name: 'Revoke key', exact: true }).click()
 assert(/revoked/i.test(await page.locator(`tr[id="${listed}"]`).innerText()))
 assert.equal((await keyed(token)).status, 401, 'A revoked key is refused on the next request')
 assert.equal((await keyed(firstBody.token)).status, 200, 'Revoking one key leaves the others')
 const audit = (await h.db.prepare('SELECT key_id,action,actor,detail FROM g_api_key_audit WHERE key_id=? ORDER BY id').bind(listed).all()).results
 assert.deepEqual(audit.map(r => r.action), ['create', 'read', 'read', 'revoke'])
 assert.deepEqual(JSON.parse(audit[1].detail), { from, to }); assert.equal(audit[1].actor, 'key:Easel revenue model')
 assert(await page.getByRole('row').filter({ hasText: 'Read utilization' }).count() >= 2, 'The owner sees each keyed read')
 await capture('utilization-key-revoked')
 console.log('PASS CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032 utilization key: owner-only create shown once, SHA-256 at rest, aggregate-only participant/available/approved-billable figures equal to the owner report, read-only scope, audited reads, revocation')
 // CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032 self-revoke: the authenticated credential is the only revocation target.
 const survivor = await cmd('apikey:create', { label: 'Independent integration' })
 const revoke = (key, options = {}) => keyed(key, '/api/gauge/keys/revoke', { method: 'POST', ...options })
 assert.equal((await keyed(firstBody.token, '/api/gauge/keys/revoke')).status, 405)
 assert.equal((await request('/api/gauge/keys/revoke', owner, { method: 'POST' })).status, 401, 'A session cannot select a key through the self-revoke door')
 const outcomes = await Promise.all([revoke(firstBody.token, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: survivor.id, token: survivor.token }) }), revoke(firstBody.token)])
 for (const response of [...outcomes, await revoke(firstBody.token), await revoke('gauge_util_' + 'z'.repeat(43)), await revoke(token)]) {
  assert.equal(response.status, 200, 'Unknown, revoked and active keys receive the same answer')
  assert.equal(await response.text(), '')
 }
 assert.equal((await keyed(firstBody.token)).status, 401, 'Self-revoke ends the presented key on the next request')
 assert.equal((await keyed(survivor.token)).status, 200, 'A body naming a different key cannot revoke it')
 const selfAudit = (await h.db.prepare("SELECT actor FROM g_api_key_audit WHERE key_id=? AND action='revoke'").bind(firstBody.id).all()).results
 assert.deepEqual(selfAudit, [{ actor: 'key:' + firstBody.label }], 'One successful self-revocation is audited as key:<label>')
 await page.goto(h.origin + '/app/access')
 assert(/revoked/i.test(await page.locator(`tr[id="${firstBody.id}"]`).innerText()))
 assert(/active/i.test(await page.locator(`tr[id="${survivor.id}"]`).innerText()))
 await capture('utilization-key-self-revoked')
 console.log('PASS CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032 self-revoke: presented-key-only, idempotent and unknown-key 200, concurrent single audit, other keys unaffected, immediate read refusal')
 await appApiJourney(h,browser,{staff,person,client,task,engagement})
 await realizationJourney(h, browser)
 console.log('PASS RESOURCE-004 scheduled/recorded/pending/approved utilization, 30/32 billable capacity, internal training, holiday and leave denominators, zero and missing capacity, service/project/detail grouping, scoped sources, CSV fingerprint and browser drills')
} finally { await browser?.close(); await h.dispose() }
