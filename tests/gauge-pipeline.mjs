import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 const { cmd, state, request, owner } = h
 const client = await cmd('save:clients', { name: 'Cascade Cider' })
 const person = await cmd('save:people', { name: 'Mia Chen', timezone: 'America/New_York' })
 const secondPerson = await cmd('save:people', { name: 'Owen Park', timezone: 'America/New_York' })
 const lead = await h.invite('Mia'), staff = await h.invite('Owen')
 await cmd('grant', { operatorId: lead.id, personId: person.id, role: 'lead', enabled: true })
 await cmd('grant', { operatorId: staff.id, personId: secondPerson.id, role: 'staff', enabled: true })
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 const capture = async name => {
  if (!process.env.GAUGE_PIPELINE_SHOTS) return
  await mkdir(process.env.GAUGE_PIPELINE_SHOTS, { recursive: true })
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 })
   await page.evaluate(() => document.fonts.ready)
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
   await page.screenshot({ path: `${process.env.GAUGE_PIPELINE_SHOTS}/${name}-${width}.png`, fullPage: true })
  }
 }
 await page.goto(h.origin + '/app/engagements')
 const create = async (name, probability, value, demand) => {
  const form = page.locator('form').filter({ has: page.locator('input[name=action][value="save:opportunities"]') })
  await form.getByLabel('Opportunity name', { exact: true }).fill(name)
  await form.locator('[name=clientId]').selectOption(client.id)
  await form.locator('[name=ownerId]').selectOption(person.id)
  await form.locator('[name=stage]').selectOption('qualified')
  await form.locator('[name=probability]').fill(String(probability))
  await form.getByLabel('Proposed start').fill('2026-11-02'); await form.getByLabel('Proposed end').fill('2026-12-18')
  await form.getByLabel('Proposed services').fill('Brand strategy, design')
  await form.locator('[name=amountDollars]').fill(String(value)); await form.locator('[name=demandHours]').fill(String(demand))
  await form.getByRole('button', { name: 'Save', exact: true }).click()
 }
 await create('Holiday launch', 50, 10000, 40)
 await create('Spring brand refresh', 25, 20000, 20)
 let data = await state(), first = data.data.opportunities.find(r => r.value.name === 'Holiday launch')
 assert.deepEqual(data.pipeline.map(p => [p.weightedMinor, p.bookedMinor, p.tentativeDemandSeconds]), [[1000000, 0, 216000]])
 assert.equal(data.data.staffing.length, 0, 'Opportunity demand never commits staffing')
 await capture('pipeline-open')
 await page.getByRole('link', { name: 'Holiday launch', exact: true }).click()
 let form = page.locator('form').filter({ has: page.locator('input[name=action][value="save:opportunities"]') })
 await form.locator('[name=stage]').selectOption('won'); await form.locator('[name=probability]').fill('100')
 await form.getByRole('button', { name: 'Save', exact: true }).click()
 data = await state()
 assert.deepEqual(data.pipeline.map(p => [p.weightedMinor, p.bookedMinor, p.tentativeDemandSeconds]), [[500000, 1000000, 72000]])
 const won = data.data.opportunities.find(r => r.id === first.id)
 await cmd('save:opportunities', { ...first.value, id: first.id, revision: first.revision }, lead.cookie, 409)
 await cmd('save:opportunities', { ...won.value, id: won.id, revision: won.revision }, staff.cookie, 403)
 const engagement = await cmd('save:engagements', { name: 'Holiday launch delivery', clientId: client.id, leadId: person.id, members: [secondPerson.id], scope: 'Agreed holiday campaign', timezone: 'America/New_York' })
 const terms = await cmd('save:budgets', { engagementId: engagement.id, mode: 'fixed', amountMinor: 1200000, effortSeconds: 144000, roundingSeconds: 60, reason: 'Signed campaign agreement' })
 await cmd('budget:approve', terms)
 const key = crypto.randomUUID(), link = { ...won.value, id: won.id, revision: won.revision, engagementId: engagement.id, key }
 const linked = await cmd('save:opportunities', link, lead.cookie)
 assert.deepEqual(await cmd('save:opportunities', link, lead.cookie), linked, 'Exact replay acknowledges original effect')
 data = await state()
 assert.equal(data.pipeline[0].bookedMinor, 1200000, 'Linked won value and signed budget counted once')
 assert.deepEqual(data.pipeline[0].booked.map(r => r.source), [`budgets:${terms.id}`])
 const history = await (await request(`/api/gauge/history/opportunities/${first.id}`, lead.cookie)).json()
 assert.deepEqual(history.history.map(r => r.value.stage), ['qualified', 'won'])
 assert.equal((await state(staff.cookie)).data.opportunities.length, 0)
 assert.equal((await request(`/api/gauge/history/opportunities/${first.id}`, staff.cookie)).status, 403)
 const second = data.data.opportunities.find(r => r.id !== first.id)
 const lost = await cmd('save:opportunities', { ...second.value, id: second.id, revision: second.revision, stage: 'lost', probability: 0 }, lead.cookie)
 assert.deepEqual((await state()).pipeline.map(p => [p.weightedMinor, p.bookedMinor, p.tentativeDemandSeconds]), [[0, 1200000, 0]])
 assert.equal((await (await request(`/api/gauge/history/opportunities/${lost.id}`, lead.cookie)).json()).history[0].value.stage, 'qualified')
 await page.goto(h.origin + '/app/engagements'); await capture('pipeline-won-lost')
 await page.goto(h.origin + `/app/engagements?opportunity=${won.id}#pipeline-title`); await capture('pipeline-editor')
 await page.goto(h.origin + `/api/gauge/history/opportunities/${won.id}`); await capture('pipeline-history')
 await cmd('grant', { operatorId: lead.id, personId: person.id, role: 'lead', enabled: false })
 assert.equal((await request(`/api/gauge/history/opportunities/${first.id}`, lead.cookie)).status, 403)
 console.log('PASS SALES-001 two probabilities, won/lost history, separate tentative demand, exact replay, scoped access and booked backlog without double counting')
} finally { await browser?.close(); await h.dispose() }
