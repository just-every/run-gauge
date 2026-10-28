import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

// Run the public portal handler with the real database and native session. Only
// the D1 transport is wrapped to renew authority after its initial read fence.
export async function portalRevisionRace(h,path,cookie,grant){
 const {createRequire}=await import('node:module'),{realpath}=await import('node:fs/promises')
 const {build}=createRequire(await realpath('node_modules/wrangler/package.json'))('esbuild')
 const bundled=await build({entryPoints:['src/gauge/client-portal.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',loader:{'.ttf':'dataurl'},banner:{js:"import {createRequire as nodeRequire} from 'node:module';const require=nodeRequire(import.meta.url);"}})
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
 const directory=await mkdtemp(join(tmpdir(),'gauge-portal-handler-')),modulePath=join(directory,'handler.mjs')
 await writeFile(modulePath,bundled.outputFiles[0].text)
 const {clientPortalResponse}=await import(modulePath)
 await rm(directory,{recursive:true,force:true})
 let changed=false
 const database={prepare(sql){
  const statement=h.db.prepare(sql)
  const wrap=statement=>new Proxy(statement,{get(target,key){
   if(key==='bind')return(...args)=>wrap(target.bind(...args))
   if(key==='first')return async(...args)=>{
    const value=await target.first(...args)
    if(!changed&&sql.startsWith('SELECT (EXISTS')&&sql.includes('g_client_portal_authority')){
     assert.equal(value.ok,1,'Race starts after a successful invitation fence')
     changed=true
     await h.cmd('client:renew-project',{...grant,months:12,reason:'Renew during an in-flight project read'})
    }
    return value
   }
   const value=target[key];return typeof value==='function'?value.bind(target):value
  }})
  return wrap(statement)
 },batch:statements=>h.db.batch(statements)}
 const response=await clientPortalResponse(new Request(h.origin+path,{headers:{cookie}}),{...h.vars,DB:database})
 assert(changed,'The invitation revision changed inside the public handler')
 assert.equal(response.status,403,'An in-flight invitation revision change refuses the old projection')
 assert.equal((await h.request(path,cookie)).status,200,'A fresh request observes renewed authority')
}

const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]]))

// Match submitted commands to the searchable business audit, including exact keys and revisions.
function milestoneAudit(h) {
 const expected=new Map(),actors=new Map()
 const remember=async(action,input,cookie,row)=>{
  if(!action.startsWith('milestone:')&&action!=='save:milestones')return
  if(!actors.has(cookie))actors.set(cookie,(await(await h.request('/auth/session',cookie)).json()).operator.id)
  if(!row.value)row=(await h.state()).data.milestones.find(r=>r.id===row.id)
  const revoke=action==='milestone:revoke-review'
  expected.set(input.key,{action:action==='milestone:approve'?'approve':action,key:input.key,id:row.id,actor:actors.get(cookie),previousRevision:revoke?null:input.revision??null,revision:revoke?null:row.revision,result:revoke?{reviewId:input.reviewId,reason:input.reason}:row.value})
 }
 const cmd=async(action,input={},cookie=h.owner,status=200)=>{
  input={key:randomUUID(),...input}
  const row=await h.cmd(action,input,cookie,status)
  if(status===200)await remember(action,input,cookie,row)
  return row
 }
 const form=async(f,cookie,submit)=>{
  const input=await f.evaluate(el=>Object.fromEntries(new FormData(el)))
  await submit()
  const row=(await h.state()).data.milestones.find(r=>r.id===input.id)
  await remember(input.action,input,cookie,row)
 }
 const verify=async()=>{
  const {entries}=await(await h.request('/api/gauge/audit?kind=milestones',h.owner)).json()
  for(const action of ['milestone:health','milestone:issue','milestone:dependency','milestone:deliver','milestone:decision','milestone:respond','milestone:authorize','milestone:release-review','milestone:revoke-review'])assert([...expected.values()].some(e=>e.action===action),`Submitted ${action} has an audit expectation`)
  for(const e of expected.values()){
   const matches=entries.filter(a=>a.requestKey===e.key&&a.action===e.action&&a.recordId===e.id)
   assert.equal(matches.length,1,`One business audit entry for ${e.action} ${e.key}`)
   const a=matches[0]
   assert.equal(a.actor.id,e.actor);assert.equal(a.previousRevision,e.previousRevision);assert.equal(a.revision,e.revision)
   assert(a.atMs>0);assert.match(a.hash,/^[a-f0-9]{64}$/)
   for(const [key,value]of Object.entries(e.result))assert.deepEqual(a.result[key],value,`${e.action} audit result ${key}`)
  }
  console.log(`PASS DELIVERY-005 / DELIVERY-012 audit: ${expected.size} submitted commands retain actor, exact request key, revisions and result`)
 }
 return {...h,cmd,deliveryAudit:{remember,form,verify}}
}

