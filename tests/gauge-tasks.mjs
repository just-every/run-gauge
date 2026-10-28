import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// DELIVERY-001 / DELIVERY-007: a real lead assigns recurring delivery work, an assignee executes
// it through the board, and project/personal views reconcile the same work.
const h=await harness({currency:'USD',timezone:'America/New_York'})
let browser
try {
 const {cmd,state,owner,request}=h,zone='America/New_York'
 const lead=await cmd('save:people',{name:'Morgan Project Lead',timezone:zone})
 const worker=await cmd('save:people',{name:'Avery Designer',timezone:zone})
 const colleague=await cmd('save:people',{name:'Blake Researcher',timezone:zone})
 const staff=await h.invite('task-worker'),manager=await h.invite('task-lead'),other=await h.invite('task-colleague')
 for(const [user,person,role] of [[staff,worker,'staff'],[manager,lead,'lead'],[other,colleague,'staff']])await cmd('grant',{operatorId:user.id,personId:person.id,role,enabled:true})
 const client=await cmd('save:clients',{name:'Cascade Studio'})
 const project=await cmd('save:engagements',{name:'Autumn campaign',clientId:client.id,leadId:lead.id,members:[worker.id,colleague.id],scope:'Weekly campaign delivery',timezone:zone})
 const secondClient=await cmd('save:clients',{name:'Willow Foods'})
 const second=await cmd('save:engagements',{name:'Other client campaign',clientId:secondClient.id,leadId:lead.id,members:[worker.id],scope:'Independent work',timezone:zone})
 const unrelated=await cmd('save:tasks',{engagementId:second.id,name:'Other project only',remainingSeconds:3600,assigneeId:worker.id})
 const peerTask=await cmd('save:tasks',{engagementId:project.id,name:'Research handoff',remainingSeconds:1800,assigneeId:colleague.id})
 const terms=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:36000,roundingSeconds:60,reason:'Approved campaign scope'});await cmd('budget:approve',terms)
 await cmd('save:rates',{personId:worker.id,service:'Design',effective:'2026-01-01',costMinor:5000,billMinor:15000})
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const signIn=async(cookie)=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}));await page.goto('about:blank')}
 const capture=async(name,locator=page.locator('#delivery-tasks'))=>{
  if(!process.env.GAUGE_TASK_SHOTS)return
  await mkdir(process.env.GAUGE_TASK_SHOTS,{recursive:true})
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`)
   await locator.scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_TASK_SHOTS}/${name}-${width}.png`,fullPage:true})
   await page.screenshot({path:`${process.env.GAUGE_TASK_SHOTS}/${name}-viewport-${width}.png`})
  }
 }
 await signIn(manager.cookie);await page.goto(h.origin+`/app/engagements?edit=${project.id}`)
 const editor=page.locator('form').filter({has:page.locator('[name=action][value="save:tasks"]')})
 await editor.getByLabel('Task name',{exact:true}).fill('Weekly creative delivery')
 await editor.locator('[name=assigneeId]').selectOption(worker.id)
 await editor.locator('[name=priority]').selectOption('high')
 await editor.getByLabel('Start date',{exact:true}).fill('2026-10-05');await editor.getByLabel('Due date',{exact:true}).fill('2026-10-06')
 await editor.getByLabel('Estimated effort (hours)',{exact:true}).fill('2');await editor.getByLabel('Remaining effort (hours)',{exact:true}).fill('2')
 await editor.getByLabel('Checklist (one item per line)',{exact:true}).fill('Review creative brief\nPublish approved assets')
 await editor.getByLabel('Repeat every calendar days (0 = once)',{exact:true}).fill('7');await editor.getByLabel('Last recurring start date',{exact:true}).fill('2026-10-12')
 await capture('task-editor',editor);await editor.getByRole('button',{name:'Save',exact:true}).click()
 let data=await state(),root=data.data.tasks.find(t=>t.value.name==='Weekly creative delivery')
 assert(root);assert.equal(root.value.billable,true);assert.equal(root.value.estimateSeconds,7200)
 const child=await cmd('save:tasks',{engagementId:project.id,name:'Accessibility proof',parentId:root.id,assigneeId:worker.id,status:'todo',priority:'urgent',from:'2026-10-05',to:'2026-10-06',estimateSeconds:1800,remainingSeconds:1800,billable:false,checklist:[{id:'alt-text',label:'Check alt text',done:false}]},manager.cookie)
 await cmd('save:tasks',{...root.value,...root,parentId:child.id},manager.cookie,400)
 await cmd('save:tasks',{engagementId:second.id,name:'Invalid cross-project child',parentId:root.id,remainingSeconds:0},manager.cookie,400)
 await cmd('save:tasks',{engagementId:project.id,name:'Invalid assignee',assigneeId:(await cmd('save:people',{name:'Unassigned person',timezone:zone})).id,remainingSeconds:0},manager.cookie,400)
 await cmd('save:tasks',{engagementId:project.id,name:'Staff cannot assign',remainingSeconds:0},staff.cookie,403)
 await cmd('task:progress',{...root,status:'blocked',completedItems:[]},other.cookie,403)
 await cmd('task:progress',{...root,status:'done',completedItems:['injected']},staff.cookie,400)
 await signIn(staff.cookie)
 const boardUrl=h.origin+`/app/engagements?taskView=board&taskClient=${client.id}&taskProject=${project.id}`
 await page.goto(h.origin+`/app/engagements?taskView=board&taskClient=${client.id}`)
 assert(!(await page.locator('#delivery-tasks').innerText()).includes('Other project only'),'Client filter excludes another client without a project filter')
 await page.goto(boardUrl)
 assert(!(await page.locator('#delivery-tasks').innerText()).includes('Other project only'))
 const row=page.locator(`#delivery-tasks [id="${root.id}"]`)
 await row.getByText('Update progress',{exact:true}).first().click()
 const progress=row.locator('form')
 await progress.locator('[name=status]').selectOption('in-progress')
 await progress.getByLabel('Remaining effort (hours)',{exact:true}).fill('1.25')
 await progress.getByLabel('Review creative brief',{exact:true}).check()
 await capture('task-board-progress');await progress.getByRole('button',{name:'Update progress',exact:true}).click()
 root=(await state()).data.tasks.find(t=>t.id===root.id)
 assert.equal(root.value.status,'in-progress');assert.equal(root.value.remainingSeconds,4500);assert.equal(root.value.checklist[0].done,true)
 await cmd('task:progress',{id:root.id,revision:'stale',status:'done',completedItems:[]},staff.cookie,409)
 const timeInput={personId:worker.id,engagementId:project.id,taskId:root.id,service:'Design',timezone:zone,notes:'Creative review',billable:true,start:'2026-10-06T09:00:00-04:00',end:'2026-10-06T10:00:00-04:00'}
 await cmd('time:save',{...timeInput,taskId:child.id},staff.cookie,400)
 const entry=await cmd('time:save',timeInput,staff.cookie),submitted=await cmd('time:submit',entry,staff.cookie);await cmd('time:approve',submitted,manager.cookie)
 await page.goto(h.origin+'/app/expenses')
 const expenseForm=page.locator('form').filter({has:page.locator('[name=action][value="expense:save"]')})
 await expenseForm.locator('[name=engagementId]').selectOption(project.id)
 await expenseForm.locator('[name=taskId]').selectOption(root.id)
 await expenseForm.getByLabel('Expense date',{exact:true}).fill('2026-10-06');await expenseForm.getByLabel('Description',{exact:true}).fill('Campaign stock photography')
 await expenseForm.getByLabel('Receipt subtotal (incurred currency)',{exact:true}).fill('25')
 await capture('task-expense-link',expenseForm);await expenseForm.getByRole('button',{name:'Save',exact:true}).click()
 assert((await state()).data.expenses.some(r=>r.value.taskId===root.id&&r.value.amountMinor===2500))
 await cmd('expense:save',{personId:worker.id,engagementId:second.id,taskId:root.id,date:'2026-10-06',description:'Wrong project',amountMinor:100,currency:'USD'},staff.cookie,400)
 for(const view of ['list','mine','board']){
  await page.goto(h.origin+`/app/engagements?taskView=${view}&taskProject=${project.id}`)
  const text=await page.locator(`#delivery-tasks [id="${root.id}"]`).innerText()
  assert(text.includes('in-progress'));assert(text.replace(/\s/g,' ').includes('1.25 h'));assert(text.includes('Avery Designer'))
  const taskRow=page.locator(`#delivery-tasks [id="${root.id}"]`)
  if(view==='board')assert.equal(await taskRow.getByText('1\u00a0h recorded',{exact:true}).count(),1)
  else assert.equal((await taskRow.locator('td').nth(4).innerText()).replace(/\s/g,' '),'1 h')
  assert.equal(await page.locator(`#delivery-tasks [id="${peerTask.id}"]`).count(),view==='mine'?0:1,'Personal work contains only this worker’s assignments')
  await capture(`task-${view}`)
 }
 // A complete root advances one dated tree, once, including its assigned subtasks.
 await cmd('task:progress',{...child,status:'done',completedItems:['alt-text']},staff.cookie)
 const key=randomUUID(),completion={key,action:'task:progress',id:root.id,revision:root.revision,status:'done',completedItems:root.value.checklist.map(i=>i.id)}
 const response=await h.post('/api/gauge/command',completion,staff.cookie);assert.equal(response.status,200);const result=await response.json()
 assert.deepEqual(await (await h.post('/api/gauge/command',completion,staff.cookie)).json(),result)
 data=await state();root=data.data.tasks.find(t=>t.id===root.id)
 const successor=data.data.tasks.find(t=>t.id===root.value.nextOccurrenceId),nextChildren=data.data.tasks.filter(t=>t.value.parentId===successor.id)
 assert(successor);assert.equal(successor.value.previousOccurrenceId,root.id);assert.equal(successor.value.status,'todo');assert.equal(successor.value.remainingSeconds,7200)
 assert.deepEqual([successor.value.from,successor.value.to],['2026-10-12','2026-10-13']);assert.equal(successor.value.assigneeId,worker.id)
 assert(successor.value.checklist.every(i=>!i.done));assert.equal(nextChildren.length,1);assert.equal(nextChildren[0].value.billable,false);assert.equal(nextChildren[0].value.remainingSeconds,1800)
 assert.equal(data.data.tasks.filter(t=>t.value.previousOccurrenceId===root.id).length,1)
 await cmd('task:progress',{id:successor.id,revision:successor.revision,status:'done',completedItems:[]},staff.cookie)
 assert.equal((await state()).data.tasks.length,data.data.tasks.length,'Last recurring start date stops the series')
 const history=await (await request(`/api/gauge/history/tasks/${root.id}`,staff.cookie)).json();assert(history.history.some(r=>r.value.status==='in-progress'&&r.value.checklist[0].done))
 await page.goto(h.origin+`/app/engagements?edit=${project.id}&taskView=mine`);await capture('task-completed-project')
 await cmd('grant',{operatorId:staff.id,personId:worker.id,role:'staff',enabled:false})
 assert.equal((await request('/api/gauge/state',staff.cookie)).status,403)
 console.log('PASS DELIVERY-001 / DELIVERY-007: assignment, task tree, board/personal filters, progress, time/expense links, exact recurrence, history and revocation')
}finally{await browser?.close();await h.dispose()}
