import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

// DELIVERY-005: every acceptance point through native forms and HTTP, at both widths.
export async function milestoneDeliveryJourney(h,browser,{lead,worker,manager,staff,outsider}) {
 const {cmd,state,request}=h
 const financePerson=await h.invite('delivery-finance')
 await cmd('grant',{operatorId:financePerson.id,personId:lead.id,role:'finance',enabled:true})
 const agent=await h.invite('delivery-agent')
 for(const width of [1440,390]) {
  const client=await cmd('save:clients',{name:`Acceptance client ${width}`})
  const engagement=await cmd('save:engagements',{name:`Delivery acceptance ${width}`,clientId:client.id,leadId:lead.id,members:[worker.id],scope:'Deliver complete design and client assets',timezone:'America/New_York'})
  await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'billing',engagementIds:[engagement.id]})
  const budget=await cmd('save:budgets',{engagementId:engagement.id,mode:'fixed',amountMinor:10000,effortSeconds:3600,roundingSeconds:60,reason:'Agreed design'});await cmd('budget:approve',budget)
  const milestone=await cmd('save:milestones',{engagementId:engagement.id,name:'Design handover',due:'2026-10-21',amountMinor:10000})
  const current=async()=>(await state()).data.milestones.find(r=>r.id===milestone.id)
  const packets=async()=>(await state()).data.packets.filter(r=>r.value.engagementId===engagement.id)
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
  try{
   await context.addCookies(manager.cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
   const page=await context.newPage(),url=h.origin+`/app/engagements?edit=${engagement.id}`
   const open=async()=>{await page.goto(url);await page.locator('#milestone-delivery').getByText('Update delivery',{exact:true}).click()}
   const form=action=>page.locator('#milestone-delivery form').filter({has:page.locator(`[name=action][value="${action}"]`)})
   const save=async(action,fields,button)=>{await open();const f=form(action).last();for(const [label,value]of Object.entries(fields)){const field=f.getByLabel(label,{exact:true});if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption(value);else await field.fill(value)}await f.getByRole('button',{name:button,exact:true}).click();assert.equal(new URL(page.url()).pathname,'/app/engagements')}
   const capture=async name=>{await page.goto(url);await page.locator('#milestone-delivery').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`DELIVERY-005 fits ${width}`);if(process.env.GAUGE_DELIVERY_SHOTS){await mkdir(process.env.GAUGE_DELIVERY_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/milestone-${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/milestone-${name}-viewport-${width}.png`})}}
   await cmd('milestone:decision',{...milestone,deliveryId:'none',outcome:'accepted',contact:'Casey',date:'2026-10-21',reason:'Not delivered'},manager.cookie,409)
   for(const cookie of [staff.cookie,outsider.cookie,agent.cookie])await cmd('milestone:health',{...milestone,health:'healthy',reason:'No authority'},cookie,403)
   await save('milestone:health',{'Delivery health':'blocked','Health reason':'Missing final assets'},'Save health')
   await save('milestone:issue',{'Issue':'Missing work <script>bad()</script>','Risk owner':worker.id,'Mitigation':'Complete the source assets','Issue status':'open','Issue update reason':'Client needs editable assets'},'Save issue')
   await save('milestone:dependency',{'Client dependency':'Brand approval','Named client contact':'Casey Client','Dependency due date':'2026-10-20','Dependency status':'pending','Dependency update reason':'Awaiting client brand input'},'Save dependency')
   const tracked=await current();assert.equal(tracked.value.delivery.health,'blocked');assert.equal(tracked.value.delivery.issues[0].ownerId,worker.id);assert.equal(tracked.value.delivery.dependencies[0].due,'2026-10-20')
   await cmd('milestone:health',{...milestone,health:'healthy',reason:'Stale'},manager.cookie,409)
   await save('milestone:deliver',{'Delivery date':'2026-10-20','Delivered work':'Initial handover missing source assets'},'Record delivery')
   const delivered=await current(),snapshot=structuredClone(delivered.value.delivery.deliveries[0])
   assert.equal((await packets()).length,0,'DELIVERY-005 initial delivery issues no invoice or packet')
   await save('milestone:decision',{'Client decision':'rejected','Named client contact':'Casey Client','Decision date':'2026-10-20','Client decision reason':'Missing editable source assets'},'Record decision')
   await capture('rejected')
   const rejected=await current(),decision=rejected.value.delivery.decisions[0]
   assert.equal(rejected.value.delivery.issues.find(i=>i.id===decision.issueId).status,'open','DELIVERY-005 rejection opens its owned delivery issue');assert.equal(decision.outcome,'rejected');assert.equal(decision.recordedBy,manager.id);assert.equal(decision.contact,'Casey Client');assert.equal(decision.date,'2026-10-20');assert.equal(decision.reason,'Missing editable source assets');assert.equal(decision.notice,'recorded by delivery-lead, not confirmed by the client')
   // Internal commercial approval cannot replace the delivery gate.
   await cmd('milestone:approve',rejected)
   await cmd('packet:create',{engagementId:engagement.id,title:'Rejected work',sources:[`milestones:${milestone.id}`]},financePerson.cookie,409)
   let row=await current(),issue=row.value.delivery.issues[0]
   await cmd('milestone:issue',{id:row.id,revision:row.revision,itemId:issue.id,name:issue.name,ownerId:worker.id,mitigation:'Source assets attached to final handover',status:'resolved',reason:'Missing work completed'},manager.cookie)
   row=await current();const rejectionIssue=row.value.delivery.issues.find(i=>i.id===decision.issueId);await cmd('milestone:issue',{id:row.id,revision:row.revision,itemId:rejectionIssue.id,name:rejectionIssue.name,ownerId:lead.id,mitigation:'Completed missing assets',status:'resolved',reason:'Client rejection resolved'},manager.cookie)
   row=await current();const dependency=row.value.delivery.dependencies[0]
   await cmd('milestone:dependency',{...dependency,id:row.id,revision:row.revision,itemId:dependency.id,status:'received',reason:'Brand approval received'},manager.cookie)
   await save('milestone:health',{'Delivery health':'healthy','Health reason':'Assets complete and brand approved'},'Save health')
   await save('milestone:deliver',{'Delivery date':'2026-10-21','Delivered work':'Complete design with editable source assets'},'Record delivery')
   row=await current();const latest=row.value.delivery.deliveries.at(-1)
   await cmd('milestone:decision',{id:row.id,revision:row.revision,deliveryId:snapshot.id,outcome:'accepted',contact:'Casey Client',date:'2026-10-21',reason:'Old delivery'},manager.cookie,409)
   await cmd('milestone:decision',{id:row.id,revision:row.revision,deliveryId:latest.id,outcome:'accepted',contact:'',date:'2026-10-21',reason:'Complete'},manager.cookie,400)
   await cmd('milestone:decision',{id:row.id,revision:row.revision,deliveryId:latest.id,outcome:'accepted',contact:'Casey Client',date:'2026-10-20',reason:'Before delivery'},manager.cookie,400)
   // Finance may record the decision too; request replay retains a single decision.
   const input={key:randomUUID(),action:'milestone:decision',id:row.id,revision:row.revision,deliveryId:latest.id,outcome:'accepted',contact:'Casey Client',date:'2026-10-21',reason:'All missing work completed'}
   const first=await h.post('/api/gauge/command',input,financePerson.cookie);assert.equal(first.status,200)
   assert.deepEqual(await(await h.post('/api/gauge/command',input,financePerson.cookie)).json(),await first.json())
   row=await current();assert.equal(row.value.delivery.decisions.length,2);assert.equal(row.value.delivery.decisions[1].notice,'recorded by delivery-finance, not confirmed by the client');assert.deepEqual(row.value.delivery.deliveries[0],snapshot,'Earlier delivery snapshot is immutable');assert.equal(row.value.delivery.issues[0].status,'resolved');assert.equal(row.value.delivery.dependencies[0].status,'received')
   assert.equal((await packets()).length,0,'DELIVERY-005 recorded acceptance issues no invoice or packet')
   const agentMilestone=(await state(agent.cookie)).data.milestones.find(r=>r.id===row.id)
   assert.equal(agentMilestone.value.amountMinor,undefined,'DELIVERY-005 agent state withholds milestone price')
   assert(agentMilestone.value.delivery.deliveries.every(delivery=>delivery.snapshot.amountMinor===undefined),'DELIVERY-005 agent state withholds nested snapshot prices')
   const agentHistory=await(await request(`/api/gauge/history/milestones/${row.id}`,agent.cookie)).json()
   assert(agentHistory.history.every(revision=>revision.value.amountMinor===undefined&&(revision.value.delivery?.deliveries??[]).every(delivery=>delivery.snapshot.amountMinor===undefined)),'DELIVERY-005 agent history withholds every snapshot price')
   await capture('accepted')
   assert((await page.locator('#milestone-delivery').innerText()).includes('recorded by delivery-finance, not confirmed by the client'))
   assert(!(await page.content()).includes('<script>bad()</script>'),'Untrusted issue text is escaped')
   const history=await(await request(`/api/gauge/history/milestones/${row.id}`,manager.cookie)).json();assert(history.history.some(r=>r.value.delivery?.decisions?.[0]?.outcome==='rejected'));assert(history.history.some(r=>r.action==='milestone:issue'&&r.value.delivery?.issues?.[0]?.status==='open'))
   assert.equal((await request(`/api/gauge/history/milestones/${row.id}`,outsider.cookie)).status,403)
   await cmd('packet:create',{engagementId:engagement.id,title:'Lead cannot bill',sources:[`milestones:${row.id}`]},manager.cookie,403)
   // Editing accepted work invalidates the gate; old acceptance remains historical.
   const changed=await cmd('milestone:health',{id:row.id,revision:row.revision,health:'at-risk',reason:'Updated delivery assessment'},manager.cookie)
   await cmd('packet:create',{engagementId:engagement.id,title:'Changed after acceptance',sources:[`milestones:${row.id}`]},financePerson.cookie,409)
   const refreshed=await cmd('milestone:deliver',{...changed,date:'2026-10-21',reason:'Updated assessment delivered'},manager.cookie)
   const redelivered=await current()
   await cmd('milestone:decision',{...refreshed,deliveryId:redelivered.value.delivery.currentDeliveryId,outcome:'accepted',contact:'Casey Client',date:'2026-10-21',reason:'Updated assessment accepted'},financePerson.cookie)
   row=await current()
   await cmd('packet:create',{engagementId:engagement.id,title:'Acceptance without finance authorization',sources:[`milestones:${row.id}`]},financePerson.cookie,409)
   await cmd('milestone:authorize',row,financePerson.cookie,403)
   await cmd('milestone:authorize',row,manager.cookie,403)
   await context.clearCookies();await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
   await page.goto(url);await page.locator('#milestone-delivery').getByRole('button',{name:'Authorize milestone billing',exact:true}).click()
   await capture('authorized')
   row=await current();assert.equal(row.value.delivery.authorization.notice,'Independent finance approval')
   const packet=await cmd('packet:create',{engagementId:engagement.id,title:'Accepted work, finance review',sources:[`milestones:${row.id}`]},financePerson.cookie)
   assert.equal((await packets())[0].value.status,'draft','Acceptance still requires separate finance packet approval')
   await cmd('milestone:health',{id:row.id,revision:row.revision,health:'blocked',reason:'Reserved source edit'},manager.cookie,409)
   await cmd('packet:approve',packet,financePerson.cookie)
   assert.equal((await packets())[0].value.status,'approved');assert.equal((await packets())[0].value.totalMinor,10000)
   // A current acceptance can never substitute for internal milestone approval.
   const separate=await cmd('save:milestones',{engagementId:engagement.id,name:'Separate authorization',due:'2026-10-21',amountMinor:1})
   const d=await cmd('milestone:deliver',{...separate,date:'2026-10-21',reason:'Delivered separately'},manager.cookie)
   const source=(await state()).data.milestones.find(r=>r.id===separate.id)
   await cmd('milestone:decision',{...d,deliveryId:source.value.delivery.currentDeliveryId,outcome:'accepted',contact:'Casey Client',date:'2026-10-21',reason:'Client reported complete'},manager.cookie)
   await cmd('packet:create',{engagementId:engagement.id,title:'Unapproved commercial milestone',sources:[`milestones:${separate.id}`]},financePerson.cookie,400)
   const ownerBudget=await cmd('save:budgets',{engagementId:engagement.id,mode:'fixed',amountMinor:10001,effortSeconds:3600,roundingSeconds:60,reason:'Separate work authorized'});await cmd('budget:approve',ownerBudget)
   await cmd('milestone:approve',(await state()).data.milestones.find(r=>r.id===separate.id))
   let ownRow=(await state()).data.milestones.find(r=>r.id===separate.id)
   const ownDelivery=await cmd('milestone:deliver',{...ownRow,date:'2026-10-21',reason:'Owner delivered final work'})
   ownRow=(await state()).data.milestones.find(r=>r.id===separate.id)
   const ownAcceptance=await cmd('milestone:decision',{...ownDelivery,deliveryId:ownRow.value.delivery.currentDeliveryId,outcome:'accepted',contact:'Casey Client',date:'2026-10-21',reason:'Owner recorded client response'})
   await cmd('milestone:authorize',ownAcceptance)
   ownRow=(await state()).data.milestones.find(r=>r.id===separate.id);assert.equal(ownRow.value.delivery.authorization.notice,'One-person approval by owner')
  }finally{await context.close()}
 }
 console.log('PASS DELIVERY-005: risks, mitigation/owner, dated client dependencies, immutable delivered work, attributed rejection/resolution/acceptance, separate billing gates, exact replay/stale refusal, access and 1440/390 public forms')
}
