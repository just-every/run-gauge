import {cashAssumptionsJourney} from './gauge-cash-assumptions.mjs'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// FINANCE-007 expected cash basis as of 10 October 2026, through the command and state doors, for the points today's
// records carry: Net 30, milestone moves, arrears fees, an advance retainer, invoice
// issuance and a dated dispute. Processor ACH settlement still needs its sandbox.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
let browser
try {
 const { cmd, request, owner } = h, asOf = '2026-10-10'
 const read = async (day=asOf) => { const r = await request(`/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=${day}`, owner); assert.equal(r.status, 200); return r.json() }
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
 const retained = await cmd('save:engagements', { name: 'November retained service', clientId: client.id, leadId: worker.id, members: [worker.id], scope: 'Contractual advance fee', timezone: 'America/New_York' })
 await cmd('agency:calendar', { weekdays: [1,2,3,4,5], holidays: [], reason: 'Contract working days' })
 const terms = await cmd('retainer:preview', { engagementId: retained.id, operation: 'terms', terms: { name: 'November retainer', feeMinor: 300000, frequency: 'monthly', unit: 'hours', allowance: 144000, services: ['Retained'], consumes: 'billable', proration: 'calendar', start: '2026-11-01', end: '2026-11-30', renewal: 'manual', noticeDays: 0, rules: { carryCap: 0, carryPeriods: 0, deficit: false, overage: 'bill', overageRate: 20000 } } })
 const retainer = await cmd('retainer:approve', { ...terms.input, fingerprint: terms.fingerprint, reason: 'November contractual fee' })
 await cmd('retainer:schedule', { retainerId: retainer.id, basis: 'advance', from: '2026-11-01', enabled: true, autoIssue: false, heldPeriodIds: [], reason: 'Contract requires advance billing' })

 const item = (data, engagementId) => { const items = data.cash.engagements.find(e => e.engagementId === engagementId).items; assert.equal(items.length, 1); return items[0] }
 const curve = (data, field) => Object.fromEntries(data.cash.months.filter(m => m[field]).map(m => [m.month, m[field]]))
 // FINANCE-007: the full contractual sample, before the individual override.
 let data = await read()
 assert.equal(data.cash.asOf, asOf)
 let milestone = item(data, fixed.id), fees = item(data, hourly.id)
 assert.deepEqual([milestone.invoiceDate, milestone.receiptDate, milestone.amountMinor], ['2026-10-15', '2026-11-14', 1000000])
 assert.deepEqual([fees.invoiceDate, fees.receiptDate, fees.amountMinor], ['2026-11-01', '2026-12-01', 400000])
 assert.deepEqual([item(data, retained.id).invoiceDate, item(data, retained.id).receiptDate, item(data, retained.id).amountMinor], ['2026-11-01', '2026-12-01', 300000])
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 1000000, '2026-12': 700000 })
 assert.equal(data.cash.engagements.find(e => e.engagementId === fixed.id).termsLabel, 'Net 30')
 assert.equal(data.cash.issuedReceivables, 'None issued'); assert.equal(data.cash.pendingCash, 'No payments recorded'); assert.equal(data.cash.settledCash, 'No payments recorded')
 assert(data.cash.months.every(m => m.complete && m.pastDueMinor === 0))

 // Approved 10 days late: the same months at 24 November and 11 December, labelled historical timing, on-terms dates the range's other end.
 const saved = data.data.clients.find(c => c.id === client.id)
 await cmd('save:clients', { id: client.id, revision: saved.revision, name: 'Hudson Partners', paymentTermsDays: 30, daysLate: 10 })
 data = await read(); milestone = item(data, fixed.id); fees = item(data, hourly.id)
 assert.deepEqual([milestone.receiptDate, milestone.historicalDate, fees.receiptDate, fees.historicalDate], ['2026-11-14', '2026-11-24', '2026-12-01', '2026-12-11'])
 assert.deepEqual(curve(data, 'historicalExpectedMinor'), { '2026-11': 1000000, '2026-12': 700000 }); assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 1000000, '2026-12': 700000 })
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
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 1000000, '2026-12': 700000 })
 const last = await approve({ engagementId: fixed.id, previousId: later.id, revision: later.revision, operation: 'delay', nodeId: 'launch', delayBusinessDays: 5 })
 data = await read(); milestone = item(data, fixed.id)
 assert.deepEqual([milestone.invoiceDate, milestone.receiptDate, milestone.cashMonth], ['2026-11-05', '2026-12-05', '2026-12'])
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-12': 1700000 })
 await approve({ engagementId: fixed.id, previousId: last.id, operation: 'baseline', plan })
 let delivered = await cmd('milestone:deliver', { ...data.data.milestones.find(m=>m.id===launch.id), revision: (await read()).data.milestones.find(m=>m.id===launch.id).revision, date: '2026-10-15', reason: 'Launch delivered' })
 const delivery = (await read()).data.milestones.find(m=>m.id===launch.id).value.delivery.deliveries.at(-1)
 delivered = await cmd('milestone:decision', { ...delivered, deliveryId: delivery.id, outcome: 'accepted', date: '2026-10-15', contact: 'Client sponsor', reason: 'Launch accepted' })
 await cmd('milestone:authorize', delivered)
 const packet = await cmd('packet:approve', await cmd('packet:create', { engagementId: fixed.id, title: 'Accepted launch', sources: ['milestones:'+launch.id] }))
 const issued = await cmd('invoice:issue', { ...packet, issueDate: '2026-10-15', dueDate: '2026-11-14', billTo: 'Hudson Partners', remitTo: 'Agency operating account', reference: 'Launch fee' })
 const original = (await read('2026-10-15')).data.invoices.find(i=>i.id===issued.id)
 const dispute = await cmd('invoice:dispute', { ...issued, date: '2026-10-15', amountMinor: 100000, reason: 'Client questions launch scope' })
 data = await read('2026-10-15'); milestone = item(data, fixed.id)
 assert.deepEqual([milestone.openMinor, milestone.disputedMinor, milestone.expectedMinor], [900000,100000,900000])
 // At this later as-of day the unworked October commitments have elapsed;
 // December retains $1,600 approved hourly work plus the $3,000 fee.
 assert.deepEqual(curve(data, 'expectedMinor'), { '2026-11': 900000, '2026-12': 460000 })
 assert.equal(data.cash.issuedTotals[0].openMinor,1000000,'Disputed money remains open receivables')
 assert(data.lineage.find(f=>f.id==='cash:USD:2026-11:expectedMinor').sources.some(s=>s.kind==='invoiceDisputes'&&s.id===dispute.id))
 assert.deepEqual(data.data.invoices.find(i=>i.id===issued.id),original,'A dispute never rewrites an invoice')
 await cmd('invoice:dispute-resolve', { ...dispute, date: '2026-10-16', outcome: 'withdrawn', resolution: 'Client confirms full fee' })
 assert.equal(item(await read('2026-10-16'),fixed.id).expectedMinor,1000000,'Resolved disputes return only their original amount')
 assert.equal(item(await read('2026-10-15'),fixed.id).expectedMinor,900000,'Later resolution preserves the earlier cash view')

 // Both FX curves use their own receipt date, including dates in different
 // months, and preserve the exact probability, commercial and rate revisions.
 const cadClient = await cmd('save:clients', { name: 'Toronto expected cash', billingCurrency: 'CAD', paymentTermsDays: 0, daysLate: 10 })
 const cadProject = await cmd('save:engagements', { name: 'Toronto fixed delivery', clientId: cadClient.id, leadId: worker.id, members: [worker.id], scope: 'Dated foreign cash', timezone: 'America/New_York' })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: cadProject.id, mode: 'fixed', amountMinor: 10001, effortSeconds: 0, roundingSeconds: 60, reason: 'Exact CAD fee' }))
 let cadMilestone = await cmd('milestone:approve', await cmd('save:milestones', { engagementId: cadProject.id, name: 'Toronto handover', due: '2026-11-25', amountMinor: 10001 }))
 const fxQuery = new URLSearchParams({from:'2026-10-01',to:'2026-12-31',asOf:'2026-11-01'})
 const fxRead = async () => { const response = await request('/api/gauge/state?'+fxQuery,owner); assert.equal(response.status,200); return response.json() }
 const fxInput = (snapshot, percent) => { const source=item(snapshot,cadProject.id); return {...Object.fromEntries(fxQuery), engagementId:cadProject.id, sourceKey:source.probabilityBasis.key, fingerprint:source.probabilityBasis.fingerprint, collectionPercent:percent, reason:'Exact CAD collection approval', ...snapshot.data.cashAssumptions.find(a=>a.value.engagementId===cadProject.id)} }
 data = await fxRead()
 const cadApproval = await cmd('cash:approve',fxInput(data,50))
 data = await fxRead()
 const converted = (snapshot,month) => snapshot.cashConverted.find(m=>m.month===month)
 assert.equal(item(data,cadProject.id).expectedMinor,5001,'Half of CAD 100.01 rounds half up to CAD 50.01')
 assert.deepEqual([converted(data,'2026-11').minor,converted(data,'2026-11').knownMinor,converted(data,'2026-11').missingRates],[null,1000000,['CAD']])
 assert.equal(converted(data,'2026-12').historical.minor,null)
 const noRateFingerprint = data.fingerprint
 const novemberRate = await cmd('fx:approve',{currency:'CAD',rate:'0.7300',effective:'2026-11-01',source:'Published rate synthetic-gauge-18001',reason:'November cash translation'})
 const decemberRate = await cmd('fx:approve',{currency:'CAD',rate:'0.7400',effective:'2026-12-01',source:'Published rate synthetic-gauge-18002',reason:'December cash translation'})
 assert.equal((await request('/api/gauge/report.csv?'+new URLSearchParams({...Object.fromEntries(fxQuery),fingerprint:noRateFingerprint}),owner)).status,409,'A rate approval invalidates a prior download snapshot')
 data = await fxRead()
 assert.deepEqual([converted(data,'2026-11').minor,converted(data,'2026-11').historical.minor,converted(data,'2026-11').rangeLowMinor,converted(data,'2026-11').rangeHighMinor],[1003651,1000000,1000000,1003651])
 assert.deepEqual([converted(data,'2026-12').minor,converted(data,'2026-12').historical.minor,converted(data,'2026-12').rangeLowMinor,converted(data,'2026-12').rangeHighMinor],[460000,463701,460000,463701])
 const placement = converted(data,'2026-12').historical.placements.find(p=>p.engagementId===cadProject.id)
 assert.deepEqual([placement.receiptDate,placement.day,placement.amountMinor,placement.convertedMinor,placement.rateId,placement.rateRevision],['2026-12-05','2026-12-05',5001,3701,decemberRate.id,decemberRate.revision])
 const historicalFigure = data.lineage.find(f=>f.id==='cashConverted:USD:2026-12:historicalExpectedMinor')
 assert.equal(historicalFigure.value,463701)
 for(const [kind,row] of [['fxRates',decemberRate],['cashAssumptions',cadApproval],['milestones',cadMilestone]])assert(historicalFigure.sources.some(s=>s.kind===kind&&s.id===row.id&&s.revision===row.revision))
 const response = await request('/api/gauge/report.csv?'+new URLSearchParams({...Object.fromEntries(fxQuery),fingerprint:data.fingerprint}),owner)
 assert.equal(response.status,200)
 const csvRows = JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps([r for r in csv.reader(sys.stdin) if r[1] == sys.argv[1]]))',historicalFigure.id],{input:await response.text(),encoding:'utf8'}))
 assert.equal(csvRows.find(r=>r[0]==='figure'&&r[1]===historicalFigure.id)[3],'463701')
 assert(csvRows.some(r=>r[0]==='source'&&r[1]===historicalFigure.id&&r[10]==='fxRates'&&r[12]===decemberRate.revision))
 assert(!historicalFigure.sources.some(s=>s.kind==='fxRates'&&s.id===novemberRate.id),'Historical December uses its own dated rate')

 browser=await chromium.launch({headless:true,...(process.env.GAUGE_CHROMIUM_PATH?{executablePath:process.env.GAUGE_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
 await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 const page=await context.newPage()
 await page.goto(h.origin+'/app/review?'+fxQuery)
 const cashView = page.locator('#cash-converted')
 const visible = (await cashView.innerText()).replaceAll('\u00a0',' ')
 for(const text of ['On terms: $10,036.51','Historical timing: $4,637.01','Range: $4,600.00 – $4,637.01','0.7400 from Dec 1, 2026'])assert(visible.includes(text),visible)
 const icons=await cashView.locator('button,a,summary').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&n.querySelector('svg,img')&&!n.getAttribute('aria-describedby')).map(n=>n.outerHTML))
 assert.deepEqual(icons,[],'Cash controls have visible text')
 assert(await cashView.locator('p,li,a,h3,h4').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height).every(n=>parseFloat(getComputedStyle(n).fontSize)>=13)))
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000})
  if(process.env.GAUGE_CASH_SHOTS) { await mkdir(process.env.GAUGE_CASH_SHOTS,{recursive:true}); await cashView.screenshot({path:`${process.env.GAUGE_CASH_SHOTS}/cash-converted-${width}.png`}) }
 }
 await page.setViewportSize({width:1440,height:1000})
 await cashView.locator('[data-cash-converted="2026-12"] a').filter({hasText:'$4,637.01'}).click()
 assert.equal(new URL(page.url()).searchParams.get('asOf'),'2026-11-01','The drill preserves the exact forecast day')
 assert((await page.locator('#report-evidence').innerText()).includes('$4,637.01'))
 await page.locator('#report-evidence').getByText(/^Source revisions/).click()
 assert((await page.locator('#report-evidence').innerText()).includes(decemberRate.revision))

 // A later accepted delivery shifts the unissued date and invalidates its old
 // probability. Reapproval survives exact issuance, receipts and credits.
 cadMilestone=await cmd('milestone:deliver',{...cadMilestone,date:'2026-11-26',reason:'Handover delivered late'})
 const cadDelivery=(await fxRead()).data.milestones.find(m=>m.id===cadMilestone.id).value.delivery.deliveries.at(-1)
 cadMilestone=await cmd('milestone:decision',{...cadMilestone,deliveryId:cadDelivery.id,outcome:'accepted',date:'2026-11-27',contact:'Toronto sponsor',reason:'Later client acceptance'})
 data=await fxRead()
 assert.deepEqual([item(data,cadProject.id).invoiceDate,item(data,cadProject.id).receiptDate,item(data,cadProject.id).historicalDate],['2026-11-27','2026-11-27','2026-12-07'])
 assert.equal(item(data,cadProject.id).collectionPercent,100);assert(item(data,cadProject.id).staleAssumption)
 cadMilestone=await cmd('milestone:authorize',cadMilestone)
 data=await fxRead();const renewed=await cmd('cash:approve',fxInput(data,50))
 const cadPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:cadProject.id,title:'Accepted Toronto handover',sources:['milestones:'+cadMilestone.id]}))
 const cadInvoice=await cmd('invoice:issue',{...cadPacket,issueDate:'2026-11-28',dueDate:'2026-11-28',billTo:'Toronto client',remitTo:'Agency operating account',reference:'Toronto fee'})
 fxQuery.set('asOf','2026-12-02');data=await fxRead()
 assert.equal(item(data,cadProject.id).probabilityRevision,renewed.revision)
 const frozenInvoice=data.data.invoices.find(i=>i.id===cadInvoice.id)
 const pastDuePlacement=converted(data,'2026-12').placements.find(p=>p.engagementId===cadProject.id)
 assert.deepEqual([pastDuePlacement.receiptDate,pastDuePlacement.day,pastDuePlacement.convertedMinor,pastDuePlacement.rateRevision],['2026-11-28','2026-12-02',3701,decemberRate.revision])
 await cmd('payment:record',{...cadInvoice,date:'2026-12-02',amountMinor:1001,reference:'synthetic-gauge-18003'})
 await cmd('invoice:credit',{...cadInvoice,type:'credit',date:'2026-12-02',lines:[{line:0,amountMinor:2000}],reason:'Accepted partial fee correction'})
 await cmd('invoice:dispute',{...cadInvoice,date:'2026-12-02',amountMinor:1000,reason:'Hold questioned remainder'})
 data=await fxRead()
 assert.deepEqual([item(data,cadProject.id).collectibleOpenMinor,item(data,cadProject.id).disputedMinor,item(data,cadProject.id).expectedMinor],[6000,1000,3000])
 assert.equal(converted(data,'2026-12').placements.find(p=>p.engagementId===cadProject.id).convertedMinor,2220)
 assert.equal(converted(data,'2026-12').historical.placements.find(p=>p.engagementId===cadProject.id).convertedMinor,2220)
 assert.deepEqual(data.data.invoices.find(i=>i.id===cadInvoice.id),frozenInvoice)
 assert.match(data.cash.recordedCash,/user-recorded/);assert(!data.cash.settledCash.includes('processor settled'))
 await page.goto(h.origin+'/app/review?'+fxQuery);await page.locator('#cash-sources > summary').click()
 const invoiceRow=page.locator(`[data-cash-source^="invoices:${cadInvoice.id}"]`)
 const sourceText=(await invoiceRow.innerText()).replaceAll('\u00a0',' ')
 for(const text of ['CA$60.00 collectible open','50%','CA$30.00 expected','CA$10.00 disputed on this invoice','10 days late',data.cash.engagements.find(e=>e.engagementId===cadProject.id).daysLateApprovedBy,'settled-history qualification pending'])assert(sourceText.includes(text),sourceText)
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000})
  if(process.env.GAUGE_CASH_SHOTS)await invoiceRow.screenshot({path:`${process.env.GAUGE_CASH_SHOTS}/cash-dispute-${width}.png`})
 }

 // A currency with no approved rate never vanishes into a known total; neither
 // does an unpriced forecast that currently contributes no numeric cash.
 const gbpClient=await cmd('save:clients',{name:'Unconverted service',billingCurrency:'GBP',paymentTermsDays:0})
 const gbpProject=await cmd('save:engagements',{name:'Unconverted delivery',clientId:gbpClient.id,leadId:worker.id,members:[worker.id],scope:'Unknown FX stays explicit',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:gbpProject.id,mode:'fixed',amountMinor:10000,effortSeconds:0,roundingSeconds:60,reason:'GBP fee'}))
 await cmd('milestone:approve',await cmd('save:milestones',{engagementId:gbpProject.id,name:'Unconverted handover',due:'2026-12-15',amountMinor:10000}))
 data=await fxRead()
 assert.equal(converted(data,'2026-12').minor,null);assert.equal(converted(data,'2026-12').historical.minor,null)
 assert.equal(converted(data,'2026-12').rangeLowMinor,null);assert.deepEqual(converted(data,'2026-12').missingRates,['GBP'])
 assert(data.lineage.find(f=>f.id==='cashConverted:USD:2026-12:expectedMinor').unknownSources.some(s=>s.includes('GBP: no approved exchange rate')))
 await cmd('fx:approve',{currency:'GBP',rate:'1.2500',effective:'2026-12-01',source:'Published rate synthetic-gauge-18004',reason:'Approved GBP conversion'})
 data=await fxRead();assert.notEqual(converted(data,'2026-12').minor,null)
 const unpriced=await cmd('save:engagements',{name:'Unpriced future service',clientId:gbpClient.id,leadId:worker.id,members:[worker.id],scope:'Missing bill rate',timezone:'America/New_York'})
 const unpricedWorker=await cmd('save:people',{name:'synthetic-gauge-18005',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:unpriced.id,mode:'hourly',amountMinor:10000,effortSeconds:3600,roundingSeconds:60,reason:'Unpriced forecast'}))
 await cmd('save:staffing',{engagementId:unpriced.id,personId:unpricedWorker.id,from:'2026-12-10',to:'2026-12-10',dailySeconds:3600,commitment:'committed'})
 data=await fxRead()
 assert.equal(converted(data,'2026-12').minor,null);assert.equal(converted(data,'2026-12').historical.minor,null)
 assert.deepEqual(converted(data,'2026-12').unknownCurrencies,['GBP'])
 console.log('PASS FINANCE-007 dated FX on both curves, independent ranges, exact rate and source drills and CSV, later acceptance, overdue clamping, immutable receipts and credits, missing rates and unpriced cash')
 console.log('PASS FINANCE-007 unissued milestone and arrears placement on Net 30, approved days late range and delivery-plan moves as of 10 October')
} finally { await browser?.close(); await h.dispose() }

await cashAssumptionsJourney()
