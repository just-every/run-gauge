import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { restoreAnalyst } from './fixtures/analyst-portability.mjs'

// One public-door journey: two roles ask the same operational questions and review an authorized correction.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 const { cmd, request, owner } = h
 const person = await cmd('save:people', { name: 'Morgan Ellis', timezone: 'America/New_York' })
 const client = await cmd('save:clients', { name: 'Cascade Studio' })
 const project = await cmd('save:engagements', { name: 'Autumn launch', clientId: client.id, leadId: person.id, members: [person.id], scope: 'Campaign delivery', timezone: 'America/New_York' })
 const otherLead = await cmd('save:people', { name: 'Casey Monroe', timezone: 'America/New_York' })
 const other = await cmd('save:engagements', { name: 'Restricted engagement', clientId: client.id, leadId: otherLead.id, members: [], scope: 'Private work', timezone: 'America/New_York' })
 const task = await cmd('save:tasks', { engagementId: project.id, name: 'Campaign strategy', remainingSeconds: 7200 })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: project.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Signed project terms' }))
 const rate = await cmd('save:rates', { personId: person.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 6000 })
 await cmd('save:calendars', { personId: person.id, from: '2026-10-01', to: '2026-10-31', weekdays: '1,2,3,4,5', dailySeconds: 28800, timezone: 'America/New_York' })
 const entries = []
 for (const [day, hours] of [['2026-10-05', 4], ['2026-10-12', 2]]) {
  const draft = await cmd('time:save', { personId: person.id, engagementId: project.id, taskId: task.id, service: 'Strategy', notes: 'Approved client workshop', timezone: 'America/New_York', billable: true, start: `${day}T09:00:00-04:00`, end: `${day}T${9 + hours}:00:00-04:00` })
  entries.push(await cmd('time:approve', await cmd('time:submit', draft)))
 }
 const lead = await h.invite('Morgan')
 const finance = await h.invite('Finley')
 const agent = await h.invite('Helper')
 await cmd('grant', { operatorId: lead.id, personId: person.id, role: 'lead', enabled: true })
 await cmd('grant', { operatorId: finance.id, personId: otherLead.id, role: 'finance', enabled: true })
 await cmd('grant', { operatorId: agent.id, role: 'agent', purpose: 'staffing', engagementIds: [project.id], enabled: true })
 const input = { from: '2026-10-12', to: '2026-10-16', compareFrom: '2026-10-05', compareTo: '2026-10-09', asOf: '2026-10-16', engagementId: project.id }
 const ask = (question, cookie = owner, extra = {}) => request('/api/gauge/analyst?' + new URLSearchParams({ ...input, question, ...extra }), cookie)
 const read = async (question, cookie = owner, extra) => { const r = await ask(question, cookie, extra); const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body }
 const auditCount = async () => { const r = await request('/api/gauge/audit', owner); assert.equal(r.status, 200); return (await r.json()).head.seq }
 const before = await auditCount(), utilizationQuestion = 'Why did utilization fall?', marginQuestion = 'Why did this project lose margin?'
 for (const who of [lead, finance]) {
  const answer = await read(utilizationQuestion, who.cookie)
  assert.equal(answer.status, 'answered'); assert.equal(answer.subject, 'utilization')
  const figure = (period, field) => answer.figures.find(f => f.period === period && f.id.endsWith(':' + field))
  // Independent controls: 40 hours available each week, with four then two recorded billable hours.
  assert.equal(figure('comparison', 'recordedBillableSeconds').value, 14400)
  assert.equal(figure('current', 'recordedBillableSeconds').value, 7200)
  for (const period of ['current', 'comparison']) assert.equal(figure(period, 'availableSeconds').value, 144000)
  assert.equal(figure('comparison', 'recordedBillableCapacity').value, 10)
  assert.equal(figure('current', 'recordedBillableCapacity').value, 5)
  assert.match(answer.summary, /fell.*10.00%.*5.00%.*-5.00/)
  assert(answer.figures.every(f => f.formula && f.asOf && f.sources.every(s => s.revision && !Object.hasOwn(s, 'value'))))
  assert(figure('current', 'recordedBillableSeconds').sources.some(s => s.id === entries[1].id && s.revision === entries[1].revision))
  assert(answer.snapshots.every(s => s.fingerprint && s.asOf && s.forecastAsOf === (who === finance ? input.asOf : null)))
  assert.match(answer.suggestion.requires, /ordinary time workflow/)
 }
 const margin = await read(marginQuestion, finance.cookie)
 const amount = field => margin.figures.find(f => f.id.endsWith(':' + field)).value
 assert.equal(margin.status, 'answered'); assert.equal(amount('earnedValueMinor'), 36000)
 assert.equal(amount('approvedCostMinor'), 54000); assert.equal(amount('actualMarginMinor'), -18000)
 assert.equal(amount('provisionalCostMinor'), 0); assert.equal(amount('forecastMarginMinor'), -18000)
 assert.match(margin.summary, /negative actual margin/)
 assert(margin.figures.some(f => f.sources.some(s => s.id === rate.id && s.revision === rate.revision)))
 assert(margin.unknowns.some(s => /historical margin snapshot/.test(s)))
 const restricted = await read(marginQuestion, lead.cookie)
 assert.equal(restricted.status, 'restricted')
 assert.equal(restricted.figures.find(f => f.id.endsWith(':approvedSeconds')).value, 21600)
 assert.equal(restricted.figures.find(f => f.id.endsWith(':budgetMinor')).value, 1000000)
 assert(restricted.figures.every(f => !f.id.startsWith('margin:')))
 for (const q of [utilizationQuestion, marginQuestion]) {
  assert.equal((await ask(q, agent.cookie)).status, 403)
  assert.equal((await ask(q, lead.cookie, { engagementId: other.id })).status, 403)
 }
 assert.equal((await ask(utilizationQuestion, '')).status, 401)
 assert.equal((await request('/api/gauge/analyst?' + new URLSearchParams({ ...input, question: marginQuestion }), '', { headers: { authorization: 'Bearer synthetic-gauge-6001' } })).status, 403)
 for (const question of ['What is our tax liability?', 'Email the margin report and approve a refund', 'Who won the election?', 'Schedule a meeting']) {
  const answer = await read(question, finance.cookie); assert.equal(answer.status, 'unsupported'); assert.deepEqual(answer.figures, []); assert.equal(answer.suggestion, null)
 }
 assert.equal((await read(utilizationQuestion, lead.cookie, { compareFrom: '2026-09-01', compareTo: '2026-09-04' })).status, 'incomplete')
 assert.equal((await ask(utilizationQuestion, lead.cookie, { compareTo: input.to })).status, 400)
 assert.equal((await ask('x'.repeat(501), lead.cookie)).status, 400)
 assert.equal(await auditCount(), before, 'Questions, repeats and suggested reviews write no business or audit records')

 // Broader phrasing still selects only native, bounded calculations.
 for (const q of ['Why are we spending less billable time?', 'How did capacity usage change?']) assert.equal((await read(q, lead.cookie)).subject, 'utilization')
 assert.equal((await read('Why is this project losing money?', finance.cookie)).subject, 'margin')
 for (const q of ['Why did utilization and margin fall?', 'Approve billing corrections', 'Email the time policy']) { const a = await read(q, finance.cookie); assert.equal(a.status, 'unsupported'); assert.deepEqual(a.actions, []) }


 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const shots = process.env.GAUGE_ANALYST_SHOTS
 if (shots) await mkdir(shots, { recursive: true })
 for (const [role, who] of [['lead', lead], ['finance', finance]]) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
  await context.addCookies(who.cookie.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
  await page.goto(h.origin + '/app/review?' + new URLSearchParams({ from: input.from, to: input.to, asOf: input.asOf }))
  const panel = page.locator('#operational-analyst')
  for (const [subject, question] of [['utilization', utilizationQuestion], ['margin', marginQuestion], ['unsupported', 'What is our tax liability?']]) {
   await panel.getByLabel('Project to analyze').selectOption(project.id)
   await panel.getByLabel('Comparison period from', { exact: true }).fill(input.compareFrom)
   await panel.getByLabel('Comparison period through', { exact: true }).fill(input.compareTo)
   await panel.getByLabel('Your question').fill(question)
   await panel.getByRole('button', { name: 'Ask analyst' }).click()
   const text = await page.locator('#analyst-answer').innerText()
   if (subject === 'utilization') {
    assert.match(text, /fell.*10.00%.*5.00%/)
    if (role === 'finance') assert.equal(text.match(new RegExp(`forecast date ${input.asOf}`, 'g'))?.length, 2, 'Both period snapshots use the selected forecast date')
   }
   if (subject === 'margin') assert.match(text, role === 'lead' ? /require finance authority/ : /negative actual margin/)
   if (subject === 'unsupported') assert.match(text, /outside those supported calculations/)
   if (role === 'lead') assert(!/costMinor|\$540|\$180|\$360/.test(text), 'Lead answer contains no private amounts')
   if (subject !== 'unsupported') {
    const sources = page.locator('#analyst-answer details').first()
    if (await sources.count()) await sources.locator('summary').click()
   }
   for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role} ${subject} fits ${width}`)
    assert(await panel.locator('input,select,textarea,button,p,h2,h3,h4,li').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).fontSize) >= 13)))
    if (shots) await panel.screenshot({ path: `${shots}/${role}-${subject}-${width}.png` })
   }
  }
  await context.close()
 }
 // Finance explicitly captures a historical observation; asking never captures one.
 const captureInput = { ...input, fingerprint: (await read(marginQuestion, finance.cookie)).snapshots[0].fingerprint, label: 'Before delivery rework' }
 await cmd('analyst:capture', captureInput, lead.cookie, 403)
 await cmd('analyst:capture', captureInput, agent.cookie, 403)
 const baseline = await cmd('analyst:capture', captureInput, finance.cookie)
 await cmd('analyst:capture', captureInput, finance.cookie, 409)
 const rework = await cmd('time:approve', await cmd('time:submit', await cmd('time:save', { personId: person.id, engagementId: project.id, taskId: task.id, service: 'Strategy', notes: 'Internal rework after workshop', timezone: 'America/New_York', billable: false, start: '2026-10-14T09:00:00-04:00', end: '2026-10-14T10:00:00-04:00' })))
 const comparison = await read(marginQuestion, finance.cookie, { comparisonSnapshotId: baseline.id })
 assert.equal(comparison.figures.find(f => f.period === 'comparison' && f.id.endsWith(':actualMarginMinor')).value, -18000)
 assert.equal(comparison.figures.find(f => f.period === 'current' && f.id.endsWith(':actualMarginMinor')).value, -27000)
 assert.match(comparison.summary, /fell by -9000.*earned operational value changed by 0, approved cost by 9000/)
 assert(comparison.figures.some(f => f.period === 'current' && f.sources.some(s => s.id === rework.id && s.revision === rework.revision)))
 assert.equal((await ask(marginQuestion, finance.cookie, { engagementId: other.id, comparisonSnapshotId: baseline.id })).status, 403)
 for (const who of [lead, agent]) {
  assert.deepEqual((await h.state(who.cookie)).data.analystSnapshots, [])
  assert.equal((await request(`/api/gauge/history/analystSnapshots/${baseline.id}`, who.cookie)).status, 403)
 }
 assert.equal((await read(marginQuestion, lead.cookie, { comparisonSnapshotId: baseline.id })).status, 'restricted')
 const retained = (await h.state()).data.analystSnapshots.find(s => s.id === baseline.id)
 assert(!JSON.stringify(retained).includes('Morgan Ellis')); assert(!retained.value.figures.some(f => f.sources.some(s => Object.hasOwn(s, 'value'))))

 // Time policy findings cite both current policy and the actual entry; they never reverse approval.
 const policy = await cmd('time:policy', { lockThrough: null, reason: 'Reviewed current entry and notes limits', review: { dueWeekday: 1, dueTime: '17:00', minimumNotes: 20, maxEntrySeconds: 10800, maxDaySeconds: 28800, reviewLevels: 1, separation: false, serviceBillability: { Strategy: false } } })
 const draft = await cmd('time:save', { personId: person.id, engagementId: project.id, taskId: task.id, service: 'Strategy', notes: 'Brief', timezone: 'America/New_York', start: '2026-10-15T09:00:00-04:00', end: '2026-10-15T10:00:00-04:00' })
 const policyBefore = await auditCount()
 for (const who of [lead, finance]) {
  const a = await read('Why are these timesheets failing time policy?', who.cookie)
  assert.equal(a.subject, 'time-policy'); assert.equal(a.status, 'answered')
  assert(a.figures.some(f => f.id.includes(draft.id) && /Work notes need/.test(f.label) && f.sources.some(s => s.id === policy.id && s.revision === policy.revision)))
  assert(a.actions.some(x => x.sources.some(s => s.id === draft.id && s.revision === draft.revision)))
  if (who === lead) assert(a.unknowns.some(x => /Other-project records may be withheld/.test(x)))
 }
 assert.equal(await auditCount(), policyBefore)
 await cmd('time:submit', draft, lead.cookie, 400)
 await cmd('time:policy', { ...policy, lockThrough: '2026-10-31', reason: 'Lead cannot reopen from a suggestion' }, lead.cookie, 403)

 // Billing review uses current approved artifacts, not guessed replacement amounts.
 let packet = await cmd('packet:create', { engagementId: project.id, title: 'Reviewed workshop billing', sources: [`time:${entries[0].id}`] }, finance.cookie)
 packet = await cmd('packet:approve', packet, finance.cookie)
 let billing = await read('Why does billing differ from earned revenue?', finance.cookie)
 assert.equal(billing.subject, 'billing'); assert.equal(billing.status, 'incomplete'); assert.equal(billing.figures.find(f => f.id.endsWith(':paidCashMinor')).value, null); assert(billing.unknowns.some(s => /No receipts are recorded/.test(s)))
 assert.equal(billing.figures.find(f => f.id.endsWith(':billedMinor')).value, 24000)
 assert.match(billing.observations.join(' '), /Billed − earned operational value = -12000/)
 assert(billing.actions.some(a => a.sources.some(s => s.id === packet.id && s.revision === packet.revision)))
 const privateBilling = await read('Why does billing differ from earned revenue?', lead.cookie)
 assert.equal(privateBilling.status, 'restricted'); assert.deepEqual(privateBilling.figures, []); assert.deepEqual(privateBilling.actions, [])
 const billingBefore = await auditCount()
 const adjust = { ...packet, sourceKind: 'time', sourceId: entries[0].id, correctedAmountMinor: 21000, reason: 'Finance reviewed the cited source and confirmed a goodwill reduction' }
 await cmd('packet:adjust', adjust, lead.cookie, 403); await cmd('packet:adjust', adjust, agent.cookie, 403)
 assert.equal(await auditCount(), billingBefore)
 const originalArtifact = (await h.state()).data.packets.find(p => p.id === packet.id).value.artifact
 const delta = await cmd('packet:adjust', adjust, finance.cookie)
 assert.equal((await read('Explain billing discrepancies', finance.cookie)).figures.find(f => f.id.endsWith(':billedMinor')).value, 24000, 'Draft correction cannot change billed totals')
 await cmd('packet:approve', delta, lead.cookie, 403)
 await cmd('packet:approve', delta, finance.cookie)
 billing = await read('Explain billing discrepancies', finance.cookie)
 assert.equal(billing.figures.find(f => f.id.endsWith(':billedMinor')).value, 21000)
 assert.equal(billing.figures.find(f => f.id.startsWith('corrections:') && f.id.endsWith(`${entries[0].id}:currentAmountMinor`)).value, 21000)
 assert.equal((await h.state()).data.packets.find(p => p.id === packet.id).value.artifact, originalArtifact)
 const afterCorrections = await auditCount()
 for (const q of ['Explain billing discrepancies', 'Explain time policy', marginQuestion]) await read(q, finance.cookie)
 assert.equal(await auditCount(), afterCorrections)

 // The same questions and explicit review steps are available in the built browser door.
 for (const [role, who] of [['lead', lead], ['finance', finance]]) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
  await context.addCookies(who.cookie.split('; ').map(part => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), url: h.origin } }))
  await page.goto(h.origin + '/app/review?' + new URLSearchParams({ from: input.from, to: input.to, asOf: input.asOf }))
  const panel = page.locator('#operational-analyst')
  for (const [subject, question] of [['time-policy', 'Explain time policy'], ['billing', 'Explain billing discrepancies'], ['historical-margin', marginQuestion]]) {
   await panel.getByLabel('Project to analyze').selectOption(project.id)
   await panel.getByLabel('Your question').fill(question)
   if (subject === 'historical-margin' && role === 'finance') await panel.getByLabel('Historical margin comparison').selectOption(baseline.id)
   await panel.getByRole('button', { name: 'Ask analyst' }).click()
   const result = page.locator('#analyst-answer'), text = await result.innerText()
   if (subject === 'time-policy') { assert.match(text, /Work notes need/); assert(await result.getByRole('link', { name: 'Review 2026-10-15 time' }).count()) }
   if (subject === 'billing') assert.match(text, role === 'finance' ? /Billed − earned operational value = -15000/ : /require finance authority/)
   if (subject === 'historical-margin') assert.match(text, role === 'finance' ? /fell by -9000/ : /require finance authority/)
   if (role === 'lead') assert(!/costMinor|\$630|\$270|\$210/.test(text))
   for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role} ${subject} fits ${width}`)
    assert(await panel.locator('input,select,textarea,button,p,h2,h3,h4,li').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).fontSize) >= 13)))
    if (shots) await panel.screenshot({ path: `${shots}/${role}-${subject}-${width}.png` })
   }
  }
  // Following a review proposal opens the ordinary form and cannot apply it.
  if (role === 'finance') {
   await panel.getByLabel('Your question').fill('Explain billing discrepancies'); await panel.getByRole('button', { name: 'Ask analyst' }).click()
   await page.locator('#analyst-answer').getByRole('link', { name: 'Review billing adjustment' }).first().click()
   assert.equal(new URL(page.url()).pathname, '/app/billing')
   assert(await page.getByText('Prepare adjustment', { exact: true }).count())
   assert.equal(await auditCount(), afterCorrections)
  }
  await context.close()
 }

 // The ordinary correction door still requires live authority and the exact approved revision.
 const oldSnapshot = await read(utilizationQuestion, lead.cookie)
 await cmd('time:correct', { ...entries[1], reason: 'Review suggested by analyst' }, agent.cookie, 403)
 assert.equal(await auditCount(), afterCorrections)
 const corrected = await cmd('time:correct', { ...entries[1], reason: 'Lead reviewed the exact approved entry' }, lead.cookie)
 const history = await (await request(`/api/gauge/history/time/${corrected.id}`, owner)).json()
 assert(history.history.some(r => r.action === 'time:correct' && r.value.status === 'approved'))
 assert.equal((await ask(utilizationQuestion, lead.cookie, { fingerprint: oldSnapshot.snapshots[0].fingerprint })).status, 409)
 const returned = (await h.state()).data.time.find(t => t.id === corrected.id)
 const replacement = await cmd('time:save', { ...returned.value, ...corrected, end: '2026-10-12T10:30:00-04:00', notes: 'Actual workshop duration confirmed by the worker' }, lead.cookie)
 const submittedReplacement = await cmd('time:submit', replacement, lead.cookie)
 await cmd('time:approve', corrected, lead.cookie, 409)
 await cmd('time:approve', submittedReplacement, lead.cookie)
 const reconciled = await read(marginQuestion, finance.cookie, { comparisonSnapshotId: baseline.id })
 assert.equal(reconciled.figures.find(f => f.period === 'current' && f.id.endsWith(':approvedCostMinor')).value, 58500)
 assert.equal(reconciled.figures.find(f => f.period === 'current' && f.id.endsWith(':earnedValueMinor')).value, 33000)
 assert.equal(reconciled.figures.find(f => f.period === 'current' && f.id.endsWith(':actualMarginMinor')).value, -25500)

 await cmd('grant', { operatorId: lead.id, personId: person.id, role: 'lead', enabled: false })
 assert.equal((await ask(utilizationQuestion, lead.cookie)).status, 403)
 assert.equal((await request('/app/review?' + new URLSearchParams({ question: marginQuestion, analystProject: project.id }), lead.cookie)).status, 403)
 const latestProject = (await h.state()).data.engagements.find(r => r.id === project.id)
 await cmd('save:engagements', { ...latestProject.value, id: latestProject.id, revision: latestProject.revision, leadId: otherLead.id })
 await cmd('privacy:policy', { personalDays: 0, fileDays: 0, evidenceDays: 0, reason: 'Owner reviewed bounded native erasure' })
 await cmd('privacy:exit', { personId: person.id, date: '2020-01-01', reason: 'Former worker' })
 const erasure = await cmd('privacy:preview', { personId: person.id })
 assert.deepEqual(erasure.blockers, [])
 await cmd('privacy:erase', { personId: person.id, fingerprint: erasure.fingerprint, reason: 'Explicit bounded erasure consent', confirm: 'erase-reviewed-native-scope', lawfulReceiptRemoval: 'authorized' })
 const erasedResponse = await ask(utilizationQuestion, lead.cookie)
 assert.equal(erasedResponse.status, 403); assert(!/Morgan Ellis|costMinor/.test(await erasedResponse.text()))
 await cmd('grant', { operatorId: lead.id, personId: person.id, role: 'lead', enabled: true }, owner, 410)
 assert.equal((await ask(marginQuestion, agent.cookie)).status, 403, 'Replaying a question after erasure cannot obtain finance data')

 // Missing frozen costs stay unknown, even when other work has known costs.
 const unpriced = await cmd('save:people', { name: 'Taylor Reed', timezone: 'America/New_York' })
 const unknownProject = await cmd('save:engagements', { name: 'Unpriced engagement', clientId: client.id, leadId: unpriced.id, members: [unpriced.id], scope: 'Unpriced delivery', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: unknownProject.id, mode: 'hourly', amountMinor: 100000, effortSeconds: 7200, roundingSeconds: 60, reason: 'Approved unknown-cost work' }))
 const unknownTask = await cmd('save:tasks', { engagementId: unknownProject.id, name: 'Unpriced delivery', remainingSeconds: 0 })
 const unknownTime = await cmd('time:approve', await cmd('time:submit', await cmd('time:save', { personId: unpriced.id, engagementId: unknownProject.id, taskId: unknownTask.id, service: 'Delivery', notes: 'Unpriced work awaiting a cost review', timezone: 'America/New_York', billable: true, start: '2026-10-13T09:00:00-04:00', end: '2026-10-13T10:00:00-04:00' })))
 const unknown = await read(marginQuestion, finance.cookie, { engagementId: unknownProject.id })
 assert.equal(unknown.status, 'incomplete')
 assert.equal(unknown.figures.find(f => f.id.endsWith(':actualMarginMinor')).value, null)
 assert(unknown.unknowns.some(s => s.includes(unknownTime.id)))
 assert.equal((await read(utilizationQuestion, finance.cookie, { engagementId: unknownProject.id })).status, 'incomplete')
 // Financial observations survive complete export and restore without retaining session authority.
 await cmd('grant', { operatorId: finance.id, personId: otherLead.id, role: 'finance', enabled: false })
 assert.equal((await ask(marginQuestion, finance.cookie, { comparisonSnapshotId: baseline.id })).status, 403)
 await cmd('analyst:capture', captureInput, finance.cookie, 403)
 assert.equal((await request(`/api/gauge/history/analystSnapshots/${baseline.id}`, finance.cookie)).status, 403)
 const retainedAfterErasure = (await h.state()).data.analystSnapshots.find(s => s.id === baseline.id)
 await restoreAnalyst(h, async restored => {
  const state = await restored.state()
  assert.deepEqual(state.data.analystSnapshots.find(s => s.id === baseline.id), retainedAfterErasure)
  const url = '/api/gauge/analyst?' + new URLSearchParams({ ...input, question: marginQuestion, comparisonSnapshotId: baseline.id })
  assert.equal((await restored.request(url, finance.cookie)).status, 401)
  assert.equal((await restored.request(url, lead.cookie)).status, 401)
  const result = await restored.request(url, restored.owner); assert.equal(result.status, 200)
  const answer = await result.json()
  assert.equal(answer.figures.find(f => f.period === 'comparison' && f.id.endsWith(':actualMarginMinor')).value, -18000)
  assert(!JSON.stringify(answer).includes('Morgan Ellis'))
  assert.equal((await restored.state()).data.packets.filter(p => p.value.correctsPacketId).length, 1, 'No replayed correction from restored answers')
 })
 console.log('PASS bounded analyst with historical margin, time-policy review, billing reconciliation and authorized linked correction: independently reconciled utilization and margin, cited revisions, native finance privacy, unsupported and unknown answers, inert suggestions, exact authorized corrections, revoked access and erased-person refusal; browser at 1440 and 390')
} finally { await browser?.close(); await h.dispose() }
