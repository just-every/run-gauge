import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {harness} from './gauge-harness.mjs'

// One money journey: isolated invoice assumptions, source renewal, immutable issue,
// current authority, replay and the exact visible report and its downloaded sources.
export async function cashAssumptionsJourney() {
 const h=await harness({currency:'USD',timezone:'America/New_York',databaseBinding:false})
 let browser
 try {
  const {cmd,request,owner}=h,asOf='2026-10-10',from='2026-10-01',to='2026-11-30'
  const query=new URLSearchParams({from,to,asOf})
  const read=async(cookie=owner)=>{const r=await request('/api/gauge/state?'+query,cookie);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body}
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
  console.log('Cash assumptions: native schedule seeded')
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
  console.log('Cash assumptions: finance approval, replay and CSV reconcile')
  const originals=Object.fromEntries(['invoices','payments','retainers','retainerPeriods','retainerCharges'].map(k=>[k,data.data[k]]))

  // Native approval form, with assertions at one width and visual proof at both.
  browser=await chromium.launch({headless:true,...(process.env.GAUGE_CHROMIUM_PATH?{executablePath:process.env.GAUGE_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  const page=await context.newPage();await page.setViewportSize({width:1440,height:1000})
  const open=async()=>{await page.goto(h.origin+'/app/review?'+query);await page.locator('#cash-sources > summary').click()}
  await open()
  await page.locator('#cash-forecast table').getByRole('row',{name:/2026-12/}).getByRole('link',{name:'$5,500.00',exact:true}).first().click()
  for(const [key,value]of query)assert.equal(new URL(page.url()).searchParams.get(key),value,'Cash drills preserve the captured forecast dates')
  assert((await page.locator('#report-evidence').innerText()).includes('$5,500.00'))
  await page.locator('#report-evidence').getByText(/^Source revisions/).click()
  assert((await page.locator('#report-evidence').innerText()).includes(approved.revision))
  await open()
  let row=page.locator(`[data-cash-source="${item.source}"]`)
  assert.match(await row.innerText(),/3,000\.00 collectible open.*50%.*1,500\.00 expected/s)
  assert((await row.innerText()).includes(approved.revision))
  await row.getByText('Review collection probability',{exact:true}).click()
  const cashScreen=page.locator('#cash-forecast')
  assert(await cashScreen.locator('p,li,a,summary,label,input,button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height).every(n=>parseFloat(getComputedStyle(n).fontSize)>=13)),'Cash text and controls remain readable')
  assert.deepEqual(await cashScreen.locator('button,a,summary').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&n.querySelector('svg,img')&&!n.hasAttribute('data-tooltip')&&!n.getAttribute('aria-describedby')).map(n=>n.outerHTML)),[],'Icon-only cash controls have tooltips')
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000})
   if(process.env.GAUGE_CASH_ASSUMPTIONS_SHOTS){await mkdir(process.env.GAUGE_CASH_ASSUMPTIONS_SHOTS,{recursive:true});await cashScreen.screenshot({path:`${process.env.GAUGE_CASH_ASSUMPTIONS_SHOTS}/cash-assumptions-${width}.png`})}
  }
  await page.setViewportSize({width:1440,height:1000})
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
  console.log('Cash assumptions: native form, zero, fallback and schedule renewal reconcile')
  const run=await cmd('retainer:run',{...schedule,asOf:'2026-11-01'})
  data=await read();const packet=data.data.packets.find(p=>p.id===run.value?.packetId||p.value.scheduleId===schedule.id)
  const approvedPacket=await cmd('packet:approve',packet)
  const issued=await cmd('invoice:issue',{...approvedPacket,issueDate:'2026-11-01',dueDate:'2026-12-01',billTo:'Collection review client',remitTo:'Agency operating account',reference:'November contract'})
  const issuedQuery=new URLSearchParams({from,to,asOf:'2026-11-01'})
  const readIssued=async()=>{const r=await request('/api/gauge/state?'+issuedQuery,owner);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body}
  data=await readIssued();const issuedItems=items(data,retainer.id)
  assert.equal(issuedItems.length,1);assert.equal(issuedItems[0].invoiceId,issued.id);assert.equal(issuedItems[0].collectionPercent,50);assert.equal(issuedItems[0].probabilityRevision,renewed.revision)
  assert.equal(issuedItems[0].probabilitySource,'scheduled source override');assert.equal(december(data).expectedMinor,278000)
  assert.equal(december(data).openMinor,460000,'Issuance replaces the same fee exactly once')
  const invoiceOriginal=data.data.invoices.find(i=>i.id===issued.id)
  const issuedInput={...approveInput(data,issuedItems[0],25),asOf:'2026-11-01'}
  await cmd('cash:approve',issuedInput)
  data=await readIssued();assert.equal(items(data,retainer.id)[0].expectedMinor,75000);assert.deepEqual(data.data.invoices.find(i=>i.id===issued.id),invoiceOriginal)
  assert.equal(december(data).expectedMinor,203000);assert.equal(december(data).historicalExpectedMinor,203000)
  await cmd('cash:approve',{...approveInput(data,items(data,retainer.id)[0],''),asOf:'2026-11-01'})
  data=await readIssued();assert.equal(items(data,retainer.id)[0].collectionPercent,80);assert.equal(items(data,retainer.id)[0].probabilitySource,'client fallback','Explicit reset suppresses an inherited scheduled override')
  await cmd('cash:approve',{...approveInput(data,items(data,retainer.id)[0],25),asOf:'2026-11-01'})
  data=await readIssued();assert.equal(december(data).expectedMinor,203000)



  await cmd('invoice:promise',{...issued,amountMinor:100000,date:'2026-12-20',reference:'Reviewed December promise'})
  data=await readIssued();const promisedParts=items(data,retainer.id).filter(i=>i.invoiceId===issued.id)
  assert.equal(promisedParts.length,2);assert(promisedParts.every(i=>i.collectibleOpenMinor===300000))
  assert.equal(promisedParts.reduce((n,i)=>n+i.expectedMinor,0),75000,'A promise moves its portion without duplicating expected cash or losing the invoice override')
  const promiseView=await(await request('/app/review?'+issuedQuery,owner)).text()
  assert(promiseView.includes('Full source collectible open:'))

  // Moving a promised portion must preserve the invoice's one rounded expected
  // amount even when the split falls on an odd cent.
  const halfApproval=await cmd('cash:approve',{...approveInput(data,promisedParts[0],50),asOf:'2026-11-01'})
  await cmd('invoice:promise',{...issued,amountMinor:100001,date:'2027-01-05',reference:'Reviewed partial promise with exact cents'})
  data=await readIssued()
  const roundedParts=items(data,retainer.id).filter(i=>i.invoiceId===issued.id)
  assert.equal(roundedParts.reduce((n,i)=>n+i.expectedMinor,0),150000,'Moving a promise cannot create expected cash by rounding its portions twice')
  assert(roundedParts.every(i=>i.probabilityRevision===halfApproval.revision))
  assert.equal(roundedParts.find(i=>i.promised).expectedMinor,50001)
  assert.equal(roundedParts.find(i=>!i.promised).expectedMinor,99999)

  const concurrentInput={...approveInput(data,roundedParts[0],50),asOf:'2026-11-01'}
  const competing=await Promise.all([0,1].map(()=>h.post('/api/gauge/command',{...concurrentInput,key:crypto.randomUUID(),action:'cash:approve'},owner)))
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409],'Only one concurrent decision can replace the reviewed revision')
  data=await readIssued()
  assert.equal(items(data,retainer.id).filter(i=>i.invoiceId===issued.id).reduce((n,i)=>n+i.expectedMinor,0),150000)

  // A combined document keeps the approved source separate from its other line.
  // Credits reduce the named line before probabilities, including a full credit.
  const mixed=await project('Combined scheduled charges')
  const budget=await cmd('budget:approve',await cmd('save:budgets',{engagementId:mixed.id,mode:'fixed',amountMinor:300000,effortSeconds:3600,roundingSeconds:60,reason:'Two scheduled charges'}))
  const charges=[]
  for(const cumulativeBasisPoints of [5000,10000])charges.push(await cmd('fixed:approve',await cmd('fixed:prepare',{engagementId:mixed.id,budgetId:budget.id,budgetRevision:budget.revision,name:'Scheduled service charge',chargeType:'progress',cumulativeBasisPoints,date:'2026-11-01',reason:'Approved billing schedule'})))
  data=await readIssued();const scheduled=items(data,mixed.id).find(i=>i.source==='fixedCharges:'+charges[0].id)
  await cmd('cash:approve',{...approveInput(data,scheduled,50),engagementId:mixed.id,asOf:'2026-11-01'})
  const combined=await cmd('packet:approve',await cmd('packet:create',{engagementId:mixed.id,title:'Combined service charges',sources:charges.map(c=>'fixedCharges:'+c.id)}))
  const combinedInvoice=await cmd('invoice:issue',{...combined,issueDate:'2026-11-01',dueDate:'2026-12-01',billTo:'Collection review client',remitTo:'Agency operating account',reference:'Two exact charges'})
  data=await readIssued();let parts=items(data,mixed.id)
  assert.equal(parts.length,2);assert.deepEqual(parts.map(i=>i.collectionPercent),[50,80]);assert.equal(parts.reduce((n,i)=>n+i.expectedMinor,0),195000)
  const combinedOriginal=data.data.invoices.find(i=>i.id===combinedInvoice.id)
  const firstIndex=combinedOriginal.value.lines.findIndex(l=>l.sourceId===charges[0].id),secondIndex=1-firstIndex
  await cmd('invoice:credit',{...combinedInvoice,type:'credit',lines:[{line:firstIndex,amountMinor:100000}],date:'2026-11-01',reason:'Partial source credit'})
  data=await readIssued();parts=items(data,mixed.id)
  assert.equal(parts.reduce((n,i)=>n+i.openMinor,0),200000)
  assert.equal(parts.reduce((n,i)=>n+i.expectedMinor,0),145000,'Only the credited source loses its own expected cash')
  assert.deepEqual(data.data.invoices.find(i=>i.id===combinedInvoice.id),combinedOriginal)
  await cmd('invoice:credit',{...combinedInvoice,type:'credit',lines:[{line:firstIndex,amountMinor:50000},{line:secondIndex,amountMinor:150000}],date:'2026-11-01',reason:'Credit the remaining scheduled sources'})
  data=await readIssued();parts=items(data,mixed.id)
  assert.equal(parts.reduce((n,i)=>n+i.openMinor,0),0);assert.equal(parts.reduce((n,i)=>n+i.expectedMinor,0),0,'A fully credited inherited schedule remains readable with zero cash')


  // A single issued invoice may span projects. Its override is one invoice
  // decision, applied to both project shares with one exact approval revision.
  const expenses=[]
  for(const engagementId of [retainer.id,hourly.id]){
   const expense=await cmd('expense:save',{engagementId,personId:worker.id,date:'2026-11-01',description:'Approved reimbursable cost',amountMinor:100000,reimbursable:true})
   expenses.push(await cmd('expense:approve',await cmd('expense:submit',expense)))
  }
  const sharedPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:retainer.id,consolidate:true,title:'One invoice across projects',sources:expenses.map(e=>'expenses:'+e.id)}))
  const sharedInvoice=await cmd('invoice:issue',{...sharedPacket,issueDate:'2026-11-01',dueDate:'2026-12-01',billTo:'Collection review client',remitTo:'Agency operating account',reference:'Consolidated expenses'})
  data=await readIssued();const sharedItem=items(data,retainer.id).find(i=>i.invoiceId===sharedInvoice.id)
  let sharedApproval=await cmd('cash:approve',{...approveInput(data,sharedItem,25),asOf:'2026-11-01'})
  data=await readIssued()
  for(const id of [retainer.id,hourly.id]){
   const part=items(data,id).find(i=>i.invoiceId===sharedInvoice.id)
   assert.equal(part.openMinor,100000);assert.equal(part.expectedMinor,25000);assert.equal(part.probabilityRevision,sharedApproval.revision)
   assert.equal(part.probabilityBasis.fingerprint,sharedItem.probabilityBasis.fingerprint)
  }
  const otherPart=items(data,hourly.id).find(i=>i.invoiceId===sharedInvoice.id)
  sharedApproval=await cmd('cash:approve',{...approveInput(data,otherPart,50),...sharedApproval,engagementId:hourly.id,asOf:'2026-11-01'})
  data=await readIssued()
  for(const id of [retainer.id,hourly.id]){
   const part=items(data,id).find(i=>i.invoiceId===sharedInvoice.id)
   assert.equal(part.expectedMinor,50000);assert.equal(part.probabilityRevision,sharedApproval.revision)
  }
  assert.equal(data.data.cashAssumptions.filter(a=>a.value.sourceKey===otherPart.probabilityBasis.key).length,1,'Project shares never create conflicting invoice approvals')

  await cmd('payment:record',{...sharedInvoice,date:'2026-11-01',amountMinor:2,reference:'Exact small balance reduction'})
  data=await readIssued()
  const sharedParts=[retainer.id,hourly.id].flatMap(id=>items(data,id).filter(i=>i.invoiceId===sharedInvoice.id))
  assert.equal(sharedParts.reduce((n,i)=>n+i.openMinor,0),199998)
  assert.equal(sharedParts.reduce((n,i)=>n+i.expectedMinor,0),99999,'Project shares reconcile to the one rounded invoice expectation')

  const lead=await h.invite('synthetic-gauge-15003'),agent=await h.invite('synthetic-gauge-15004')
  await cmd('grant',{operatorId:lead.id,personId:worker.id,role:'lead',enabled:true})
  await cmd('grant',{operatorId:agent.id,personId:worker.id,role:'agent',purpose:'staffing',engagementIds:[retainer.id],enabled:true})
  for(const cookie of [lead.cookie,agent.cookie]){
   await cmd('cash:approve',issuedInput,cookie,403)
   const view=await read(cookie);assert.equal(view.cash,null);assert.equal(view.cashConverted,null);assert(!view.lineage.some(f=>f.id.startsWith('cashConverted:')));assert.deepEqual(view.data.cashAssumptions,[])
   assert.equal((await request('/api/gauge/history/cashAssumptions/'+approved.id,cookie)).status,403)
   const html=await(await request('/app/review?'+query,cookie)).text();assert(!html.includes(approved.revision));assert(!html.includes('cash:approve'))
  }
  await cmd('grant',{operatorId:finance.id,personId:worker.id,role:'finance',enabled:false})
  await cmd('cash:approve',{...payload,key:requestKey},finance.cookie,403)
  assert.equal((await request('/api/gauge/history/cashAssumptions/'+approved.id,finance.cookie)).status,403)
  const erasedPerson=await cmd('save:people',{name:'synthetic-gauge-15005',timezone:'America/New_York'})
  const erasedFinance=await h.invite('synthetic-gauge-15006')
  await cmd('grant',{operatorId:erasedFinance.id,personId:erasedPerson.id,role:'finance',enabled:true})
  const erasedInput={...approveInput(data,sharedParts[0],50),...sharedApproval,asOf:'2026-11-01',key:crypto.randomUUID()}
  await cmd('cash:approve',erasedInput,erasedFinance.cookie)
  await cmd('grant',{operatorId:erasedFinance.id,personId:erasedPerson.id,role:'finance',enabled:false})
  await cmd('privacy:policy',{personalDays:0,fileDays:0,evidenceDays:0,reason:'Owner-reviewed native erasure scope'})
  await cmd('privacy:exit',{personId:erasedPerson.id,date:'2020-01-01',reason:'Exited finance reviewer'})
  const erasure=await cmd('privacy:preview',{personId:erasedPerson.id})
  assert.deepEqual(erasure.blockers,[])
  await cmd('privacy:erase',{personId:erasedPerson.id,fingerprint:erasure.fingerprint,reason:'Erase only the reviewed native scope',confirm:'erase-reviewed-native-scope',lawfulReceiptRemoval:'authorized'})
  const beforeRefused=(await readIssued()).data.cashAssumptions
  await cmd('cash:approve',erasedInput,erasedFinance.cookie,403)
  assert.equal((await request('/api/gauge/history/cashAssumptions/'+approved.id,erasedFinance.cookie)).status,403)
  assert.equal((await request('/api/gauge/report.csv?'+issuedQuery,erasedFinance.cookie)).status,403)
  assert.deepEqual((await readIssued()).data.cashAssumptions,beforeRefused,'Erased-person replays neither read nor change retained finance decisions')
  const allApprovals=(await readIssued()).data.cashAssumptions
  assert.equal(allApprovals.length,4,'Refusals, stale sources and replays create no extra assumptions')
  // A reviewed period overage is a scheduled source too. Issuing its exact
  // approved packet must carry its decision, rather than restore the client rate.
  const excessProject=await project('Retainer excess collection')
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:excessProject.id,mode:'hourly',amountMinor:100000,effortSeconds:14400,roundingSeconds:60,reason:'Separate service budget'}))
  const excessPreview=await cmd('retainer:preview',{engagementId:excessProject.id,operation:'terms',from:'2026-10-01',to:'2026-10-31',terms:{name:'October service',feeMinor:30000,frequency:'monthly',unit:'hours',allowance:3600,services:['Excess service'],consumes:'billable',proration:'calendar',start:'2026-10-01',end:'2026-10-31',renewal:'manual',noticeDays:0,rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:20000}}})
  await cmd('retainer:approve',{...excessPreview.input,fingerprint:excessPreview.fingerprint,reason:'Approved October service and overage rate'})
  const excessTask=await cmd('save:tasks',{engagementId:excessProject.id,name:'Retainer delivery',remainingSeconds:7200})
  let excessTime=await cmd('time:save',{personId:worker.id,engagementId:excessProject.id,taskId:excessTask.id,service:'Excess service',notes:'Two hours against one included hour',timezone:'America/New_York',billable:true,start:'2026-10-06T09:00:00-04:00',end:'2026-10-06T11:00:00-04:00'})
  excessTime=await cmd('time:approve',await cmd('time:submit',excessTime))
  data=await readIssued()
  const excessSource=items(data,excessProject.id).find(i=>i.source.endsWith(':overage'))
  assert.equal(excessSource.openMinor,20000)
  assert(excessSource.probabilityBasis.references.some(r=>r.kind==='time'&&r.id===excessTime.id&&r.revision===excessTime.revision))
  let excessApproval=await cmd('cash:approve',{...approveInput(data,excessSource,25),engagementId:excessProject.id,asOf:'2026-11-01'})
  data=await readIssued()
  assert.equal(items(data,excessProject.id).find(i=>i.source.endsWith(':overage')).expectedMinor,5000)
  const staleExcessInput={...approveInput(data,items(data,excessProject.id).find(i=>i.source===excessSource.source),25),engagementId:excessProject.id,asOf:'2026-11-01',...excessApproval}
  excessTime=await cmd('time:correct',{...excessTime,reason:'Renew reviewed work without changing its duration'})
  excessTime=await cmd('time:approve',await cmd('time:submit',excessTime))
  data=await readIssued()
  const changedExcess=items(data,excessProject.id).find(i=>i.source===excessSource.source)
  assert.equal(changedExcess.openMinor,20000)
  assert.equal(changedExcess.expectedMinor,16000,'Changed consumption revisions require renewed approval even when the amount is unchanged')
  assert(changedExcess.staleAssumption)
  assert(changedExcess.probabilityBasis.references.some(r=>r.kind==='time'&&r.id===excessTime.id&&r.revision===excessTime.revision))
  await cmd('cash:approve',staleExcessInput,owner,409)
  excessApproval=await cmd('cash:approve',{...approveInput(data,changedExcess,25),engagementId:excessProject.id,asOf:'2026-11-01',...excessApproval})
  const excessPeriodId=excessSource.source.split(':')[1]
  const excessPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:excessProject.id,title:'October excess service',sources:['retainerPeriods:'+excessPeriodId]}))
  const excessInvoice=await cmd('invoice:issue',{...excessPacket,issueDate:'2026-11-01',dueDate:'2026-12-01',billTo:'Collection review client',remitTo:'Agency operating account',reference:'Exact October overage'})
  data=await readIssued()
  const issuedExcess=items(data,excessProject.id).filter(i=>i.invoiceId===excessInvoice.id)
  assert.equal(issuedExcess.reduce((n,i)=>n+i.openMinor,0),20000)
  assert.equal(issuedExcess.reduce((n,i)=>n+i.expectedMinor,0),5000,'Issuance preserves the approved overage probability instead of restoring the client fallback')
  assert(issuedExcess.every(i=>i.probabilityRevision===excessApproval.revision))
  assert(issuedExcess.every(i=>i.assumptionSnapshot.value.references.some(r=>r.kind==='time'&&r.id===excessTime.id&&r.revision===excessTime.revision)))
  const overageFigure=data.lineage.find(f=>f.id==='cash:USD:2026-12:expectedMinor')
  assert(overageFigure.sources.some(r=>r.kind==='cashAssumptions'&&r.id===excessApproval.id&&r.revision===excessApproval.revision))
  const excessCsv=await request('/api/gauge/report.csv?'+new URLSearchParams({...Object.fromEntries(issuedQuery),fingerprint:data.fingerprint}),owner)
  assert.equal(excessCsv.status,200)
  const excessCsvText=await excessCsv.text()
  assert(excessCsvText.includes(excessApproval.revision));assert(excessCsvText.includes(excessTime.revision))
  await page.setViewportSize({width:1440,height:1000})
  await page.goto(h.origin+'/app/review?'+issuedQuery);await page.locator('#cash-sources > summary').click()
  const excessRow=page.locator(`[data-cash-source^="invoices:${excessInvoice.id}"]`)
  assert.match(await excessRow.innerText(),new RegExp(String.raw`200\.00 collectible open.*25%.*50\.00 expected`,'s'))
  assert((await excessRow.innerText()).includes(excessApproval.revision))
  if(process.env.GAUGE_OVERAGE_SHOTS){
   await mkdir(process.env.GAUGE_OVERAGE_SHOTS,{recursive:true})
   for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await excessRow.screenshot({path:`${process.env.GAUGE_OVERAGE_SHOTS}/retainer-overage-${width}.png`})}
  }
  const frozenExcess=data.data.invoices.find(i=>i.id===excessInvoice.id)
  await cmd('cash:approve',{...approveInput(data,issuedExcess[0],0),engagementId:excessProject.id,asOf:'2026-11-01'})
  data=await readIssued()
  assert.equal(items(data,excessProject.id).find(i=>i.invoiceId===excessInvoice.id).expectedMinor,0)
  assert.deepEqual(data.data.invoices.find(i=>i.id===excessInvoice.id),frozenExcess,'An issued override preserves the exact overage original')

  assert(!items(data,excessProject.id).some(i=>!i.issued&&i.source===excessSource.source),'The issued overage replaces its scheduled source exactly once')
  console.log('PASS retainer overage probability: 20000 open, 25% and 5000 expected before and after issuance; same-amount source revision refuses stale approval')
  console.log('PASS invoice collection assumptions: isolated 5500 of 7000, native zero and fallback, source renewal, replay, authority, lineage, CSV and once-only issuance')
 } finally {await browser?.close();await h.dispose()}
}
