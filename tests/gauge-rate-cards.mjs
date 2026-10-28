import assert from 'node:assert/strict'
import { harness } from './gauge-harness.mjs'

// RATE-002 / RATE-003 through the public command, state, explain API and rates page doors.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' }), { cmd, state, request } = h
const hour = 3600
try {
 const ana = await cmd('save:people', { name: 'Ana', timezone: 'America/New_York', role: 'Designer', employmentType: 'employee' })
 const cal = await cmd('save:people', { name: 'Cal', timezone: 'America/New_York', role: 'Designer', employmentType: 'contractor' })
 const [alpha, beta] = [await cmd('save:clients', { name: 'Alpha Co' }), await cmd('save:clients', { name: 'Beta Co' })]
 const engagement = async (name, client) => { const e = await cmd('save:engagements', { name, clientId: client.id, leadId: ana.id, members: [ana.id, cal.id], scope: 'Agreed scope', timezone: 'America/New_York' }); const t = await cmd('save:tasks', { engagementId: e.id, name: 'Work', remainingSeconds: 36000 }); await cmd('budget:approve', await cmd('save:budgets', { engagementId: e.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 360000, roundingSeconds: 60, reason: 'Agreed terms' })); return { ...e, task: t } }
 const ea = await engagement('Alpha retainer', alpha), eb = await engagement('Beta launch', beta)
 const card = input => cmd('save:rates', { effective: '2026-01-01', ...input })
 const serviceCard = await card({ service: 'Design', billMinor: 10000, costMinor: 4000 })
 const roleCard = await card({ role: 'Designer', service: 'Design', billMinor: 12000 })
 const alphaOld = await card({ clientId: alpha.id, role: 'Designer', service: 'Design', billMinor: 15000 })
 const alphaNew = await card({ clientId: alpha.id, role: 'Designer', service: 'Design', effective: '2026-10-10', billMinor: 18000 })
 const betaCard = await card({ clientId: beta.id, service: '*', billMinor: 13000 })
 const anaCard = await card({ personId: ana.id, service: '*', billMinor: 11000, costMinor: 6000 })
 await card({ personId: cal.id, service: '*', billMinor: 11000, costMinor: 7000 })
 const projectCard = await card({ engagementId: eb.id, service: 'Strategy', billMinor: 20000, overtimeAfterSeconds: hour, overtimeBps: 15000, writeDownBps: 1000 })
 const staff = await h.invite('rate-staff'); await cmd('grant', { operatorId: staff.id, personId: ana.id, role: 'staff', enabled: true })

 const record = async (k, id, cookie) => (await state(cookie)).data[k].find(r => r.id === id)
 const approve = async (person, e, service, day, start = '09:00') => {
  const saved = await cmd('time:save', { personId: person.id, engagementId: e.id, taskId: e.task.id, service, timezone: 'America/New_York', billable: true, start: `${day}T${start}:00-04:00`, end: `${day}T${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00:00-04:00` })
  const submitted = await cmd('time:submit', saved); await cmd('time:approve', submitted); return (await record('time', saved.id)).value.economics
 }

 // Cards: client and project cards carry bill rates only; costs are USD-declared; staff never edit or read cards.
 await cmd('save:rates', { clientId: alpha.id, service: 'Design', effective: '2026-02-01', billMinor: 1, costMinor: 1 }, h.owner, 400)
 await cmd('save:rates', { personId: ana.id, service: 'Design', effective: '2026-02-01', billMinor: 1, costMinor: 1, costCurrency: 'EUR' }, h.owner, 400)
 await cmd('save:rates', { personId: ana.id, clientId: alpha.id, effective: '2026-02-01', billMinor: 1 }, h.owner, 400)
 await cmd('save:rates', { role: 'Designer', service: 'Design', effective: '2026-02-01', billMinor: 1 }, staff.cookie, 403)
 assert.deepEqual((await state(staff.cookie)).data.rates, [])
 console.log('PASS RATE-002 / RATE-003 versioned client, role, person, service and project cards; bill-only client cards, USD-declared costs, finance-only')

 // Identical service for two clients at different rates, across Alpha's effective date, with declared W-2 and 1099 costs.
 const alphaBefore = await approve(ana, ea, 'Design', '2026-10-05'), betaSame = await approve(ana, eb, 'Design', '2026-10-05', '11:00')
 const contractor = await approve(cal, ea, 'Design', '2026-10-05', '13:00'), alphaAfter = await approve(ana, ea, 'Design', '2026-10-12')
 assert.deepEqual([alphaBefore.rateLevel, alphaBefore.rateId, alphaBefore.billMinor], ['client-role', alphaOld.id, 15000])
 assert.deepEqual([betaSame.rateLevel, betaSame.rateId, betaSame.billMinor], ['client', betaCard.id, 13000])
 assert.deepEqual([alphaAfter.rateId, alphaAfter.billMinor], [alphaNew.id, 18000])
 assert.deepEqual([alphaBefore.costRateId, alphaBefore.costLevel, alphaBefore.costMinor, alphaBefore.costCurrency, alphaBefore.costKind], [anaCard.id, 'person', 6000, 'USD', 'w2-loaded'])
 assert.deepEqual([contractor.billMinor, contractor.costMinor, contractor.costKind], [15000, 7000, '1099-contract'])
 const frozenTrace = alphaBefore.precedence.map(l => [l.level, l.chosen])
 assert.deepEqual(frozenTrace, [['project', null], ['client-role', alphaOld.id], ['client', null], ['role', roleCard.id], ['person', anaCard.id], ['service', serviceCard.id]])
 console.log('PASS RATE-002 / RATE-003 identical services bill two clients differently, cross an effective date and freeze declared W-2/1099 USD costs')

 // Project card overtime and write-down: the second hour that day passes the 1 h threshold at 1.5×, then 10% is written down.
 const first = await approve(ana, eb, 'Strategy', '2026-10-06'), second = await approve(ana, eb, 'Strategy', '2026-10-06', '10:00')
 assert.deepEqual([first.rateLevel, first.rateId, first.overtimeSeconds, first.standardBillMinor, first.writeDownMinor, first.billMinor], ['project', projectCard.id, 0, 20000, 2000, 18000])
 assert.deepEqual([second.overtimeSeconds, second.overtimeRateMinor, second.standardBillMinor, second.writeDownMinor, second.billMinor], [hour, 30000, 30000, 3000, 27000])

 // A negotiated entry override beats every card, stays private to finance and is frozen at approval.
 const saved = await cmd('time:save', { personId: ana.id, engagementId: ea.id, taskId: ea.task.id, service: 'Design', timezone: 'America/New_York', billable: true, start: '2026-10-07T09:00:00-04:00', end: '2026-10-07T10:00:00-04:00' }, staff.cookie)
 await cmd('rate:entry', { ...saved, billRateMinor: 9000, reason: 'Negotiated' }, staff.cookie, 403)
 const overridden = await cmd('rate:entry', { ...saved, billRateMinor: 9000, writeDownBps: 500, reason: 'Negotiated launch rate' })
 assert.equal((await record('time', saved.id, staff.cookie)).value.rateOverride, undefined)
 await cmd('time:approve', await cmd('time:submit', overridden, staff.cookie))
 const negotiated = (await record('time', saved.id)).value.economics
 assert.deepEqual([negotiated.rateLevel, negotiated.rateId, negotiated.billRateMinor, negotiated.writeDownMinor, negotiated.billMinor, negotiated.entryOverride.reason], ['entry', null, 9000, 450, 8550, 'Negotiated launch rate'])
 console.log('PASS RATE-002 / RATE-003 overtime rules, write-downs and negotiated entry overrides freeze at approval')

 // Explain view through the API and the rates page; a later card never rewrites an approved value.
 const explained = await (await request(`/api/gauge/rates/explain?personId=${ana.id}&engagementId=${ea.id}&service=Design&date=2026-10-12`, h.owner)).json()
 assert.deepEqual(explained.precedence, ['entry', 'project', 'client-role', 'client', 'role', 'person', 'service'])
 assert.deepEqual([explained.bill.level, explained.bill.rate.id, explained.cost.level, explained.cost.rate.id], ['client-role', alphaNew.id, 'person', anaCard.id])
 assert.deepEqual(explained.levels.find(l => l.level === 'client-role').candidates.map(c => c.id).sort(), [alphaOld.id, alphaNew.id].sort())
 assert.equal((await request(`/api/gauge/rates/explain?personId=${ana.id}&engagementId=${ea.id}&service=Design&date=2026-10-12`, staff.cookie)).status, 403)
 const page = await (await request(`/app/rates?explainPerson=${ana.id}&explainEngagement=${ea.id}&explainService=Design&explainDate=2026-10-12`, h.owner)).text()
 assert.match(page, /Client role card, \$180\.00 per hour/); assert.match(page, /Person card, \$60\.00 per hour/)
 await card({ clientId: alpha.id, role: 'Designer', service: 'Design', effective: '2026-10-01', billMinor: 99900 })
 const unchanged = (await state()).data.time.filter(r => r.value.status === 'approved').map(r => r.value.economics.billMinor).sort((x, y) => x - y)
 assert.deepEqual(unchanged, [8550, 13000, 15000, 15000, 18000, 18000, 27000])
 const alphaEcon = (await state()).economics.find(x => x.engagementId === ea.id)
 assert.deepEqual([alphaEcon.billableMinor, alphaEcon.costMinor, alphaEcon.costByCurrency, alphaEcon.otherCostCurrencies], [15000 + 15000 + 18000 + 8550, 6000 + 7000 + 6000 + 6000, { USD: 25000 }, []])
 console.log('PASS RATE-002 / RATE-003 explain view shows precedence; billed value and declared cost trace without changing historical approvals')
} finally { await h.dispose() }
