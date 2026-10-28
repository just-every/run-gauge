import assert from 'node:assert/strict'
import { harness } from './gauge-harness.mjs'

// FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022 expected cash basis as of 10 October 2026, through the command and state doors, for the points today's
// records carry: nothing issued; a New York client on Net 30; a fixed-fee milestone invoiced on its scheduled date and
// October hourly fees monthly in arrears on 1 November; approved days late as the labelled historical-timing end of the
// range; the milestone moved through the approved delivery plan. Retainer in-advance invoices (RETAINER-005 / RETAINER-013 / RETAINER-014), issued
// invoices and disputes (INVOICE-001 / INVOICE-009/006/007), scheduled-invoice probabilities and pending ACH (PAYMENT-001 / PAYMENT-004/002) join later.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
try {
 const { cmd, request, owner } = h, asOf = '2026-10-10'
 const read = async () => { const r = await request(`/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=${asOf}`, owner); assert.equal(r.status, 200); return r.json() }
 const worker = await cmd('save:people', { name: 'Kai Moreno', timezone: 'America/New_York' })
 const client = await cmd('save:clients', { name: 'Hudson Partners', paymentTermsDays: 30 })
 await cmd('save:rates', { personId: worker.id, service: '*', effective: '2026-01-01', costMinor: 9000, billMinor: 20000 })
 const fixed = await cmd('save:engagements', { name: 'Brand launch', clientId: client.id, leadId: worker.id, members: [worker.id], scope: 'Launch', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: fixed.id, mode: 'fixed', amountMinor: 1000000, effortSeconds: 36000, roundingSeconds: 60, reason: 'Fixed fee' }))
 const launch = await cmd('save:milestones', { engagementId: fixed.id, name: 'Launch', due: '2026-10-15', amountMinor: 1000000 }); await cmd('milestone:approve', launch)
 const hourly = await cmd('save:engagements', { name: 'Hourly support', clientId: client.id, leadId: worker.id, members: [worker.id], scope: 'Support', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: hourly.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 72000, roundingSeconds: 60, reason: 'Support SOW' }))
 const task = await cmd('save:tasks', { engagementId: hourly.id, name: 'Support', remainingSeconds: 72000 })
 // $4,000 of October hourly fees at $200/h: 8 approved hours on 5 October and 12 committed hours on 12–14 October.
 const entry = await cmd('time:save', { personId: worker.id, engagementId: hourly.id, taskId: task.id, service: 'Support', notes: 'Support', timezone: 'America/New_York', billable: true, start: '2026-10-05T09:00:00-04:00', end: '2026-10-05T17:00:00-04:00' })
 await cmd('time:approve', await cmd('time:submit', entry))
 await cmd('save:staffing', { personId: worker.id, engagementId: hourly.id, service: 'Support', from: '2026-10-12', to: '2026-10-14', dailySeconds: 14400, commitment: 'committed' })

 const item = (data, engagementId) => { const items = data.cash.engagements.find(e => e.engagementId === engagementId).items; assert.equal(items.length, 1); return items[0] }
 const curve = (data, field) => Object.fromEntries(data.cash.months.filter(m => m[field]).map(m => [m.month, m[field]]))
 // FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022: November $10,000 (due 14 November) and December $4,000 of hourly fees (due 1 December), nothing issued.
 let data = await read()
 assert.equal(data.cash.asOf, asOf)
 let milestone = item(data, fixed.id), fees = item(data, hourly.id)
 assert.deepEqual([milestone.invoiceDate, milestone.receiptDate, milestone.amountMinor], ['2026-10-15', '2026-11-14', 1000000])
 assert.deepEqual([fees.invoiceDate, fees.receiptDate, fees.amountMinor], ['2026-11-01', '2026-12-01', 400000])
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 1000000, '2026-12': 400000 })
 assert.equal(data.cash.engagements.find(e => e.engagementId === fixed.id).termsLabel, 'Net 30')
 assert.equal(data.cash.issuedReceivables, 'None issued'); assert.equal(data.cash.pendingCash, 'No payments recorded'); assert.equal(data.cash.settledCash, 'No payments recorded')
 assert(data.cash.months.every(m => m.complete && m.pastDueMinor === 0))

 // Approved 10 days late: the same months at 24 November and 11 December, labelled historical timing, on-terms dates the range's other end.
 const saved = data.data.clients.find(c => c.id === client.id)
 await cmd('save:clients', { id: client.id, revision: saved.revision, name: 'Hudson Partners', paymentTermsDays: 30, daysLate: 10 })
 data = await read(); milestone = item(data, fixed.id); fees = item(data, hourly.id)
 assert.deepEqual([milestone.receiptDate, milestone.historicalDate, fees.receiptDate, fees.historicalDate], ['2026-11-14', '2026-11-24', '2026-12-01', '2026-12-11'])
 assert.deepEqual(curve(data, 'historicalExpectedMinor'), { '2026-11': 1000000, '2026-12': 400000 }); assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 1000000, '2026-12': 400000 })
 assert.equal(data.cash.labels.historical, 'historical timing'); assert.equal(data.cash.engagements.find(e => e.engagementId === fixed.id).daysLate, 10)
 for (const m of data.cash.months.filter(m => m.expectedMinor)) { assert.equal(m.rangeLowMinor, Math.min(m.expectedMinor, m.historicalExpectedMinor)); assert.equal(m.rangeHighMinor, Math.max(m.expectedMinor, m.historicalExpectedMinor)) }

 // Moving the milestone through the approved delivery plan: 29 October keeps it in November (due 28 November);
 // 5 November moves the $10,000 to December (due 5 December).
 const plan = { calendar: { weekdays: [1, 2, 3, 4, 5], holidays: [] }, nodes: [{ id: 'launch', kind: 'milestone', sourceId: launch.id, name: 'Launch', start: '2026-10-15', durationDays: 1, predecessors: [], staffingIds: [] }] }
 const approve = async input => { const preview = await cmd('delivery:preview', input); return cmd('delivery:approve', { ...preview.input, fingerprint: preview.fingerprint, acceptEffects: true, reason: 'Client moved launch' }) }
 const baseline = await approve({ engagementId: fixed.id, previousId: null, operation: 'baseline', plan })
 const later = await approve({ engagementId: fixed.id, previousId: baseline.id, revision: baseline.revision, operation: 'delay', nodeId: 'launch', delayBusinessDays: 10 })
 data = await read(); milestone = item(data, fixed.id)
 assert.deepEqual([milestone.invoiceDate, milestone.receiptDate, milestone.cashMonth], ['2026-10-29', '2026-11-28', '2026-11'])
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 1000000, '2026-12': 400000 })
 await approve({ engagementId: fixed.id, previousId: later.id, revision: later.revision, operation: 'delay', nodeId: 'launch', delayBusinessDays: 5 })
 data = await read(); milestone = item(data, fixed.id)
 assert.deepEqual([milestone.invoiceDate, milestone.receiptDate, milestone.cashMonth], ['2026-11-05', '2026-12-05', '2026-12'])
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-12': 1400000 })
 console.log('PASS FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022 unissued milestone and arrears placement on Net 30, approved days late range and delivery-plan moves as of 10 October')
} finally { await h.dispose() }
