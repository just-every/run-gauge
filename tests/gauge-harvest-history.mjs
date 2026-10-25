import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { workbook } from './fixtures/harvest-workbook.mjs'

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
 pack.manifest.sourceCoverage=JSON.parse(await readFile('tests/fixtures/harvest/manifest.json','utf8')).sourceCoverage
 pack.manifest.sourceCoverage.time.count=2
 const rows = pack.files['time.csv'].trimEnd().split('\n').map(line => line.split(','))
 rows[1][3] = 46269 // 2026-09-04 in the Excel 1900 date system.
 rows[1][4] = 2.11; rows[1][5] = 2.25; rows[2][4] = 1; rows[2][5] = 1
 rows[2][9] = undefined // Sparse optional invoice reference.
 rows[1][12] = { value: rows[1][12], type: 'inlineStr' }
 rows.splice(2, 0, []) // Original workbook row 4 remains row 4 after a blank row.
 const bytes = workbook(rows, { extraSheets: [{ name: 'Summary', rows: [['Not detailed time']] }] })
 const xlsx = structuredClone(pack); delete xlsx.files['time.csv']
 xlsx.manifest.timeWorksheet = 'Detailed time'; xlsx.workbook = { base64: bytes.toString('base64') }
 const xlsxPreview = await cmd('import:preview', { package: xlsx })
 assert.deepEqual(xlsxPreview.timeControls, pack.manifest.timeReconciliation, 'MIGRATE-002 XLSX controls match independent report')
 assert.deepEqual(xlsxPreview.timeSources, ['brand', 'web'].map((sourceId, i) => ({ sourceId, location: { artifact: 'time.xlsx', row: [2, 4][i], pointer: 'Detailed time' } })), 'MIGRATE-002 worksheet and original row locations')
 const modern = structuredClone(xlsx), modernRows = structuredClone(rows)
 modernRows[0][3] = 'Work day'; modernRows[1][3] = 44807
 modern.manifest.columns = { time: { date: 'Work day' } }
 modern.workbook.base64 = workbook(modernRows, { date1904: true }).toString('base64')
 assert.deepEqual((await cmd('import:preview', { package: modern })).timeControls, pack.manifest.timeReconciliation, 'MIGRATE-002 Excel 1904 dates and mapped date header')
 const changedWorkbook = structuredClone(xlsx), changedRows = structuredClone(rows); changedRows[1][9] = 'INV-205'
 changedWorkbook.workbook.base64 = workbook(changedRows).toString('base64')
 await cmd('import:create', { package: changedWorkbook, fingerprint: xlsxPreview.fingerprint }, owner, 409)
 for (const [label, alter] of [
  ['missing worksheet', p => { delete p.manifest.timeWorksheet }],
  ['wrong worksheet', p => { p.manifest.timeWorksheet = 'Absent' }],
  ['conflicting time formats', p => { p.files['time.csv'] = pack.files['time.csv'] }],
  ['formula', p => { p.workbook.base64 = workbook(rows, { formula: { E2: '1+1.11' } }).toString('base64') }],
  ['invalid Excel leap date', p => { const changed = structuredClone(rows); changed[1][3] = 60; p.workbook.base64 = workbook(changed).toString('base64') }],
  ['expanded ZIP limit', p => { p.workbook.base64 = workbook(rows, { extraFiles: { 'large.xml': 'x'.repeat(8 * 1024 * 1024 + 1) } }).toString('base64') }],
  ['compressed size limit', p => { p.workbook.base64 = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }],
  ['independent controls', p => { p.manifest.timeReconciliation['northstar/2026-09'].rawSeconds-- }],
 ]) {
  const invalid = structuredClone(xlsx); alter(invalid)
  await cmd('import:preview', { package: invalid }, owner, 400)
  assert.equal((await state()).data.time.length, 0, `MIGRATE-002 ${label} refuses without writes`)
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
 const [guideResponse] = await Promise.all([page.waitForNavigation(), page.getByRole('link', { name: 'Read the move-in guide' }).click()])
 assert.equal(guideResponse.status(), 200)
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1100 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `MIGRATE-002 guide fits ${width}`)
  if (process.env.GAUGE_HARVEST_SHOTS) {
   await mkdir(process.env.GAUGE_HARVEST_SHOTS, { recursive: true })
   // Read the changed workbook section in the public guide, without changing its document.
   await page.evaluate(() => { const pre = document.querySelector('pre'), node = pre.firstChild, index = node.textContent.indexOf('XLSX time uses'); const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1); window.scrollBy(0, range.getBoundingClientRect().top - 100) })
   await page.screenshot({ path: `${process.env.GAUGE_HARVEST_SHOTS}/harvest-guide-${width}.png` })
  }
 }
 await page.getByRole('link', { name: 'Back to imports' }).click()
 await page.getByLabel('Harvest export files:', { exact: false }).setInputFiles(Object.entries(xlsx.files).map(([name, content]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(content) })).concat({ name: 'time.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes }))
 await page.getByLabel('Manifest, as described in the move-in guide').fill(JSON.stringify(xlsx.manifest))
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1100 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `MIGRATE-002 upload fits ${width}`)
  if (process.env.GAUGE_HARVEST_SHOTS) await page.getByRole('heading', { name: 'Preview source package' }).locator('..').screenshot({ path: `${process.env.GAUGE_HARVEST_SHOTS}/harvest-upload-${width}.png` })
 }
 await page.getByRole('button', { name: 'Preview', exact: true }).click()
 assert(await page.getByRole('heading', { name: 'Source time controls' }).isVisible())
 assert.match(await page.locator('main').innerText(), /Source time controls/)
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
 const workbookOriginalsPath = await page.getByRole('link', { name: 'Download retained originals and manifest' }).first().getAttribute('href')
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
 const originals = await request(workbookOriginalsPath, owner)
 assert.equal(originals.status, 200)
 const retained = await originals.json(), timeOriginal = retained.find(r => r.name === 'time.xlsx')
 assert.deepEqual(Buffer.from(timeOriginal.original.base64, 'base64'), bytes, 'MIGRATE-002 exact binary workbook custody')
 const afterEdit = await cmd('import:preview', { package: xlsx })
 await cmd('import:create', { package: xlsx, fingerprint: afterEdit.fingerprint }, owner, 409)
 assert.deepEqual((await state()).data.time.find(r => r.id === final.id), final, 'Reimport preserves later native approval')
 console.log('PASS MIGRATE-002 XLSX bounded value-only decoding, worksheet selection, binary custody, cross-format replay; raw 7596 / rounded 8100 seconds, historical rates, invoice reference, source approval/lock evidence, independent controls, preview/apply, native approval, duplicate-billing refusal and original custody')
} finally { await browser?.close(); await h.dispose() }

await (await import('./gauge-kantata.mjs')).kantataJourney()
