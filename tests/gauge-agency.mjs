import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// SETUP-001: the New York agency profile and who sees it, the workweek, an old AUD record that stays AUD until the
// owner approves an exchange rate, and USD quote → work across the 8 March 2026 spring-forward → invoice.
export async function agencyJourney(h, page, capture) {
 const { cmd, state, request, owner } = h, EIN = '12-3456789'
 const agencyPerson = await cmd('save:people', { name: 'Agency finance', timezone: 'America/New_York' })
 const finance = await h.invite('agency-finance'), staff = await h.invite('agency-staff')
 await cmd('grant', { operatorId: finance.id, personId: agencyPerson.id, role: 'finance', enabled: true })
 await cmd('grant', { operatorId: staff.id, personId: agencyPerson.id, role: 'staff', enabled: true })

 // The profile saved at setup: the owner sees all of it, finance everything but the EIN, others nothing.
 let profile = (await state()).data.agencyProfiles[0]
 assert.deepEqual([profile.value.legalBusiness, profile.value.billingAddress.line1, profile.value.billingAddress.state, profile.value.billingAddress.postalCode, profile.value.einReference, profile.value.fiscalYearStartMonth], ['Hudson Studio LLC', '1 Pier Plaza', 'NY', '10001', EIN, 1])
 const financeState = await state(finance.cookie), staffState = await state(staff.cookie)
 assert.equal(financeState.data.agencyProfiles[0].value.legalBusiness, 'Hudson Studio LLC'); {const j=JSON.stringify(financeState),i=j.indexOf(EIN);assert(i<0,'EIN leaked: '+j.slice(Math.max(0,i-300),i+60))}
 assert.deepEqual([staffState.data.agencyProfiles.length, staffState.data.fxRates.length], [0, 0]); assert(!JSON.stringify(staffState).includes('Hudson Studio'))
 const profileInput = { legalBusiness: 'Hudson Studio LLC', addressLine1: '1 Pier Plaza', city: 'New York', state: 'NY', postalCode: '10001', einReference: EIN, fiscalYearStartMonth: 7, reason: 'Fiscal year moves to July', id: profile.id, revision: profile.revision }
 for (const [who, cookie] of [['finance', finance.cookie], ['staff', staff.cookie]]) await cmd('agency:profile', profileInput, cookie, 403)
 for (const bad of [{ state: 'ZZ' }, { postalCode: '1234' }, { einReference: '12-34' }, { legalBusiness: '' }, { fiscalYearStartMonth: 13 }]) await cmd('agency:profile', { ...profileInput, ...bad }, owner, 400)
 await cmd('agency:profile', { ...profileInput, revision: 'stale' }, owner, 409)
 await cmd('agency:profile', profileInput)
 profile = (await state()).data.agencyProfiles[0]; assert.equal(profile.value.fiscalYearStartMonth, 7)
 const history = path => request(path, owner).then(r => r.text()), asFinance = path => request(path, finance.cookie).then(r => r.text())
 assert((await history(`/api/gauge/history/agencyProfiles/${profile.id}`)).includes(EIN), 'The owner reads the full revision history')
 assert(!(await asFinance(`/api/gauge/history/agencyProfiles/${profile.id}`)).includes(EIN), 'Finance never reads the EIN in history')
 assert(!(await asFinance('/api/gauge/audit')).includes(EIN), 'Finance never reads the EIN in the audit trail')
 assert((await history('/api/gauge/audit')).includes('agency:profile'), 'The profile changes are audited for the owner')

 // The workweek and holidays are the owner's, versioned with a reason.
 const calendar = (await state()).data.agencyCalendars.at(-1)
 await cmd('agency:calendar', { weekdays: [1, 2, 3, 4, 5], holidays: ['2026-11-26'], reason: 'New York agency Thanksgiving', previousId: calendar?.id ?? null })
 assert.deepEqual((await state()).data.agencyCalendars.at(-1).value.calendar, { weekdays: [1, 2, 3, 4, 5], holidays: ['2026-11-26'] })
 await cmd('agency:calendar', { weekdays: [1], holidays: [], reason: 'Not the owner', previousId: (await state()).data.agencyCalendars.at(-1).id }, finance.cookie, 403)
 await page.goto(h.origin + '/app/access')
 const access = await page.locator('main').innerText()
 for (const text of ['Hudson Studio LLC', 'Agency profile', 'Workweek and holidays', 'Approved exchange rates', 'Currency consolidation']) assert(access.includes(text), `Access shows ${text}`)
 assert.match(access, /FY20\d\d runs/); await capture('agency')

 // An old AUD record keeps its currency; consolidating it with USD needs an approved rate.
 const fixture = 'tests/fixtures/harvest/', files = {}
 for (const name of ['clients.csv', 'people.csv', 'projects.csv', 'time.csv']) files[name] = await readFile(fixture + name, 'utf8')
 files['clients.csv'] = files['clients.csv'].replace('Synthetic client', 'Harbour Bakery'); files['people.csv'] = files['people.csv'].replace('Synthetic person', 'Piper Lane'); files['projects.csv'] = files['projects.csv'].replace('Synthetic project', 'Winter rebrand')
 const old = { ...JSON.parse(await readFile(fixture + 'manifest.json', 'utf8')), namespace: 'old-aud-account' }
 assert.match((await cmd('import:preview', { package: { manifest: old, files } }, owner, 400)).error, /AUD.*USD.*keep-source-currency/)
 await cmd('import:preview', { package: { manifest: { ...old, currencyPolicy: 'convert-to-usd' }, files } }, owner, 400)
 const preview = await cmd('import:preview', { package: { manifest: { ...old, currencyPolicy: 'keep-source-currency' }, files } })
 assert.deepEqual([preview.currency, preview.agencyCurrency, preview.currencyPolicy], ['AUD', 'USD', 'keep-source-currency'])
 let job = await cmd('import:create', { package: preview.package, fingerprint: preview.fingerprint })
 while (job.state !== 'completed') job = await cmd('import:resume', { id: job.id })
 let data = await state(); const audEngagement = data.data.engagements.find(e => e.value.currency === 'AUD')
 assert(audEngagement, 'The old record keeps AUD'); assert.equal((await state()).agency.currency, 'USD')
 const aud = data.data.time.filter(r => r.value.source.currency === 'AUD').sort((x, y) => x.value.workDate.localeCompare(y.value.workDate)).slice(0, 3)
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: audEngagement.id, mode: 'hourly', amountMinor: 200000, effortSeconds: 43200, roundingSeconds: 60, reason: 'Old AUD terms' }))
 for (const row of aud) await cmd('time:approve', await cmd('time:submit', row))
 const september = { from: '2026-09-01', to: '2026-09-30' }
 let read = await cmd('fx:consolidate', september)
 const bucket = currency => read.buckets.find(b => b.currency === currency)
 assert.deepEqual([bucket('AUD').amountMinor, bucket('AUD').convertedMinor, bucket('AUD').status, bucket('USD').amountMinor, read.consolidatedMinor, read.complete, read.missingRates, read.knownMinor], [30000, null, 'no approved rate', 18651, null, false, ['AUD'], 18651])
 const refused = await page.goto(h.origin + '/app/imports'); assert.equal(refused.status(), 200)
 assert.match(await page.locator('main').innerText(), /Not consolidated: no approved AUD rate/)
 for (const [who, cookie] of [['finance', finance.cookie], ['staff', staff.cookie]]) await cmd('fx:approve', { currency: 'AUD', rate: '0.6500', effective: '2026-09-01', source: 'Published rate synthetic-gauge-31', reason: 'Old AUD work', }, cookie, 403)
 await cmd('fx:consolidate', september, staff.cookie, 403)
 for (const bad of [{ currency: 'USD' }, { currency: 'JPY' }, { rate: '0' }, { rate: '0.65 AUD' }, { effective: '2026-13-01' }, { source: '' }]) await cmd('fx:approve', { currency: 'AUD', rate: '0.6500', effective: '2026-09-01', source: 'Published rate synthetic-gauge-31', reason: 'Old AUD work', ...bad }, owner, 400)
 await cmd('fx:approve', { currency: 'AUD', rate: '0.6500', effective: '2026-09-01', source: 'Published rate synthetic-gauge-31', reason: 'Old AUD work' })
 await cmd('fx:approve', { currency: 'AUD', rate: '0.6700', effective: '2026-09-03', source: 'Published rate synthetic-gauge-32', reason: 'Rate moved' })
 await cmd('fx:approve', { currency: 'AUD', rate: '0.6000', effective: '2026-09-02', source: 'Published rate synthetic-gauge-33', reason: 'Backdated' }, owner, 409)
 read = await cmd('fx:consolidate', september)
 assert.deepEqual([bucket('AUD').convertedMinor, bucket('AUD').status, read.consolidatedMinor, read.complete, read.missingRates], [19700, 'converted', 38351, true, []])
 assert.deepEqual(bucket('AUD').conversions.map(c => [c.rate, c.effective, c.sourceMinor, c.convertedMinor]), [['0.6500', '2026-09-01', 20000, 13000], ['0.6700', '2026-09-03', 10000, 6700]])
 assert.equal((await cmd('fx:consolidate', { from: '2026-08-01', to: '2026-08-31' })).consolidatedMinor, 0)
 assert.equal((await state(finance.cookie)).data.fxRates.length, 2); assert.equal((await state(staff.cookie)).data.fxRates.length, 0)
 assert.deepEqual((await cmd('fx:consolidate', september, finance.cookie)).buckets.map(b => b.convertedMinor), [19700, 18651])
 await page.goto(h.origin + '/app/imports'); const labelled = await page.locator('main').innerText()
 assert(labelled.includes('0.6500 from') && labelled.includes('0.6700 from') && labelled.includes('synthetic-gauge-31'), 'Every converted total names its rate and date'); await capture('consolidation')
 // The AUD record itself is unchanged by the rate: no silent conversion.
 assert.equal((await state()).data.time.find(r => r.id === aud[0].id).value.economics.currency, 'AUD')

 // USD quote and invoice across the New York spring-forward (clocks jump from 02:00 EST to 03:00 EDT on 8 March 2026).
 const zone = 'America/New_York', person = await cmd('save:people', { name: 'Dana Whitfield', timezone: zone }), client = await cmd('save:clients', { name: 'Brooklyn Bikes' })
 await cmd('save:rates', { personId: person.id, service: '*', effective: '2026-01-01', billMinor: 15000, costMinor: 6000 })
 await cmd('save:calendars', { personId: person.id, from: '2026-03-06', to: '2026-03-13', weekdays: '1,2,3,4,5', dailySeconds: 28800, timezone: zone })
 const opportunity = await cmd('save:opportunities', { name: 'Brooklyn Bikes site', clientId: client.id, ownerId: person.id, stage: 'proposal', probability: 75, amountMinor: 90000, demandSeconds: 21600, services: 'Build', from: '2026-03-06', to: '2026-03-13' })
 const quote = await cmd('estimate:save', { opportunityId: opportunity.id, name: 'Brooklyn Bikes site quote', reason: 'Six hours across the clock change', contingencyBasisPoints: 0, discountBasisPoints: 0, phases: [{ key: 'build', name: 'Build', service: 'Build', mode: 'hourly', from: '2026-03-06', to: '2026-03-13' }], lines: [{ key: 'build', phaseKey: 'build', kind: 'labor', name: 'Site build', role: 'Developer', personId: person.id, effortSeconds: 21600, billRateMinor: 15000 }] })
 const quoted = (await state()).data.estimates.find(r => r.id === quote.id).value; assert.deepEqual([quoted.currency, quoted.totalMinor], ['USD', 90000])
 await cmd('estimate:approve', { ...quote, attest: 'owner-recorded-external-acceptance', acceptorName: 'Rae Brooks', acceptorContact: 'synthetic-gauge-34', acceptanceDate: '2026-03-05', channel: 'email', evidenceRef: 'synthetic-gauge-35', reason: 'Owner records reported acceptance' })
 const engagement = await cmd('estimate:convert', quote); data = await state()
 assert.equal(data.data.engagements.find(e => e.id === engagement.id).value.currency, 'USD')
 const acceptedWork=data.data.engagements.find(e=>e.id===engagement.id)
 await cmd('save:engagements',{...acceptedWork,...acceptedWork.value,currency:'CAD'},owner,409)
 await cmd('budget:approve', data.data.budgets.find(b => b.value.engagementId === engagement.id))
 const task = data.data.tasks.find(t => t.value.engagementId === engagement.id), entries = []
 for (const [start, end] of [['2026-03-08T01:00:00-05:00', '2026-03-08T04:00:00-04:00'], ['2026-03-09T09:00:00-04:00', '2026-03-09T13:00:00-04:00']]) {
  const saved = await cmd('time:save', { personId: person.id, engagementId: engagement.id, taskId: task.id, service: 'Build', notes: 'Site build', timezone: zone, billable: true, start, end })
  entries.push(await cmd('time:approve', await cmd('time:submit', saved)))
 }
 const worked = (await state()).data.time.filter(r => r.value.engagementId === engagement.id).sort((x, y) => x.value.workDate.localeCompare(y.value.workDate))
 assert.deepEqual(worked.map(r => [r.value.workDate, r.value.durationSeconds, r.value.economics.billMinor, r.value.economics.currency]), [['2026-03-08', 7200, 30000, 'USD'], ['2026-03-09', 14400, 60000, 'USD']], 'The clock-change morning is two elapsed hours, not three, billed exactly')
 const packet = await cmd('packet:approve', await cmd('packet:create', { engagementId: engagement.id, title: 'Brooklyn Bikes site build', sources: entries.map(e => `time:${e.id}`) }))
 const invoice = await cmd('invoice:issue', { ...packet, issueDate: '2026-03-10', dueDate: '2026-04-09', billTo: 'Brooklyn Bikes accounts payable', remitTo: 'Hudson Studio LLC operating account', reference: 'Site build March' })
 const issued = (await state()).data.invoices.find(r => r.id === invoice.id).value
 assert.deepEqual([issued.currency, issued.totalMinor, issued.lines.map(l => l.durationSeconds), issued.lines.map(l => l.amountMinor), issued.issueDate, issued.dueDate], ['USD', 90000, [7200, 14400], [30000, 60000], '2026-03-10', '2026-04-09'])
 assert.equal(issued.totalMinor, quoted.totalMinor, 'The invoice equals the quote')
 await page.goto(h.origin + '/app/billing'); assert.match(await page.locator('main').innerText(), /\$900\.00/); await capture('invoice')
 console.log('PASS SETUP-001 agency profile privacy → workweek → old AUD import stays AUD until an approved rate → USD quote and invoice across the spring-forward')
}