// DELIVERY-005 / DELIVERY-012: every acceptance point through native forms and HTTP, at both widths.
export async function milestoneDeliveryJourney(h,browser,{lead,worker,manager,staff,outsider}) {
 h=milestoneAudit(h)
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
   const save=async(action,fields,button)=>{await open();const f=form(action).last();for(const [label,value]of Object.entries(fields)){const field=f.getByLabel(label,{exact:true});if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption(value);else await field.fill(value)}await h.deliveryAudit.form(f,manager.cookie,()=>f.getByRole('button',{name:button,exact:true}).click());assert.equal(new URL(page.url()).pathname,'/app/engagements')}
   const capture=async name=>{await page.goto(url);await page.locator('#milestone-delivery').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`DELIVERY-005 fits ${width}`);if(process.env.GAUGE_DELIVERY_SHOTS){await mkdir(process.env.GAUGE_DELIVERY_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/milestone-${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/milestone-${name}-viewport-${width}.png`})}}
   await cmd('milestone:decision',{...milestone,deliveryId:'none',outcome:'accepted',contact:'Casey',date:'2026-10-21',reason:'Not delivered'},manager.cookie,409)
   for(const cookie of [staff.cookie,outsider.cookie,agent.cookie])await cmd('milestone:health',{...milestone,health:'healthy',reason:'No authority'},cookie,403)
   await save('milestone:health',{'Delivery health':'blocked','Health reason':'Missing final assets'},'Save health')
   await save('milestone:issue',{'Issue':'Missing work <script>bad()</script>','Risk owner':worker.id,'Mitigation':'Complete the source assets','Issue status':'open','Issue update reason':'Client needs editable assets'},'Save issue')
   await save('milestone:dependency',{'Client dependency':'Brand approval','Named client contact':'Casey Client','Dependency due date':'2026-10-20','Dependency status':'pending','Dependency update reason':'Awaiting client brand input'},'Save dependency')
   const tracked=await current();assert.equal(tracked.value.delivery.issues[0].mitigation,'Complete the source assets');assert.equal(tracked.value.delivery.health,'blocked');assert.equal(tracked.value.delivery.issues[0].ownerId,worker.id);assert.equal(tracked.value.delivery.dependencies[0].due,'2026-10-20')
   await cmd('milestone:health',{...milestone,health:'healthy',reason:'Stale'},manager.cookie,409)
   await save('milestone:deliver',{'Delivery date':'2026-10-20','Delivered work':'Initial handover missing source assets'},'Record delivery')
   const delivered=await current(),snapshot=structuredClone(delivered.value.delivery.deliveries[0])
   assert.deepEqual({name:snapshot.snapshot.name,amountMinor:snapshot.snapshot.amountMinor,currency:snapshot.snapshot.currency,health:snapshot.snapshot.health},{name:'Design handover',amountMinor:10000,currency:'USD',health:'blocked'})
   assert.equal(snapshot.snapshot.issues.length,1);assert.equal(snapshot.snapshot.dependencies.length,1)
   assert.deepEqual(pick(snapshot.snapshot.issues[0],['name','ownerId','mitigation','status','reason']),{name:'Missing work <script>bad()</script>',ownerId:worker.id,mitigation:'Complete the source assets',status:'open',reason:'Client needs editable assets'})
   assert.deepEqual(pick(snapshot.snapshot.dependencies[0],['name','contact','due','status','reason']),{name:'Brand approval',contact:'Casey Client',due:'2026-10-20',status:'pending',reason:'Awaiting client brand input'})
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
   assert.equal((await h.post('/api/gauge/command',{...input,reason:'Changed decision under the same key'},financePerson.cookie)).status,409,'Changed milestone request content cannot reuse its key')
   await h.deliveryAudit.remember('milestone:decision',input,financePerson.cookie,await current())
   row=await current();assert.equal(row.value.delivery.decisions.length,2);assert.equal(row.value.delivery.decisions[1].notice,'recorded by delivery-finance, not confirmed by the client');assert.deepEqual(row.value.delivery.deliveries[0],snapshot,'Earlier delivery snapshot is immutable');assert.equal(row.value.delivery.issues[0].status,'resolved');assert.equal(row.value.delivery.dependencies[0].status,'received')
   assert.equal((await packets()).length,0,'DELIVERY-005 recorded acceptance issues no invoice or packet')
   const agentMilestone=(await state(agent.cookie)).data.milestones.find(r=>r.id===row.id)
   assert.equal(agentMilestone.value.amountMinor,undefined,'DELIVERY-005 agent state withholds milestone price')
   assert.equal(agentMilestone.value.delivery,undefined,'GOVERN-007 billing purpose withholds undeclared delivery snapshots, including every price')
   const agentHistory=await(await request(`/api/gauge/history/milestones/${row.id}`,agent.cookie)).json()
   assert(agentHistory.history.every(revision=>revision.value.amountMinor===undefined&&revision.value.delivery===undefined),'GOVERN-007 billing history withholds undeclared delivery snapshots and every price')
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
   await page.goto(url);const authorize=page.locator('#milestone-delivery form').filter({has:page.locator('[name=action][value="milestone:authorize"]')});await h.deliveryAudit.form(authorize,h.owner,()=>authorize.getByRole('button',{name:'Authorize milestone billing',exact:true}).click())
   await capture('authorized')
   row=await current();assert.equal(row.value.delivery.authorization.notice,'Independent finance approval')
   const authorizedId=row.value.delivery.authorization.deliveryId
   row=await cmd('milestone:deliver',{...row,date:'2026-10-21',reason:'Replacement after finance authorization'},manager.cookie)
   row=await current();const replacementId=row.value.delivery.currentDeliveryId
   assert.notEqual(replacementId,authorizedId)
   row=await cmd('milestone:decision',{...row,deliveryId:replacementId,outcome:'accepted',contact:'Casey Client',date:'2026-10-21',reason:'Replacement explicitly accepted'},manager.cookie)
   await cmd('packet:create',{engagementId:engagement.id,title:'Historical authorization cannot bill replacement',sources:[`milestones:${row.id}`]},financePerson.cookie,409)
   row=await cmd('milestone:authorize',row)
   assert.equal((await current()).value.delivery.authorization.deliveryId,replacementId)
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
   const legacy=await cmd('milestone:approve',await cmd('save:milestones',{engagementId:engagement.id,name:'Pre-existing undelivered milestone',due:'2026-10-21',amountMinor:0}))
   assert.equal((await state()).data.milestones.find(r=>r.id===legacy.id).value.delivery,undefined)
   await cmd('packet:create',{engagementId:engagement.id,title:'Legacy milestone requires acceptance',sources:[`milestones:${legacy.id}`]},financePerson.cookie,409)
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
 await directMilestoneReviewJourney(h,browser,{lead,worker,manager,staff,outsider,financePerson})
 await h.deliveryAudit.verify()
 console.log('PASS DELIVERY-005 / DELIVERY-012: risks, mitigation/owner, dated client dependencies, immutable delivered work, attributed rejection/resolution/acceptance, separate billing gates, exact replay/stale refusal, access and 1440/390 public forms')
}

async function directMilestoneReviewJourney(h,browser,{lead,worker,manager,staff,outsider,financePerson}) {
 const {cmd:rawCmd,state,request:rawRequest}=h,tokens=new Map(),attempts=[]
 const cmd=async(action,input={},cookie=h.owner,expected=200)=>{
  if(action==='milestone:release-review')input={key:randomUUID(),...input}
  const outbound=h.providerRequests.length
  const result=await rawCmd(action,input,cookie,expected)
  if(['milestone:release-review','milestone:revoke-review'].includes(action))assert.equal(h.providerRequests.length,outbound,'Release and revocation send nothing')
  if(action==='milestone:release-review'&&expected===200){
   assert.match(result.token,/^[a-f0-9]{64}$/)
   const row=(await state()).data.milestones.find(r=>r.id===result.id),review=row.value.delivery.clientReviews.at(-1)
   const path=`/api/gauge/client-milestones/${row.id}/${review.id}`
   tokens.set(path,result.token)
   const stored=await h.db.prepare('SELECT token_hash FROM g_milestone_review_authority WHERE review_id=?').bind(review.id).first()
   assert.equal(stored.token_hash,createHash('sha256').update(result.token).digest('hex'))
   const replay=await rawCmd(action,input,cookie)
   assert.equal(replay.token,undefined,'A release replay never shows the token again')
   const surfaces=JSON.stringify(await state())+await(await rawRequest(`/api/gauge/history/milestones/${row.id}`,h.owner)).text()+await(await rawRequest('/api/gauge/audit/export',h.owner)).text()+JSON.stringify((await h.db.prepare('SELECT result FROM g_receipts').all()).results)
   assert(!surfaces.includes(result.token),'Token never persists in business state, history, audit or receipts')
  }
  return result
 }
 const request=async(path,cookie='',options={})=>{
  const outbound=h.providerRequests.length
  const response=await rawRequest(path,cookie,{...options,headers:{'x-gauge-review-token':tokens.get(path)??'',...options.headers}})
  attempts.push({path,status:response.status,method:options.method??'GET'})
  assert.equal(h.providerRequests.length,outbound,'Recipient access and decisions send nothing')
  return response
 }
 const post=async(path,input,cookie)=>{
  const response=await request(path,cookie,{method:'POST',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify(input)})
  if(response.status===200)await h.deliveryAudit.remember('milestone:respond',input,cookie,await response.clone().json())
  return response
 }
 const browserDecision=async(path,cookie,input,widths=[1440,390])=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  try{
   await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
   for(const width of widths){
    await page.setViewportSize({width,height:1000})
    await page.goto(h.origin+path.replace('/api/gauge/','/app/'))
    attempts.push({path,status:200,method:'GET'})
    await page.getByLabel('Review key',{exact:true}).fill(tokens.get(path))
    await page.getByRole('button',{name:'Open delivery',exact:true}).click()
    attempts.push({path,status:200,method:'GET'})
    assert.equal(await page.getByLabel('Your decision').count(),1,await page.locator('main').innerText())
    assert(!(await page.locator('main').innerText()).includes('Private internal'))
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Client review fits ${width}`)
    assert.equal(await page.locator('button:not(:has-text("Open")):not(:has-text("Submit"))').count(),0,'All review controls have visible names')
    if(process.env.GAUGE_DELIVERY_SHOTS)await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-${input.outcome}-review-${width}.png`,fullPage:true})
   }
   await page.locator('[name=key]').evaluate((el,key)=>el.value=key,input.key)
   await page.getByLabel('Your decision').selectOption(input.outcome)
   await page.getByLabel('Decision reason',{exact:true}).fill(input.reason)
   await page.getByRole('button',{name:'Submit decision',exact:true}).click()
   attempts.push({path,status:200,method:'POST'},{path,status:200,method:'GET'})
   await h.deliveryAudit.remember('milestone:respond',input,cookie,(await state()).data.milestones.find(r=>r.id===path.split('/')[4]))
   for(const width of widths){
    await page.setViewportSize({width,height:1000})
    assert.match(await page.getByRole('status').innerText(),new RegExp(`Response saved: ${input.outcome}`))
    assert((await page.getByRole('status').innerText()).includes(input.reason),'The saved client form displays the exact submitted reason')
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
    if(process.env.GAUGE_DELIVERY_SHOTS)await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-${input.outcome}-saved-${width}.png`,fullPage:true})
   }
  }finally{await context.close()}
 }
 const recipient=await h.invite('synthetic-gauge-7301'),otherRecipient=await h.invite('synthetic-gauge-7302')
 const client=await cmd('save:clients',{name:'synthetic-gauge-7303'})
 const engagement=await cmd('save:engagements',{name:'synthetic-gauge-7304',clientId:client.id,leadId:lead.id,members:[worker.id],scope:'Internal scope withheld from recipients',timezone:'UTC'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:engagement.id,mode:'fixed',amountMinor:10000,effortSeconds:3600,roundingSeconds:60,reason:'Agreed client delivery'}))
 let milestone=await cmd('milestone:approve',await cmd('save:milestones',{engagementId:engagement.id,name:'Client design',due:'2020-01-02',amountMinor:10000}))
 const current=async()=>(await state()).data.milestones.find(r=>r.id===milestone.id)
 milestone=await cmd('milestone:health',{...milestone,health:'at-risk',reason:'Private internal risk assessment'},manager.cookie)
 milestone=await cmd('milestone:deliver',{...milestone,date:'2020-01-01',reason:'Private internal delivery notes'},manager.cookie)
 const releaseInput={...milestone,contact:'synthetic-gauge-7301@example.test',description:'Review the delivered design assets',reason:'Owner explicitly shares this delivery only',days:7}
 for(const cookie of [manager.cookie,financePerson.cookie,staff.cookie,recipient.cookie])await cmd('milestone:release-review',releaseInput,cookie,403)
 await cmd('milestone:release-review',{...releaseInput,contact:'delivery-worker@example.test'},h.owner,409)
 assert.equal((await h.post('/auth/invite',{email:'synthetic-gauge-92501@example.test',displayName:'Unconfirmed recipient',role:'member'},h.owner)).status,202)
 await cmd('milestone:release-review',{...releaseInput,contact:'synthetic-gauge-92501@example.test'},h.owner,409,'Unconfirmed recipient cannot receive a release')
 for(const days of [0,31])await cmd('milestone:release-review',{...releaseInput,days},h.owner,400)
 const start=Date.now()
 milestone=await cmd('milestone:release-review',{...releaseInput,days:1})
 let row=await current(),review=row.value.delivery.clientReviews.at(-1)
 assert(review.expiresAt>=start+86400000&&review.expiresAt<=Date.now()+86400000)
 const path=review=>`/api/gauge/client-milestones/${row.id}/${review.id}`
 for(const [cookie,status]of [['',401],[otherRecipient.cookie,403],[h.owner,403],[staff.cookie,403],[outsider.cookie,403]])assert.equal((await request(path(review),cookie)).status,status)
 assert.equal((await request(path(review),recipient.cookie,{headers:{'x-gauge-review-token':''}})).status,403,'Confirmed sign-in without the shown-once token cannot read')
 assert.equal((await request(path(review),recipient.cookie,{headers:{'x-gauge-review-token':'synthetic-gauge-wrong'}})).status,403)
 let response=await request(path(review),recipient.cookie);assert.equal(response.status,200)
 const document=await response.json()
 assert.deepEqual(Object.keys(document).sort(),['date','decision','deliveryId','description','expiresAt','id','name','revision'].sort())
 assert.equal(document.description,releaseInput.description);assert.equal(document.decision,null)
 assert(!JSON.stringify(document).includes('Private internal'));assert(!JSON.stringify(document).includes('10000'))
 const input={key:randomUUID(),revision:row.revision,outcome:'rejected',reason:'Editable assets are missing',contact:'Forged person',date:'1900-01-01'}
 assert.equal((await request(path(review),recipient.cookie,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})).status,403)
 assert.equal((await post(path(review),{...input,revision:'stale'},recipient.cookie)).status,409)
 assert.equal((await post(path(review),{...input,reason:''},recipient.cookie)).status,400)
 await browserDecision(path(review),recipient.cookie,input)
 const rejected=await post(path(review),input,recipient.cookie);assert.equal(rejected.status,200,await rejected.clone().text())
 assert.deepEqual(await(await post(path(review),input,recipient.cookie)).json(),await rejected.json(),'Exact client response replay stays once-only')
 row=await current();const first=structuredClone(row.value.delivery.deliveries[0]),decision=row.value.delivery.decisions[0]
 assert.equal(decision.reason,input.reason);assert.equal(decision.confirmedByClient,true);assert.equal(decision.recordedBy,recipient.id);assert.equal(decision.contact,'synthetic-gauge-7301@example.test');assert(decision.notice.startsWith('Confirmed by client '));assert.notEqual(decision.date,'1900-01-01')
 const issue=row.value.delivery.issues.find(i=>i.id===decision.issueId);assert.equal(issue.status,'open');assert.equal(issue.ownerId,lead.id)
 await cmd('packet:create',{engagementId:engagement.id,title:'Rejected delivery cannot bill',sources:[`milestones:${row.id}`]},financePerson.cookie,409)
 await cmd('milestone:issue',{...row,itemId:issue.id,name:issue.name,ownerId:lead.id,mitigation:'Editable assets delivered',status:'resolved',reason:'Missing work resolved'},manager.cookie)
 assert.equal((await request(path(review),recipient.cookie)).status,403,'A changed delivery invalidates recipient authority immediately')
 row=await current();await cmd('milestone:deliver',{...row,date:'2020-01-02',reason:'Private revised internal delivery'},manager.cookie)
 row=await current();await cmd('milestone:release-review',{...row,contact:'synthetic-gauge-7301@example.test',description:'Revised design includes editable assets',reason:'Owner releases the exact revised work'})
 row=await current();review=row.value.delivery.clientReviews.at(-1)
 const accept={key:randomUUID(),revision:row.revision,outcome:'accepted',reason:'All required assets received'}
 await browserDecision(path(review),recipient.cookie,accept)
 const results=await Promise.all([post(path(review),accept,recipient.cookie),post(path(review),accept,recipient.cookie)])
 for(const result of results)assert.equal(result.status,200,await result.clone().text())
 assert.deepEqual(await results[0].json(),await results[1].json())
 row=await current();assert.equal(row.value.delivery.decisions.at(-1).reason,accept.reason);assert.equal(row.value.delivery.decisions.length,2);assert.deepEqual(row.value.delivery.deliveries[0],first)
 assert.equal(row.value.delivery.issues.find(i=>i.id===issue.id).status,'resolved')
 assert.equal((await state()).data.packets.filter(p=>p.value.engagementId===engagement.id).length,0,'Direct acceptance creates no packet')
 assert.equal((await state()).data.invoices.filter(p=>p.value.engagementId===engagement.id).length,0,'Direct acceptance issues no invoice')
 await cmd('packet:create',{engagementId:engagement.id,title:'Client cannot authorize finance',sources:[`milestones:${row.id}`]},recipient.cookie,403)
 await cmd('packet:create',{engagementId:engagement.id,title:'Still needs finance authorization',sources:[`milestones:${row.id}`]},financePerson.cookie,409)
 await cmd('milestone:authorize',row,recipient.cookie,403)
 await cmd('milestone:authorize',row,financePerson.cookie)
 const packet=await cmd('packet:create',{engagementId:engagement.id,title:'Separately authorized delivery',sources:[`milestones:${row.id}`]},financePerson.cookie)
 assert.equal((await state()).data.packets.find(r=>r.id===packet.id).value.status,'draft')
 row=await current()
 const acceptedRevision=row.revision
 await cmd('milestone:revoke-review',{...row,reviewId:review.id,reason:'Close client access after finance reservation'})
 assert.equal((await current()).revision,acceptedRevision,'Revocation preserves the exact reserved financial source revision')
 assert.equal((await request(path(review),recipient.cookie)).status,403)
 for(const denied of ['/api/gauge/state',`/api/gauge/history/milestones/${row.id}`,'/app/engagements'])assert.equal((await request(denied,recipient.cookie)).status,403)
 const pending=await cmd('milestone:deliver',{...await cmd('save:milestones',{engagementId:engagement.id,name:'Pending client review',due:'2020-01-03',amountMinor:0}),date:'2020-01-02',reason:'Pending exact work'})
 await cmd('milestone:release-review',{...pending,contact:'synthetic-gauge-7301@example.test',description:'Explicitly shared pending work',reason:'Exercise revoke and expiry'})
 let pendingRow=(await state()).data.milestones.find(r=>r.id===pending.id),pendingReview=pendingRow.value.delivery.clientReviews.at(-1)
 const pendingPath=()=>`/api/gauge/client-milestones/${pending.id}/${pendingReview.id}`
 await cmd('milestone:revoke-review',{...pendingRow,reviewId:pendingReview.id,reason:'Withdraw recipient access'})
 assert.equal((await request(pendingPath(),recipient.cookie)).status,403)
 pendingRow=(await state()).data.milestones.find(r=>r.id===pending.id)
 await cmd('milestone:release-review',{...pendingRow,contact:'synthetic-gauge-7301@example.test',description:'Fresh pending work release',reason:'Explicit renewed authority',days:30})
 pendingRow=(await state()).data.milestones.find(r=>r.id===pending.id);pendingReview=pendingRow.value.delivery.clientReviews.at(-1)
 assert(pendingReview.expiresAt>Date.now()+29*86400000&&pendingReview.expiresAt<=Date.now()+30*86400000)
 await h.db.prepare('UPDATE g_milestone_review_authority SET expires_at=0 WHERE review_id=?').bind(pendingReview.id).run()
 assert.equal((await request(pendingPath(),recipient.cookie)).status,403,'An expired grant cannot read or decide')
 assert.equal((await post(pendingPath(),{key:randomUUID(),revision:pendingRow.revision,outcome:'accepted',reason:'Expired authority'},recipient.cookie)).status,403)
 pendingRow=(await state()).data.milestones.find(r=>r.id===pending.id)
 const authorizer=await h.invite('synthetic-gauge-7307','owner')
 await cmd('milestone:release-review',{...pendingRow,contact:'synthetic-gauge-7302@example.test',description:'Exact pending delivery for the other recipient',reason:'Owner authority must remain live'},authorizer.cookie)
 pendingRow=(await state()).data.milestones.find(r=>r.id===pending.id);const liveReview=pendingRow.value.delivery.clientReviews.at(-1),livePath=`/api/gauge/client-milestones/${pending.id}/${liveReview.id}`
 assert.equal((await request(livePath,otherRecipient.cookie)).status,200)
 assert.equal((await h.post('/auth/operator/status',{operatorId:authorizer.id,status:'inactive'},h.owner)).status,200)
 assert.equal((await request(livePath,otherRecipient.cookie)).status,403,'Losing the authorizing owner immediately fences client review')
 pendingRow=(await state()).data.milestones.find(r=>r.id===pending.id)
 const staffRelease=await cmd('milestone:release-review',{...pendingRow,contact:'synthetic-gauge-7301@example.test',description:'Only the released customer description',reason:'Do not project later private staff decisions'})
 pendingRow=(await state()).data.milestones.find(r=>r.id===pending.id);const staffReview=pendingRow.value.delivery.clientReviews.at(-1),staffPath=`/api/gauge/client-milestones/${pending.id}/${staffReview.id}`
 await cmd('milestone:decision',{...staffRelease,deliveryId:staffReview.deliveryId,outcome:'accepted',contact:'Internal staff contact',date:'2020-01-03',reason:'Private staff rationale must remain internal'},manager.cookie)
 const staffDocument=await(await request(staffPath,recipient.cookie)).json()
 assert.equal(staffDocument.description,'Only the released customer description');assert.equal(staffDocument.decision,null)
 assert(!JSON.stringify(staffDocument).includes('Private staff'));assert(!JSON.stringify(staffDocument).includes('Internal staff contact'))
 const staffCurrent=(await state()).data.milestones.find(r=>r.id===pending.id)
 assert.equal((await post(staffPath,{key:randomUUID(),revision:staffCurrent.revision,outcome:'accepted',reason:'Cannot relabel staff evidence as client confirmation'},recipient.cookie)).status,409)
 assert(!staffCurrent.value.delivery.decisions.at(-1).confirmedByClient)
 const audit=await(await rawRequest(`/api/gauge/audit?recordId=${milestone.id}&action=milestone:review-access`,h.owner)).json()
 const expected=attempts.filter(a=>a.path.startsWith(`/api/gauge/client-milestones/${milestone.id}/`))
 assert.equal(audit.entries.length,expected.length,'Every successful or refused review access appears in the owner audit')
 for(const status of [200,400,401,403,409])assert.equal(audit.entries.filter(e=>e.result.status===status).length,expected.filter(a=>a.status===status).length)
 assert(audit.entries.some(e=>e.result.status===200&&e.result.method==='GET'))
 assert(audit.entries.some(e=>e.result.status===403))
 assert(audit.entries.some(e=>e.result.method==='POST'))
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try {
  await context.addCookies(h.owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000})
   await page.goto(`${h.origin}/app/engagements?edit=${engagement.id}`)
   await page.getByRole('link',{name:'Client review access audit'}).first().click()
   // Select this exact released milestone, rather than the first project milestone.
   await page.goto(`${h.origin}/app/audit?recordId=${milestone.id}&action=milestone%3Areview-access`)
   assert.match(await page.locator('main').innerText(),/milestone:review-access/)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Access audit fits ${width}`)
   if(process.env.GAUGE_DELIVERY_SHOTS)await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-access-audit-${width}.png`,fullPage:true})
  }
 }finally{await context.close()}
 const ownerContext=await browser.newContext({ignoreHTTPSErrors:true}),ownerPage=await ownerContext.newPage()
 try{
  await ownerContext.addCookies(h.owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]){
   const fresh=await cmd('milestone:deliver',{...await cmd('save:milestones',{engagementId:engagement.id,name:`Owner form review ${width}`,due:'2020-01-03',amountMinor:0}),date:'2020-01-02',reason:'Private delivery notes'})
   await ownerPage.setViewportSize({width,height:1000});await ownerPage.goto(`${h.origin}/app/engagements?edit=${engagement.id}`)
   const release=ownerPage.locator('form').filter({has:ownerPage.locator('[name=action][value="milestone:release-review"]')}).filter({has:ownerPage.locator(`[name=id][value="${fresh.id}"]`)})
   await release.getByLabel('Confirmed recipient email',{exact:true}).fill('synthetic-gauge-7301@example.test')
   await release.getByLabel('Client delivery description',{exact:true}).fill('Customer description from the owner form')
   await release.getByLabel('Client review authorization reason',{exact:true}).fill('Explicit exact release')
   assert(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
   if(process.env.GAUGE_DELIVERY_SHOTS)await ownerPage.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/owner-release-${width}.png`,fullPage:true})
   await h.deliveryAudit.form(release,h.owner,()=>release.getByRole('button',{name:'Release client review',exact:true}).click())
   assert.equal(await ownerPage.getByLabel('Review key (shown once)',{exact:true}).count(),1)
   if(process.env.GAUGE_DELIVERY_SHOTS)await ownerPage.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/owner-release-saved-${width}.png`,fullPage:true,mask:[ownerPage.getByLabel('Review key (shown once)',{exact:true})]})
   const token=await ownerPage.getByLabel('Review key (shown once)',{exact:true}).inputValue()
   const released=(await state()).data.milestones.find(r=>r.id===fresh.id),ownerReview=released.value.delivery.clientReviews.at(-1),reviewPath=`/api/gauge/client-milestones/${fresh.id}/${ownerReview.id}`
   tokens.set(reviewPath,token)
   assert.equal((await request(reviewPath,recipient.cookie)).status,200)
   await browserDecision(reviewPath,recipient.cookie,{key:randomUUID(),revision:released.revision,outcome:'accepted',reason:`Exact form acceptance at ${width}`},[width])
   await ownerPage.goto(`${h.origin}/app/engagements?edit=${engagement.id}`)
   const revoke=ownerPage.locator('form').filter({has:ownerPage.locator('[name=action][value="milestone:revoke-review"]')}).filter({has:ownerPage.locator(`[name=reviewId][value="${ownerReview.id}"]`)})
   await revoke.getByLabel('Revocation reason',{exact:true}).fill('Owner withdraws exact delivery access')
   await revoke.scrollIntoViewIfNeeded()
   if(process.env.GAUGE_DELIVERY_SHOTS)await ownerPage.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/owner-revocation-form-${width}.png`})
   await h.deliveryAudit.form(revoke,h.owner,()=>revoke.getByRole('button',{name:'Revoke client review',exact:true}).click())
   assert.equal((await request(reviewPath,recipient.cookie)).status,403,`Owner revocation form fences access at ${width}`)
   assert(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
   if(process.env.GAUGE_DELIVERY_SHOTS)await ownerPage.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/owner-revoked-${width}.png`,fullPage:true})
  }
 }finally{await ownerContext.close()}
 // Every mutable delivery input revokes both accepted billing eligibility and review access.
 let draft=await cmd('save:milestones',{engagementId:engagement.id,name:'Mutable draft delivery',due:'2020-01-03',amountMinor:0})
 const draftCurrent=async()=>(await state()).data.milestones.find(r=>r.id===draft.id)
 for(const edit of ['dependency','commercial']){
  draft=await cmd('milestone:deliver',{...await draftCurrent(),date:'2020-01-02',reason:'Exact draft delivered before edit'})
  draft=await cmd('milestone:release-review',{...draft,contact:'synthetic-gauge-7302@example.test',description:'Only this draft delivery',reason:'Review mutable draft'})
  let before=await draftCurrent(),r=before.value.delivery.clientReviews.at(-1),p=`/api/gauge/client-milestones/${draft.id}/${r.id}`
  assert.equal((await request(p,otherRecipient.cookie)).status,200)
  assert.equal((await post(p,{key:randomUUID(),revision:before.revision,outcome:'accepted',reason:`Accept before ${edit} edit`},otherRecipient.cookie)).status,200)
  before=await draftCurrent()
  const decision=structuredClone(before.value.delivery.decisions.at(-1)),snapshot=structuredClone(before.value.delivery.deliveries.at(-1))
  if(edit==='dependency')await cmd('milestone:dependency',{...before,name:'New client asset',contact:'Sponsor',due:'2020-01-04',status:'pending',reason:'Changed dated dependency'},manager.cookie)
  else await cmd('save:milestones',{...before.value,...before,amountMinor:1})
  const after=await draftCurrent()
  assert.equal(after.value.delivery.currentDeliveryId,null,`${edit} edit invalidates acceptance`)
  assert.deepEqual(after.value.delivery.decisions.at(-1),decision);assert.deepEqual(after.value.delivery.deliveries.at(-1),snapshot)
  assert.equal((await request(p,otherRecipient.cookie)).status,403,`${edit} edit invalidates review access`)
  assert.equal((await post(p,{key:randomUUID(),revision:after.revision,outcome:'accepted',reason:'Old delivery after edit'},otherRecipient.cookie)).status,403)
 }
 draft=await cmd('milestone:deliver',{...await draftCurrent(),date:'2020-01-02',reason:'Fresh draft for recipient authority check'})
 draft=await cmd('milestone:release-review',{...draft,contact:'synthetic-gauge-7302@example.test',description:'Recipient must remain external',reason:'Owner authorizes external review'})
 const bound=await draftCurrent(),boundReview=bound.value.delivery.clientReviews.at(-1),boundPath=`/api/gauge/client-milestones/${draft.id}/${boundReview.id}`
 assert.equal((await request(boundPath,otherRecipient.cookie)).status,200)
 await cmd('grant',{operatorId:otherRecipient.id,personId:worker.id,role:'staff',enabled:true})
 assert.equal((await request(boundPath,otherRecipient.cookie)).status,403,'A later internal grant immediately refuses the recipient')
 assert.equal((await post(boundPath,{key:randomUUID(),revision:bound.revision,outcome:'accepted',reason:'Internal recipient cannot decide'},otherRecipient.cookie)).status,403)
 await clientPortalJourney(h,browser,{lead,worker,manager,staff,financePerson})
 console.log('PASS DELIVERY-005 / DELIVERY-012 direct API: exact recipient, private projection, rejection issue, resolution, acceptance, stale, revoked and expired authority, replay and separate finance gates')
}

