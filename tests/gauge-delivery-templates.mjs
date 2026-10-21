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
  console.log('PASS DELIVERY-003: versioned client-onboarding template with dependencies, owners, effort and priced milestone applied to two start dates on the agency calendar; later version leaves started projects unchanged; scoped authority')
 }finally{await context.close()}
}
