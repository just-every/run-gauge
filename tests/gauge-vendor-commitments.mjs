import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { attachVendorOriginal } from './fixtures/vendor-commitments.mjs'

/** Native commitment and received-bill sanity journey through built HTTP and forms. */
const h=await harness({currency:'USD',timezone:'Etc/UTC'})
let browser
try {
 const {cmd,state,request,owner}=h
 const worker=await cmd('save:people',{name:'synthetic-gauge-8001',timezone:'Etc/UTC'})
 const contractor=await cmd('save:people',{name:'synthetic-gauge-8002',timezone:'Etc/UTC',contractor:true})
 const client=await cmd('save:clients',{name:'Vendor workflow client'})
 const project=await cmd('save:engagements',{name:'Vendor project',clientId:client.id,leadId:worker.id,members:[worker.id,contractor.id],scope:'Vendor deliverables',timezone:'Etc/UTC'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:1000000,effortSeconds:0,roundingSeconds:1,reason:'Native phase budget',phases:[{key:'vendor',name:'Vendor delivery',service:'Vendor',mode:'hourly',feeBudgetMinor:1000000,hourBudgetSeconds:0,expenseBudgetMinor:0}]}))
 const finance=await h.invite('synthetic-gauge-8003'),lead=await h.invite('synthetic-gauge-8004'),staff=await h.invite('synthetic-gauge-8005'),recipient=await h.invite('synthetic-gauge-8006'),agent=await h.invite('synthetic-gauge-8007')
 for(const [user,role]of [[finance,'finance'],[lead,'lead'],[staff,'staff']])await cmd('grant',{operatorId:user.id,personId:worker.id,role,enabled:true})
 await cmd('grant',{operatorId:agent.id,role:'agent',purpose:'billing',engagementIds:[project.id],enabled:true})
 await cmd('approval:limit',{reviewAboveMinor:100000,reason:'Independent monetary review'})
 const input={engagementId:project.id,phaseKey:'vendor',vendor:'Native vendor',scope:'Deliver the approved design',poReference:'PO-8001',amountMinor:800000,date:'2026-10-01',from:'2026-10-01',to:'2026-12-31',expectedDate:'2026-12-15',reason:'Reviewed subcontractor scope'}
 const report=async(cookie=owner)=>{const r=await request('/api/gauge/state?from=2026-10-01&to=2026-12-31&asOf=2026-10-31',cookie);assert.equal(r.status,200,await r.clone().text());return r.json()}
 const row=async(kind,id)=>(await state()).data[kind].find(r=>r.id===id)
 const noEffect=async(work)=>{const before=(await report()).data;await work();assert.deepEqual((await report()).data,before,'Refusal leaves every business record unchanged')}

 // Native forms create and approve the exact $8,000 commitment at one assertion width.
 browser=await chromium.launch({headless:true,executablePath:process.env.GAUGE_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))}
 await login(owner)
 const open=async()=>{await page.goto(h.origin+'/app/engagements?edit='+project.id);await page.locator('#vendor-commitments').waitFor()}
 const submit=async(form,button)=>{await Promise.all([page.waitForNavigation(),form.getByRole('button',{name:button,exact:true}).click()]);assert.equal(new URL(page.url()).pathname,'/app/engagements',await page.textContent('body'))}
 await open();await page.locator('#vendor-commitments').getByText('New commitment',{exact:true}).click()
 const form=page.locator('form').filter({has:page.locator('input[name="action"][value="vendor:save"]')}).first()
 for(const[name,value]of Object.entries({vendor:input.vendor,scope:input.scope,poReference:input.poReference,amountDollars:'8000.00',date:input.date,from:input.from,to:input.to,expectedDate:input.expectedDate,reason:input.reason}))await form.locator('[name="'+name+'"]').fill(value)
 await submit(form,'Save commitment draft')
 let commitment=(await state()).data.vendorCommitments[0]
 assert.match(await page.locator('#vendor-'+commitment.id).innerText(),/Needs an independent approver/)
 await noEffect(()=>cmd('vendor:approve',{id:commitment.id,revision:commitment.revision,reason:'Self review refused'},owner,403))
 await login(finance.cookie);await open()
 const decide=page.locator('#vendor-'+commitment.id).getByText('Approve commitment',{exact:true}).first()
 await decide.click()
 const approveForm=page.locator('#vendor-'+commitment.id+' form').filter({has:page.locator('input[name="action"][value="vendor:approve"]')})
 await approveForm.getByLabel('Reason',{exact:true}).fill('Independent finance approves exact purchase order')
 await submit(approveForm,'Approve commitment')
 commitment=await row('vendorCommitments',commitment.id)
 const createBill=async(reference,amountMinor,date,actor=owner,c=commitment)=>cmd('vendorBill:save',{engagementId:project.id,phaseKey:'vendor',commitmentId:c.id,commitmentRevision:c.revision,reference,amountMinor,date,reason:'Received original bill'},actor)
 const approve=async b=>cmd('vendorBill:approve',{id:b.id,revision:b.revision,reason:'Independent reviewed bill'},finance.cookie)

 // Receive both originals with the native form. Approval is a separate exact-revision decision.
 const bills=[]
 for(const[reference,amount,date]of [['BILL-2000','2000.00','2026-10-08'],['BILL-3000','3000.00','2026-10-15']]){
  await open();const card=page.locator('#vendor-'+commitment.id);await card.getByText('Receive bill',{exact:true}).click()
  const receive=card.locator('form').filter({has:page.locator('input[name="action"][value="vendorBill:save"]')})
  await receive.getByLabel('Amount',{exact:true}).fill(amount);await receive.getByLabel('Record date').fill(date);await receive.getByLabel('Vendor bill reference').fill(reference);await receive.getByLabel('Preparation reason').fill('User-recorded received bill')
  await submit(receive,'Save bill draft')
  let b=(await state()).data.vendorBills.find(b=>b.value.reference===reference)
  const file=page.locator('#bill-'+b.id+' form').filter({has:page.locator('input[name="action"][value="vendorBill:file"]')})
  await file.getByLabel('Original bill file').setInputFiles({name:reference+'.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic-gauge-8008 '+reference)})
  await submit(file,'Attach original');b=await row('vendorBills',b.id)
  await noEffect(()=>cmd('vendorBill:approve',{id:b.id,revision:b.revision,reason:'Self approval denied'},finance.cookie,403))
  await login(owner)
  const approved=await cmd('vendorBill:approve',{id:b.id,revision:b.revision,reason:'Independent owner reviews finance-prepared bill'})
  bills.push(await row('vendorBills',approved.id));await login(finance.cookie)
 }
 const initial=await report(),f=initial.forecast.engagements.find(f=>f.engagementId===project.id),m=initial.margin.find(m=>m.engagementId===project.id)
 assert.equal(f.actualCostMinor,500000);assert.equal(f.etcCostMinor,300000);assert.equal(f.eacCostMinor,800000)
 assert.equal(f.marginMinor,-800000);assert.equal(m.approvedCostMinor,500000);assert.equal(m.approvedVendorCostMinor,500000);assert.equal(m.approvedLaborCostMinor,0)
 assert.equal(initial.economics.find(e=>e.engagementId===project.id).costMinor,500000)
 assert.equal(initial.portfolio.projects.find(p=>p.engagementId===project.id).costMinor,500000)
 assert.equal(initial.portfolio.rows.find(p=>p.projectIds.includes(project.id)).eacCostMinor,800000)
 assert.equal(initial.portfolio.convertedBurn.minor,500000)
 const phase=initial.phaseMargins.find(m=>m.engagementId===project.id&&m.phase.key==='vendor')
 assert.equal(phase.approvedCostMinor,500000);assert.equal(phase.eacCostMinor,800000);assert.equal(phase.etcCostMinor,300000)
 const figure=initial.lineage.find(f=>f.id==='vendor:'+commitment.id+':totalMinor')
 assert.equal(figure.value,800000);assert(figure.complete)
 assert.deepEqual(figure.sources.filter(s=>s.kind==='vendorBills').map(s=>s.revision).sort(),bills.map(b=>b.revision).sort())
 assert(figure.sources.some(s=>s.kind==='vendorCommitments'&&s.revision===commitment.revision))
 const csv=await request('/api/gauge/report.csv?from=2026-10-01&to=2026-12-31&asOf=2026-10-31&fingerprint='+initial.fingerprint,owner)
 assert.equal(csv.status,200);const exported=await csv.text();const rows=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:exported,encoding:'utf8',maxBuffer:16*1024*1024}))
 for(const [field,expected]of [['actualMinor',500000],['remainingMinor',300000],['totalMinor',800000]]){
  const figureId='vendor:'+commitment.id+':'+field,exportedFigure=rows.find(r=>r.row==='figure'&&r.figure===figureId)
  assert.equal(Number(exportedFigure.value),expected);assert.equal(exportedFigure.currency,'USD')
  const sources=rows.filter(r=>r.row==='source'&&r.figure===figureId)
  for(const bill of bills)assert(sources.some(r=>r['source id']===bill.id&&r['source revision']===bill.revision))
 }
 await open();await page.locator('#vendor-commitments').getByRole('link',{name:'Calculation and sources'}).click()
 assert.match(await page.locator('#report-evidence').innerText(),/Vendor forecast/)

 // Candidate browser proof shows the changed screen once at each width. Assertions run at 1440.
 if(process.env.GAUGE_VENDOR_SHOTS){await mkdir(process.env.GAUGE_VENDOR_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await open();await page.evaluate(()=>document.fonts.ready);await page.locator('#vendor-commitments').screenshot({path:process.env.GAUGE_VENDOR_SHOTS+'/vendors-'+width+'.png'})}}
 await page.setViewportSize({width:1440,height:1000})
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Vendor forms fit the existing shell')

 // Duplicate matching, immutable approved inputs, excess and stale decisions fail without changes.
 await noEffect(()=>approve(bills[0]).then(()=>assert.fail('Duplicate approval must refuse')).catch(error=>{assert.match(error.message,/already approved/)}))
 await noEffect(()=>cmd('vendorBill:save',{...bills[0],...bills[0].value,amountMinor:1},owner,409))
 await noEffect(()=>createBill('BILL-2000',200000,'2026-10-08',owner).then(()=>assert.fail('Duplicate reference must refuse')).catch(error=>assert.match(error.message,/already received/)))
 let excess=await attachVendorOriginal(h,await createBill('BILL-EXCESS',400000,'2026-10-16'))
 await noEffect(()=>cmd('vendorBill:approve',{...excess,reason:'Would exceed commitment'},finance.cookie,409))
 let stale=await createBill('BILL-STALE',10000,'2026-10-17'),edited=await cmd('vendorBill:save',{...stale,engagementId:project.id,phaseKey:'vendor',commitmentId:commitment.id,commitmentRevision:commitment.revision,reference:'BILL-STALE',amountMinor:15000,date:'2026-10-17',reason:'Corrected draft amount'})
 await noEffect(()=>cmd('vendorBill:approve',{...stale,reason:'Old revision'},owner,409))
 const simultaneous=await attachVendorOriginal(h,edited),key=crypto.randomUUID(),decision={action:'vendorBill:approve',id:simultaneous.id,revision:simultaneous.revision,reason:'Concurrent exact bill decision'}
 const responses=await Promise.all([1,2].map(()=>h.post('/api/gauge/command',{...decision,key:crypto.randomUUID()},owner)))
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409])
 assert.equal((await row('vendorBills',edited.id)).value.amountMinor,15000)
 const accepted=await row('vendorBills',edited.id)
 // A successful request-key replay of another bill remains one match.
 let replay=await attachVendorOriginal(h,await createBill('BILL-REPLAY',10000,'2026-10-18'))
 const replayInput={action:'vendorBill:approve',key,...replay,reason:'Once-only request'}
 const first=await h.post('/api/gauge/command',replayInput,owner),again=await h.post('/api/gauge/command',replayInput,owner)
 assert.equal(first.status,200);assert.equal(again.status,200);assert.deepEqual(await first.json(),await again.json())
 assert.equal((await h.post('/api/gauge/command',{...replayInput,reason:'Changed replay'},owner)).status,409)

 // Ambiguous costs are refused in either write order, including proposal-created sources.
 for(const vendor of [input.vendor,'Different display name'])await noEffect(()=>cmd('expense:save',{personId:worker.id,engagementId:project.id,date:'2026-10-10',description:'Ambiguous expense cannot duplicate a vendor cost',vendor,amountMinor:200000,reimbursable:false},owner,409))
 await noEffect(()=>cmd('save:staffing',{personId:contractor.id,engagementId:project.id,phaseKey:'vendor',from:'2026-10-10',to:'2026-10-11',dailySeconds:3600,commitment:'committed'},owner,409))
 const other=await cmd('save:engagements',{name:'Ambiguous source project',clientId:client.id,leadId:worker.id,members:[contractor.id],scope:'Existing native contractor work',timezone:'Etc/UTC'})
 await cmd('save:staffing',{personId:contractor.id,engagementId:other.id,from:'2026-10-10',to:'2026-10-11',dailySeconds:3600,commitment:'committed'})
 const ambiguous=await cmd('vendor:save',{...input,engagementId:other.id,phaseKey:undefined,poReference:'PO-AMBIGUOUS'})
 await noEffect(()=>cmd('vendor:approve',{...ambiguous,reason:'Cannot double count staffing'},finance.cookie,409))

 // Linked corrections preserve originals, change only their own chain and retain review authority.
 const originalBill=bills[1],originalBytes=await(await request('/api/gauge/vendor-files/'+originalBill.value.attachmentIds[0],owner)).text()
 let correction=await cmd('vendorBill:save',{engagementId:project.id,phaseKey:'vendor',commitmentId:commitment.id,commitmentRevision:commitment.revision,previousId:originalBill.id,previousRevision:originalBill.revision,reference:'BILL-3000 corrected',amountMinor:250000,date:'2026-10-19',reason:'Vendor reduced the bill'})
 correction=await attachVendorOriginal(h,correction,'synthetic-gauge-8009 corrected original')
 await cmd('vendorBill:approve',{...correction,reason:'Independent finance reviews correction'},finance.cookie)
 assert.deepEqual(await row('vendorBills',originalBill.id),originalBill,'Approved original is unchanged')
 assert.equal(await(await request('/api/gauge/vendor-files/'+originalBill.value.attachmentIds[0],owner)).text(),originalBytes)
 const corrected=await report(),cf=corrected.forecast.engagements.find(f=>f.engagementId===project.id)
 assert.equal(cf.actualCostMinor,475000);assert.equal(cf.etcCostMinor,325000);assert.equal(cf.eacCostMinor,800000)
 const oldSnapshot=await(await request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-16',owner)).json()
 assert.equal(oldSnapshot.forecast.engagements.find(f=>f.engagementId===project.id).actualCostMinor,500000,'Later correction retains earlier dated actuals')


 // A dated correction is a signed delta in its own month, preserving earlier period burn.
 const correctedBill=await row('vendorBills',correction.id)
 let later=await cmd('vendorBill:save',{engagementId:project.id,phaseKey:'vendor',commitmentId:commitment.id,commitmentRevision:commitment.revision,previousId:correctedBill.id,previousRevision:correctedBill.revision,reference:'BILL-3000 final',amountMinor:200000,date:'2026-11-05',reason:'Later linked reduction'})
 later=await attachVendorOriginal(h,later,'synthetic-gauge-8010 later correction')
 await cmd('vendorBill:approve',{...later,reason:'Independent later correction'},finance.cookie)
 const november=await(await request('/api/gauge/state?from=2026-11-01&to=2026-11-30&asOf=2026-11-30',owner)).json(),nf=november.forecast.engagements.find(f=>f.engagementId===project.id)
 assert.equal(nf.actualCostMinor,425000);assert.equal(nf.eacCostMinor,800000)
 assert.equal(nf.months.find(m=>m.month==='2026-10').actualCostMinor,475000);assert.equal(nf.months.find(m=>m.month==='2026-11').actualCostMinor,-50000)
 assert.equal(november.portfolio.projects.find(p=>p.engagementId===project.id).costMinor,-50000)
 assert.equal((await report()).forecast.engagements.find(f=>f.engagementId===project.id).actualCostMinor,475000,'A November delta cannot rewrite October actual cost')
 const successor=await cmd('vendor:save',{...input,previousId:commitment.id,previousRevision:commitment.revision,amountMinor:750000,date:'2026-11-06',reason:'Linked purchase-order reduction'})
 await noEffect(()=>cmd('vendor:approve',{...successor,reason:'Above-limit self approval'},owner,403))
 const originalCommitment=commitment
 await cmd('vendor:approve',{...successor,reason:'Independent finance reviews reduced purchase order'},finance.cookie)
 commitment=await row('vendorCommitments',successor.id)
 assert.deepEqual(await row('vendorCommitments',originalCommitment.id),originalCommitment,'The original purchase order remains immutable')
 await noEffect(()=>createBill('BILL-OLD-REVISION',10000,'2026-11-10',owner,originalCommitment).then(()=>assert.fail('Superseded commitment must refuse')).catch(error=>assert.match(error.message,/current approved commitment revision/)))
 const revised=(await report()).forecast.engagements.find(f=>f.engagementId===project.id)
 assert.equal(revised.eacCostMinor,750000);assert.equal(revised.actualCostMinor,475000);assert.equal(revised.etcCostMinor,275000)

 // Concurrent distinct bills share one bounded remainder and cannot overspend it.
 const contenders=await Promise.all(['BILL-RACE-A','BILL-RACE-B'].map(async reference=>attachVendorOriginal(h,await createBill(reference,200000,'2026-11-10'))))
 const raced=await Promise.all(contenders.map(b=>h.post('/api/gauge/command',{action:'vendorBill:approve',key:crypto.randomUUID(),...b,reason:'Competing remaining commitment'},finance.cookie)))
 assert.deepEqual(raced.map(r=>r.status).sort(),[200,409])
 const afterRace=await(await request('/api/gauge/state?from=2026-11-01&to=2026-11-30&asOf=2026-11-30',owner)).json()
 assert.equal(afterRace.forecast.engagements.find(f=>f.engagementId===project.id).actualCostMinor,625000)
 assert.equal(afterRace.forecast.engagements.find(f=>f.engagementId===project.id).eacCostMinor,750000)

 // Invalid currencies, missing explicit source revisions and unrelated private roles refuse.
 await noEffect(()=>cmd('vendor:save',{...input,currency:'EUR'},owner,400))
 await noEffect(()=>cmd('vendorBill:save',{engagementId:project.id,commitmentId:commitment.id,reference:'BILL-NO-SOURCE',amountMinor:1,date:'2026-11-10',reason:'Missing exact source'},owner,409))

 // Monthly reconciliation includes native vendor costs and refuses edits to a closed financial period.
 const preview=await cmd('period:preview',{month:'2026-10'})
 assert.equal(preview.snapshot.totals.vendorCostByCurrency.USD,475000)
 assert(preview.snapshot.checklist.blocking.some(b=>b.kind==='vendorBills'&&b.id===excess.id))
 const oldInput={...input,poReference:'PO-HISTORICAL',date:'2020-09-01',from:'2020-09-01',to:'2020-12-31',expectedDate:'2020-12-15',amountMinor:90000}
 const historical=await cmd('vendor:approve',{...await cmd('vendor:save',oldInput),reason:'Approved historical commitment'})
 let historicalBill=await cmd('vendorBill:save',{engagementId:project.id,phaseKey:'vendor',commitmentId:historical.id,commitmentRevision:historical.revision,reference:'BILL-HISTORICAL',amountMinor:50000,date:'2020-09-15',reason:'Historical vendor bill'})
 historicalBill=await attachVendorOriginal(h,historicalBill);historicalBill=await cmd('vendorBill:approve',{...historicalBill,reason:'Reviewed historical original'})
 await cmd('time:policy',{lockThrough:'2020-09-30',reason:'Completed historical time period'})
 const historicalPreview=await cmd('period:preview',{month:'2020-09'})
 assert.deepEqual(historicalPreview.snapshot.checklist.blocking,[])
 const close=await cmd('period:approve',await cmd('period:prepare',{month:'2020-09',fingerprint:historicalPreview.fingerprint,acknowledgeWip:true,wipReconciliation:'No remaining historical work or billable vendor recovery',reason:'Freeze native vendor costs'}))
 const download=await request('/api/gauge/closes/'+close.id,owner);assert.equal(download.status,200)
 const closeValue=await download.json();assert.equal(closeValue.value.snapshot.totals.vendorCostByCurrency.USD,50000)
 await noEffect(()=>cmd('vendorBill:save',{engagementId:project.id,phaseKey:'vendor',commitmentId:historical.id,commitmentRevision:historical.revision,reference:'BILL-CLOSED',amountMinor:10000,date:'2020-09-20',reason:'Cannot alter closed actuals'},owner,409))
 assert.deepEqual(await(await request('/api/gauge/closes/'+close.id,owner)).json(),closeValue,'Refused dated writes preserve the close original')
 // Every private read and write boundary is checked using populated ledger data.
 const privatePath='/api/gauge/history/vendorBills/'+originalBill.id,originalPath='/api/gauge/vendor-files/'+originalBill.value.attachmentIds[0]
 for(const user of [lead,staff,agent]){
  const view=await report(user.cookie);assert.deepEqual(view.data.vendorBills,[]);assert.deepEqual(view.data.vendorCommitments,[]);assert.equal(view.forecast,null)
  assert(!JSON.stringify(view).includes('PO-8001'));assert.equal((await request(privatePath,user.cookie)).status,403);assert.equal((await request(originalPath,user.cookie)).status,403)
  await noEffect(()=>cmd('vendor:save',input,user.cookie,403))
 }
 for(const path of [privatePath,originalPath,'/api/gauge/state'])assert.equal((await request(path,recipient.cookie)).status,403)
 await cmd('grant',{operatorId:finance.id,personId:worker.id,role:'finance',enabled:false})
 for(const path of [privatePath,originalPath,'/api/gauge/state'])assert.equal((await request(path,finance.cookie)).status,403)
 await noEffect(()=>cmd('vendor:save',input,finance.cookie,403))
 assert.equal((await request(originalPath,owner)).status,200,'Owner custody continues after finance revocation')
 assert((await(await request('/api/gauge/audit?kind=vendorBills',owner)).json()).entries.some(e=>e.action==='vendorBill:approve'))
 console.log('PASS native vendor commitment and received-bill journey: independent review, originals, exact once-only actuals and remainder, source drills and CSV, project and phase totals, immutable corrections, overlap refusals, concurrent and stale decisions, private boundaries and revocation')
} finally {await browser?.close();await h.dispose()}