// SETUP-003 native billing currencies, exact invoice values and labelled dated conversion.
export async function clientCurrencyJourney(h, page, capture) {
 const {cmd,state}=h,zone=(await state()).agency.timezone,person=await cmd('save:people',{name:'Casey Currency',timezone:zone})
 const currencies=[]
 for(const [name,currency,amount] of [['Toronto Studio','CAD',1000000],['New York Studio','USD',500000],['London Studio','GBP',10000]]) {
  const client=await cmd('save:clients',{name,billingCurrency:currency})
  let engagement=await cmd('save:engagements',{name:name+' delivery',clientId:client.id,leadId:person.id,members:[person.id],scope:'Independent delivery',timezone:zone})
  let row=(await state()).data.engagements.find(r=>r.id===engagement.id)
  assert.equal(row.value.currency,currency,'New work inherits its client currency')
  if(currency==='CAD') {
   await page.goto(h.origin+'/app/engagements?edit='+engagement.id)
   const form=page.locator('form').filter({has:page.locator('[name=action][value="save:engagements"]')})
   await form.locator('[name=currency]').selectOption('USD');await form.getByRole('button',{name:'Save',exact:true}).click()
   row=(await state()).data.engagements.find(r=>r.id===engagement.id);assert.equal(row.value.currency,'USD', await page.locator('main').innerText())
   engagement=await cmd('save:engagements',{...row,...row.value,currency:'CAD'})
   await page.goto(h.origin+'/app/engagements?edit='+client.id)
   assert.equal(await page.getByLabel('Default billing currency').inputValue(),'CAD');await capture('client-currency')
   await page.goto(h.origin+'/app/engagements?edit='+engagement.id);await capture('engagement-currency')
  }
  const task=await cmd('save:tasks',{engagementId:engagement.id,name:'Delivery',remainingSeconds:0})
  await cmd('save:rates',{engagementId:engagement.id,service:'*',effective:'2026-10-01',billMinor:amount})
  const card=(await state()).data.rates.at(-1);assert.equal(card.value.currency,currency)
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:engagement.id,mode:'hourly',amountMinor:amount,effortSeconds:3600,roundingSeconds:1,reason:'Approved client-currency work'}))
  row=(await state()).data.engagements.find(r=>r.id===engagement.id)
  await cmd('save:engagements',{...row,...row.value,currency:currency==='USD'?'CAD':'USD'},h.owner,409)
  const entry=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{personId:person.id,engagementId:engagement.id,taskId:task.id,service:'Delivery',notes:'One hour of agreed delivery',timezone:zone,billable:true,start:`2026-10-08T${String(9+currencies.length).padStart(2,'0')}:00:00-04:00`,end:`2026-10-08T${String(10+currencies.length).padStart(2,'0')}:00:00-04:00`})))
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:engagement.id,title:name+' October delivery',sources:['time:'+entry.id]}))
  const invoice=await cmd('invoice:issue',{...packet,issueDate:'2026-10-09',dueDate:'2026-11-08',billTo:name,remitTo:'Studio operating account',reference:'October delivery'})
  currencies.push((await state()).data.invoices.find(r=>r.id===invoice.id))
  const c=(await state()).data.clients.find(r=>r.id===client.id)
  await cmd('save:clients',{...c,...c.value,billingCurrency:currency==='CAD'?'USD':currency})
  assert.equal((await state()).data.engagements.find(r=>r.id===engagement.id).value.currency,currency,'A later client default never relabels saved work')
 }
 const raceClient=await cmd('save:clients',{name:'Commercial approval race',billingCurrency:'USD'})
 const raceEngagement=await cmd('save:engagements',{name:'Currency review race',clientId:raceClient.id,leadId:person.id,members:[person.id],scope:'Review one commercial basis',timezone:zone})
 const draft=await cmd('save:budgets',{engagementId:raceEngagement.id,mode:'hourly',amountMinor:10000,effortSeconds:3600,roundingSeconds:1,reason:'Review currency once'})
 const raceRow=(await state()).data.engagements.find(r=>r.id===raceEngagement.id)
 const outcomes=await Promise.all([h.post('/api/gauge/command',{key:crypto.randomUUID(),action:'save:engagements',...raceRow,...raceRow.value,currency:'CAD'},h.owner),h.post('/api/gauge/command',{key:crypto.randomUUID(),action:'budget:approve',...draft},h.owner)])
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409],'Commercial approval and a currency change cannot both commit')
 const raced=await state(),agreed=raced.data.budgets.find(r=>r.id===draft.id),work=raced.data.engagements.find(r=>r.id===raceEngagement.id)
 if(agreed.value.status==='approved')assert.equal(work.value.currency,agreed.value.currency)
 await cmd('save:clients',{name:'Unsupported',billingCurrency:'JPY'},h.owner,400)
 await cmd('fx:approve',{currency:'CAD',rate:'0.7300',effective:'2026-10-01',source:'Published rate synthetic-gauge-45',reason:'October reporting'})
 const window={basis:'issued-invoices',from:'2026-10-01',to:'2026-10-31'},october=await cmd('fx:consolidate',window)
 assert.deepEqual(october.buckets.map(b=>[b.currency,b.amountMinor,b.convertedMinor]),[['CAD',1000000,730000],['GBP',10000,null],['USD',500000,500000]])
 assert.deepEqual([october.consolidatedMinor,october.knownMinor,october.missingRates],[null,1230000,['GBP']])
 assert.deepEqual(october.buckets[0].conversions.map(c=>[c.rate,c.effective,c.sourceMinor,c.convertedMinor]),[['0.7300','2026-10-01',1000000,730000]])
 // SETUP-005: the October portfolio's earned value converts amount by amount at the labelled approved rate; GBP stays unconverted.
 const portfolioOctober=(await state()).portfolio.convertedEarned
 assert.deepEqual(portfolioOctober.buckets.map(b=>[b.currency,b.amountMinor,b.convertedMinor,b.unconvertedMinor]),[['CAD',1000000,730000,0],['GBP',10000,null,10000],['USD',500000,500000,0]])
 assert.deepEqual([portfolioOctober.knownMinor,portfolioOctober.minor,portfolioOctober.missingRates,portfolioOctober.buckets[0].conversions.map(c=>[c.rate,c.effective])],[1230000,null,['GBP'],[['0.7300','2026-10-01']]])
 await cmd('fx:approve',{currency:'CAD',rate:'0.7400',effective:'2026-11-01',source:'Published rate synthetic-gauge-46',reason:'November reporting'})
 assert.deepEqual(await cmd('fx:consolidate',window),october,'November rate leaves October figures unchanged')
 assert.deepEqual((await state()).portfolio.convertedEarned,portfolioOctober,'November rate leaves the October portfolio conversion unchanged')
 await page.goto(h.origin+'/app/review?from=2026-10-01&to=2026-10-31')
 const converted=(await page.locator('#portfolio-converted').innerText()).replaceAll('\u00a0',' ')
 for(const line of ['$12,300.00 known','CA$10,000.00 → $7,300.00 · 0.7300 from Oct 1, 2026 (Published rate synthetic-gauge-45)','£100.00 → Unconverted · no approved rate'])assert(converted.includes(line),`Portfolio conversion shows ${line}: ${converted}`)
 await page.locator('#portfolio-converted').scrollIntoViewIfNeeded();await capture('portfolio-conversion')
 for(const invoice of currencies)assert.deepEqual((await state()).data.invoices.find(r=>r.id===invoice.id),invoice,'Conversion never changes an issued document')
 await page.goto(h.origin+'/app/imports')
 const issuedTotals=(await page.locator('section.g-card').filter({has:page.getByRole('heading',{name:'Issued invoice currency totals',exact:true})}).innerText()).replaceAll('\u00a0',' ')
 for(const line of ['CA$10,000.00 → $7,300.00 · 0.7300 from Oct 1, 2026 (Published rate synthetic-gauge-45)','£100.00 → Unconverted'])assert(issuedTotals.includes(line),`Issued invoice totals show ${line}: ${issuedTotals}`)
 await capture('invoice-consolidation')
 // The owner's rates table names who approved each rate and when, beside its rate, effective date and source.
 await page.goto(h.origin+'/app/access')
 const rateRows=(await page.locator('section.g-card--table').filter({has:page.getByRole('heading',{name:'Approved exchange rates',exact:true})}).locator('tbody tr').allInnerTexts()).map(row=>row.replaceAll('\u00a0',' '))
 for(const [rate,effective,source] of [['0.7300','Oct 1, 2026','synthetic-gauge-45'],['0.7400','Nov 1, 2026','synthetic-gauge-46']])assert(rateRows.some(row=>row.includes(rate)&&row.includes(effective)&&row.includes(source)&&row.includes('Test owner')),`The rates table shows who approved ${rate}: ${rateRows.join(' | ')}`)
 await capture('exchange-rates')
 await page.goto(h.origin+'/app/rates');await capture('client-currency-rates')
 console.log('PASS SETUP-003 client defaults, pre-commercial engagement override and lock, scoped CAD rates, CAD and USD native invoices, labelled 0.7300 conversion, November stability, missing GBP rate and approver on the rates table')
}
