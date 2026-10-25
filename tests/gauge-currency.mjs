import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { agencyJourney, clientCurrencyJourney } from './gauge-agency.mjs'

const h = await harness({ finishSetup: false }), { cmd, state, request, owner } = h
let browser
try {
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 const evidence = process.env.GAUGE_CURRENCY_SHOTS
 const capture = async name => {
  if (!evidence) return
  await mkdir(evidence, { recursive: true })
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits ${width}`)
   await page.screenshot({ path: `${evidence}/${name}-${width}.png`, fullPage: true })
  }
 }
 await page.goto(h.origin + '/setup')
 assert.equal(await page.locator('[name=currency]').inputValue(), 'USD')
 await page.getByLabel('Work timezone').fill('America/New_York')
 // SETUP-001: the New York agency's legal business, US address, EIN and fiscal year are saved with the first-run form.
 await page.getByLabel('Legal business name').fill('Hudson Studio LLC'); await page.getByLabel('US billing address').fill('1 Pier Plaza')
 await page.getByLabel('City').fill('New York'); await page.getByLabel('State').fill('NY'); await page.getByLabel('ZIP code').fill('10001')
 await page.getByLabel('EIN (owner-only, never printed on documents)').fill('123456789'); await page.getByLabel('Fiscal year starts in').selectOption('1')
 await capture('setup')
 await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup' }).click(); await page.waitForURL('**/app')
 assert.deepEqual((await state()).agency, { currency: 'USD', timezone: 'America/New_York' })
 // A second setup submission must never relabel existing money.
 await request('/setup', owner, { method: 'POST', headers: { origin: h.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes&currency=AUD&timezone=Australia%2FBrisbane' })
 assert.equal((await state()).agency.currency, 'USD')

 const fixture = 'tests/fixtures/harvest/', files = {}
 for (const name of ['clients.csv', 'people.csv', 'projects.csv', 'time.csv']) files[name] = await readFile(fixture + name, 'utf8')
 files['clients.csv'] = files['clients.csv'].replace('Synthetic client', 'Cascade Cider')
 files['people.csv'] = files['people.csv'].replace('Synthetic person', 'Owen Park')
 files['projects.csv'] = files['projects.csv'].replace('Synthetic project', 'Fall launch')
 const manifest = { ...JSON.parse(await readFile(fixture + 'manifest.json', 'utf8')), currency: 'USD', timezone: 'America/New_York' }
 const mismatch = await cmd('import:preview', { package: { manifest: { ...manifest, currency: 'AUD' }, files } }, owner, 400)
 assert.match(mismatch.error, /AUD.*USD/)
 await page.goto(h.origin + '/app/imports')
 await page.locator('input[name=files]').setInputFiles(Object.entries(files).map(([name, contents]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(contents) })))
 const incomplete=structuredClone(manifest);incomplete.sourceCoverage.time.complete=false
 await page.getByLabel('Manifest, as described in the move-in guide').fill(JSON.stringify(incomplete))
 await page.getByRole('button', { name: 'Preview', exact: true }).click()
 await page.getByRole('heading', { name: 'Incomplete source preview' }).waitFor()
 assert.equal(await page.getByRole('button',{name:'Apply first bounded batch'}).count(),0)
 assert((await page.locator('body').innerText()).includes('Filtered or incomplete original'))
 assert.equal((await state()).data.time.length,0)
 await capture('harvest-incomplete')
 const icons=await page.locator('button,a,summary').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&n.querySelector('svg,img')).map(n=>n.outerHTML));assert.deepEqual(icons,[],'Imports controls have visible text')
 await page.locator('input[name=files]').setInputFiles(Object.entries(files).map(([name,contents])=>({name,mimeType:'text/csv',buffer:Buffer.from(contents)})))
 await page.getByLabel('Manifest, as described in the move-in guide').fill(JSON.stringify(manifest))
 await page.getByRole('button', { name: 'Preview', exact: true }).click()
 await page.getByRole('heading', { name: 'Reconciled preview' }).waitFor(); await capture('harvest-preview')
 await page.getByRole('button', { name: 'Apply first bounded batch' }).click()
 let data = await state(), job = await cmd('import:read', { id: await page.locator('input[name=id]').first().inputValue() })
 while (job.state !== 'completed') job = await cmd('import:resume', { id: job.id })
 data = await state()
 const engagement = data.data.engagements[0], person = data.data.people[0], task = data.data.tasks[0]
 assert.equal(engagement.value.currency, 'USD'); assert.equal(data.data.rates[0].value.currency, 'USD')
 assert(data.data.time.every(row => row.value.source.currency === 'USD'))
 const expense = await cmd('expense:save', { engagementId: engagement.id, personId: person.id, date: '2026-09-01', description: 'Launch workshop materials', amountMinor: 8650, reimbursable: true })
 await cmd('expense:approve', await cmd('expense:submit', expense))
 assert.equal((await state()).data.expenses[0].value.currency, 'USD')
 await cmd('save:calendars', { personId: person.id, from: '2026-10-01', to: '2026-11-30', weekdays: '1,2,3,4,5', dailySeconds: 28800, timezone: 'America/New_York' })
 await cmd('save:staffing', { engagementId: engagement.id, personId: person.id, from: '2026-11-02', to: '2026-11-06', dailySeconds: 14400, commitment: 'committed' })
 const terms = await cmd('save:budgets', { engagementId: engagement.id, mode: 'hourly', amountMinor: 200000, effortSeconds: 43200, roundingSeconds: 60, reason: 'Fall launch agreement' })
 await cmd('budget:approve', terms)
 // The public rate form rounds decimal text half-up, rather than floating point.
 await page.goto(h.origin + '/app/rates')
 await page.locator('[name=personId]').selectOption(person.id); await page.locator('[name=effective]').fill('2026-09-01')
 await page.locator('[name=costDollars]').fill('50.005'); await page.locator('[name=billDollars]').fill('100.005')
 // Exercise finer decimal rounding through the same form transport.
 const rateForm = await page.locator('form').first().evaluate(form => Object.fromEntries(new FormData(form)))
 const saved = await request('/app/action', owner, { method: 'POST', headers: { origin: h.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...rateForm, key: randomUUID() }).toString() })
 assert.equal(saved.status, 303)
 data = await state(); assert.equal(data.data.rates.at(-1).value.billMinor, 10001); assert.equal(data.data.rates.at(-1).value.costMinor, 5001)
 await page.reload(); await capture('rates')
 let entry = data.data.time[0]
 entry = await cmd('time:submit', entry); await cmd('time:approve', entry)
 data = await state(); entry = data.data.time.find(row => row.id === entry.id)
 assert.equal(entry.value.economics.currency, 'USD'); assert.equal(entry.value.economics.billMinor, 10001)
 assert.equal(data.economics[0].currency, 'USD'); assert.equal(data.economics[0].costMinor, 13651)
 await page.goto(h.origin + `/api/gauge/history/expenses/${expense.id}`)
 assert.equal(await page.getByRole('heading', { name: 'Revision history', exact: true }).count(), 1)
 // History's HTML representation is reached with the browser's ordinary Accept header.
 await capture('history')
 await page.goto(h.origin + '/app/engagements'); await capture('engagements')
 for (const section of ['time', 'expenses', 'capacity', 'review']) {
  await page.goto(h.origin + '/app/' + section + (section === 'capacity' ? '?from=2026-11-01&to=2026-11-30' : '')); await capture(section)
  assert(!/AUD|A\$|GST|Australia\/Brisbane/.test(await page.locator('body').innerText()), `${section} uses agency currency and timezone`)
 }
 await page.goto(h.origin + '/app/billing')
 const preparation=page.locator('select[name=engagementId]').locator('xpath=ancestor::form')
 await preparation.locator('select[name=engagementId]').selectOption(engagement.id); await preparation.getByLabel('Packet title',{exact:true}).fill('Cascade Cider · September delivery')
 await preparation.locator(`input[name=sources][value="time:${entry.id}"]`).check()
 await preparation.getByRole('button', { name: 'Save', exact: true }).click()
 await page.getByRole('button', { name: 'Approve exact packet', exact: true }).click()
 await capture('billing')
 const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download approved CSV' }).click()
 const artifact = await download, stream = await artifact.createReadStream(), chunks = []
 for await (const chunk of stream) chunks.push(chunk)
 const csv = Buffer.concat(chunks).toString()
 assert(csv.includes('"Gauge billing preparation","USD"')); assert(csv.includes('"10001","USD"')); assert(!/AUD|GST/.test(csv))
 const packet = (await state()).data.packets[0]
 assert.equal(packet.value.totalMinor, 10001); assert.equal(packet.value.currency, 'USD')
 assert.equal(await (await request(`/api/gauge/packets/${packet.id}`, owner)).text(), csv)
 const adjustment = await cmd('packet:adjust', { ...packet, sourceId: entry.id, correctedAmountMinor: 9999, reason: 'Agreed two-cent reduction' })
 await cmd('packet:approve', adjustment)
 assert.equal((await state()).data.packets.find(row => row.id === adjustment.id).value.totalMinor, -2)
 console.log('PASS USD setup → Harvest preview/apply → exact cents → approval → report → billing CSV and correction; mismatch refused')
 await agencyJourney(h, page, capture)
 await clientCurrencyJourney(h, page, capture)
} finally { await browser?.close(); await h.dispose() }

// Legacy milestones inherited currency from their engagement. Populate that old
// storage shape as a fixture, then read it through the real page and history doors.
const legacy = await harness()
try {
 const person = await legacy.cmd('save:people', { name: 'Agency lead', timezone: 'Australia/Brisbane' })
 const client = await legacy.cmd('save:clients', { name: 'Existing Australian client' })
 const engagement = await legacy.cmd('save:engagements', { name: 'Existing delivery', clientId: client.id, leadId: person.id, members: [person.id], scope: 'Previously agreed scope', timezone: 'Australia/Brisbane' })
 const milestone = await legacy.cmd('save:milestones', { engagementId: engagement.id, name: 'Existing milestone', due: '2026-10-31', amountMinor: 1234 })
 await legacy.db.prepare("UPDATE g_milestones SET data=json_remove(data,'$.currency') WHERE id=?").bind(milestone.id).run()
 assert((await (await legacy.request('/app/review', legacy.owner)).text()).includes('A$12.34'))
 await legacy.cmd('save:milestones', { ...milestone, engagementId: engagement.id, name: 'Reviewed milestone', due: '2026-10-31', amountMinor: 2234 })
 const history = await legacy.request(`/api/gauge/history/milestones/${milestone.id}`, legacy.owner, { headers: { accept: 'text/html' } })
 assert.equal(history.status, 200); assert((await history.text()).includes('A$12.34'))
 console.log('PASS legacy AUD milestone summaries and immutable history retain engagement currency')
 // RATE-002 (ct 19 Oct 12:00Z): a pre-RATE-002 card keeps its AUD cost; new declared costs are USD and never summed with AUD.
 const task = await legacy.cmd('save:tasks', { engagementId: engagement.id, name: 'Existing work', remainingSeconds: 36000 })
 await legacy.cmd('budget:approve', await legacy.cmd('save:budgets', { engagementId: engagement.id, mode: 'hourly', amountMinor: 500000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Existing terms' }))
 // The stored shape RATE-001 wrote before cards declared a cost currency: one currency for bill and cost.
 await legacy.db.prepare('INSERT INTO g_rates(id,revision,data) VALUES(?,?,?)').bind('legacy-aud-card', 'legacy-revision', JSON.stringify({ personId: person.id, service: '*', effective: '2026-01-01', costMinor: 5000, billMinor: 10000, currency: 'AUD' })).run()
 const newCard = await legacy.cmd('save:rates', { personId: person.id, service: '*', effective: '2026-10-08', billMinor: 10000, costMinor: 4000 })
 const declared = (await legacy.state()).data.rates.find(r => r.id === newCard.id).value; assert.deepEqual([declared.costCurrency, declared.currency], ['USD', 'AUD'])
 for (const day of ['2026-10-05', '2026-10-09']) {
  const saved = await legacy.cmd('time:save', { personId: person.id, engagementId: engagement.id, taskId: task.id, service: 'Delivery', timezone: 'Australia/Brisbane', billable: true, start: `${day}T09:00:00+10:00`, end: `${day}T10:00:00+10:00` })
  await legacy.cmd('time:approve', await legacy.cmd('time:submit', saved))
 }
 const mixed = await legacy.state(), econ = mixed.economics.find(x => x.engagementId === engagement.id)
 assert.deepEqual(mixed.data.time.map(r => [r.value.economics.costMinor, r.value.economics.costCurrency, r.value.economics.billMinor, r.value.economics.currency]).sort(), [[4000, 'USD', 10000, 'AUD'], [5000, 'AUD', 10000, 'AUD']])
 assert.deepEqual([econ.costMinor, econ.knownCostMinor, econ.costByCurrency, econ.otherCostCurrencies, econ.billableMinor], [null, 5000, { AUD: 5000, USD: 4000 }, ['USD'], 20000])
 const usd = mixed.lineage.find(f => f.id === `economics:${engagement.id}:costByCurrency:USD`)
 assert.deepEqual([usd.value, usd.currency], [4000, 'USD']); assert.equal(mixed.lineage.find(f => f.id === `economics:${engagement.id}:costMinor`).complete, false)
 console.log('PASS RATE-002 legacy AUD costs keep their currency; new USD-declared costs stay a separate bucket and mixed sums are refused')
} finally { await legacy.dispose() }