export async function clientPortalJourney(h,browser,{lead,worker,manager,staff,financePerson}) {
 const {state,request}=h
 const allMoney=Object.fromEntries(['shareBudget','shareBurn','shareRemaining','shareValue','shareFields'].map(k=>[k,'yes'])),noMoney=Object.fromEntries(Object.keys(allMoney).map(k=>[k,'no']))
 const cmd=async(action,input={},cookie=h.owner,expected=200)=>{
  const key=input.key??randomUUID(),before=h.providerRequests.length,result=await h.cmd(action,{...input,key},cookie,expected)
  if(action.startsWith('client:')){
   assert.equal(h.providerRequests.length,before,'Client invitation, renewal, sharing and revocation send nothing')
   if(expected===200){
    const entries=(await h.db.prepare('SELECT actor,request_key,action,kind,record_id,data FROM g_audit WHERE request_key=?').bind(key).all()).results
    assert.equal(entries.length,1,'Each successful client command records exactly one complete business audit entry')
    const entry=entries[0],session=await(await request('/auth/session',cookie)).json(),data=JSON.parse(entry.data)
    assert.equal(entry.actor,session.operator.id);assert.equal(entry.request_key,key);assert.equal(entry.action,action);assert.equal(entry.kind,'engagements')
    assert.equal(data.id,result.id);assert.equal(data.revision,result.revision);assert.equal(data.reason,input.reason)
    if(action==='client:invite-project'){assert.equal(entry.record_id,input.engagementId);assert.equal(data.contact,input.contact.toLowerCase());assert.equal(data.shareMoney,false)}
    if(action==='client:invite-project'||action==='client:renew-project')assert.equal(data.expiresAt,(await h.db.prepare('SELECT expires_at FROM g_client_portal_authority WHERE id=?').bind(result.id).first()).expires_at)
    if(action==='client:share-money')assert.deepEqual(Object.fromEntries(Object.keys(allMoney).map(k=>[k,data[k]])),Object.fromEntries(Object.keys(allMoney).map(k=>[k,input[k]==='yes'])))
   }
  }
  return result
 }
 const alice=await h.invite('synthetic-gauge-91401'),bob=await h.invite('synthetic-gauge-91402')
 const signInAlice=async()=>{
  assert.equal((await h.post('/auth/magic-link',{email:'synthetic-gauge-91401@example.test'})).status,202)
  const link=new URL(h.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]),response=await h.post('/auth/confirm',{token:link.searchParams.get('token')})
  assert.equal(response.status,303)
  alice.cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
 }
 const make=async(name)=>{const c=await cmd('save:clients',{name});return cmd('save:engagements',{name,clientId:c.id,leadId:lead.id,members:[worker.id],scope:'Agreed design deliverables',timezone:'UTC'})}
 const project=await make('synthetic-gauge-91403'),other=await make('synthetic-gauge-91404')
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:other.id,mode:'hourly',amountMinor:800000,effortSeconds:144000,roundingSeconds:60,reason:'Other sponsor budget'}))
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:500000,effortSeconds:144000,roundingSeconds:60,reason:'Agreed budget'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Design deliverable',remainingSeconds:3600})
 const invite={engagementId:project.id,contact:'synthetic-gauge-91401@example.test',reason:'Sponsor project access',days:7}
 for(const cookie of [manager.cookie,staff.cookie,financePerson.cookie,alice.cookie])await cmd('client:invite-project',invite,cookie,403)
 await cmd('client:invite-project',{...invite,contact:'delivery-worker@example.test'},h.owner,409)
 assert.equal((await h.post('/auth/invite',{email:'synthetic-gauge-unconfirmed@example.test',displayName:'Unconfirmed recipient'},h.owner)).status,202)
 await cmd('client:invite-project',{...invite,contact:'synthetic-gauge-unconfirmed@example.test'},h.owner,409)
 for(const days of [0,31])await cmd('client:invite-project',{...invite,days},h.owner,400)
 for(const months of [0,13])await cmd('client:invite-project',{...invite,days:undefined,months},h.owner,400)
 let grant=await cmd('client:invite-project',{...invite,days:undefined,months:12})
 const longGrant=await h.db.prepare('SELECT expires_at FROM g_client_portal_authority WHERE id=?').bind(grant.id).first()
 assert(longGrant.expires_at>Date.now()+360*86400000&&longGrant.expires_at<=Date.now()+366*86400000,'Twelve calendar months, including leap years')
 await cmd('client:renew-project',{...grant,months:12,reason:'Only owner renewal'},financePerson.cookie,403)
 await h.db.prepare('UPDATE g_client_portal_authority SET expires_at=0 WHERE id=?').bind(grant.id).run()
 grant=await cmd('client:renew-project',{...grant,months:12,reason:'Continue standing sponsor relationship'})
 const renewedExpiry=await h.db.prepare('SELECT expires_at FROM g_client_portal_authority WHERE id=?').bind(grant.id).first()
 assert(renewedExpiry.expires_at>Date.now()+360*86400000&&renewedExpiry.expires_at<=Date.now()+366*86400000,'Renewal replaces expired access with twelve calendar months')

 const replacement=await cmd('client:invite-project',invite)
 await cmd('client:revoke-project',{...grant,reason:'An older invitation cannot alter its replacement'},h.owner,409)
 grant=replacement
 await cmd('client:invite-project',{...invite,engagementId:other.id,contact:'synthetic-gauge-91402@example.test'})
 for(const cookie of [manager.cookie,staff.cookie,alice.cookie])await cmd('client:share-money',{...grant,...allMoney,reason:'Refuse non-finance monetary publication'},cookie,403)
 const path=`/api/gauge/client-projects/${project.id}`
 const read=async(cookie=alice.cookie)=>{const response=await request(path,cookie);assert.equal(response.status,200,await response.clone().text());return response.json()}
 assert.deepEqual((await read()).budgets,[],'No monetary exposure on issuance');assert.equal((await read()).burn,null)
 assert.equal((await read()).scope,'Agreed design deliverables');assert.deepEqual((await read()).tasks.map(t=>[t.id,t.name,t.status]),[[task.id,'Design deliverable','todo']])
 for(const cookie of [bob.cookie,staff.cookie,h.owner])assert.equal((await request(path,cookie)).status,403)
 assert.equal((await request(`/api/gauge/client-projects/${other.id}`,alice.cookie)).status,403)
 assert.equal((await request(`/app/client-projects/${other.id}`,alice.cookie)).status,403)
 for(const door of ['/api/gauge/state','/app/rates',`/api/gauge/history/engagements/${project.id}`,'/api/gauge/rates/explain'])assert.equal((await request(door,alice.cookie)).status,403)
 const field=async(scope,name,visibility='everyone',type='text')=>cmd('field:define',{scope,name,type,visibility,...(type==='currency'?{currency:'USD'}:{}),reason:'Explicit field visibility'})
 const publicField=await field('engagements','Client progress'),privateField=await field('engagements','Private commercial strategy','finance-only'),narrowed=await field('engagements','Restricted after publication'),historical=await field('engagements','Historical private value','finance-only'),currencyField=await field('engagements','Selected contract amount','everyone','currency'),taskField=await field('tasks','Client task action'),clientField=await field('clients','Client reference')
 const leadField=await field('engagements','Lead-only delivery strategy','lead-finance'),savedLeadField=await field('engagements','Previously lead-only strategy','lead-finance')
 const yen=await cmd('field:define',{scope:'engagements',name:'Yen allowance',type:'currency',currency:'JPY',visibility:'everyone',reason:'Explicit currency field'}),dinar=await cmd('field:define',{scope:'engagements',name:'Dinar allowance',type:'currency',currency:'BHD',visibility:'everyone',reason:'Explicit currency field'})
 const setFields=async(scope,id,values)=>{const row=(await state()).data[scope].find(r=>r.id===id);return cmd('field:values',{scope,id,revision:row.revision,customFields:values})}
 await setFields('engagements',project.id,{[leadField.id]:'Current lead secret',[savedLeadField.id]:'Saved lead secret',[publicField.id]:'Ready for client',[privateField.id]:'Never share strategy',[narrowed.id]:'Withdrawn publication',[historical.id]:'Originally private',[currencyField.id]:678900,[yen.id]:1234,[dinar.id]:1234})
 await setFields('tasks',task.id,{[taskField.id]:'Approve design'});await setFields('clients',(await state()).data.engagements.find(r=>r.id===project.id).value.clientId,{[clientField.id]:'Sponsor reference'})
 await cmd('field:define',{...narrowed,visibility:'finance-only',reason:'Narrow current policy'})
 const broadened=await cmd('field:define',{...historical,visibility:'everyone',reason:'Broaden definition without publishing old value'})
 await cmd('field:define',{...savedLeadField,visibility:'everyone',reason:'Broaden without publishing saved lead-only value'})
 const flatFields=d=>d.customFields.flatMap(r=>r.fields)
 assert.deepEqual(flatFields(await read()).map(f=>f.id).sort(),[publicField.id,taskField.id,clientField.id].sort(),'Only current and original public values; currency also needs finance sharing')
 assert(!JSON.stringify(await read()).includes('Originally private'))
 assert(!JSON.stringify(await read()).includes('Current lead secret'),'Current lead-and-finance visibility excludes recipients')
 assert(!JSON.stringify(await read()).includes('Saved lead secret'),'Saved lead-and-finance visibility excludes recipients after broadening')
 await setFields('engagements',project.id,{[historical.id]:'Explicitly published value'})
 const budgetOnly=await cmd('client:share-money',{...grant,...noMoney,shareBudget:'yes',reason:'Share only approved budget'},financePerson.cookie)
 assert.equal((await read()).budgets[0].amountMinor,500000);assert.equal((await read()).burn,null);assert.deepEqual((await read()).remainingBudgets,[])
 const otherResponse=await request(`/api/gauge/client-projects/${other.id}`,bob.cookie);assert.equal(otherResponse.status,200);const otherDocument=await otherResponse.json();assert.deepEqual(otherDocument.budgets,[]);assert.equal(otherDocument.burn,null);assert.deepEqual(otherDocument.remainingBudgets,[])
 const projects=async cookie=>{const response=await request('/api/gauge/client-projects',cookie);assert.equal(response.status,200);return (await response.json()).projects}
 assert.equal((await request('/app',alice.cookie)).headers.get('location'),'/app/client-projects')
 assert.deepEqual((await projects(alice.cookie)).map(p=>p.id),[project.id]);assert.deepEqual((await projects(bob.cookie)).map(p=>p.id),[other.id])
 const shared=await cmd('client:share-money',{...budgetOnly,...allMoney,reason:'Finance authorizes sponsor budget'},financePerson.cookie)
 assert.equal((await read()).budgets[0].amountMinor,500000)
 await cmd('client:share-money',{...grant,...noMoney,reason:'Stale existing invitation sharing'},financePerson.cookie,409)
 await cmd('client:renew-project',{...grant,months:12,reason:'Stale existing invitation renewal'},h.owner,409)
 const terms={name:'Client hour statement',frequency:'monthly',unit:'hours',allowance:144000,services:['Design'],consumes:'billable',proration:'calendar',start:'2026-10-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:28800,carryPeriods:1,deficit:false,overage:'bill',overageRate:12000}}
 const preview=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms})
 const retainer=await cmd('retainer:approve',{...preview.input,fingerprint:preview.fingerprint,reason:'Agreed retainer'})
 await cmd('save:rates',{personId:worker.id,service:'Design',effective:'2020-01-01',costMinor:12347,billMinor:23457})
 const time=async(start,end)=>cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Design',timezone:'UTC',start,end,notes:'Private internal time detail',billable:true},staff.cookie)
 let approved=await time('2026-10-06T09:00:00Z','2026-10-06T10:30:00Z');approved=await cmd('time:submit',approved,staff.cookie);await cmd('time:approve',approved,manager.cookie)
 const before=await read(),period=(await state()).data.retainerPeriods.find(p=>p.value.retainerId===retainer.id)
 await time('2026-10-06T10:30:00Z','2026-10-06T12:30:00Z')
 const document=await read(),managerStatement=(await state(manager.cookie)).retainerBalances.find(b=>b.periodId===period.id),statement=document.statements.find(b=>b.periodId===period.id)
 for(const key of ['opening','rollover','deficitOpening','allowance','consumed','pending','pendingSeconds','projectedRemaining','adjustments','projectedAdjustments','remaining','provisional'])assert.deepEqual(statement[key],managerStatement[key],key)
 assert.equal(statement.consumed,before.statements.find(b=>b.periodId===period.id).consumed)
 assert.equal(statement.consumed,5400);assert.equal(statement.remaining,138600);assert.equal(statement.projectedRemaining,131400);assert.equal(statement.pending,7200);assert.equal(statement.sources.find(s=>s.id===approved.id).status,'approved');assert.equal(statement.rules[0].id,retainer.id)
 // Open several saved periods with independent nonzero FIFO and linked correction controls.
 const richTerms={...terms,name:'Rollover and linked corrections',services:['Portal rollover'],start:'2026-07-01',allowance:14400,rules:{...terms.rules,carryCap:7200}}
 const richPreview=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:richTerms,from:'2026-07-01',to:'2026-10-31'})
 const rich=await cmd('retainer:approve',{...richPreview.input,fingerprint:richPreview.fingerprint,reason:'Reviewed client statement rules'})
 const report=async()=>{const r=await request('/api/gauge/state?from=2026-07-01&to=2026-10-31',manager.cookie);assert.equal(r.status,200);return r.json()}
 const periods=(await report()).data.retainerPeriods.filter(p=>p.value.retainerId===rich.id).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart)),[july,august]=periods
 await cmd('retainer:close',{...july,reason:'Completed July allowance'})
 const adjustment=await cmd('retainer:adjust-prepare',{...july,kind:'renewal',quantity:18000,amountMinor:0,reason:'Agreed extra allowance'})
 const augustStatement=async()=> (await read()).statements.find(b=>b.periodId===august.id)
 assert.equal((await augustStatement()).rollover,7200);assert.equal((await augustStatement()).projectedAdjustments,3600);assert.equal((await augustStatement()).adjustments,0)
 await cmd('retainer:adjust-approve',adjustment)
 assert.equal((await augustStatement()).opening,25200);assert.equal((await augustStatement()).adjustments,3600);assert.equal((await augustStatement()).remaining,25200)
 const linked=(await augustStatement()).linkedAdjustments;assert.equal(linked.length,1);assert.equal(linked[0].id,adjustment.id);assert.equal(linked[0].originPeriodId,july.id);assert.equal(linked[0].ruleRevision,rich.revision)
 await cmd('save:rates',{personId:worker.id,service:'Portal rollover',effective:'2020-01-01',costMinor:12347,billMinor:19000})
 let late=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Portal rollover',timezone:'UTC',start:'2026-07-06T09:00:00Z',end:'2026-07-06T10:00:00Z',notes:'Private late work note',billable:true},staff.cookie)
 late=await cmd('time:submit',late,staff.cookie);late=await cmd('time:approve',late,manager.cookie)
 const lateAdjustment=await cmd('retainer:adjust-prepare',{...july,kind:'late',sourceId:late.id,reason:'Late approved July work'})
 assert.equal((await augustStatement()).consumed,0,'Prepared late work changes only the projection')
 assert.equal((await augustStatement()).projectedRemaining,21600)
 await cmd('retainer:adjust-approve',lateAdjustment)
 assert.equal((await augustStatement()).consumed,3600);assert.equal((await augustStatement()).remaining,21600)
 const lateLink=(await augustStatement()).linkedAdjustments.find(a=>a.id===lateAdjustment.id)
 assert.deepEqual((await augustStatement()).linkedAdjustments.map(a=>a.id).sort(),[adjustment.id,lateAdjustment.id].sort(),'Both approved linked adjustments remain visible')
 assert.equal(lateLink.sourceId,late.id);assert.equal(lateLink.sourceRevision,late.revision);assert.equal(lateLink.ruleId,rich.id);assert.equal(lateLink.ruleRevision,rich.revision)
 const valuePreview=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:{...richTerms,name:'Selected value statement',unit:'value',allowance:100000,services:['Portal value'],rules:{...richTerms.rules,carryCap:20000}} ,from:'2026-07-01',to:'2026-10-31'})
 const valueRetainer=await cmd('retainer:approve',{...valuePreview.input,fingerprint:valuePreview.fingerprint,reason:'Agreed monetary allowance'})
 await cmd('save:rates',{personId:worker.id,service:'Portal value',effective:'2020-01-01',costMinor:12347,billMinor:25000})
 const valueTime=async(start,end)=>cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Portal value',timezone:'UTC',start,end,notes:'Private value source note',billable:true},staff.cookie)
 let valueApproved=await valueTime('2026-08-06T09:00:00Z','2026-08-06T10:00:00Z');valueApproved=await cmd('time:submit',valueApproved,staff.cookie);valueApproved=await cmd('time:approve',valueApproved,manager.cookie)
 await valueTime('2026-08-06T10:00:00Z','2026-08-06T11:00:00Z')
 const richDocument=await read(),managerReport=await report(),managerBalances=managerReport.retainerBalances
 assert.deepEqual(richDocument.statements.map(b=>b.periodId).sort(),managerReport.data.retainerPeriods.filter(p=>p.value.engagementId===project.id).map(p=>p.id).sort(),'The client receives the complete permitted statement period set')
 for(const b of richDocument.statements)for(const key of ['opening','rollover','allowance','consumed','pending','pendingSeconds','adjustments','projectedAdjustments','remaining','projectedRemaining'])assert.deepEqual(b[key],managerBalances.find(m=>m.periodId===b.periodId)[key],`${b.periodId} ${key}`)
 const valuePeriod=(await report()).data.retainerPeriods.find(p=>p.value.retainerId===valueRetainer.id&&p.value.periodStart==='2026-08-01'),valueStatement=richDocument.statements.find(b=>b.periodId===valuePeriod.id)
 assert.equal(valueStatement.rollover,20000);assert.equal(valueStatement.opening,120000);assert.equal(valueStatement.consumed,25000);assert.equal(valueStatement.remaining,95000);assert.equal(valueStatement.pending,null);assert.equal(valueStatement.pendingSeconds,3600);assert.equal(valueStatement.projectedRemaining,null)
 assert.equal(valueStatement.sources.find(t=>t.id===valueApproved.id).revision,valueApproved.revision)
 assert.deepEqual(richDocument.burn,{approvedSeconds:12600,pendingSeconds:10800,hourlyValueMinor:79186,knownHourlyValueMinor:79186,unknownHourlyValues:0,currency:'USD'})
 assert.deepEqual(richDocument.remainingBudgets,[{id:richDocument.budgets[0].id,currency:'USD',amountMinor:420814}])
 // A change order replaces the current budget; earlier approved terms are history.
 const priorBudget=richDocument.budgets[0]
 const change=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:800000,effortSeconds:144000,roundingSeconds:60,reason:'Approved expanded scope'})
 await cmd('budget:approve',change)
 const changed=await read()
 assert.deepEqual(changed.budgets.map(b=>[b.id,b.amountMinor]),[[change.id,800000]],'Only current approved terms are shared as the budget')
 assert.deepEqual(changed.remainingBudgets,[{id:change.id,currency:'USD',amountMinor:720814}],'Remaining budget deducts burn from current terms once')
 assert.deepEqual(changed.budgetHistory,[priorBudget],'Superseded approved terms remain labelled history')

 assert.deepEqual(flatFields(richDocument).map(f=>[f.id,f.value]).sort(),[[publicField.id,'Ready for client'],[historical.id,'Explicitly published value'],[currencyField.id,678900],[yen.id,1234],[dinar.id,1234],[taskField.id,'Approve design'],[clientField.id,'Sponsor reference']].sort())
 assert.equal(flatFields(richDocument).find(f=>f.id===historical.id).valueRevision,broadened.revision)
 let unknown=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'synthetic-gauge-unpriced',timezone:'UTC',start:'2026-09-06T09:00:00Z',end:'2026-09-06T10:00:00Z',notes:'Private unpriced work',billable:true},staff.cookie)
 unknown=await cmd('time:submit',unknown,staff.cookie);await cmd('time:approve',unknown,manager.cookie)
 assert.deepEqual((await read()).burn,{approvedSeconds:16200,pendingSeconds:10800,hourlyValueMinor:null,knownHourlyValueMinor:79186,unknownHourlyValues:1,currency:'USD'},'An unpriced approval is unknown, never zero')
 assert.equal((await read()).remainingBudgets[0].amountMinor,null,'Remaining budget preserves unknown approved value')
 assert(!/"(?:costMinor|billMinor|billRateMinor|overageRate|economics|notes|personId)":/.test(JSON.stringify(await read())),'Closed projection excludes private economics and staff details')
 const hidden=await cmd('client:share-money',{...shared,...noMoney,reason:'Finance withdraws monetary sharing'},financePerson.cookie)
 assert.equal((await read()).burn,null);assert.deepEqual((await read()).budgets,[]);assert(!(await read()).statements.some(b=>b.unit==='value'));assert(!flatFields(await read()).some(f=>f.id===currencyField.id))
 let selected=hidden
 for(const detail of ['shareBudget','shareBurn','shareRemaining','shareValue','shareFields']){
  selected=await cmd('client:share-money',{...selected,...noMoney,[detail]:'yes',reason:`Selected detail ${detail}`},financePerson.cookie)
  const projection=await read()
  assert.equal(projection.budgets.length,detail==='shareBudget'?1:0)
  assert.equal(projection.budgetHistory.length,detail==='shareBudget'?1:0,'Historical money follows explicit budget sharing')
  assert.equal(projection.burn!==null,detail==='shareBurn')
  assert.equal(projection.remainingBudgets.length,detail==='shareRemaining'?1:0)
  assert.equal(projection.statements.some(b=>b.unit==='value'),detail==='shareValue')
  assert.equal(flatFields(projection).some(f=>f.id===currencyField.id),detail==='shareFields')
  const entry=await h.db.prepare("SELECT data FROM g_audit WHERE action='client:share-money' ORDER BY seq DESC LIMIT 1").first(),choice=JSON.parse(entry.data)
  assert.equal(choice.reason,`Selected detail ${detail}`)
  assert.deepEqual(Object.fromEntries(Object.keys(allMoney).map(k=>[k,choice[k]])),Object.fromEntries(Object.keys(allMoney).map(k=>[k,k===detail])))
 }
 const reshared=await cmd('client:share-money',{...selected,...allMoney,reason:'Finance reauthorizes selected figures'},financePerson.cookie)
 const leaves=[];(function walk(v){if(v&&typeof v==='object')Object.values(v).forEach(walk);else leaves.push(String(v))})(document)
 for(const privateValue of ['Private internal time detail','12347','23457'])assert(!leaves.some(v=>v===privateValue),'Private staff economics and notes excluded')
 // A portal recipient opens and decides an exact released delivery without its review key.
 const reviewProject=await make('synthetic-gauge-portal-handover')
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:reviewProject.id,mode:'fixed',amountMinor:10000,effortSeconds:3600,roundingSeconds:60,reason:'Exact fixed handover'}))
 const reviewInvitation=await cmd('client:invite-project',{...invite,engagementId:reviewProject.id,months:12,days:undefined})
 let portalMilestone=await cmd('save:milestones',{engagementId:reviewProject.id,name:'Portal handover',due:'2026-10-01',amountMinor:10000})
 portalMilestone=await cmd('milestone:approve',portalMilestone)
 portalMilestone=await cmd('milestone:deliver',{...portalMilestone,date:'2026-10-01',reason:'Exact portal handover delivered'},manager.cookie)
 portalMilestone=await cmd('milestone:release-review',{...portalMilestone,contact:invite.contact,days:7,description:'Review the delivered design',reason:'Release to project sponsor'})
 const portalReview=(await state()).data.milestones.find(m=>m.id===portalMilestone.id).value.delivery.clientReviews.at(-1)
 const reviewPath=`/api/gauge/client-milestones/${portalMilestone.id}/${portalReview.id}`
 assert.equal((await request(reviewPath,bob.cookie)).status,403)
 assert.equal((await request(reviewPath,alice.cookie)).status,200,'Current project access opens the exact released review without a key')
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try{
  const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))}
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await login(alice.cookie)
   await page.goto(`${h.origin}/app/client-projects/${project.id}`)
   if(width===1440){assert.match(await page.locator('main').innerText(),/Shared budget/);assert.match(await page.locator('main').innerText(),/Earlier approved budgets/);await page.getByText('Earlier approved budgets',{exact:true}).click();assert.match(await page.locator('main').innerText(),/Superseded · \$5,000\.00/);assert.match(await page.locator('main').innerText(),/Approved burn/);assert.match(await page.locator('main').innerText(),/Approved hourly work value Unknown/);assert.match(await page.locator('main').innerText(),/2026-08-01 to 2026-08-31/);assert.match(await page.locator('main').innerText(),/Explicitly published value/);assert.match(await page.locator('main').innerText(),/Yen allowance · ¥1,234/);assert.match(await page.locator('main').innerText(),/Dinar allowance · BHD\s*1\.234/);assert.match(await page.locator('main').innerText(),/Selected value statement/);assert.match(await page.locator('main').innerText(),/Provisional pending Unknown/);assert.match(await page.locator('main').innerText(),/Provisional pending 2\s+h/)}
   for(const control of await page.getByText('Sources and rule versions',{exact:true}).all())await control.click()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Client project fits ${width}`)
   if(width===1440)assert((await page.locator('main').boundingBox()).width>800,'Desktop portal uses the workspace content column')
   if(process.env.GAUGE_DELIVERY_SHOTS)await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-project-${width}.png`,fullPage:true})
   await page.goto(`${h.origin}/app/client-projects`)
   if(width===1440){assert.deepEqual((await page.locator('main a').allTextContents()).sort(),['synthetic-gauge-91403','synthetic-gauge-portal-handover'].sort())}
   if(process.env.GAUGE_DELIVERY_SHOTS)await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-project-list-${width}.png`,fullPage:true})
   await page.goto(`${h.origin}/app/client-projects/${reviewProject.id}`)
   if(width===1440)assert.equal(await page.getByRole('link',{name:'Review Portal handover',exact:false}).count(),1,'Exactly one released delivery opens from its invited project')
   await page.getByRole('link',{name:'Review Portal handover',exact:false}).click()
   if(width===1440){await page.getByLabel('Your decision').selectOption('rejected');await page.getByLabel('Decision reason').fill('Please finish the final illustration');await page.getByRole('button',{name:'Submit decision',exact:true}).click()}
   if(width===1440){assert.match(await page.locator('main').innerText(),/Response saved: rejected/)}
   if(process.env.GAUGE_DELIVERY_SHOTS)await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-portal-decision-${width}.png`,fullPage:true})
   await login(h.owner);await page.goto(`${h.origin}/app/engagements?edit=${project.id}`)
   if(width===1440){assert.equal(await page.getByRole('button',{name:'Invite to project',exact:true}).count(),1)}
   if(width===1440){const navigation=page.locator('nav .g-menu a').first();await navigation.focus();assert.equal(await navigation.evaluate(el=>getComputedStyle(el,'::after').opacity),'1','Navigation tooltip appears on keyboard focus');assert((await navigation.getAttribute('data-tooltip')).split(' ').length>=2)}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Client access controls fit ${width}`)
   if(process.env.GAUGE_DELIVERY_SHOTS)await page.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-project-access-${width}.png`,fullPage:true})
  }
 }finally{await context.close()}
 const decided=(await state()).data.milestones.find(m=>m.id===portalMilestone.id)
 assert.equal(decided.value.delivery.decisions.at(-1).reason,'Please finish the final illustration');assert.equal(decided.value.delivery.decisions.at(-1).confirmedByClient,true)
 assert.equal(decided.value.delivery.issues.at(-1).reason,'Please finish the final illustration')
 await cmd('milestone:authorize',decided,alice.cookie,403)
 const rejection=structuredClone(decided.value.delivery.deliveries[0]),issue=decided.value.delivery.issues.at(-1)
 let resolved=await cmd('milestone:issue',{...decided,itemId:issue.id,name:issue.name,ownerId:lead.id,mitigation:'Final illustration completed',status:'resolved',reason:'Sponsor rejection resolved'},manager.cookie)
 assert.equal((await request(reviewPath,alice.cookie)).status,403,'Changed delivery invalidates its old portal review')
 let deliveredAgain=await cmd('milestone:deliver',{...resolved,date:'2026-10-01',reason:'Completed replacement handover'},manager.cookie)
 deliveredAgain=await cmd('milestone:release-review',{...deliveredAgain,contact:invite.contact,days:7,description:'Final illustration is complete',reason:'Release replacement to current project recipient'})
 const replacementReview=(await state()).data.milestones.find(m=>m.id===portalMilestone.id).value.delivery.clientReviews.at(-1)
 const replacementPath=`/api/gauge/client-milestones/${portalMilestone.id}/${replacementReview.id}`
 const response=await request(replacementPath,alice.cookie);assert.equal(response.status,200);const exact=await response.json()
 const decisionInput={key:randomUUID(),revision:exact.revision,outcome:'accepted',reason:'Final illustration now complete'}
 assert.equal((await h.post(replacementPath,decisionInput,alice.cookie)).status,200)
 const accepted=(await state()).data.milestones.find(m=>m.id===portalMilestone.id)
 assert.deepEqual(accepted.value.delivery.deliveries[0],rejection);assert.equal(accepted.value.delivery.issues.at(-1).status,'resolved')
 assert.deepEqual(accepted.value.delivery.decisions.map(d=>[d.outcome,d.reason]),[['rejected','Please finish the final illustration'],['accepted','Final illustration now complete']])
 assert.equal((await state()).data.packets.filter(p=>p.value.engagementId===reviewProject.id).length,0);assert.equal((await state()).data.invoices.filter(p=>p.value.engagementId===reviewProject.id).length,0)
 await cmd('packet:create',{engagementId:reviewProject.id,title:'Acceptance still requires finance',sources:[`milestones:${portalMilestone.id}`]},financePerson.cookie,409)
 await cmd('milestone:authorize',accepted,financePerson.cookie)
 await cmd('client:revoke-project',{...reviewInvitation,reason:'End project-based review access'})
 assert.equal((await request(replacementPath,alice.cookie)).status,403,'Revoked project access cannot reopen a review without its key')
 assert.equal((await h.post(replacementPath,decisionInput,alice.cookie)).status,403,'Revocation also fences a successful decision replay')

 // Owner changes stop existing project access visibly until a current owner renews it.
 const secondOwner=await h.invite('synthetic-gauge-portal-owner','owner')
 let stopped=await cmd('client:invite-project',invite,secondOwner.cookie)
 assert.equal((await h.post('/auth/operator/status',{operatorId:secondOwner.id,status:'inactive'},h.owner)).status,200)
 assert.equal((await request(path,alice.cookie)).status,403);assert.deepEqual(await projects(alice.cookie),[])
 assert.match(await(await request(`/app/engagements?edit=${project.id}`,h.owner)).text(),/Stopped: releasing owner lost owner authority/)
 assert.equal((await h.post('/auth/operator/status',{operatorId:secondOwner.id,status:'active'},h.owner)).status,200)
 assert.equal((await request(path,alice.cookie)).status,403,'Reactivating a former owner cannot revive an old invitation')
 const ownerContext=await browser.newContext({ignoreHTTPSErrors:true}),ownerPage=await ownerContext.newPage()
 try{
  await ownerContext.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  for(const width of [1440,390]){
   await ownerPage.setViewportSize({width,height:1000});await ownerPage.goto(`${h.origin}/app/engagements?edit=${project.id}`)
   if(width===1440)assert.match(await ownerPage.locator('main').innerText(),/Stopped: releasing owner lost owner authority/)
   if(process.env.GAUGE_DELIVERY_SHOTS)await ownerPage.screenshot({path:`${process.env.GAUGE_DELIVERY_SHOTS}/client-stopped-access-${width}.png`,fullPage:true})
  }
  await ownerPage.setViewportSize({width:1440,height:1000})
  const renewal=ownerPage.locator('form').filter({has:ownerPage.locator('[name=action][value="client:renew-project"]')})
  assert.equal(await renewal.locator('[name=contact]').count(),0,'Renewal selects the existing recipient')
  await renewal.getByLabel('Renewal duration in months').fill('12');await renewal.getByLabel('Client access reason').fill('Current owner renews stopped access')
  const before=h.providerRequests.length;await renewal.getByRole('button',{name:'Renew project access',exact:true}).click();assert.equal(h.providerRequests.length,before)
  const current=await h.db.prepare('SELECT id,revision,owner_id,expires_at FROM g_client_portal_authority WHERE id=?').bind(stopped.id).first()
  assert.equal(current.owner_id,(await(await request('/auth/session',h.owner)).json()).operator.id);assert.notEqual(current.revision,stopped.revision)
  assert(current.expires_at>Date.now()+360*86400000&&current.expires_at<=Date.now()+366*86400000,'Owner renewal grants twelve calendar months after the stop')
  stopped={id:current.id,revision:current.revision}
 }finally{await ownerContext.close()}
 assert.equal((await request(path,alice.cookie)).status,200)
 const audit=(await h.db.prepare("SELECT action,data FROM g_audit WHERE action IN ('client:renew-project','client:share-money')").all()).results
 assert(audit.some(r=>r.action==='client:renew-project'&&JSON.parse(r.data).reason==='Current owner renews stopped access'))
 await cmd('client:share-money',{...grant,...noMoney,reason:'Stale choice'},financePerson.cookie,409)
 await cmd('client:revoke-project',{...stopped,reason:'Recipient no longer authorized'})
 assert.equal((await request(path,alice.cookie)).status,403)
 const liveInvitation=await cmd('client:invite-project',invite)
 await cmd('client:share-money',{...liveInvitation,...allMoney,reason:'Restore must drop currently active permission'},financePerson.cookie)
 const portableDocument=await read()
 const {createPortability,readArchive}=await import('@runeditrun/rer/modules/portability')
 const {portabilityPolicy}=await import('../scripts/installer/portability-policy.mjs')
 const service=await createPortability({db:h.db,policy:portabilityPolicy}),archiveId=await service.exports.create()
 while((await service.exports.advance(archiveId,{maxParts:16})).phase==='building'){}
 const records=[];for await(const record of readArchive(await service.exports.download(archiveId)))records.push(record)
 assert(!records[0].tables.some(t=>t.name==='g_client_portal_authority'),'Project recipient authority never travels in business archives')
 assert(records.filter(r=>r.kind==='part').flatMap(r=>r.items).some(r=>r.table==='g_audit'&&String(r.row.data).includes('Sponsor project access')),'Business consent history remains portable without execution authority')
 await service.exports.abort(archiveId)
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,resolve}=await import('node:path'),{execFileSync}=await import('node:child_process'),{getPlatformProxy}=await import('wrangler'),{harness}=await import('./gauge-harness.mjs')
 const destination=await mkdtemp(join(tmpdir(),'gauge-client-restore-'));let proxy,restored
 try{
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--persist-to',destination,'--config','wrangler.jsonc'],{stdio:'pipe',maxBuffer:8*1024*1024,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}})
  proxy=await getPlatformProxy({configPath:resolve('wrangler.jsonc'),persist:{path:join(destination,'v3')},remoteBindings:false})
  const restore=await createPortability({db:proxy.env.DB,policy:portabilityPolicy}),restoreId=await restore.imports.create(records[0])
  for(const part of records.filter(r=>r.kind==='part'))await restore.imports.uploadPart(restoreId,part.index,part)
  await restore.imports.finalize(restoreId,records.at(-1))
  assert.equal((await proxy.env.DB.prepare('SELECT COUNT(*) n FROM g_client_portal_authority').first()).n,0)
  for(const table of ['g_engagements','g_clients','g_tasks','g_time','g_retainers','g_retainerPeriods','g_retainerCloses','g_retainerAdjustments','g_customFields','g_history','g_audit']){
   const expected=records.filter(r=>r.kind==='part').flatMap(r=>r.items).filter(r=>r.table===table).map(r=>r.row)
   // Archive rows contain writable columns; SQLite regenerates the derived columns.
   const actual=(await proxy.env.DB.prepare(`SELECT * FROM "${table}"`).all()).results.map(row=>Object.fromEntries(Object.keys(expected[0]??{}).map(key=>[key,row[key]])))
   const ordered=rows=>rows.map(r=>JSON.stringify(Object.fromEntries(Object.entries(r).sort()))).sort()
   assert.deepEqual(ordered(actual),ordered(expected),`${table} business history survives restore`)
  }
  const intakeRows=await h.db.prepare('SELECT id,revision,data FROM g_intakeRequests ORDER BY id').all()
  assert(intakeRows.results.length>=2,'Requested and accepted client intake exists before archive')
  assert.deepEqual((await proxy.env.DB.prepare('SELECT id,revision,data FROM g_intakeRequests ORDER BY id').all()).results,intakeRows.results,'Complete intake submissions, decisions, reminders and template origin survive restore')
  const intakeFiles=await h.db.prepare('SELECT id,request_id,submission_id,name,digest,hex(bytes) AS body FROM g_intake_files ORDER BY id').all()
  assert(intakeFiles.results.length>=2,'Both requested input versions exist before archive')
  assert.deepEqual((await proxy.env.DB.prepare('SELECT id,request_id,submission_id,name,digest,hex(bytes) AS body FROM g_intake_files ORDER BY id').all()).results,intakeFiles.results,'Every input file and digest survives without recipient authority')
  await proxy.dispose();proxy=undefined
  restored=await harness({persistenceDirectory:destination,beforeLogin:async({request})=>assert.equal((await request(path,alice.cookie)).status,401,'Pre-restore client session is invalid')})
  assert.equal((await restored.post('/auth/magic-link',{email:invite.contact})).status,202)
  const link=new URL(restored.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]),confirmation=await restored.post('/auth/confirm',{token:link.searchParams.get('token')})
  assert.equal(confirmation.status,303)
  const freshCookie=confirmation.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
  for(const door of [path,`/app/client-projects/${project.id}`])assert.equal((await restored.request(door,freshCookie)).status,403,'Fresh matching email restores no project authority')
  const fresh=await restored.cmd('client:invite-project',invite)
  const restoredRead=async()=>{const response=await restored.request(path,freshCookie);assert.equal(response.status,200);return response.json()}
  assert.equal((await restoredRead()).burn,null,'Fresh invitation starts without restored monetary consent')
  await restored.cmd('client:share-money',{...fresh,...allMoney,reason:'New installation finance explicitly shares again'})
  const stable=v=>Array.isArray(v)?v.map(stable).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort().map(([k,x])=>[k,stable(x)])):v
  assert.deepEqual(stable(await restoredRead()),stable(portableDocument),'Fresh explicit authority reveals identical business projections and source versions')
 }finally{await proxy?.dispose();await restored?.dispose();await rm(destination,{recursive:true,force:true})}

 // Each lifecycle probe starts with usable native recipient authority.
 let lifecycle=await cmd('client:invite-project',invite)
 assert.equal((await request(path,alice.cookie)).status,200)
 const currentProject=(await state()).data.engagements.find(r=>r.id===project.id)
 const foreignClient=(await state()).data.engagements.find(r=>r.id===other.id).value.clientId
 await cmd('save:engagements',{...currentProject.value,...currentProject,clientId:foreignClient})
 assert.equal((await request(path,alice.cookie)).status,403,'Changed project-client identity invalidates the captured invitation')
 assert.deepEqual(await projects(alice.cookie),[])
 const changedProject=(await state()).data.engagements.find(r=>r.id===project.id)
 await cmd('save:engagements',{...changedProject.value,...changedProject,clientId:currentProject.value.clientId})
 assert.equal((await request(path,alice.cookie)).status,200)
 await h.db.prepare("UPDATE oa_operators SET email=? WHERE id=?").bind('synthetic-gauge-changed@example.test',alice.id).run()
 assert.equal((await request(path,alice.cookie)).status,403,'Changed recipient email cannot retain invitation access')
 await h.db.prepare('UPDATE oa_operators SET email=? WHERE id=?').bind(invite.contact,alice.id).run()
 await h.db.prepare("UPDATE oa_operators SET role='owner' WHERE id=?").bind(alice.id).run()
 assert.equal((await request(path,alice.cookie)).status,401,'Changed recipient role invalidates its prior native session')
 await signInAlice()
 assert.equal((await request(path,alice.cookie)).status,403,'A fresh owner session cannot use its former recipient invitation')
 await h.db.prepare("UPDATE oa_operators SET role='member' WHERE id=?").bind(alice.id).run()
 await signInAlice()
 assert.equal((await request(path,alice.cookie)).status,200)
 assert.equal((await h.post('/auth/operator/status',{operatorId:alice.id,status:'inactive'},h.owner)).status,200)
 assert.equal((await request(path,alice.cookie)).status,401,'Deactivated recipient loses its session immediately')
 assert.equal((await h.post('/auth/operator/status',{operatorId:alice.id,status:'active'},h.owner)).status,200)
 assert.equal((await request(path,alice.cookie)).status,401,'Reactivation never revives the old recipient session')
 await signInAlice()
 assert.equal((await request(path,alice.cookie)).status,200)
 await portalRevisionRace(h,path,alice.cookie,lifecycle)
 const renewed=await cmd('client:invite-project',invite)
 await h.db.prepare('UPDATE g_client_portal_authority SET expires_at=0 WHERE id=?').bind(renewed.id).run()
 assert.equal((await request(path,alice.cookie)).status,403)
 await cmd('grant',{operatorId:bob.id,personId:worker.id,role:'staff',enabled:true})
 assert.equal((await request(`/api/gauge/client-projects/${other.id}`,bob.cookie)).status,403,'An acquired internal grant ends client projection access')
 assert.deepEqual(await projects(bob.cookie),[])
 console.log('PASS CLIENT-001 / CLIENT-005 / CLIENT-006 / CLIENT-007 scoped project: selected burn and unknown values, current and original field visibility and ISO currencies, nonzero rollover and linked corrections and value parity, authority-free restore, two-client refusal, revocation, expiry and 1440/390')
}
