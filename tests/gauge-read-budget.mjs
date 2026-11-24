import assert from 'node:assert/strict'
import { harness } from './gauge-harness.mjs'

// Workers Free gives every tool on an account 5,000,000 D1 rows read a day. The routine reads of a five-person agency with a
// month of time (the owner's pages, Easel's hourly keyed utilization read, the hourly retainer cron) must not grow with older
// history. Row counts are D1's own meta.rows_read through the public doors; ceilings are generous, a regression is a multiple.
const h = await harness({ currency: 'USD', timezone: 'America/New_York', meter: true, now: '2026-11-25T10:00:00Z' })
const sum = log => log.reduce((n, r) => n + (r.read ?? 0), 0), written = log => log.reduce((n, r) => n + (r.written ?? 0), 0)
try {
 const { cmd, request, owner, db, reads } = h
 const people = [], engagements = [], tasks = []
 for (let i = 0; i < 5; i++) people.push(await cmd('save:people', { name: 'Person ' + i, timezone: 'America/New_York' }))
 const client = await cmd('save:clients', { name: 'Client', paymentTermsDays: 30 })
 for (const p of people) await cmd('save:rates', { personId: p.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 20000 })
 for (let i = 0; i < 2; i++) {
  const e = await cmd('save:engagements', { name: 'Engagement ' + i, clientId: client.id, leadId: people[0].id, members: people.map(p => p.id), scope: 'x', timezone: 'America/New_York' })
  await cmd('budget:approve', await cmd('save:budgets', { engagementId: e.id, mode: 'hourly', amountMinor: 100000000, effortSeconds: 3600000, roundingSeconds: 60, reason: 'SOW' }))
  engagements.push(e); tasks.push(await cmd('save:tasks', { engagementId: e.id, name: 'Work', remainingSeconds: 360000 }))
 }
 await cmd('agency:calendar', { weekdays: [1, 2, 3, 4, 5], holidays: [], reason: 'days' })
 const terms = await cmd('retainer:preview', { engagementId: engagements[0].id, operation: 'terms', terms: { name: 'Monthly retainer', feeMinor: 300000, frequency: 'monthly', unit: 'hours', allowance: 144000, services: ['Retained'], consumes: 'billable', proration: 'calendar', start: '2026-11-01', end: null, renewal: 'automatic', noticeDays: 0, rules: { carryCap: 0, carryPeriods: 0, deficit: false, overage: 'bill', overageRate: 20000 } } })
 const retainer = await cmd('retainer:approve', { ...terms.input, fingerprint: terms.fingerprint, reason: 'fee' })
 await cmd('retainer:schedule', { retainerId: retainer.id, basis: 'advance', from: '2026-11-01', enabled: true, autoIssue: false, heldPeriodIds: [], reason: 'advance' })

 // One approved entry per person per day: 30 days in the window the key reads, 150 older days, and a long audit trail.
 // Each copies the stored shape of an entry made through the public door, so its economics are real.
 const made = await cmd('time:save', { personId: people[0].id, engagementId: engagements[0].id, taskId: tasks[0].id, service: 'Support', notes: 'work', timezone: 'America/New_York', billable: true, start: '2026-11-02T09:00:00-05:00', end: '2026-11-02T10:00:00-05:00' })
 await cmd('time:approve', await cmd('time:submit', made))
 const template = JSON.parse((await db.prepare('SELECT data FROM g_time WHERE id=?').bind(made.id).first()).data)
 const hour = 3600000, rows = [], day = n => new Date(Date.UTC(2026, 9, 31) - n * 86400000).toISOString().slice(0, 10)
 for (let n = 0; n < 180; n++) for (const [i, p] of people.entries()) {
  const workDate = day(n), start = Date.parse(workDate + 'T13:00:00Z'), k = i % 2
  rows.push(db.prepare('INSERT INTO g_time(id,revision,data) VALUES(?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), JSON.stringify({ ...template, engagementId: engagements[k].id, personId: p.id, taskId: tasks[k].id, start, end: start + hour, workDate })))
 }
 for (let i = 0; i < 600; i++) rows.push(db.prepare('INSERT INTO g_history(kind,record_id,revision,data,actor,action,at) VALUES(?,?,?,?,?,?,?)').bind('time', crypto.randomUUID(), crypto.randomUUID(), '{}', 'seed', 'update', 1))
 for (let i = 0; i < rows.length; i += 100) await db.batch(rows.slice(i, i + 100))
 const windowRows = 30 * 5, allRows = 180 * 5 + 1

 // The retainer cron: one period is due and runs once; every later hour with nothing due reads a handful of rows and writes none.
 await reads(); await h.scheduled()
 const due = await reads(); assert.ok(written(due) > 0, 'the first run issues the period')
 await h.scheduled()
 const idle = await reads()
 assert.equal(written(idle), 0, 'an hour with nothing due writes nothing')
 assert.ok(sum(idle) <= 30, `idle cron read ${sum(idle)} rows`)

 // The owner's page and state read: every time row once, no scan of the history table.
 await reads()
 const state = await request('/api/gauge/state?from=2026-10-01&to=2026-10-31', owner); const stateText = await state.text(); assert.equal(state.status, 200, stateText.slice(0, 300))
 const read = await reads()
 assert.equal(read.filter(r => /FROM g_time ORDER BY/.test(r.sql)).length, 1, 'time is read once per request')
 assert.ok(sum(read) <= allRows + 300, `state read ${sum(read)} rows for ${allRows} time rows`)

 // Easel's hourly keyed utilization read: only the requested window, however much older time exists. Each time row is an index entry plus its row.
 const key = await cmd('apikey:create', { label: 'Easel' })
 await reads()
 const util = await request('/api/gauge/state?from=2026-10-02&to=2026-10-31', '', { headers: { authorization: 'Bearer ' + key.token } }); assert.equal(util.status, 200)
 const body = await util.json(); assert.equal(body.approvedBillableSeconds, windowRows * 3600, 'the window is fully counted')
 const keyed = await reads()
 assert.ok(sum(keyed) <= 2 * windowRows + 120, `keyed read ${sum(keyed)} rows with ${allRows} time rows and ${windowRows} in its window`)
console.log(`gauge read budget: idle cron ${sum(idle)} rows read ${written(idle)} written; state ${sum(read)} rows for ${allRows} time rows; keyed read ${sum(keyed)} rows for ${windowRows} in window`)
} finally { await h.dispose() }
