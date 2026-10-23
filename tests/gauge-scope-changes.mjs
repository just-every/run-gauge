// SALES-005: propose extra work, decline it, revise and record the client's acceptance; only the accepted,
// separately approved increment changes the signed value the forecast reads.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

const h = await harness({ currency: 'USD', timezone: 'America/New_York' }), { cmd, state, owner } = h
let browser
try {
 const zone = 'America/New_York', leadPerson = await cmd('save:people', { name: 'Noor Lead', timezone: zone }), staffPerson = await cmd('save:people', { name: 'Sam Staff', timezone: zone })
 const client = await cmd('save:clients', { name: 'Riverside Cafe' })
 const engagement = await cmd('save:engagements', { name: 'Riverside site', clientId: client.id, leadId: leadPerson.id, members: [staffPerson.id], scope: 'Agreed five-page site', timezone: zone })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: engagement.id, mode: 'fixed', amountMinor: 600000, effortSeconds: 144000, roundingSeconds: 60, reason: 'Agreed fixed fee' }))
 const lead = await h.invite('scope-lead'), staff = await h.invite('scope-staff'), financeUser = await h.invite('scope-finance'), reviewer = await h.invite('scope-reviewer')
 await cmd('grant', { operatorId: lead.id, personId: leadPerson.id, role: 'lead', enabled: true }); await cmd('grant', { operatorId: staff.id, personId: staffPerson.id, role: 'staff', enabled: true })
 const financePerson = await cmd('save:people', { name: 'Fin Person', timezone: zone }); await cmd('grant', { operatorId: financeUser.id, personId: financePerson.id, role: 'finance', enabled: true })
 await cmd('grant', { operatorId: reviewer.id, personId: financePerson.id, role: 'finance', enabled: true })
 const booked = async () => (await state()).pipeline.find(x => x.currency === 'USD')?.bookedMinor ?? 0
 const approvedBudgets = async () => (await state()).data.budgets.filter(b => b.value.engagementId === engagement.id)
 const base = { engagementId: engagement.id, title: 'Extra landing pages', description: 'Two more landing pages for the autumn menu', addedFeeMinor: 150000, addedEffortSeconds: 36000, scheduleDays: 7, reason: 'Client asked for two more pages' }
 const startBooked = await booked(), startBudgets = (await approvedBudgets()).length

 // Only a lead of the engagement or finance proposes; cost and margin stay finance's.
 await cmd('scope:propose', base, staff.cookie, 403)
 await cmd('scope:propose', { ...base, addedCostMinor: 50000 }, lead.cookie, 403)
 await cmd('scope:propose', { ...base, addedFeeMinor: 0, addedEffortSeconds: 0, scheduleDays: 0 }, lead.cookie, 400)
 const v1 = await cmd('scope:propose', base, lead.cookie)
 let data = await state(); const row = id => data.data.scopeChanges.find(r => r.id === id)
 assert.deepEqual([row(v1.id).value.number, row(v1.id).value.delta.feeMinor, row(v1.id).value.baseline.amountMinor, row(v1.id).value.impact.marginMinor], [1, 150000, 600000, null])
 assert.equal((await state(staff.cookie)).data.scopeChanges.length, 0); assert(!JSON.stringify((await state(lead.cookie)).data.scopeChanges).includes('marginMinor'))
 assert.deepEqual([await booked(), (await approvedBudgets()).length], [startBooked, startBudgets], 'A pending change consumes no approved budget')

 // Internal review is independent; the client declines version one.
 await cmd('scope:approve', { ...v1, reason: 'Preparer reviewing own change' }, lead.cookie, 403)
 await cmd('scope:decide', { ...v1, outcome: 'accepted', reason: 'Too early' }, owner, 409)
 await cmd('scope:approve', { ...v1, reason: 'Scope and price look right' }, owner)
 await cmd('scope:approve', { ...v1, reason: 'Twice' }, owner, 409)
 await cmd('scope:decide', { ...v1, outcome: 'declined', reason: 'Lead cannot record client decisions' }, lead.cookie, 403)
 await cmd('scope:decide', { ...v1, outcome: 'declined', reason: 'Client found two pages too expensive' }, financeUser.cookie)
 await cmd('scope:decide', { ...v1, outcome: 'declined', reason: 'Again' }, owner, 409)
 assert.deepEqual([await booked(), (await approvedBudgets()).length], [startBooked, startBudgets], 'A declined change changes nothing')

 // Revise: version two is smaller; the declined version stays in history.
 await cmd('scope:propose', { ...base, previousId: v1.id, title: 'Extra landing pages', addedFeeMinor: 100000, addedEffortSeconds: 21600, scheduleDays: 3, addedCostMinor: 40000, reason: 'One landing page and one menu page' }, lead.cookie, 403)
 const v2 = await cmd('scope:propose', { ...base, previousId: v1.id, addedFeeMinor: 100000, addedEffortSeconds: 21600, scheduleDays: 3, addedCostMinor: 40000, reason: 'One landing page and one menu page' }, financeUser.cookie)
 data = await state(); assert.deepEqual([row(v2.id).value.number, row(v2.id).value.rootId === row(v1.id).value.rootId, row(v2.id).value.impact.marginMinor, data.data.scopeChanges.length], [2, true, 60000, 2])
 await cmd('scope:propose', { ...base, previousId: v1.id }, financeUser.cookie, 409)
 await cmd('scope:propose', { ...base, previousId: v2.id }, financeUser.cookie, 409)
 await cmd('scope:decide', { ...v2, outcome: 'accepted', acceptorName: 'Rae Brooks', acceptorContact: 'synthetic-gauge-41', acceptanceDate: '2026-10-22', channel: 'email', evidenceRef: 'synthetic-gauge-42', reason: 'No review yet' }, owner, 409)
 await cmd('scope:approve', { ...v2, reason: 'Independent finance review' }, reviewer.cookie)
 for (const field of ['acceptorName', 'acceptorContact', 'acceptanceDate', 'channel', 'evidenceRef']) {
  const incomplete = { ...v2, outcome: 'accepted', acceptorName: 'Rae Brooks', acceptorContact: 'synthetic-gauge-41', acceptanceDate: '2026-10-22', channel: 'email', evidenceRef: 'synthetic-gauge-42', reason: 'Client accepts' }; delete incomplete[field]
  await cmd('scope:decide', incomplete, owner, 400)
 }
 assert.deepEqual([await booked(), (await approvedBudgets()).length], [startBooked, startBudgets], 'An unrecorded acceptance changes nothing')
 await cmd('scope:decide', { ...v2, outcome: 'accepted', acceptorName: 'Rae Brooks', acceptorContact: 'synthetic-gauge-41', acceptanceDate: '2026-10-22', channel: 'email', evidenceRef: 'synthetic-gauge-42', reason: 'Client accepts the smaller change' }, owner)
 data = await state(); const accepted = data.data.scopeEvents.find(x => x.value.type === 'client-accepted')
 assert.deepEqual([accepted.value.changeId, accepted.value.acceptorName, accepted.value.notice], [v2.id, 'Rae Brooks', 'recorded by agency, client identity unverified'])
 assert(!JSON.stringify((await state(lead.cookie)).data.scopeEvents).includes('synthetic-gauge-41'), 'Leads never read the client contact or evidence reference')
 const changeOrder = data.data.budgets.find(b => b.id === accepted.value.changeOrderBudgetId)
 assert.deepEqual([changeOrder.value.status, changeOrder.value.amountMinor, changeOrder.value.effortSeconds], ['draft', 700000, 165600]); assert.match(changeOrder.value.reason, /client identity unverified/)
 assert.equal(await booked(), startBooked, 'A prepared change order is not yet signed value')
 await cmd('scope:decide', { ...v2, outcome: 'declined', reason: 'After acceptance' }, owner, 409)
 await cmd('scope:propose', { ...base, previousId: v2.id }, financeUser.cookie, 409)

 // Ordinary exact approval moves the forecast by the accepted increment only: $1,000, never version one's $1,500.
 await cmd('budget:approve', changeOrder)
 assert.equal(await booked(), startBooked + 100000)
 assert.equal((await state()).data.budgets.filter(b => b.value.status === 'approved' && b.value.engagementId === engagement.id).length, startBudgets + 1)

 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 await context.addCookies(owner.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
 const shots = process.env.GAUGE_SCOPE_SHOTS; if (shots) await mkdir(shots, { recursive: true })
 await page.goto(h.origin + '/app/engagements')
 const text = await page.locator('main').innerText()
 for (const expected of ['Scope changes', 'Extra landing pages · version 2', 'Accepted by client (reported); budget change order prepared', 'recorded by agency, client identity unverified', 'Rae Brooks via email']) assert(text.includes(expected), `Engagements shows ${expected}`)
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Scope changes fit ${width}`)
  if (shots) { const box = await page.evaluate(() => ({ top: document.querySelector('#scope-changes').getBoundingClientRect().top + scrollY, height: document.documentElement.scrollHeight })); await page.screenshot({ path: `${shots}/scope-changes-${width}.png`, fullPage: true, clip: { x: 0, y: box.top - 16, width, height: box.height - box.top + 16 } }) }
 }
 // The browser forms reach the same commands: propose through the page, then see it awaiting review.
 await page.setViewportSize({ width: 1440, height: 1000 })
 const form = page.locator('form').filter({ has: page.locator('[name=action][value="scope:propose"]') })
 await form.getByLabel('Change title').fill('Seasonal banner'); await form.getByLabel('What the client asked for').fill('A winter banner on the home page')
 await form.getByLabel('Added fee').fill('250.00'); await form.getByLabel('Added hours').fill('3'); await form.getByLabel('Reason for the change').fill('Client request by email')
 await form.getByRole('button', { name: 'Propose change' }).click(); await page.waitForURL('**/app/engagements**')
 assert((await page.locator('main').innerText()).includes('Proposed; needs internal review'))
 assert.deepEqual((await state()).data.scopeChanges.filter(r => r.value.title === 'Seasonal banner').map(r => [r.value.delta.feeMinor, r.value.delta.effortSeconds]), [[25000, 10800]])
 console.log('PASS SALES-005 propose, independent review, client decline, revision, reported acceptance and exact change-order approval; only the accepted increment moves signed value (PARTIAL: default pending ct)')
} finally { await browser?.close(); await h.dispose() }
