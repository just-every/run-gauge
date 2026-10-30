import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {harness} from './gauge-harness.mjs'

// One money journey: isolated invoice assumptions, source renewal, immutable issue,
// current authority, replay and the exact visible report and its downloaded sources.
export async function cashAssumptionsJourney() {
 const h=await harness({currency:'USD',timezone:'America/New_York'})
 let browser
 try {
  const {cmd,request,owner}=h,asOf='2026-10-10',from='2026-10-01',to='2026-11-30'
  const query=new URLSearchParams({from,to,asOf})
  const read=async(cookie=owner)=>{const r=await request('/api/gauge/state?'+query,cookie);assert.equal(r.status,200,await r.clone().text());return r.json()}
  const worker=await cmd('save:people',{name:'synthetic-gauge-15001',timezone:'America/New_York'})
  const client=await cmd('save:clients',{name:'Collection review client',paymentTermsDays:30,daysLate:10})
  const project=async name=>cmd('save:engagements',{name,clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Reviewed cash forecast',timezone:'America/New_York'})
  const retainer=await project('November service'),hourly=await project('Hourly delivery')
  for(const engagement of [retainer,hourly])await cmd('budget:approve',await cmd('save:budgets',{engagementId:engagement.id,mode:'hourly',amountMinor:1000000,effortSeconds:72000,roundingSeconds:60,reason:'Approved service budget'}))
  await cmd('save:rates',{personId:worker.id,service:'*',effective:'2026-01-01',costMinor:9000,billMinor:20000})
  const task=await cmd('save:tasks',{engagementId:hourly.id,name:'Hourly work',remainingSeconds:72000})
  const entry=await cmd('time:save',{personId:worker.id,engagementId:hourly.id,taskId:task.id,service:'Support',notes:'Supported service',timezone:'America/New_York',billable:true,start:'2026-10-05T09:00:00-04:00',end:'2026-10-05T17:00:00-04:00'})
  await cmd('time:approve',await cmd('time:submit',entry))
  await cmd('save:staffing',{personId:worker.id,engagementId:hourly.id,service:'Support',from:'2026-10-12',to:'2026-10-14',dailySeconds:14400,commitment:'committed'})
  await cmd('agency:calendar',{weekdays:[1,2,3,4,5],holidays:[],reason:'Service calendar'})
  const preview=await cmd('retainer:preview',{engagementId:retainer.id,operation:'terms',terms:{name:'November service fee',feeMinor:300000,frequency:'monthly',unit:'hours',allowance:144000,services:['Service'],consumes:'billable',proration:'calendar',start:'2026-11-01',end:'2026-11-30',renewal:'manual',noticeDays:0,rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:20000}}})
  const term=await cmd('retainer:approve',{...preview.input,fingerprint:preview.fingerprint,reason:'Approved November fee'})
  let schedule=await cmd('retainer:schedule',{retainerId:term.id,basis:'advance',from:'2026-11-01',enabled:true,autoIssue:false,heldPeriodIds:[],reason:'Invoice November service in advance'})
  const items=(data,id)=>data.cash.engagements.find(p=>p.engagementId===id).items
  const getItem=data=>items(data,retainer.id).find(i=>i.source.startsWith('retainerPeriods:'))
  const december=data=>data.cash.months.find(m=>m.month==='2026-12')
  const approveInput=(data,item,percent)=>({from,to,asOf,engagementId:retainer.id,sourceKey:item.probabilityBasis.key,fingerprint:item.probabilityBasis.fingerprint,collectionPercent:percent,reason:'Finance assessment of this exact invoice',...data.data.cashAssumptions.find(r=>r.value.engagementId===retainer.id&&r.value.sourceKey===item.probabilityBasis.key)})
  let data=await read(),item=getItem(data)
  assert.equal(item.amountMinor,300000);assert.equal(item.collectionPercent,100)
  assert.equal(december(data).openMinor,700000);assert.equal(december(data).expectedMinor,700000)
  const unrelated=items(data,hourly.id)
  const finance=await h.invite('synthetic-gauge-15002')
  await cmd('grant',{operatorId:finance.id,personId:worker.id,role:'finance',enabled:true})
  const payload=approveInput(data,item,50),requestKey=crypto.randomUUID()
  const approved=await cmd('cash:approve',{...payload,key:requestKey},finance.cookie)
  assert.deepEqual(await cmd('cash:approve',{...payload,key:requestKey},finance.cookie),approved,'Exact request replay returns the existing approval')
  await cmd('cash:approve',{...payload,key:requestKey,collectionPercent:25},finance.cookie,409)
  data=await read();item=getItem(data)
  assert.equal(data.data.cashAssumptions.length,1)
  assert.equal(december(data).expectedMinor,550000);assert.equal(december(data).historicalExpectedMinor,550000);assert.equal(december(data).openMinor,700000)
  assert.deepEqual(items(data,hourly.id),unrelated,'One override changes no unrelated invoice')
  assert.equal(item.collectionPercent,50);assert.equal(item.probabilityApprovedBy,finance.id);assert.equal(item.probabilityRevision,approved.revision)
  assert.equal(item.invoiceDate,'2026-11-01');assert.equal(item.receiptDate,'2026-12-01');assert.equal(item.historicalDate,'2026-12-11')
  const figure=data.lineage.find(f=>f.id==='cash:USD:2026-12:expectedMinor')
  assert.equal(figure.value,550000);assert(figure.sources.some(s=>s.kind==='cashAssumptions'&&s.id===approved.id&&s.revision===approved.revision))
  const csv=await request('/api/gauge/report.csv?'+new URLSearchParams({from,to,asOf,fingerprint:data.fingerprint}),owner)
  assert.equal(csv.status,200);const csvText=await csv.text();assert(csvText.includes('550000'));assert(csvText.includes(approved.revision));assert(csvText.includes(item.probabilityBasis.references[0].revision))
  const originals=Object.fromEntries(['invoices','payments','retainers','retainerPeriods','retainerCharges'].map(k=>[k,data.data[k]]))

  // Native approval form, with assertions at one width and visual proof at both.
  browser=await chromium.launch({headless:true,...(process.env.GAUGE_CHROMIUM_PATH?{executablePath:process.env.GAUGE_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  const page=await context.newPage();await page.setViewportSize({width:1440,height:1000})
  const open=async()=>{await page.goto(h.origin+'/app/review?'+query);await page.locator('#cash-sources > summary').click()}
  await open()
  let row=page.locator(`[data-cash-source="${item.source}"]`)
  assert.match(await row.innerText(),/3,000\.00 collectible open.*50%.*1,500\.00 expected/s)
  assert((await row.innerText()).includes(approved.revision))
  await row.getByText('Review collection probability',{exact:true}).click()
  await row.getByLabel('Collection percentage (0–100; blank uses client)').fill('0')
  await row.getByLabel('Approval reason').fill('Do not expect collection on this source')
  await row.getByRole('button',{name:'Approve probability',exact:true}).click()
  data=await read();item=getItem(data)
  assert.equal(item.collectionPercent,0);assert.equal(december(data).expectedMinor,400000);assert.equal(december(data).openMinor,700000)
  assert.deepEqual(Object.fromEntries(Object.keys(originals).map(k=>[k,data.data[k]])),originals,'Probability approval changes no terms, invoice, period or payment')
  const zero=data.data.cashAssumptions[0]
  assert.equal(zero.id,approved.id);assert.notEqual(zero.revision,approved.revision)
  const history=await(await request('/api/gauge/history/cashAssumptions/'+zero.id,owner)).json()
  assert.equal(history.history[0].revision,approved.revision);assert.equal(history.history[0].value.collectionPercent,50)
  // Clearing one override returns to the client rate; changing the client leaves
  // an explicit invoice override intact because terms and source have not changed.
  let savedClient=data.data.clients.find(c=>c.id===client.id)
  await cmd('save:clients',{...savedClient,...savedClient.value,collectionPercent:80})
  data=await read();item=getItem(data);assert.equal(item.collectionPercent,0)
  await cmd('cash:approve',approveInput(data,item,''))
  data=await read();item=getItem(data);assert.equal(item.collectionPercent,80);assert.equal(item.probabilitySource,'client fallback');assert.equal(item.probabilityRevision,data.data.clients.find(c=>c.id===client.id).revision)
  await cmd('cash:approve',approveInput(data,item,50))
  data=await read();const stalePayload=approveInput(data,getItem(data),40)
  schedule=await cmd('retainer:schedule',{...schedule,retainerId:term.id,basis:'arrears',from:'2026-11-01',enabled:true,heldPeriodIds:[],reason:'Approved arrears schedule replaces advance'})
  await cmd('cash:approve',stalePayload,owner,409)
  data=await read();item=getItem(data);assert.equal(item.collectionPercent,80);assert(item.staleAssumption);assert.equal(item.invoiceDate,'2026-12-01')
  const staleView=await request('/app/review?'+query,owner);assert((await staleView.text()).includes('Renew approval; client fallback applies.'))
  // Even returning to the old date is a new schedule revision and needs approval.
  schedule=await cmd('retainer:schedule',{...schedule,retainerId:term.id,basis:'advance',from:'2026-11-01',enabled:true,heldPeriodIds:[],reason:'Renew advance terms with a new schedule revision'})
  data=await read();item=getItem(data);assert.equal(item.collectionPercent,80)
  const renewed=await cmd('cash:approve',approveInput(data,item,50))
  await cmd('cash:approve',stalePayload,owner,409)
  // Issue the exact scheduled fee. Its identity and probability carry once, and
  // no old scheduled fee remains beside the new immutable invoice.
  const run=await cmd('retainer:run',{...schedule,asOf:'2026-11-01'})
  data=await read();const packet=data.data.packets.find(p=>p.id===run.value?.packetId||p.value.scheduleId===schedule.id)
  const approvedPacket=await cmd('packet:approve',packet)
  const issued=await cmd('invoice:issue',{...approvedPacket,issueDate:'2026-11-01',dueDate:'2026-12-01',billTo:'Collection review client',remitTo:'Agency operating account',reference:'November contract'})
  const issuedQuery=new URLSearchParams({from,to,asOf:'2026-11-01'})
  const readIssued=async()=>{const r=await request('/api/gauge/state?'+issuedQuery,owner);assert.equal(r.status,200,await r.clone().text());return r.json()}
  data=await readIssued();const issuedItems=items(data,retainer.id)
  assert.equal(issuedItems.length,1);assert.equal(issuedItems[0].invoiceId,issued.id);assert.equal(issuedItems[0].collectionPercent,50);assert.equal(issuedItems[0].probabilityRevision,renewed.revision)
  assert.equal(issuedItems[0].probabilitySource,'scheduled source override');assert.equal(december(data).expectedMinor,278000)
  assert.equal(december(data).openMinor,460000,'Issuance replaces the same fee exactly once')
  const invoiceOriginal=data.data.invoices.find(i=>i.id===issued.id)
  const issuedInput={...approveInput(data,issuedItems[0],25),asOf:'2026-11-01'}
  await cmd('cash:approve',issuedInput)
  data=await readIssued();assert.equal(items(data,retainer.id)[0].expectedMinor,75000);assert.deepEqual(data.data.invoices.find(i=>i.id===issued.id),invoiceOriginal)
  assert.equal(december(data).expectedMinor,203000);assert.equal(december(data).historicalExpectedMinor,203000)

  const lead=await h.invite('synthetic-gauge-15003'),agent=await h.invite('synthetic-gauge-15004')
  await cmd('grant',{operatorId:lead.id,personId:worker.id,role:'lead',enabled:true})
  await cmd('grant',{operatorId:agent.id,personId:worker.id,role:'agent',purpose:'staffing',engagementIds:[retainer.id],enabled:true})
  for(const cookie of [lead.cookie,agent.cookie]){
   await cmd('cash:approve',issuedInput,cookie,403)
   const view=await read(cookie);assert.equal(view.cash,null);assert.deepEqual(view.data.cashAssumptions,[])
   assert.equal((await request('/api/gauge/history/cashAssumptions/'+approved.id,cookie)).status,403)
   const html=await(await request('/app/review?'+query,cookie)).text();assert(!html.includes(approved.revision));assert(!html.includes('cash:approve'))
  }
  await cmd('grant',{operatorId:finance.id,personId:worker.id,role:'finance',enabled:false})
  await cmd('cash:approve',{...payload,key:requestKey},finance.cookie,403)
  assert.equal((await request('/api/gauge/history/cashAssumptions/'+approved.id,finance.cookie)).status,403)
  const allApprovals=(await readIssued()).data.cashAssumptions
  assert.equal(allApprovals.length,2,'Refusals, stale sources and replays create no extra assumptions')
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/review?'+issuedQuery);await page.locator('#cash-sources > summary').click()
   if(process.env.GAUGE_CASH_ASSUMPTIONS_SHOTS){await mkdir(process.env.GAUGE_CASH_ASSUMPTIONS_SHOTS,{recursive:true});await page.locator('#cash-forecast').screenshot({path:`${process.env.GAUGE_CASH_ASSUMPTIONS_SHOTS}/cash-assumptions-${width}.png`})}
  }
  console.log('PASS invoice collection assumptions: isolated 5500 of 7000, native zero and fallback, source renewal, replay, authority, lineage, CSV and once-only issuance')
 } finally {await browser?.close();await h.dispose()}
}
