import { recordMilestoneAcceptance } from './gauge-harness.mjs'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// DELIVERY-003: a versioned client-onboarding template starts two projects on
// different dates; a later version never changes the projects already started.
export async function deliveryTemplatesJourney(h,browser,{lead,worker,manager,staff,outsider}) {
 const {cmd,state,request}=h,zone='America/New_York'
 await cmd('agency:calendar',{weekdays:[1,2,3,4,5],holidays:['2026-11-26','2026-11-27'],reason:'Agency Thanksgiving closure',previousId:(await state()).data.agencyCalendars.at(-1)?.id??null})
 const clients=[await cmd('save:clients',{name:'Northwind Retail'}),await cmd('save:clients',{name:'Harbor Clinics'}),await cmd('save:clients',{name:'Summit Labs'})]
 const [first,second,third]=await Promise.all(clients.map((client,n)=>cmd('save:engagements',{name:`Onboarding ${n+1}`,clientId:client.id,leadId:lead.id,members:[worker.id],scope:'New client onboarding',timezone:zone})))
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 const capture=async(name,target)=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);if(!process.env.GAUGE_DELIVERY_SHOTS)continue;await mkdir(process.env.GAUGE_DELIVERY_SHOTS,{recursive:true});await target.scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/${name}-viewport-${width}.png`})}}
 try{
  // Owner/finance saves version 1 through the page.
  const workerName=(await state()).data.people.find(p=>p.id===worker.id).value.name
  await login(h.owner);await page.goto(h.origin+'/app/engagements')
  const editor=page.locator('#delivery-templates section.g-card').filter({has:page.getByRole('heading',{name:'New delivery template',exact:true})})
  await editor.getByLabel('Template name').fill('New client onboarding');await editor.getByLabel('Template purpose').selectOption('client-onboarding')
  await editor.getByLabel('Template items').fill(['discovery | phase | Discovery | 0 | 3','intake | task | Intake workshop | 0 | 1 | | lead | 2',`design | task | Design draft | 0 | 2 | intake | ${workerName} | 6`,'signoff | milestone | Onboarding sign-off | 0 | 1 | design | | | 1500.00'].join('\n'))
  await editor.getByLabel('Version reason').fill('Standard onboarding plan');await capture('template-editor',editor);await Promise.all([page.waitForURL(/saved=1/),editor.getByRole('button',{name:'Save template'}).click()])
  let data=(await state()).data;const v1=data.deliveryTemplates.find(t=>t.value.name==='New client onboarding')
  assert.equal(v1.value.number,1);assert.equal(v1.value.purpose,'client-onboarding');assert.equal(v1.value.items.find(x=>x.key==='design').owner,worker.id);assert.equal(v1.value.items.find(x=>x.key==='signoff').amountMinor,150000)
  await cmd('template:save',{name:'Lead template',items:v1.value.items,reason:'Leads do not maintain agency templates'},manager.cookie,403)
  await cmd('template:save',{name:'Cyclic template',items:[{key:'a',kind:'task',name:'A',durationDays:1,predecessors:['b']},{key:'b',kind:'task',name:'B',durationDays:1,predecessors:['a']}],reason:'Cycle'},h.owner,400)
  // A lead applies version 1 on the page; Thanksgiving closure pushes the sign-off.
  await login(manager.cookie);await page.goto(h.origin+`/app/engagements?edit=${first.id}`)
  const apply=page.locator('form').filter({has:page.locator('[name=action][value="template:apply"]')})
  await apply.getByLabel('Template version').selectOption(v1.id);await apply.getByLabel('Project start').fill('2026-11-23');await apply.getByLabel('Application reason').fill('Kick off Northwind');await capture('template-apply',apply)
  await Promise.all([page.waitForURL(/saved=1/),apply.getByRole('button',{name:'Apply template'}).click()])
  await cmd('template:apply',{templateId:v1.id,engagementId:second.id,start:'2027-01-02',reason:'Kick off Harbor after New Year'},manager.cookie)
  data=(await state()).data
  const planOf=id=>data.deliveryPlans.find(p=>p.value.engagementId===id),items=id=>({tasks:data.tasks.filter(t=>t.value.engagementId===id).sort((x,y)=>x.value.name.localeCompare(y.value.name)),milestones:data.milestones.filter(m=>m.value.engagementId===id),plan:planOf(id)})
  const a=items(first.id),b=items(second.id),task=(set,name)=>set.tasks.find(t=>t.value.name===name).value
  assert.deepEqual([task(a,'Intake workshop').from,task(a,'Intake workshop').to,task(a,'Design draft').from,task(a,'Design draft').to,a.milestones[0].value.due],['2026-11-23','2026-11-23','2026-11-24','2026-11-25','2026-11-30'])
  assert.deepEqual([task(b,'Intake workshop').from,task(b,'Design draft').from,task(b,'Design draft').to,b.milestones[0].value.due],['2027-01-04','2027-01-05','2027-01-06','2027-01-07'],'A weekend start moves to the next working day')
  assert.equal(task(a,'Intake workshop').assigneeId,lead.id);assert.equal(task(a,'Design draft').assigneeId,worker.id);assert.equal(task(a,'Design draft').remainingSeconds,21600)
  assert.equal(a.milestones[0].value.amountMinor,150000);assert.equal(a.milestones[0].value.status,'draft');assert.equal(a.milestones[0].value.currency,'USD')
  assert.deepEqual(a.plan.value.template,{id:v1.id,rootId:v1.value.rootId,number:1,name:'New client onboarding',start:'2026-11-23'});assert.equal(a.plan.value.schedule.nodes.find(n=>n.id==='discovery').end,'2026-11-25')
  await page.goto(h.origin+`/app/engagements?edit=${first.id}`);assert((await page.locator('#template-origin').innerText()).includes('New client onboarding · version 1'));await capture('template-applied',page.locator('#template-origin'))
  // Version 2 changes effort, adds review and reprices sign-off; started projects keep their plans.
  const before=JSON.stringify([items(first.id),items(second.id)])
  const v2items=[...v1.value.items.map(x=>x.key==='design'?{...x,effortSeconds:36000}:x.key==='signoff'?{...x,amountMinor:180000,predecessors:['review']}:x),{key:'review',kind:'task',name:'Client review',offsetDays:0,durationDays:1,predecessors:['design'],owner:'lead',effortSeconds:3600,amountMinor:null}]
  const v2=await cmd('template:save',{previousId:v1.id,items:v2items,reason:'Add client review'})
  await cmd('template:save',{previousId:v1.id,items:v2items,reason:'Stale revision'},h.owner,409)
  data=(await state()).data;assert.equal(JSON.stringify([items(first.id),items(second.id)]),before,'Earlier projects keep their original plans');assert.equal(data.deliveryTemplates.find(t=>t.id===v1.id).revision,v1.revision,'Version 1 is immutable')
  await cmd('template:apply',{templateId:v2.id,engagementId:third.id,start:'2026-11-23',reason:'Kick off Summit'},manager.cookie)
  data=(await state()).data;const c=items(third.id)
  assert.equal(task(c,'Client review').from,'2026-11-30');assert.equal(c.milestones[0].value.due,'2026-12-01');assert.equal(c.milestones[0].value.amountMinor,180000);assert.equal(c.plan.value.template.number,2)
  await cmd('template:apply',{templateId:v2.id,engagementId:first.id,start:'2026-12-07',reason:'Running projects are not replanned'},manager.cookie,409)
  // Template milestones bill through the ordinary commercial gates: approved terms, then the milestone.
  const fee=await cmd('save:budgets',{engagementId:first.id,mode:'fixed',amountMinor:150000,effortSeconds:28800,roundingSeconds:60,reason:'Approved onboarding fee'});await cmd('budget:approve',fee)
  const milestone=(await state()).data.milestones.find(m=>m.id===a.milestones[0].id);await cmd('milestone:approve',{id:milestone.id,revision:milestone.revision})
  await recordMilestoneAcceptance(h,milestone.id)
  const packet=await cmd('packet:create',{engagementId:first.id,title:'Onboarding sign-off',sources:[`milestones:${milestone.id}`]});assert.equal((await state()).data.packets.find(p=>p.id===packet.id).value.totalMinor,150000)
  // Scope: staff and other leads cannot see or apply agency templates.
  assert.equal((await state(staff.cookie)).data.deliveryTemplates.length,0)
  await cmd('template:apply',{templateId:v2.id,engagementId:third.id,start:'2026-11-23',reason:'Staff cannot plan'},staff.cookie,403)
  const fresh=await cmd('save:engagements',{name:'Outsider target',clientId:clients[0].id,leadId:lead.id,members:[],scope:'Not theirs',timezone:zone})
  await cmd('template:apply',{templateId:v2.id,engagementId:fresh.id,start:'2026-11-23',reason:'Not my engagement'},outsider.cookie,403)
  assert.equal((await request(`/api/gauge/history/deliveryTemplates/${v1.id}`,staff.cookie)).status,403)
  await clientIntakeJourney(h,browser,{lead,worker,manager,staff,outsider})
  console.log('PASS DELIVERY-003: versioned client-onboarding template with dependencies, owners, effort and priced milestone applied to two start dates on the agency calendar; later version leaves started projects unchanged; scoped authority')
 }finally{await context.close()}
}

// DELIVERY-006: requested inputs remain due through submission and rejection;
// only explicit acceptance closes the reminders. The production portal owns uploads.
export async function clientIntakeJourney(h,browser,{lead,worker,manager,staff,outsider}){
 const {cmd,state,request}=h,zone='America/New_York'
 const client=await cmd('save:clients',{name:'Intake client'}),otherClient=await cmd('save:clients',{name:'Other intake client'})
 const project=await cmd('save:engagements',{name:'Brand onboarding',clientId:client.id,leadId:lead.id,members:[worker.id],scope:'Brand assets and creative direction',timezone:zone})
 const other=await cmd('save:engagements',{name:'Private onboarding',clientId:otherClient.id,leadId:lead.id,members:[],scope:'Private',timezone:zone})
 const recipient=await h.invite('intake-recipient'),stranger=await h.invite('intake-stranger')
 const grant=await cmd('client:invite-project',{engagementId:project.id,contact:'intake-recipient@example.test',days:7,reason:'Brand sponsor access'})
 await cmd('client:invite-project',{engagementId:other.id,contact:'intake-stranger@example.test',days:7,reason:'Separate client'})
 const shots=process.env.GAUGE_INTAKE_SHOTS??process.env.GAUGE_DELIVERY_SHOTS
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 const capture=async name=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);if(shots){await mkdir(shots,{recursive:true});await page.screenshot({path:`${shots}/${name}-${width}.png`,fullPage:true})}}}
 const current=async id=>(await state()).data.intakeRequests.find(r=>r.id===id)
 const article=id=>page.locator(`[data-intake-id="${id}"]`)
 const portal=`/app/client-projects/${project.id}`
 let submitted
 try{
  await page.setViewportSize({width:1440,height:1000});await login(manager.cookie);await page.goto(h.origin+`/app/engagements?edit=${project.id}`)
  await page.locator('#client-intake').getByText('Request client inputs',{exact:true}).click()
  const editor=page.locator('form').filter({has:page.locator('[name=action][value="intake:request"]')})
  await editor.getByLabel('Intake title',{exact:true}).fill('Brand assets')
  await editor.getByLabel('Required questions, one per line').fill('Brand direction\nUsage permission')
  await editor.getByLabel('Requested file',{exact:true}).fill('Logo package')
  await editor.getByLabel('Due date',{exact:true}).fill('2026-11-10');await editor.getByLabel('First in-app reminder').fill('2026-11-09');await editor.getByLabel('Reminder interval in days').fill('2');await editor.getByText('Related product requests',{exact:true}).click();await editor.getByLabel('Chest shared-file link').fill('https://chest.example.test/files/brand');await editor.getByLabel('Blotter practice-request link').fill('https://blotter.example.test/requests/brand')
  await capture('intake-request');await Promise.all([page.waitForURL(/saved=1/),editor.getByRole('button',{name:'Request inputs'}).click()])
  const row=(await state()).data.intakeRequests.find(r=>r.value.engagementId===project.id)
  assert.deepEqual([row.value.title,row.value.questions,row.value.fileLabel,row.value.due,row.value.reminderOn,row.value.everyDays,row.value.status],['Brand assets',['Brand direction','Usage permission'],'Logo package','2026-11-10','2026-11-09',2,'requested'])
  for(const cookie of [staff.cookie,outsider.cookie])await cmd('intake:request',{engagementId:project.id,title:'No access',questions:['Why'],fileLabel:'File',due:'2026-11-10'},cookie,403)
  assert(!(await state(outsider.cookie)).data.intakeRequests.some(r=>r.id===row.id))
  assert(!(await state(staff.cookie)).data.intakeRequests.some(r=>r.id===row.id))
  const providers=h.providerRequests.length
  await login(recipient.cookie);await page.goto(h.origin+portal);assert((await article(row.id).innerText()).includes('Next in-app reminder 2026-11-09'))
  assert.equal(await article(row.id).getByRole('link',{name:'Open shared files in Chest'}).count(),1);assert.equal(await article(row.id).getByRole('link',{name:'Open shared files in Chest'}).getAttribute('href'),'https://chest.example.test/files/brand');assert.equal(await article(row.id).getByRole('link',{name:'Open practice request in Blotter'}).count(),1);assert.equal(await article(row.id).getByRole('link',{name:'Open practice request in Blotter'}).getAttribute('href'),'https://blotter.example.test/requests/brand')
  const upload=()=>article(row.id).locator('form')
  await upload().getByLabel('Brand direction',{exact:true}).fill('Use the blue wordmark')
  await upload().getByLabel('Logo package',{exact:true}).setInputFiles({name:'brand.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic-gauge-1 brand bytes')})
  await capture('intake-client-submit');await Promise.all([page.waitForURL(/client-projects/),upload().getByRole('button',{name:'Submit inputs'}).click()])
  submitted=await current(row.id);assert.equal(submitted.value.status,'submitted');assert.deepEqual(submitted.value.submissions[0].answers,['Use the blue wordmark',''])
  const file=submitted.value.submissions[0].file;assert.equal(file.name,'brand.txt');assert.equal(file.size,29)
  const bytes=await request(`/api/gauge/intake-files/${file.id}`,recipient.cookie);assert.equal(bytes.status,200);assert.equal(await bytes.text(),'synthetic-gauge-1 brand bytes');assert.match(bytes.headers.get('content-disposition'),/^attachment/)
  for(const cookie of [stranger.cookie,staff.cookie,outsider.cookie])assert.equal((await request(`/api/gauge/intake-files/${file.id}`,cookie)).status,403)
  assert.equal((await request(portal,stranger.cookie)).status,403)
  await cmd('intake:review',{...submitted,outcome:'accepted',reason:'Incomplete cannot pass'},manager.cookie,409)
  for(const cookie of [staff.cookie,outsider.cookie])await cmd('intake:review',{...submitted,outcome:'rejected',reason:'Not their review'},cookie,403)
  let rejected=await cmd('intake:review',{...submitted,outcome:'rejected',reason:'Usage permission is missing'},manager.cookie)
  assert.equal((await current(row.id)).value.decisions[0].reason,'Usage permission is missing')
  await page.goto(h.origin+portal);assert((await article(row.id).innerText()).includes('Next in-app reminder 2026-11-09'));assert((await article(row.id).innerText()).includes('rejected: Usage permission is missing'));await capture('intake-rejected')
  const reminded=await cmd('intake:remind',{...rejected,on:'2026-11-09',reason:'Please complete usage permission'},manager.cookie)
  assert.equal((await current(row.id)).value.reminderOn,'2026-11-11');assert.equal((await current(row.id)).value.reminders.length,1)
  let escalated=await cmd('intake:escalate',{...reminded,reason:'Sponsor clarification needed'},manager.cookie)
  assert.equal((await current(row.id)).value.escalations[0].ownerId,lead.id)
  const reopened=await page.goto(h.origin+portal);assert.equal(reopened.status(),200,await page.locator('body').innerText());assert.equal(await upload().count(),1,JSON.stringify((await current(row.id)).value));await upload().getByLabel('Brand direction',{exact:true}).fill('Use the blue wordmark');await upload().getByLabel('Usage permission',{exact:true}).fill('Approved for this project');await upload().getByLabel('Logo package',{exact:true}).setInputFiles({name:'complete.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic-gauge-2 complete assets')})
  const replay={key:await upload().locator('[name=key]').inputValue(),revision:await upload().locator('[name=revision]').inputValue()}
  const replayForm=()=>{const f=new FormData();f.set('key',replay.key);f.set('revision',replay.revision);f.set('answer0','Use the blue wordmark');f.set('answer1','Approved for this project');f.set('file',new File(['synthetic-gauge-2 complete assets'],'complete.txt',{type:'text/plain'}));return f}
  const post=async(cookie,form=replayForm(),origin=h.origin)=>request(`/app/client-intake/${project.id}/${row.id}`,cookie,{method:'POST',headers:{origin},body:form})
  assert.equal((await post(recipient.cookie,replayForm(),'https://other.example.test')).status,403)
  assert.equal((await post(stranger.cookie)).status,403)
  await h.db.exec("CREATE TRIGGER intake_authority_race AFTER INSERT ON g_intake_files BEGIN DELETE FROM g_client_portal_authority; END")
  try{assert.equal((await post(recipient.cookie)).status,409,'Authority changing in the committing batch rolls back the upload');assert.equal((await current(row.id)).value.submissions.length,1);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM g_intake_files WHERE request_id=?').bind(row.id).first()).n,1)}finally{await h.db.exec('DROP TRIGGER intake_authority_race')}
  await Promise.all([page.waitForURL(/client-projects/),upload().getByRole('button',{name:'Submit inputs'}).click()])
  assert.equal((await post(recipient.cookie)).status,303,'Exact upload replay is once only')
  const changed=replayForm();changed.set('answer0','Changed');assert.equal((await post(recipient.cookie,changed)).status,409)
  const complete=await current(row.id);assert.equal(complete.value.submissions.length,2);assert.equal(complete.value.status,'submitted')
  await login(manager.cookie);await page.goto(h.origin+`/app/engagements?edit=${project.id}`)
  const review=article(row.id).locator('form').filter({has:page.locator('[name=action][value="intake:review"]')})
  await review.getByLabel('Review decision').selectOption('accepted');await review.getByLabel('Review reason').fill('Complete brand package approved');await capture('intake-lead-review')
  await Promise.all([page.waitForURL(/saved=1/),review.getByRole('button',{name:'Save review'}).click()])
  const accepted=await current(row.id);assert.equal(accepted.value.status,'accepted');assert.deepEqual(accepted.value.decisions.map(d=>[d.outcome,d.reason]),[['rejected','Usage permission is missing'],['accepted','Complete brand package approved']]);assert.deepEqual(accepted.value.submissions[0],submitted.value.submissions[0])
  await cmd('intake:remind',{...accepted,on:'2026-11-11',reason:'Must stop'},manager.cookie,409)
  await cmd('intake:escalate',{...accepted,reason:'Closed request'},manager.cookie,409)
  await login(recipient.cookie);await page.goto(h.origin+portal);assert((await article(row.id).innerText()).includes('Accepted · No outstanding reminders.'));assert.equal(await article(row.id).getByRole('button',{name:'Submit inputs'}).count(),0);await capture('intake-accepted')
  assert.equal(h.providerRequests.length,providers,'Intake sends nothing')
  // Onboarding templates carry the complete form and apply relative due dates.
  await login(h.owner);await page.goto(h.origin+'/app/engagements');const templateEditor=page.locator('#delivery-templates section.g-card').filter({has:page.getByRole('heading',{name:'New delivery template',exact:true})});await templateEditor.getByText('Client intake form',{exact:true}).click();await templateEditor.getByLabel('Intake title',{exact:true}).fill('Template brand assets');await templateEditor.getByLabel('Required questions, one per line').fill('Brand direction');await templateEditor.getByLabel('Requested file',{exact:true}).fill('Logo package');await templateEditor.getByLabel('Intake due after business days').fill('1');await templateEditor.getByLabel('Reminder interval in days').fill('3');await capture('intake-template-editor')
  const template=await cmd('template:save',{name:'Intake onboarding',purpose:'client-onboarding',items:[{key:'start',kind:'task',name:'Kickoff',durationDays:1,owner:'lead'}],intakeForms:[{title:'Template brand assets',questions:['Brand direction'],fileLabel:'Logo package',everyDays:3,offsetDays:1}],reason:'Reusable intake'})
  await cmd('template:apply',{templateId:template.id,engagementId:other.id,start:'2026-11-02',reason:'New engagement onboarding'},manager.cookie)
  const fromTemplate=(await state()).data.intakeRequests.filter(r=>r.value.engagementId===other.id)
  assert.equal(fromTemplate.length,1);assert.deepEqual([fromTemplate[0].value.title,fromTemplate[0].value.due,fromTemplate[0].value.questions,fromTemplate[0].value.everyDays,fromTemplate[0].value.status,fromTemplate[0].value.templateId],['Template brand assets','2026-11-03',['Brand direction'],3,'requested',template.id])
  const templateBefore=await current(fromTemplate[0].id);await cmd('template:save',{previousId:template.id,items:[{key:'start',kind:'task',name:'Kickoff',durationDays:1,owner:'lead'}],intakeForms:[{title:'Changed future intake',questions:['New question'],fileLabel:'New file',everyDays:1,offsetDays:2}],reason:'Future projects only'});assert.deepEqual(await current(fromTemplate[0].id),templateBefore,'Template evolution never rewrites an existing request')
  await cmd('client:revoke-project',{...grant,reason:'Sponsor revoked'})
  assert.equal((await request(`/api/gauge/intake-files/${file.id}`,recipient.cookie)).status,403);assert.equal((await post(recipient.cookie)).status,403,'Revoked authority also refuses successful replay')
  const audit=await h.db.prepare("SELECT action,actor,request_key,revision FROM g_audit WHERE kind='intakeRequests' AND record_id=?").bind(row.id).all();for(const action of ['intake:request','intake:submit','intake:review','intake:remind','intake:escalate'])assert(audit.results.some(r=>r.action===action&&r.actor&&r.request_key&&r.revision),`Audited ${action}`)
  console.log('PASS DELIVERY-006: lead requests dated form and file; scoped client uploads; incomplete rejection; continuing reminders and escalation; explicit acceptance stops reminders; onboarding template creates requested intake; private file and revoked replay refusals')
 }finally{await context.close()}
}
