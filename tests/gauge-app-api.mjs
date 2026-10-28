import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {mkdir} from 'node:fs/promises'

// Extends CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032's existing utilization journey through the built Worker.
export async function appApiJourney(h,browser,{staff,person,client,task,engagement}) {
 const {cmd,owner,request}=h
 const app=(token,path='/api/gauge/v1/projects',input)=>request(path,'',{...(input?{method:'POST',body:JSON.stringify(input)}:{}),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}})
 const create={label:'Scoped timesheet app',operatorId:staff.id,scope:'projects:read time:write'}
 await cmd('appkey:create',create,staff.cookie,403)
 await cmd('appkey:create',{...create,scope:'owner:*'},owner,400)
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
 const capture=async name=>{
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`App credential screen fits ${width}`)
   // Access uses text buttons. Any icon-only control must retain the shared tooltip.
   for(const control of await page.locator('button.g-btn--icon,a.g-btn--icon').all())assert(await control.getAttribute('data-tooltip'))
   if(process.env.GAUGE_UTILIZATION_SHOTS){await mkdir(process.env.GAUGE_UTILIZATION_SHOTS,{recursive:true});await page.locator('#app-keys').scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_UTILIZATION_SHOTS}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_UTILIZATION_SHOTS}/${name}-viewport-${width}.png`})}
  }
 }
 try{
  await page.goto(h.origin+'/app/access');const form=page.locator('form:has(input[value="appkey:create"])')
  await form.getByLabel('App label',{exact:true}).fill(create.label);await form.locator('select[name=operatorId]').selectOption(staff.id);await form.locator('select[name=scope]').selectOption(create.scope)
  await capture('app-credential-create');await form.getByRole('button',{name:'Create app credential',exact:true}).click()
  const token=await page.locator('[name=createdKey]').inputValue();assert.match(token,/^gauge_app_/)
  const key=await h.db.prepare('SELECT * FROM g_app_keys WHERE label=?').bind(create.label).first();assert.equal(key.hash,createHash('sha256').update(token).digest('hex'));assert(!JSON.stringify(key).includes(token))
  await capture('app-credential-shown-once');await page.reload();assert.equal(await page.locator('[name=createdKey]').count(),0)
  const repeated={...create,key:randomUUID()},first=await cmd('appkey:create',repeated),replay=await cmd('appkey:create',repeated);assert.equal(replay.id,first.id);assert(!replay.token)
  await cmd('appkey:create',{...repeated,scope:'projects:read'},owner,409)
  for(let i=0;i<3;i++)await cmd('save:engagements',{name:`App project ${i}`,clientId:client.id,leadId:person.id,members:[person.id],scope:'Assigned app work',timezone:'Australia/Brisbane'})
  const hiddenPerson=await cmd('save:people',{name:'Other app principal',timezone:'Australia/Brisbane'})
  const hidden=await cmd('save:engagements',{name:'Hidden app project',clientId:client.id,leadId:hiddenPerson.id,members:[hiddenPerson.id],scope:'Private project',timezone:'Australia/Brisbane'})
  const native=(await h.state(staff.cookie)).data.engagements,projects=[];let cursor=null,firstCursor
  do{const response=await app(token,'/api/gauge/v1/projects?limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('gauge-api-version'),'1');const body=await response.json();projects.push(...body.projects);cursor=body.nextCursor;if(!firstCursor)firstCursor=cursor}while(cursor)
  assert.deepEqual(projects,native.sort((a,b)=>a.id.localeCompare(b.id)));assert(!projects.some(r=>r.id===hidden.id));assert.equal(new Set(projects.map(r=>r.id)).size,projects.length)
  const filtered=await(await app(token,'/api/gauge/v1/projects?clientId='+client.id+'&q=App%20project')).json();assert.equal(filtered.projects.length,3)
  assert.equal((await app(token,'/api/gauge/v1/projects?limit=101')).status,400)
  assert.equal((await app(token,'/api/gauge/v1/projects?cursor=invalid')).status,400)
  assert.equal((await app(token,'/api/gauge/v1/projects?q=changed&cursor='+encodeURIComponent(firstCursor))).status,409)
  const changed=await cmd('save:engagements',{...engagement,...(await h.state()).data.engagements.find(r=>r.id===engagement.id).value,name:'Changed project snapshot'})
  assert.equal((await app(token,'/api/gauge/v1/projects?cursor='+encodeURIComponent(firstCursor))).status,409,'A changed snapshot refuses stale pagination')
  const input={key:randomUUID(),personId:person.id,engagementId:engagement.id,taskId:task.id,service:'App entry',billable:false,timezone:'Australia/Brisbane',start:'2026-10-04T09:00:00+10:00',end:'2026-10-04T09:30:00+10:00',notes:'Native app draft'}
  const before=(await h.state()).data.time.length
  const sent=await app(token,'/api/gauge/v1/time',input);assert.equal(sent.status,200,await sent.clone().text());const saved=await sent.json()
  const second=await app(token,'/api/gauge/v1/time',input);assert.equal(second.status,200);assert.deepEqual(await second.json(),saved)
  assert.equal((await h.state()).data.time.length,before+1);assert.equal((await h.state()).data.time.find(r=>r.id===saved.id).value.status,'draft')
  assert.equal((await app(token,'/api/gauge/v1/time',{...input,end:'2026-10-04T10:00:00+10:00'})).status,409,'A changed request cannot replay the same key')
  for(const data of [{...input,key:randomUUID(),personId:hiddenPerson.id},{...input,key:randomUUID(),engagementId:hidden.id},{...input,key:randomUUID(),action:'time:approve'}])assert.equal((await app(token,'/api/gauge/v1/time',data)).status,403)
  const readOnly=await cmd('appkey:create',{...create,label:'Read-only app',scope:'projects:read'})
  assert.equal((await app(readOnly.token,'/api/gauge/v1/time',{...input,key:randomUUID()})).status,403)
  assert.equal((await app(token,'/api/gauge/v1/audit')).status,403)
  assert.equal((await app(token,'/api/gauge/state?from=2026-10-01&to=2026-10-31')).status,401,'App credential cannot use the utilization door')
  const audit=await(await request('/api/gauge/audit',owner)).json();assert(audit.entries.some(e=>e.action==='appkey:use'));assert(!JSON.stringify(audit).includes(token))
  await page.goto(h.origin+'/app/access');await page.locator(`tr[id="${key.id}"]`).getByRole('button',{name:'Revoke app credential',exact:true}).click()
  await page.goto(h.origin+'/app/access');assert.match(await page.locator(`tr[id="${key.id}"]`).innerText(),/revoked/);await capture('app-credential-revoked')
  assert.equal((await app(token)).status,401);assert.equal((await app(token,'/api/gauge/v1/time',input)).status,401,'Revocation also refuses an exact write replay')
  await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true})
  assert.equal((await app(readOnly.token)).status,403,'A changed native grant invalidates existing credentials')
  console.log('PASS CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032 appApiJourney: scoped native project pagination and filters, stale cursor refusal, one draft per request key, changed replay refusal, read-only and person boundaries, audited SHA-256 custody, grant change and revoked replay refusal, Access at 1440 and 390')
 }finally{await context.close()}
}
