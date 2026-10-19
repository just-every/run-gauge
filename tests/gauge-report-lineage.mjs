import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 const { cmd, state, request, owner } = h
 const worker = await cmd('save:people', { name: 'Mia Chen', timezone: 'America/New_York' })
 const unpriced = await cmd('save:people', { name: 'Owen Park', timezone: 'America/New_York' })
 const client = await cmd('save:clients', { name: 'Cascade Cider' })
 const eng = await cmd('save:engagements', { name: 'Holiday launch', clientId: client.id, leadId: worker.id, members: [worker.id, unpriced.id], scope: 'Holiday campaign delivery', timezone: 'America/New_York' })
 const task = await cmd('save:tasks', { engagementId: eng.id, name: 'Campaign strategy', remainingSeconds: 7200 })
 const terms = await cmd('save:budgets', { engagementId: eng.id, mode: 'hourly', amountMinor: 2000000, effortSeconds: 144000, roundingSeconds: 60, reason: 'Signed delivery agreement' })
 await cmd('budget:approve', terms)
 const rate = await cmd('save:rates', { personId: worker.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 15000 })
 const entries = []
 for (const person of [worker, unpriced]) {
  const entry = await cmd('time:save', { personId: person.id, engagementId: eng.id, taskId: task.id, service: 'Strategy', notes: 'Approved campaign workshop', timezone: 'America/New_York', billable: true, start: '2026-10-01T09:00:00-04:00', end: '2026-10-01T10:00:00-04:00' })
  await cmd('time:approve', await cmd('time:submit', entry)); entries.push(entry)
 }
 const expense = await cmd('expense:save', { engagementId: eng.id, personId: worker.id, date: '2026-10-01', description: 'Workshop materials', amountMinor: 5000, reimbursable: true })
 await cmd('expense:approve', await cmd('expense:submit', expense))
 await cmd('save:calendars', { personId: worker.id, from: '2026-10-01', to: '2026-10-31', weekdays: '1,2,3,4,5', dailySeconds: 28800, timezone: 'America/New_York' })
 await cmd('save:staffing', { personId: worker.id, engagementId: eng.id, from: '2026-10-01', to: '2026-10-01', dailySeconds: 14400, commitment: 'committed' })
 const staff = await h.invite('Mia')
 await cmd('grant', { operatorId: staff.id, personId: worker.id, role: 'staff', enabled: true })
 const data = await state(), costId = `economics:${eng.id}:costMinor`, cost = data.lineage.find(f => f.id === costId)
 assert.equal(data.economics[0].costMinor, null); assert.equal(data.economics[0].knownCostMinor, 14000)
 assert.equal(cost.value, null); assert.equal(cost.knownValue, 14000); assert.equal(cost.complete, false)
 assert(cost.unknownSources.some(s => s.includes(entries[1].id)))
 assert(cost.sources.some(s => s.kind === 'rates' && s.id === rate.id && s.revision === rate.revision))
 const frozen = cost.sources.find(s => s.kind === 'time' && s.id === entries[0].id)
 assert.equal(frozen.value.economics.rateId, rate.id); assert(frozen.value.approvedBy); assert(frozen.value.approvedAt)
 const unknownCalendar = data.lineage.find(f => f.id === `capacity:${unpriced.id}:availableSeconds`)
 assert.equal(unknownCalendar.value, null); assert.equal(unknownCalendar.complete, false)
 const csvPath = d => '/api/gauge/report.csv?' + new URLSearchParams({ from: d.from, to: d.to, fingerprint: d.fingerprint })
 const response = await request(csvPath(data), owner); assert.equal(response.status, 200)
 const rows = JSON.parse(execFileSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'], { input: await response.text(), encoding: 'utf8' }))
 for (const figure of data.lineage) {
  const exported=rows.find(row=>row.row==='figure'&&row.figure===figure.id)
  assert(exported, 'Every visible report figure is exported')
  assert.equal(exported.value, figure.value===null?'':String(figure.value))
  assert.equal(exported.currency, figure.currency??'')
  assert.equal(exported['report from'],data.from); assert.equal(exported['report through'],data.to)
 }
 const total = rows.find(r => r.row === 'figure' && r.figure === costId)
 assert.equal(total.value, ''); assert.equal(Number(total['known subtotal']), 14000)
 const sources = rows.filter(r => r.row === 'source' && r.figure === costId).map(r => ({ kind: r['source kind'], value: JSON.parse(r['source values']) }))
 const independent = sources.reduce((n, s) => n + (s.kind === 'time' ? s.value.economics?.costMinor ?? 0 : s.kind === 'expenses' ? s.value.amountMinor : 0), 0)
 assert.equal(independent, Number(total['known subtotal']))
 assert.equal((await request(csvPath(data))).status, 401)
 assert.equal((await request(csvPath(data), staff.cookie)).status, 409, 'Finance snapshot cannot export under staff authority')
 const staffData = await state(staff.cookie), staffCsv = await request(csvPath(staffData), staff.cookie)
 assert.equal(staffCsv.status, 200); assert(!/costMinor|billRateMinor|knownCostMinor/.test(await staffCsv.text()), 'Staff export contains no private rates or costs')
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 const shots = process.env.GAUGE_REPORT_SHOTS
 const capture = async name => {
  if (!shots) return
  await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits ${width}`)
   await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true })
  }
 }
 await page.goto(h.origin + `/app/engagements?edit=${eng.id}`)
 await page.getByRole('link', { name: 'Calculation and sources', exact: true }).click()
 const evidence = page.locator('#report-evidence')
 assert(await evidence.getAttribute('open') !== null)
 const selected = evidence.locator('article').first()
 assert((await selected.innerText()).includes('140.00'))
 await selected.locator('summary').filter({ hasText: /^Source revisions/ }).click()
 await capture('engagement-burn-evidence')
 const download = page.waitForEvent('download'); await evidence.getByRole('link', { name: 'Download report calculations CSV' }).click()
 const artifact = await download, stream = await artifact.createReadStream(), chunks = []
 for await (const chunk of stream) chunks.push(chunk)
 assert(Buffer.concat(chunks).toString().includes(costId))
 for (const section of ['review', 'capacity', 'billing']) {
  await page.goto(h.origin + '/app/' + section)
  await page.locator('#report-evidence > summary').click(); await capture(section + '-report-evidence')
 }
 await cmd('save:rates', { personId: worker.id, service: '*', effective: '2026-11-01', costMinor: 9500, billMinor: 17500 })
 assert.equal((await request(csvPath(data), owner)).status, 409, 'Changed inputs require refreshing the screen before export')
 const after = await state()
 assert.equal(after.lineage.find(f => f.id === costId).knownValue, 14000, 'Later rate never reprices approved work')
 const cap=await cmd('save:budgets',{engagementId:eng.id,mode:'hourly',amountMinor:10000,effortSeconds:7200,roundingSeconds:60,reason:'Approved reduced workshop scope'})
 await cmd('budget:approve',cap)
 const overspend=(await state()).exceptions.find(x=>x.type==='overspend')
 assert.equal(overspend.amountMinor,4000); assert.equal(overspend.incomplete,true,'Known costs above budget remain a lower-bound exception while total cost is unknown')
 await page.goto(h.origin+'/app/review'); assert((await page.locator('body').innerText()).includes('at least $40.00'))
 await capture('review-incomplete-overspend')
 await cmd('grant', { operatorId: staff.id, personId: worker.id, role: 'staff', enabled: false })
 assert.equal((await request(csvPath(staffData), staff.cookie)).status, 403)
 console.log('PASS REPORT-005 burn drill, frozen rate and approval lineage, exact CSV subtotal reconciliation, unknown cost/calendar, stale snapshot refusal and private/revoked exports')
} finally { await browser?.close(); await h.dispose() }
