import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'

// Extend the existing role journey through the built Worker, never a domain stub.
export async function clientRoleJourney(h,browser){
 const {cmd,state,request,owner}=h
 const person=await cmd('save:people',{name:'synthetic-gauge-93001',timezone:'UTC'})
 const sponsor=await h.invite('synthetic-gauge-93002'),collaborator=await h.invite('synthetic-gauge-93003'),finance=await h.invite('synthetic-gauge-93004')
 await cmd('grant',{operatorId:finance.id,personId:person.id,role:'finance',enabled:true})
 const client=await cmd('save:clients',{name:'synthetic-gauge-93005'})
 const project=await cmd('save:engagements',{name:'synthetic-gauge-93006',clientId:client.id,leadId:person.id,members:[],scope:'Deliver the reviewed identity assets',timezone:'UTC'})
 const other=await cmd('save:engagements',{name:'synthetic-gauge-93007',clientId:client.id,leadId:person.id,members:[],scope:'Unrelated private project',timezone:'UTC'})
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Reviewed design assets',remainingSeconds:3600})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'fixed',amountMinor:628400,effortSeconds:3600,roundingSeconds:60,reason:'Reviewed private commercial budget'}))
 const terms={name:'Private allowance',frequency:'monthly',unit:'hours',allowance:14400,services:['Design'],consumes:'billable',proration:'calendar',start:'2026-10-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:7200,carryPeriods:1,deficit:false,overage:'bill',overageRate:12000}}
 const preview=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms,from:'2026-10-01',to:'2026-10-31'});await cmd('retainer:approve',{...preview.input,fingerprint:preview.fingerprint,reason:'Reviewed allowance'})
 const providerBefore=h.providerRequests.length
 const invite={engagementId:project.id,days:7,reason:'Explicit client role'}
 const role=await cmd('client:invite-project',{...invite,contact:'synthetic-gauge-93002@example.test',clientRole:'sponsor',reviewEnabled:'yes'})
 const collab=await cmd('client:invite-project',{...invite,contact:'synthetic-gauge-93003@example.test',clientRole:'collaborator',reviewEnabled:'no'})
 const path=`/api/gauge/client-projects/${project.id}`,read=async cookie=>{const r=await request(path,cookie);assert.equal(r.status,200,await r.clone().text());return r.json()}
 assert.deepEqual((await read(sponsor.cookie)).budgets,[])
 const shared=await cmd('client:share-money',{...role,shareBudget:'yes',shareBurn:'yes',shareRemaining:'yes',shareValue:'yes',shareFields:'yes',reason:'Sponsor may inspect the reviewed budget'},finance.cookie)
 assert.deepEqual((await read(sponsor.cookie)).budgets.map(b=>b.amountMinor),[628400])
 assert.equal((await read(sponsor.cookie)).statements.length,1)
 const delivery=await read(collaborator.cookie)
 assert.equal(delivery.clientRole,'collaborator');assert.equal(delivery.scope,'Deliver the reviewed identity assets')
 assert.deepEqual(delivery.tasks.map(t=>t.id),[task.id]);assert.deepEqual(delivery.budgets,[]);assert.deepEqual(delivery.statements,[]);assert.equal(delivery.burn,null);assert.equal(delivery.reviewEnabled,false)
 for(const cookie of [sponsor.cookie,collaborator.cookie]){
  for(const door of ['/api/gauge/state','/api/gauge/report.csv','/app/billing','/app/rates','/api/gauge/receivables.csv',`/api/gauge/history/engagements/${project.id}`,`/api/gauge/client-projects/${other.id}`,`/api/gauge/packets/${randomUUID()}`,`/api/gauge/invoice-documents/${randomUUID()}`])assert.equal((await request(door,cookie)).status,403,door)
  await cmd('invoice:issue',{},cookie,403);await cmd('grant',{operatorId:collaborator.id,personId:person.id,role:'finance',enabled:true},cookie,403)
 }
 await cmd('client:share-money',{...collab,shareBudget:'yes',shareBurn:'yes',shareRemaining:'yes',shareValue:'yes',shareFields:'yes',reason:'Cannot widen collaborator'},finance.cookie,403)
 await cmd('client:configure-role',{...collab,clientRole:'collaborator',reviewEnabled:'yes',reason:'Cannot add approvals'},owner,403)
 await cmd('client:configure-role',{...collab,clientRole:'finance',reviewEnabled:'no',reason:'Cannot manufacture a finance role'},owner,400)
 for(const cookie of [finance.cookie,sponsor.cookie,collaborator.cookie])await cmd('client:configure-role',{...collab,clientRole:'sponsor',reason:'Only owner assigns roles'},cookie,403)
 const milestone=await cmd('save:milestones',{engagementId:project.id,name:'Exact reviewed delivery',due:'2000-01-01',amountMinor:628400})
 const current=async()=> (await state()).data.milestones.find(m=>m.id===milestone.id)
 await cmd('milestone:deliver',{...milestone,date:'2000-01-01',reason:'Completed agreed assets'})
 const release=async contact=>{const r=await cmd('milestone:release-review',{...await current(),contact,days:7,description:'Review these delivered assets',reason:'Release exact work'}),m=await current();return {path:`/api/gauge/client-milestones/${m.id}/${m.value.delivery.clientReviews.at(-1).id}`,token:r.token}}
 const sponsorReview=await release('synthetic-gauge-93002@example.test'),collabReview=await release('synthetic-gauge-93003@example.test')
 const reviewRead=(r,cookie)=>request(r.path,cookie,{headers:{'x-gauge-review-token':r.token}})
 assert.equal((await reviewRead(sponsorReview,sponsor.cookie)).status,200)
 assert.equal((await reviewRead(collabReview,collaborator.cookie)).status,403,'A separate release cannot override delivery-only role')
 const narrowed=await cmd('client:configure-role',{...shared,clientRole:'sponsor',reviewEnabled:'no',reason:'Withdraw sponsor decision rights'})
 assert.equal((await read(sponsor.cookie)).reviewEnabled,false)
 assert.equal((await reviewRead(sponsorReview,sponsor.cookie)).status,403,'Narrowing applies on the next request')
 await cmd('client:configure-role',{...shared,clientRole:'sponsor',reviewEnabled:'yes',reason:'Stale grant'},owner,409)
 const restored=await cmd('client:configure-role',{...narrowed,clientRole:'sponsor',reviewEnabled:'yes',reason:'Owner permits exact released delivery decisions'})
 const review=await(await reviewRead(sponsorReview,sponsor.cookie)).json()
 const responseInput={key:randomUUID(),revision:review.revision,outcome:'accepted',reason:'The exact assets meet the agreed delivery'}
 const respond=()=>request(sponsorReview.path,sponsor.cookie,{method:'POST',headers:{origin:h.origin,'content-type':'application/json','x-gauge-review-token':sponsorReview.token},body:JSON.stringify(responseInput)})
 assert.equal((await respond()).status,200)
 assert.equal((await current()).value.delivery.decisions.at(-1).reason,responseInput.reason)
 assert.equal((await current()).value.delivery.decisions.at(-1).recordedBy,sponsor.id)
 assert.equal((await state()).data.invoices.filter(r=>r.value.engagementId===project.id).length,0);assert.equal((await state()).data.packets.filter(r=>r.value.engagementId===project.id).length,0)
 // A separately released invoice must also respect the delivery-only ceiling.
 await cmd('milestone:approve',await current())
 await cmd('milestone:authorize',await current())
 const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Explicit finance billing',sources:[`milestones:${milestone.id}`]}))
 const issueDate=(await current()).value.delivery.decisions.at(-1).date,dueDate=new Date(Date.parse(issueDate+'T00:00:00Z')+30*86400000).toISOString().slice(0,10)
 const invoice=await cmd('invoice:issue',{...packet,issueDate,dueDate,billTo:'Reviewed client',remitTo:'Agency',reference:'synthetic-gauge-93008'})
 const sponsorInvoice=await cmd('invoice:release',{...invoice,contact:'synthetic-gauge-93002@example.test',days:7,reason:'Explicit sponsor document access'})
 const collabInvoice=await cmd('invoice:release',{...invoice,contact:'synthetic-gauge-93003@example.test',days:7,reason:'Independent release cannot widen collaborator'})
 assert.equal((await request(`/app/client-invoices/${sponsorInvoice.id}`,sponsor.cookie)).status,200)
 const pdf=await request(`/app/client-invoices/${sponsorInvoice.id}?format=pdf`,sponsor.cookie);assert.equal(pdf.status,200);assert.equal((await pdf.text()).slice(0,4),'%PDF')
 assert.equal((await request(`/app/client-invoices/${collabInvoice.id}?format=pdf`,collaborator.cookie)).status,403,'Retained PDF also enforces the collaborator ceiling')
 assert.equal((await request(`/app/client-invoices/${collabInvoice.id}`,collaborator.cookie)).status,403,'An independently released financial download cannot bypass the collaborator ceiling')
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 try{
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000})
   for(const [name,cookie] of [['sponsor',sponsor.cookie],['collaborator',collaborator.cookie],['owner',owner]]){
    await login(cookie);await page.goto(h.origin+(name==='owner'?`/app/engagements?edit=${project.id}`:`/app/client-projects/${project.id}`))
    if(width===1440){const text=await page.locator('main').innerText();if(name==='sponsor')assert.match(text,/Shared budget/);if(name==='collaborator'){assert.match(text,/Reviewed design assets/);assert(!/Shared budget|Retainer statements|6284/.test(text))}if(name==='owner')assert.equal(await page.locator('form').filter({has:page.locator('[name=action][value="client:configure-role"]')}).count(),2)}
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`)
    if(process.env.GAUGE_ROLE_SHOTS){await mkdir(process.env.GAUGE_ROLE_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_ROLE_SHOTS}/client-role-${name}-${width}.png`,fullPage:true})}
   }
  }
  await page.setViewportSize({width:1440,height:1000});await login(owner);await page.goto(`${h.origin}/app/engagements?edit=${project.id}`)
  const form=page.locator('form').filter({has:page.locator(`[name=id][value="${restored.id}"]`)}).filter({has:page.locator('[name=action][value="client:configure-role"]')})
  await form.locator('[name=clientRole]').selectOption('collaborator');await form.locator('[name=reviewEnabled]').selectOption('no');await form.locator('[name=reason]').fill('Owner narrows sponsor to delivery only');await form.getByRole('button',{name:'Save client role'}).click()
 }finally{await context.close()}
 const downgraded=await read(sponsor.cookie);assert.equal(downgraded.clientRole,'collaborator');assert.deepEqual(downgraded.budgets,[]);assert.deepEqual(downgraded.statements,[])
 assert.equal((await respond()).status,403,'Previously successful decision replay is refused after role narrowing')
 assert.equal((await request(`/app/client-invoices/${sponsorInvoice.id}`,sponsor.cookie)).status,403,'Role downgrade also withdraws an existing invoice release')
 const receipt=await h.db.prepare('SELECT id,revision FROM g_client_portal_authority WHERE id=?').bind(restored.id).first()
 await cmd('client:revoke-project',{...receipt,reason:'End project access'})
 assert.equal((await request(path,sponsor.cookie)).status,403);assert.equal((await reviewRead(sponsorReview,sponsor.cookie)).status,403,'Revocation cannot revive an older independent review')
 assert.equal(h.providerRequests.length,providerBefore,'Client role, sharing and revocation commands send no notification')
 const audit=await h.db.prepare("SELECT data FROM g_audit WHERE action='client:configure-role' AND record_id=?").bind(project.id).all()
 assert.equal(audit.results.length,3);assert(audit.results.some(r=>JSON.parse(r.data).reason==='Owner narrows sponsor to delivery only'))
 console.log('PASS clientRoleJourney: sponsor shared budget and exact delivery decision; collaborator delivery-only projection, direct billing and download refusals; owner role ceilings, native form, narrowing, stale grant and replay revocation; screens 1440 and 390')
}
