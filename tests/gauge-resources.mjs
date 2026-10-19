import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// RESOURCE-001: agency-wide qualification and capacity search, then a human's
// approval converts one placeholder into one named, committed allocation.
const h = await harness(), from = '2026-10-05', to = '2026-10-09', hour = 3600
let browser
try {
 const { cmd, request, owner } = h
 const state = async (cookie = owner, start = from, end = to) => {
  const response = await request('/api/gauge/state?' + new URLSearchParams({ from: start, to: end }), cookie)
  assert.equal(response.status, 200); return response.json()
 }
 const search = async (id, cookie = owner) => {
  const response = await request(`/api/gauge/resources/${id}`, cookie)
  assert.equal(response.status, 200); return response.json()
 }
 const ids = result => result.candidates.map(p => p.personId).sort()
 const profile = async (name, proficiency = 4, extra = {}) => {
  const value = { name, timezone: 'Australia/Brisbane', skills: [{ name: 'UX', proficiency }], team: 'Product', location: 'Brisbane', role: 'UX designer', employmentType: 'employee', ...extra }
  return { ...await cmd('save:people', value), value }
 }
 const manager = await cmd('save:people', { name: 'Design lead', timezone: 'Australia/Brisbane' })
 const unrelated = await cmd('save:people', { name: 'Other lead', timezone: 'Australia/Brisbane' })
 const employee = await profile('Ava Employee')
 const contractor = await profile('Bo Contractor', 5, { employmentType: 'contractor' })
 const underqualified = await profile('Cy Learning', 2)
 const busy = await profile('Dee Booked')
 const missing = await profile('Eli Unknown')
 const elsewhere = await profile('Fran Elsewhere', 4, { team: 'Brand', location: 'Sydney' })
 for (const person of [employee, contractor, underqualified, busy, elsewhere]) await cmd('save:calendars', { personId: person.id, from, to, dailySeconds: 8 * hour, weekdays: '1,2,3,4,5', timezone: 'Australia/Brisbane' })
 const renamed = await cmd('save:people', { id: employee.id, revision: employee.revision, name: 'Ava Employee', timezone: 'Australia/Brisbane' })
 const preserved = (await state()).data.people.find(p => p.id === renamed.id).value
 for (const key of ['skills', 'team', 'location', 'role', 'employmentType']) assert.deepEqual(preserved[key], employee.value[key], `Ordinary person editing preserves ${key}`)
 await cmd('save:people', { name: 'Invalid skill', timezone: 'Australia/Brisbane', skills: [{ name: 'UX', proficiency: 0 }] }, owner, 400)
 const lead = await h.invite('resource-lead'), staff = await h.invite('resource-staff'), outsider = await h.invite('resource-outsider')
 for (const [user, personId, role] of [[lead, manager.id, 'lead'], [staff, employee.id, 'staff'], [outsider, unrelated.id, 'lead']]) await cmd('grant', { operatorId: user.id, personId, role, enabled: true })
 const client = await cmd('save:clients', { name: 'Cascade Cider' })
 const engagement = await cmd('save:engagements', { name: 'Customer experience', clientId: client.id, leadId: manager.id, members: [], scope: 'Research and UX delivery', timezone: 'Australia/Brisbane' })
 const privateEngagement = await cmd('save:engagements', { name: 'Confidential competing work', clientId: client.id, leadId: unrelated.id, members: [busy.id], scope: 'Private staffing commitment', timezone: 'Australia/Brisbane' })
 const busyBooking = await cmd('save:staffing', { engagementId: privateEngagement.id, personId: busy.id, from, to, dailySeconds: 5 * hour, commitment: 'committed', service: 'UX', billable: true })
 const busyBookingValue = (await state()).data.staffing.find(r => r.id === busyBooking.id).value
 const initialRate = await cmd('save:rates', { personId: employee.id, service: 'UX', effective: '2026-01-01', costMinor: 5000, billMinor: 15000 })
 const changedRate = await cmd('save:rates', { personId: employee.id, service: 'UX', effective: '2026-10-07', costMinor: 7500, billMinor: 15000 })
 await cmd('save:rates', { personId: contractor.id, service: 'UX', effective: '2026-10-07', costMinor: 8000, billMinor: 16000 })

 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
 const signIn = async cookie => {
  await context.clearCookies()
  await context.addCookies(cookie.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
  // Discard the previous persona's document before navigating to an identical hash URL.
  await page.goto('about:blank')
 }
 const capture = async name => {
  if (!process.env.GAUGE_RESOURCE_SHOTS) return
  await mkdir(process.env.GAUGE_RESOURCE_SHOTS, { recursive: true })
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits ${width}`)
   await page.screenshot({ path: `${process.env.GAUGE_RESOURCE_SHOTS}/${name}-${width}.png`, fullPage: true })
   const focus=name==='resource-person-profile'?personForm:name.includes('candidates')?section.getByRole('heading',{name:'Qualified candidates for UX designer'}):name==='resource-filled'?section.getByRole('heading',{name:'Resource requests',exact:true}):section
   await focus.scrollIntoViewIfNeeded()
   await page.screenshot({ path: `${process.env.GAUGE_RESOURCE_SHOTS}/${name}-viewport-${width}.png` })
  }
 }
 await signIn(owner)
 await page.goto(h.origin + `/app/engagements?edit=${employee.id}`)
 const personForm = page.locator('form').filter({ has: page.locator('input[name=action][value="save:people"]') })
 await personForm.getByLabel('Skills (name:proficiency, comma-separated)', { exact: true }).fill('UX:4, Research:3')
 await personForm.locator('[name=employmentType]').selectOption('employee')
 await capture('resource-person-profile')
 await personForm.getByRole('button', { name: 'Save', exact: true }).click()
 assert((await state()).data.people.find(p => p.id === employee.id).value.skills.some(s => s.name === 'Research' && s.proficiency === 3))
 await signIn(lead.cookie)
 await page.goto(h.origin + `/app/capacity?from=${from}`)
 const section = page.locator('#resource-requests')
 assert(await section.isVisible())
 const form = section.locator('form').filter({ has: page.locator('input[name=action][value="save:resourceRequests"]') })
 await form.locator('[name=engagementId]').selectOption(engagement.id)
 await form.getByLabel('Role needed', { exact: true }).fill('UX designer')
 await form.getByLabel('Required skill', { exact: true }).fill('ux')
 await form.getByLabel('Minimum proficiency', { exact: true }).fill('4')
 await form.getByLabel('From', { exact: true }).fill(from)
 await form.getByLabel('Through', { exact: true }).fill(to)
 await form.getByLabel('Requested hours per date', { exact: true }).fill('4')
 await form.getByLabel('Service', { exact: true }).fill('UX')
 await form.getByLabel('Team filter', { exact: true }).fill('Product')
 await form.getByLabel('Location filter', { exact: true }).fill('Brisbane')
 await form.locator('[name=employmentType]').selectOption('')
 await form.getByLabel('Billable request', { exact: true }).check()
 await capture('resource-request-form')
 await form.getByRole('button', { name: 'Save', exact: true }).click()
 let data = await state(), resourceRequest = data.data.resourceRequests.find(r => r.value.engagementId === engagement.id)
 assert(resourceRequest, 'The real Staffing form creates a role placeholder')
 const requestId = resourceRequest.id
 await section.getByRole('link', { name: 'UX designer', exact: true }).click()
 assert.equal(new URL(page.url()).searchParams.get('resourceRequest'), requestId, 'The role opens its actual candidate search')
 const demand = report => report.resourceDemand.find(r => r.engagementId === engagement.id)
 assert.deepEqual([demand(data).unfilledSeconds, demand(data).staffingSeconds, demand(data).totalSeconds], [20 * hour, 0, 20 * hour])
 assert.equal(data.data.staffing.filter(r => r.value.engagementId === engagement.id).length, 0, 'Searching never commits staffing')
 assert.equal(demand(await state(owner, '2026-10-05', '2026-10-06')).totalSeconds, 8 * hour, 'Demand follows the report window')
 let found = await search(requestId)
 assert.deepEqual(ids(found), [employee.id, contractor.id].sort())
 assert.equal(found.request.id, requestId)
 assert(!found.candidates.some(p => p.personId === underqualified.id))
 for (const p of [busy, missing]) assert(found.unavailable.some(r => r.personId === p.id && r.reason), `${p.value.name} has an explicit unavailable reason`)
 const employeeResult = found.candidates.find(p => p.personId === employee.id)
 assert.equal(employeeResult.costMinor, 130000, 'Requested hours use the cost rate effective on each work date')
 assert.equal(employeeResult.totalSeconds, 20 * hour)
 assert.equal(employeeResult.currency, 'USD', 'Declared costs are USD (RATE-002) in an AUD agency')
 assert.deepEqual(employeeResult.days.map(d => [d.date, d.availableSeconds, d.committedSeconds, d.remainingSeconds]), ['05', '06', '07', '08', '09'].map(day => [`2026-10-${day}`, 8 * hour, 0, 8 * hour]))
 assert.equal(employeeResult.profile.team, 'Product'); assert.equal(employeeResult.profile.role, 'UX designer')
 const incompleteCost = found.candidates.find(p => p.personId === contractor.id)
 assert.equal(incompleteCost.costMinor, null); assert.deepEqual(incompleteCost.missingRateDates, ['2026-10-05', '2026-10-06'])
 await cmd('save:rates', { personId: contractor.id, service: 'UX', effective: '2026-01-01', costMinor: 6000, billMinor: 16000 })
 assert.equal((await search(requestId)).candidates.find(p => p.personId === contractor.id).costMinor, 144000)
 const leadSearch = await search(requestId, lead.cookie), leadText = JSON.stringify(leadSearch)
 assert.deepEqual(ids(leadSearch), [employee.id, contractor.id].sort())
 assert(!/costMinor|costRates|missingRateDates|rateId|billMinor|costMinor/.test(leadText), 'Lead search contains no cost or rate fields')
 for (const secret of [privateEngagement.id, 'Confidential competing work', busyBooking.id, initialRate.id, changedRate.id]) assert(!leadText.includes(secret), 'Global capacity reveals no hidden commercial source')
 assert(!(await state(lead.cookie)).data.people.some(p => p.id === contractor.id), 'Search can find an unattached person outside ordinary scoped people')
 for (const cookie of ['', staff.cookie, outsider.cookie]) {
  assert.equal((await request(`/api/gauge/resources/${requestId}`, cookie)).status, cookie ? 403 : 401)
  if (cookie) await cmd('resource:fill', { id: requestId, revision: resourceRequest.revision, personId: contractor.id, fingerprint: leadSearch.fingerprint }, cookie, 403)
 }
 assert.equal((await state(staff.cookie)).data.resourceRequests.length, 0)
 assert.equal((await state(outsider.cookie)).data.resourceRequests.length, 0)
 await cmd('save:staffing', { engagementId: engagement.id, personId: employee.id, from, to, dailySeconds: 4 * hour, commitment: 'committed', service: 'UX', resourceRequestId: requestId }, owner, 400)
 const revise = async changes => {
  await cmd('save:resourceRequests', { ...resourceRequest.value, id: requestId, revision: resourceRequest.revision, ...changes }, lead.cookie)
  const result = await search(requestId, lead.cookie)
  resourceRequest = result.request
  return result
 }
 assert.deepEqual(ids(await revise({ employmentType: 'employee' })), [employee.id])
 assert.deepEqual(ids(await revise({ employmentType: 'contractor' })), [contractor.id])
 assert.deepEqual(ids(await revise({ employmentType: '', team: '', location: '' })), [employee.id, contractor.id, elsewhere.id].sort())
 assert.deepEqual(ids(await revise({ team: 'Product', location: 'Sydney' })), [])
 assert.deepEqual(ids(await revise({ team: 'Brand', location: 'Brisbane' })), [])
 await revise({ team: 'Product', location: 'Brisbane', employmentType: '' })
 const beforeBooking = await search(requestId, lead.cookie)
 const competing = await cmd('save:staffing', { engagementId: privateEngagement.id, personId: employee.id, from, to, dailySeconds: 5 * hour, commitment: 'committed', service: 'UX', billable: true })
 const competingValue = (await state()).data.staffing.find(r => r.id === competing.id).value
 await cmd('resource:fill', { id: requestId, revision: resourceRequest.revision, personId: employee.id, fingerprint: beforeBooking.fingerprint }, lead.cookie, 409)
 const refreshed = await search(requestId, lead.cookie)
 assert.deepEqual(ids(refreshed), [contractor.id]); assert.notEqual(refreshed.fingerprint, beforeBooking.fingerprint)
 assert(refreshed.unavailable.some(p => p.personId === employee.id))
 assert.equal(demand(await state()).unfilledSeconds, 20 * hour, 'A stale approval leaves the placeholder untouched')
 await page.goto(h.origin + `/app/capacity?from=${from}&resourceRequest=${requestId}#resource-requests`)
 assert(await section.getByRole('button', { name: 'Approve and staff', exact: true }).count() === 1)
 assert((await section.innerText()).includes(contractor.value.name))
 assert(!(await section.innerText()).includes('Confidential competing work'))
 await capture('resource-eligible-candidates')
 await signIn(owner); await page.goto(h.origin + `/app/capacity?from=${from}&resourceRequest=${requestId}#resource-requests`)
 assert.equal((await (await context.request.get(h.origin + '/auth/session')).json()).operator.role, 'owner')
 assert.equal(await section.locator('th').filter({hasText:'Declared cost'}).count(),1)
 assert((await section.innerText()).includes('1,440'), 'Finance sees the requested effective cost on the candidate page')
 await capture('resource-finance-candidates')
 await signIn(lead.cookie); await page.goto(h.origin + `/app/capacity?from=${from}&resourceRequest=${requestId}#resource-requests`)
 const fillForm = section.locator('form').filter({ has: page.locator('input[name=action][value="resource:fill"]') })
 const replay = await fillForm.locator('input[name]').evaluateAll(inputs => Object.fromEntries(inputs.map(i => [i.name, i.value])))
 assert.equal(replay.personId, contractor.id)
 await fillForm.getByRole('button', { name: 'Approve and staff', exact: true }).click()
 data = await state()
 const filled = data.data.resourceRequests.find(r => r.id === requestId), allocations = data.data.staffing.filter(r => r.value.resourceRequestId === requestId)
 assert.equal(filled.value.status, 'filled'); assert.equal(filled.value.filledBy, lead.id)
 assert.equal(allocations.length, 1); assert.equal(allocations[0].id, filled.value.staffingId)
 assert.deepEqual([allocations[0].value.personId, allocations[0].value.commitment, allocations[0].value.dailySeconds, allocations[0].value.service, allocations[0].value.billable], [contractor.id, 'committed', 4 * hour, 'UX', true])
 assert(data.data.engagements.find(r => r.id === engagement.id).value.members.includes(contractor.id))
 assert.deepEqual([demand(data).unfilledSeconds, demand(data).staffingSeconds, demand(data).totalSeconds], [0, 20 * hour, 20 * hour], 'Filling replaces 20h placeholder demand, without doubling it')
 const acknowledged = await cmd('resource:fill', replay, lead.cookie)
 assert.equal(acknowledged.id, requestId); assert.equal(acknowledged.revision, filled.revision)
 assert.deepEqual(await cmd('resource:fill', replay, lead.cookie), acknowledged, 'Exact request-key replay acknowledges the original effect')
 await cmd('resource:fill', { ...replay, key: randomUUID() }, lead.cookie, 409)
 await cmd('save:resourceRequests', { ...filled.value, id: requestId, revision: filled.revision, dailySeconds: 5 * hour }, lead.cookie, 409)
 const history = await request(`/api/gauge/history/resourceRequests/${requestId}`, lead.cookie)
 assert.equal(history.status, 200); assert((await history.json()).history.some(r => r.value.status === 'open'))
 assert.equal((await request(`/api/gauge/history/resourceRequests/${requestId}`, staff.cookie)).status, 403)
 data = await state()
 assert.deepEqual(data.data.staffing.find(r => r.id === competing.id).value, competingValue, 'The fill preserves hidden competing staffing')
 assert.deepEqual(data.data.staffing.find(r => r.id === busyBooking.id).value, busyBookingValue)
 await page.goto(h.origin + `/app/capacity?from=${from}&resourceRequest=${requestId}#resource-requests`)
 assert.equal(await section.locator('input[name=action][value="resource:fill"]').count(), 0)
 assert((await section.innerText()).includes(contractor.value.name))
 await capture('resource-filled')
 await section.locator(`a[href="/app/capacity?edit=${allocations[0].id}"]`).click()
 const allocationForm = page.locator('form').filter({ has: page.locator('input[name=action][value="save:staffing"]') })
 assert.equal(await allocationForm.locator('[name=id]').inputValue(), allocations[0].id)
 assert.equal(await allocationForm.locator('[name=personId]').inputValue(), contractor.id)
 assert.equal(await allocationForm.locator('[name=service]').inputValue(), 'UX')

 // Two independently keyed approvals contend for another placeholder. One wins
 // and the other observes the committed revision; the first project stays 20h.
 const raceEngagement = await cmd('save:engagements', { name: 'Follow-up research', clientId: client.id, leadId: manager.id, members: [], scope: 'One-hour research slot', timezone: 'Australia/Brisbane' })
 const raceRequest = await cmd('save:resourceRequests', { engagementId: raceEngagement.id, role: 'UX designer', skill: 'UX', minProficiency: 4, from, to: from, dailySeconds: hour, service: 'UX', billable: true, team: 'Product', location: 'Brisbane', employmentType: 'contractor' }, lead.cookie)
 const raceSearch = await search(raceRequest.id, lead.cookie)
 const raceInput = { action: 'resource:fill', id: raceRequest.id, revision: raceRequest.revision, personId: contractor.id, fingerprint: raceSearch.fingerprint }
 const responses = await Promise.all([h.post('/api/gauge/command', { ...raceInput, key: randomUUID() }, lead.cookie), h.post('/api/gauge/command', { ...raceInput, key: randomUUID() }, lead.cookie)])
 assert.deepEqual(responses.map(r => r.status).sort(), [200, 409])
 data = await state()
 assert.equal(data.data.staffing.filter(r => r.value.resourceRequestId === raceRequest.id).length, 1)
 assert.equal(data.data.staffing.filter(r => r.value.resourceRequestId === requestId).length, 1)
 assert.equal(demand(data).totalSeconds, 20 * hour)
 await cmd('grant', { operatorId: lead.id, personId: manager.id, role: 'lead', enabled: false })
 assert.equal((await request(`/api/gauge/resources/${requestId}`, lead.cookie)).status, 403)
 console.log('PASS RESOURCE-001 qualified employee/contractor search, effective costs and privacy, unavailable capacity, filters, stale search refusal, human browser fill, exact replay, racing approvals and 20h demand reconciliation')
} finally { await browser?.close(); await h.dispose() }
