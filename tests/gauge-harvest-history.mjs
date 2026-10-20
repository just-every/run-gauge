import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// MIGRATE-002: source raw/rounded time, historical rates, invoice and approval/lock evidence
// through native preview, apply, state, retained originals, billing refusal and browser doors.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 const { cmd, state, request, owner } = h
 const pack = {
  manifest: { namespace: 'harvest-history', currency: 'USD', timezone: 'America/New_York', units: 'decimal-hours', coverage: 'all-time', projectLeads: { launch: 'ada' }, projectMembers: { launch: ['ada'] },
   rates: { ada: [{ effective: '2026-09-10', costMinor: 5000, billMinor: 17500 }, { effective: '2026-09-01', costMinor: 4000, billMinor: 10000 }] },
   reconciliation: { 'northstar/2026-09': { count: 2, seconds: 11196, amountMinor: 40000 } },
   timeReconciliation: { 'northstar/2026-09': { count: 2, rawSeconds: 11196, billingSeconds: 11700, billedSeconds: 7596, unbilledSeconds: 3600, costMinor: 13440, billMinor: 40000 } } },
  files: {
   'clients.csv': 'Client ID,Client\nnorthstar,Northstar Studio\n',
   'people.csv': 'Person ID,Name,Contractor\nada,Ada Ruiz,No\n',
   'projects.csv': 'Project ID,Client ID,Project,Notes\nlaunch,northstar,Autumn launch,Identity and launch delivery\n',
   'time.csv': 'Time Entry ID,Person ID,Project ID,Date,Hours,Rounded Hours,Task,Billable?,Invoiced?,Invoice ID,Approved?,Locked?,Notes\nbrand,ada,launch,2026-09-04,2.11,2.25,Brand design,Yes,Yes,INV-204,Yes,Yes,Approved identity concepts\nweb,ada,launch,2026-09-11,1,1,Web delivery,Yes,No,,No,No,Accessible launch page\n',
  },
 }
 const preview = await cmd('import:preview', { package: pack })
 assert.deepEqual(preview.timeControls, pack.manifest.timeReconciliation)
 assert.equal((await state()).data.time.length, 0, 'MIGRATE-002 preview makes no native writes')
 const bad = structuredClone(pack); bad.manifest.timeReconciliation['northstar/2026-09'].billingSeconds--
 await cmd('import:preview', { package: bad }, owner, 400)
 const missing = structuredClone(pack); delete missing.manifest.timeReconciliation
 await cmd('import:preview', { package: missing }, owner, 400)
 const duplicate = structuredClone(pack); duplicate.manifest.rates.ada[0].effective = '2026-09-01'
 await cmd('import:preview', { package: duplicate }, owner, 400)
 const uncovered = structuredClone(pack); uncovered.manifest.rates.ada = [{ effective: '2026-09-05', costMinor: 4000, billMinor: 10000 }]
 await cmd('import:preview', { package: uncovered }, owner, 400)
 const fraction = structuredClone(pack); fraction.files['time.csv'] = fraction.files['time.csv'].replace('2.11,2.25', '2.11,2.111111')
 await cmd('import:preview', { package: fraction }, owner, 400)
 await cmd('import:preview', { package: { manifest: pack.manifest, files: {}, archives: [{ name: 'historical-invoice.pdf', mediaType: 'application/pdf', base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') }] } }, owner, 400)
 const changed = structuredClone(pack); changed.files['time.csv'] = changed.files['time.csv'].replace('INV-204', 'INV-205')
 await cmd('import:create', { package: changed, fingerprint: preview.fingerprint }, owner, 409)

 // Exercise the actual upload/preview/apply path with the same independent source report.
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 await page.goto(h.origin + '/app/imports')
 await page.getByRole('link', { name: 'Read the move-in guide' }).click()
 assert.equal(new URL(page.url()).pathname, '/move-in.html')
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1100 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `MIGRATE-002 guide fits ${width}`)
  if (process.env.GAUGE_HARVEST_SHOTS) {
   await mkdir(process.env.GAUGE_HARVEST_SHOTS, { recursive: true })
   // Read the changed manifest section in the public guide, without changing its document.
   await page.evaluate(() => { const pre = document.querySelector('pre'), node = pre.firstChild, index = node.textContent.indexOf('timeReconciliation'); const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1); window.scrollBy(0, range.getBoundingClientRect().top - 100) })
   await page.screenshot({ path: `${process.env.GAUGE_HARVEST_SHOTS}/harvest-guide-${width}.png` })
  }
 }
 await page.getByRole('link', { name: 'Back to imports' }).click()
 await page.getByLabel('Harvest export files:', { exact: false }).setInputFiles(Object.entries(pack.files).map(([name, content]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(content) })))
 await page.getByLabel('Manifest, as described in the move-in guide').fill(JSON.stringify(pack.manifest))
 await page.getByRole('button', { name: 'Preview', exact: true }).click()
 assert(await page.getByRole('heading', { name: 'Source time controls' }).isVisible())
 const shots = process.env.GAUGE_HARVEST_SHOTS
 const capture = async name => {
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1100 })
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `MIGRATE-002 ${name} fits ${width}`)
   if (shots) { await mkdir(shots, { recursive: true }); await page.getByRole('heading', { name: name === 'harvest-preview' ? 'Reconciled preview' : 'Recorded work', exact: true }).locator('..').screenshot({ path: `${shots}/${name}-${width}.png` }) }
  }
 }
 await capture('harvest-preview')
 await page.getByRole('button', { name: 'Apply first bounded batch' }).click()
 let data = await state()
 assert.equal(data.data.time.length, 2)
 const brand = data.data.time.find(r => r.value.source.externalId === 'brand'), web = data.data.time.find(r => r.value.source.externalId === 'web')
 assert.equal(brand.value.durationSeconds, 7596); assert.equal(brand.value.source.rawSeconds, 7596); assert.equal(brand.value.source.billingSeconds, 8100)
 assert.equal(brand.value.source.invoiceId, 'INV-204'); assert.equal(brand.value.source.billed, true)
 assert.equal(brand.value.source.approved, true); assert.equal(brand.value.source.locked, true)
 assert.equal(brand.value.status, 'draft'); assert.equal(brand.value.start, null); assert.equal(brand.value.end, null)
 assert.equal(brand.value.source.rateEffective, '2026-09-01'); assert.equal(brand.value.source.billMinor, 22500); assert.equal(brand.value.source.costMinor, 8440)
 assert.equal(web.value.source.rateEffective, '2026-09-10'); assert.equal(web.value.source.billMinor, 17500); assert.equal(web.value.source.costMinor, 5000)
 assert.deepEqual(data.data.rates.map(r => r.value.effective).sort(), ['2026-09-01', '2026-09-10'])
 await page.goto(h.origin + '/app/time?from=2026-09-01&to=2026-09-30')
 assert.match(await page.getByRole('heading', { name: 'Recorded work' }).locator('..').innerText(), /INV-204/)
 await capture('harvest-time')
 // A reimport with unchanged source identity cannot duplicate historical work.
 const again = await cmd('import:preview', { package: pack })
 let replay = await cmd('import:create', { package: pack, fingerprint: again.fingerprint })
 while (['queued', 'applying'].includes(replay.state)) replay = await cmd('import:resume', { id: replay.id })
 assert.equal((await state()).data.time.length, 2)

 // Source billing flags still refuse re-billing after ordinary native review; source rounding never replaces actual time.
 const engagement = data.data.engagements[0]
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: engagement.id, mode: 'hourly', amountMinor: 100000, effortSeconds: 14400, roundingSeconds: 1, reason: 'Native review of imported history' }))
 const approved = await cmd('time:approve', await cmd('time:submit', brand))
 await cmd('packet:create', { engagementId: engagement.id, title: 'Duplicate historical billing refused', sources: [`time:${brand.id}`] }, owner, 400)
 data = await state()
 const final = data.data.time.find(r => r.id === approved.id)
 assert.equal(final.value.economics.billMinor, 21100); assert.equal(final.value.durationSeconds, 7596)
 assert.equal(final.value.source.billMinor, 22500); assert.equal(final.value.source.billingSeconds, 8100)
 const history = await (await request(`/api/gauge/history/time/${brand.id}`, owner)).json()
 assert(JSON.stringify(history).includes('INV-204'))
 const importPage = await (await request('/app/imports', owner)).text(), retainedPath = importPage.match(/href="(\/api\/gauge\/imports\/[^"]+)"/)[1]
 const originals = await request(retainedPath, owner)
 assert.equal(originals.status, 200)
 const retained = await originals.json(), timeOriginal = retained.find(r => r.name === 'time.csv')
 assert.equal(Buffer.from(timeOriginal.original.base64, 'base64').toString(), pack.files['time.csv'])
 const afterEdit = await cmd('import:preview', { package: pack })
 await cmd('import:create', { package: pack, fingerprint: afterEdit.fingerprint }, owner, 409)
 assert.deepEqual((await state()).data.time.find(r => r.id === final.id), final, 'Reimport preserves later native approval')
 console.log('PASS MIGRATE-002 raw 7596 / rounded 8100 seconds, historical rates, invoice reference, source approval/lock evidence, independent controls, preview/apply, native approval, duplicate-billing refusal and original custody')
} finally { await browser?.close(); await h.dispose() }
