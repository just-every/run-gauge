import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { csvRows, workbookRows, pdfLines } from './fixtures/report-downloads.mjs'

// One public-door sanity journey: saved views, exact exports and unsafe reads.
const h=await harness({currency:'USD',timezone:'America/New_York'}),{cmd,state,request,owner}=h
let browser
try {
 const zone='America/New_York',from='2026-10-05',to=from
 const lead=await cmd('save:people',{name:'synthetic-gauge-8101',timezone:zone}),other=await cmd('save:people',{name:'synthetic-gauge-8102',timezone:zone})
 const finance=await h.invite('synthetic-gauge-8103'),leadUser=await h.invite('synthetic-gauge-8104'),outsider=await h.invite('synthetic-gauge-8105')
 for(const [user,personId,role]of [[finance,other.id,'finance'],[leadUser,lead.id,'lead'],[outsider,other.id,'lead']])await cmd('grant',{operatorId:user.id,personId,role,enabled:true})
 const field=await cmd('field:define',{name:'Practice',scope:'engagements',type:'single-select',options:[{id:'design',name:'=SUM(1,2)'}],visibility:'lead-finance',reason:'Report cohorts'})
 const measure=await cmd('field:define',{name:'Score',scope:'engagements',type:'number',visibility:'lead-finance',reason:'Exact numeric report measure'})
 const privateField=await cmd('field:define',{name:'Private contract',scope:'engagements',type:'currency',currency:'USD',visibility:'finance-only',reason:'Private finance measure'})
 const client=await cmd('save:clients',{name:'synthetic-gauge-8106'}),cad=await cmd('save:clients',{name:'synthetic-gauge-8107',billingCurrency:'CAD'})
 const projects=[]
 for(const [i,c,p]of [[0,client,lead],[1,client,lead],[2,cad,other]]){
  const eng=await cmd('save:engagements',{name:`synthetic-gauge-${8110+i}`,clientId:c.id,leadId:p.id,members:[p.id],scope:'Saved report scope',timezone:zone,customFields:{[field.id]:'design',...(i<2?{[measure.id]:String(i+2),[privateField.id]:10000}: {})}});projects.push(eng)
  const terms=await cmd('save:budgets',{engagementId:eng.id,mode:'hourly',amountMinor:100000,effortSeconds:28800,roundingSeconds:60,reason:'Approved terms'});await cmd('budget:approve',terms)
  const task=await cmd('save:tasks',{engagementId:eng.id,name:'Report work',remainingSeconds:0})
  if(i===0)await cmd('save:rates',{personId:p.id,service:'*',effective:'2026-01-01',costMinor:9000,billMinor:15000})
  const time=await cmd('time:save',{personId:p.id,engagementId:eng.id,taskId:task.id,service:'Design',notes:'Exact captured work',timezone:zone,billable:true,start:`${from}T${i===1?'10':'09'}:00:00-04:00`,end:`${from}T${i===1?'12':'10'}:00:00-04:00`})
  await cmd('time:approve',await cmd('time:submit',time))
 }
 await cmd('save:calendars',{personId:lead.id,from,to,weekdays:'1,2,3,4,5',dailySeconds:28800,timezone:zone})
 browser=await chromium.launch({headless:true,...(process.env.GAUGE_CHROMIUM?{executablePath:process.env.GAUGE_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return{name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))}
 const definition={dataset:'profitability',group:field.id,from,to,columns:['costMinor','earnedMinor','marginMinor'],measures:[measure.id,privateField.id]}
 const saveForm=async(cookie,name,dataset,columns,measures)=>{
  await login(cookie);await page.goto(h.origin+'/app/review?'+new URLSearchParams({from,to}))
  const form=page.locator('#custom-reports form').filter({has:page.locator('input[value="saved:save"]')})
  await form.getByLabel('Report name',{exact:true}).fill(name);await form.getByLabel('Dataset').selectOption(dataset);await form.getByLabel('Group by field').selectOption(field.id)
  for(const box of await form.locator(`input[name="column:${dataset}"]`).all())await box.setChecked(columns.includes(await box.getAttribute('value')))
  for(const box of await form.locator('input[name="measure"]').all())await box.setChecked(measures.includes(await box.getAttribute('value')))
  await form.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await page.getByRole('alert').count(),0,await page.locator('main').innerText());await page.waitForURL('**/app/review?saved=1')
  return (await state(cookie)).data.savedReports.find(r=>r.value.name===name)
 }
 const profit=await saveForm(finance.cookie,'Finance profit','profitability',definition.columns,definition.measures)
 const utilization=await saveForm(leadUser.cookie,'Lead utilization','utilization',['billableSeconds','availableSeconds','utilizationPercent'],[measure.id])
 const read=async(row,cookie=owner)=>{const response=await request('/api/gauge/saved/'+row.id,cookie);assert.equal(response.status,200,await response.clone().text());return response.json()}
 const path=(row,snapshot,format)=>`/api/gauge/saved/${row.id}.${format}?`+new URLSearchParams({revision:snapshot.definition.revision,fingerprint:snapshot.fingerprint})
 const profitSnapshot=await read(profit,finance.cookie),utilSnapshot=await read(utilization,leadUser.cookie)
 const usd=profitSnapshot.table.rows.find(r=>r[1]==='USD'),unknown=profitSnapshot.table.rows.find(r=>r[1]==='CAD')
 assert.deepEqual(usd,['=SUM(1,2)','USD',27000,45000,18000,5,20000],'Two USD projects: 3 hours × frozen rates; exact currency and custom sums')
 assert.deepEqual(unknown,['=SUM(1,2)','CAD',null,null,null,null,null],'Unpriced CAD sources remain unknown, never merged into USD')
 assert.deepEqual(utilSnapshot.table.rows,[['=SUM(1,2)','',10800,28800,37.5,5]],'Lead sees distinct-person capacity and permitted work only')
 assert(!JSON.stringify(utilSnapshot).includes('Private contract'));assert(!JSON.stringify(utilSnapshot).includes('costMinor'))
 for(const [row,snapshot,cookie]of [[profit,profitSnapshot,finance.cookie],[utilization,utilSnapshot,leadUser.cookie]]){
  await login(cookie);await page.goto(h.origin+`/app/review?savedReport=${row.id}`)
  const shown=page.locator('#saved-report');assert.equal(await shown.locator('tbody tr').count(),snapshot.table.rows.length)
  for(const r of snapshot.table.rows)for(const value of r)assert((await shown.innerText()).includes(String(value??'Unknown')))
  for(const formula of snapshot.table.formulas.filter(Boolean)){await shown.locator('details').evaluate(d=>d.open=true);assert((await shown.innerText()).includes(formula))}
  const csv=await request(path(row,snapshot,'csv'),cookie),xlsx=await request(path(row,snapshot,'xlsx'),cookie),pdf=await request(path(row,snapshot,'pdf'),cookie)
  for(const response of [csv,xlsx,pdf])assert.equal(response.status,200,await response.clone().text())
  const csvGrid=csvRows(Buffer.from(await csv.arrayBuffer())),xlsxGrid=workbookRows(Buffer.from(await xlsx.arrayBuffer())),pdfText=await pdfLines(new Uint8Array(await pdf.arrayBuffer()))
  const independentRows=row.value.dataset==='profitability'
   ? [["'=SUM(1,2)",'USD','27000','45000','18000','5','20000'],["'=SUM(1,2)",'CAD','Unknown','Unknown','Unknown','Unknown','Unknown']]
   : [["'=SUM(1,2)",'','10800','28800','37.5','5']]
  assert.deepEqual(csvGrid.slice(-independentRows.length),independentRows,'Downloaded rows reconcile to independently priced time, distinct capacity and custom values')
  assert.deepEqual(csvGrid[7],snapshot.table.headers,'Displayed selected columns match the native download')
  assert.deepEqual(csvGrid[6].slice(1),snapshot.table.formulas,'Displayed calculation explanations match the native download')
  assert.deepEqual(xlsxGrid,csvGrid,'Independent ZIP and XML decode equals native CSV decode')
  assert.equal(pdfText.join(''),csvGrid.map(r=>r.join(' | ')).join(''),'Actual PDF glyphs preserve each captured cell, formula and exact amount')
  assert(csvGrid.some(r=>r[0]==="'=SUM(1,2)"),'Formula-like cohort text is escaped in every format')
  assert(!Object.values(xlsxGrid).flat().some(c=>c==='=SUM(1,2)'))
  // Exercise the browser download door as well as the direct transport.
  const download=page.waitForEvent('download');await shown.getByRole('link',{name:'Download XLSX',exact:true}).click();assert.match((await download).suggestedFilename(),/\.xlsx$/)
  const shots=process.env.GAUGE_SAVED_REPORT_SHOTS
  if(shots){await mkdir(shots,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#custom-reports').screenshot({path:`${shots}/${row.value.dataset}-${width}.png`})}await page.setViewportSize({width:1440,height:1000})}
 }
 // Stale definition and source fingerprints refuse without modifying business records.
 await login(finance.cookie);await page.goto(h.origin+`/app/review?savedReport=${profit.id}`)
 const revise=page.locator('#custom-reports form').filter({has:page.locator('input[value="saved:save"]')})
 await revise.getByLabel('Report name',{exact:true}).fill('Revised profit');await revise.locator('input[value="costMinor"]').uncheck()
 await revise.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/app/review?saved=1')
 const revised=(await state(finance.cookie)).data.savedReports.find(r=>r.id===profit.id)
 assert.notEqual(revised.revision,profit.revision);assert.deepEqual(revised.value.columns,['earnedMinor','marginMinor'])
 await cmd('saved:save',{...definition,...profit,name:'Stale edit'},finance.cookie,409)
 for(const format of ['csv','xlsx','pdf'])assert.equal((await request(path(profit,profitSnapshot,format),finance.cookie)).status,409)
 const history=await(await request('/api/gauge/history/savedReports/'+profit.id,finance.cookie)).json();assert.equal(history.history[0].value.name,'Finance profit');assert.deepEqual(history.history[0].value.columns,definition.columns)
 const current=await read(revised,finance.cookie),project=(await state()).data.engagements.find(r=>r.id===projects[0].id)
 await cmd('field:values',{scope:'engagements',...project,customFields:{[measure.id]:'7'}})
 for(const format of ['csv','xlsx','pdf'])assert.equal((await request(path(revised,current,format),finance.cookie)).status,409)
 for(const format of ['csv','xlsx','pdf']){
  assert.equal((await request(path(profit,profitSnapshot,format))).status,401)
  assert.equal((await request(path(profit,profitSnapshot,format),leadUser.cookie)).status,403)
  assert.equal((await request(path(utilization,utilSnapshot,format),outsider.cookie)).status,403)
 }
 await cmd('saved:save',{name:'Private selection',dataset:'utilization',group:field.id,from,to,columns:['costMinor']},leadUser.cookie,403)
 await cmd('saved:save',{name:'Private field',dataset:'utilization',group:privateField.id,from,to},leadUser.cookie,403)
 await cmd('saved:save',{name:'Private measure',dataset:'utilization',group:field.id,from,to,measures:[privateField.id]},leadUser.cookie,403)
 const fieldRow=(await state()).data.customFields.find(r=>r.id===field.id)
 const privatePolicy=await cmd('field:define',{...fieldRow,...fieldRow.value,visibility:'finance-only',reason:'Narrow reporting policy'})
 assert.equal((await request('/api/gauge/saved/'+utilization.id,leadUser.cookie)).status,403)
 for(const format of ['csv','xlsx','pdf'])assert.equal((await request(path(utilization,utilSnapshot,format),leadUser.cookie)).status,403)
 await cmd('field:define',{...privatePolicy,...fieldRow.value,visibility:'lead-finance',reason:'Restore previously permitted reporting policy'})
 await read(utilization,leadUser.cookie)
 const narrowed=(await state()).data.engagements.find(r=>r.id===projects[0].id)
 await cmd('save:engagements',{...narrowed,...narrowed.value,leadId:other.id,members:[]})
 assert.equal((await request('/api/gauge/saved/'+utilization.id,leadUser.cookie)).status,403)
 for(const format of ['csv','xlsx','pdf'])assert.equal((await request(path(utilization,utilSnapshot,format),leadUser.cookie)).status,403)
 await cmd('grant',{operatorId:finance.id,personId:other.id,role:'finance',enabled:false})
 for(const format of ['csv','xlsx','pdf'])assert.equal((await request(path(profit,profitSnapshot,format),finance.cookie)).status,403)
 console.log('PASS REPORT-004 saved finance and lead forms, exact CSV XLSX PDF rows and formulas, revision history, stale sources, private fields, narrowed projects and revocation')
} finally {await browser?.close();await h.dispose()}
