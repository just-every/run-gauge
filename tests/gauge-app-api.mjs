import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {request as httpsRequest} from 'node:https'

// Extends CONNECT-020's existing utilization journey through the built Worker.
export async function appApiJourney(h,browser,{staff,person,client,task,engagement}) {
 const {cmd,owner,request}=h
 const app=(token,path='/api/gauge/v1/projects',input)=>request(path,'',{...(input?{method:'POST',body:JSON.stringify(input)}:{}),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}})
 const assigned=[]
 for(let i=0;i<3;i++)assigned.push(await cmd('save:engagements',{name:`App project ${i}`,clientId:client.id,leadId:person.id,members:[person.id],scope:'Assigned app work',timezone:'Australia/Brisbane'}))
 const create={projectIds:(await h.state(staff.cookie)).data.engagements.map(r=>r.id).sort(),expiryDays:30,label:'Scoped timesheet app',operatorId:staff.id,scope:'projects:read time:write'}
 await cmd('appkey:create',create,staff.cookie,403)
 await cmd('appkey:create',{...create,scope:'owner:*'},owner,400)
 for(const expiryDays of [0,366,'Infinity'])await cmd('appkey:create',{...create,expiryDays},owner,400)
 await cmd('appkey:create',{...create,projectIds:[]},owner,400)

 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
 const capture=async name=>{
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`App credential screen fits ${width}`)
   // Access uses text buttons. Any icon-only control must retain the shared tooltip.
   if(width===1440)for(const control of await page.locator('button.g-btn--icon,a.g-btn--icon').all())assert(await control.getAttribute('data-tooltip'))
   if(process.env.GAUGE_UTILIZATION_SHOTS){await mkdir(process.env.GAUGE_UTILIZATION_SHOTS,{recursive:true});await page.locator('#app-keys').scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_UTILIZATION_SHOTS}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_UTILIZATION_SHOTS}/${name}-viewport-${width}.png`})}
  }
 }
 try{
  await page.goto(h.origin+'/app/access');const form=page.locator('form:has(input[value="appkey:create"])')
  await form.getByLabel('App label',{exact:true}).fill(create.label);await form.locator('select[name=operatorId]').selectOption(staff.id);await form.locator('select[name=scope]').selectOption(create.scope)
  for(const id of create.projectIds)await form.locator(`input[name=projectIds][value="${id}"]`).check()
  await form.getByLabel('Expires after days (1 to 365)',{exact:true}).fill('30')
  await capture('app-credential-create');await form.getByRole('button',{name:'Create app credential',exact:true}).click()
  const token=await page.locator('[name=createdKey]').inputValue();assert.match(token,/^gauge_app_/)
  const key=await h.db.prepare('SELECT * FROM g_app_keys WHERE label=?').bind(create.label).first();assert.equal(key.hash,createHash('sha256').update(token).digest('hex'));assert(!JSON.stringify(key).includes(token));assert.equal(key.expires_at-key.created_at,30*86400000);assert.equal(key.person_id,person.id);assert.deepEqual(JSON.parse(key.project_ids),create.projectIds)
  const lifecycle=await page.locator(`tr[id="${key.id}"]`).innerText();for(const value of ['Expires','Issued','Last used','Credential v1','Mia Chen'])assert(lifecycle.includes(value),value)
  await capture('app-credential-shown-once');await page.reload();assert.equal(await page.locator('[name=createdKey]').count(),0)
  const repeated={...create,key:randomUUID()},first=await cmd('appkey:create',repeated),replay=await cmd('appkey:create',repeated);assert.equal(replay.id,first.id);assert(!replay.token)
  await cmd('appkey:create',{...repeated,scope:'projects:read'},owner,409)
  const hiddenPerson=await cmd('save:people',{name:'Other app principal',timezone:'Australia/Brisbane'})
  const hidden=await cmd('save:engagements',{name:'Hidden app project',clientId:client.id,leadId:hiddenPerson.id,members:[hiddenPerson.id],scope:'Private project',timezone:'Australia/Brisbane'})
  await cmd('appkey:create',{...create,projectIds:[hidden.id]},owner,403)
  const sharedField=await cmd('field:define',{scope:'engagements',name:'App shared context',type:'text',visibility:'everyone',reason:'Explicit shared app context'})
  const privateField=await cmd('field:define',{scope:'engagements',name:'App private context',type:'text',visibility:'finance-only',reason:'Keep private commercial context out of apps'})
  const currentProject=(await h.state()).data.engagements.find(r=>r.id===engagement.id)
  await cmd('save:engagements',{...currentProject,...currentProject.value,customFields:{[sharedField.id]:'Public reviewed context',[privateField.id]:'synthetic-gauge-private-context'}})
  let projected=(await(await app(token)).json()).projects.find(r=>r.id===engagement.id)
  assert.equal(projected.value.customFields[sharedField.id],'Public reviewed context');assert(!JSON.stringify(projected).includes('synthetic-gauge-private-context'));assert(!Object.hasOwn(projected.value.customFields,privateField.id))
  const broadened=await cmd('field:define',{...privateField,visibility:'everyone',reason:'Definition widening alone does not publish historical values'})
  projected=(await(await app(token)).json()).projects.find(r=>r.id===engagement.id);assert(!Object.hasOwn(projected.value.customFields,privateField.id),'The saved finance-only version still withholds the value')
  const beforePublish=(await h.state()).data.engagements.find(r=>r.id===engagement.id)
  await cmd('save:engagements',{...beforePublish,...beforePublish.value,customFields:{[sharedField.id]:'Public reviewed context',[privateField.id]:'Explicitly published context'}})
  projected=(await(await app(token)).json()).projects.find(r=>r.id===engagement.id);assert.equal(projected.value.customFields[privateField.id],'Explicitly published context')
  const native=(await h.state(staff.cookie)).data.engagements,projects=[];let cursor=null,firstCursor
  do{const response=await app(token,'/api/gauge/v1/projects?limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('gauge-api-version'),'1');const body=await response.json();projects.push(...body.projects);cursor=body.nextCursor;if(!firstCursor)firstCursor=cursor}while(cursor)
  assert.deepEqual(projects,native.sort((a,b)=>a.id.localeCompare(b.id)));assert(!projects.some(r=>r.id===hidden.id));assert.equal(new Set(projects.map(r=>r.id)).size,projects.length)
  const filtered=await(await app(token,'/api/gauge/v1/projects?clientId='+client.id+'&q=App%20project')).json();assert.equal(filtered.projects.length,3)
  assert.equal((await app(token,'/api/gauge/v1/projects?limit=101')).status,400)
  assert.equal((await app(token,'/api/gauge/v1/projects?cursor=invalid')).status,400)
  assert.equal((await app(token,'/api/gauge/v1/projects?q=changed&cursor='+encodeURIComponent(firstCursor))).status,409)
  const beforeChange=(await h.state()).data.engagements.find(r=>r.id===engagement.id)
  const changed=await cmd('save:engagements',{...beforeChange,...beforeChange.value,name:'Changed project snapshot'})
  assert.equal((await app(token,'/api/gauge/v1/projects?cursor='+encodeURIComponent(firstCursor))).status,409,'A changed snapshot refuses stale pagination')
  const input={key:randomUUID(),personId:person.id,engagementId:engagement.id,taskId:task.id,service:'App entry',billable:false,timezone:'Australia/Brisbane',start:'2026-10-04T09:00:00+10:00',end:'2026-10-04T09:30:00+10:00',notes:'Native app draft'}
  const before=(await h.state()).data.time.length
  const sent=await app(token,'/api/gauge/v1/time',input);assert.equal(sent.status,200,await sent.clone().text());const saved=await sent.json()
  const second=await app(token,'/api/gauge/v1/time',input);assert.equal(second.status,200);assert.deepEqual(await second.json(),saved)
  assert.equal((await h.state()).data.time.length,before+1);assert.equal((await h.state()).data.time.find(r=>r.id===saved.id).value.status,'draft')
  assert.equal((await app(token,'/api/gauge/v1/time',{...input,end:'2026-10-04T10:00:00+10:00'})).status,409,'A changed request cannot replay the same key')
  for(const data of [{...input,key:randomUUID(),personId:hiddenPerson.id},{...input,key:randomUUID(),engagementId:hidden.id},...['time:submit','time:approve','packet:create','grant','providerJob:dispatch'].map(action=>({...input,key:randomUUID(),action}))])assert.equal((await app(token,'/api/gauge/v1/time',data)).status,403)
  const widened=await cmd('save:engagements',{...hidden,...(await h.state()).data.engagements.find(r=>r.id===hidden.id).value,members:[hiddenPerson.id,person.id]})
  assert((await h.state(staff.cookie)).data.engagements.some(r=>r.id===widened.id),'Native widening is visible to the staff member')
  assert.deepEqual((await(await app(token)).json()).projects.map(r=>r.id).sort(),create.projectIds,'Native widening cannot add app projects')
  assert.equal((await app(token,'/api/gauge/v1/time',{...input,key:randomUUID(),engagementId:widened.id})).status,403,'A newly assigned project is still outside the captured write scope')
  await cmd('appkey:create',{...create,projectIds:[widened.id],operatorId:staff.id,expiryDays:1})
  const readOnly=await cmd('appkey:create',{...create,label:'Read-only app',scope:'projects:read'})
  assert.equal((await app(readOnly.token,'/api/gauge/v1/time',{...input,key:randomUUID()})).status,403)
  assert.equal((await app(token,'/api/gauge/v1/audit')).status,403)
  assert.equal((await app(token,'/api/gauge/state?from=2026-10-01&to=2026-10-31')).status,401,'App credential cannot use the utilization door')
  const selected=await cmd('appkey:create',{...create,label:'Only one project',projectIds:[engagement.id]})
  assert.deepEqual((await(await app(selected.token)).json()).projects.map(r=>r.id),[engagement.id],'Explicit selection excludes another already assigned project')
  const removed=(await h.state()).data.engagements.find(r=>r.id===engagement.id)
  const narrowed=await cmd('save:engagements',{...removed,...removed.value,members:[]})
  assert.equal((await app(token,'/api/gauge/v1/time',input)).status,403,'Native removal also refuses an exact successful replay')
  assert.deepEqual((await(await app(selected.token)).json()).projects,[],'Captured scope never overrides a native removal')
  assert.equal((await app(selected.token,'/api/gauge/v1/time',{...input,key:randomUUID()})).status,403)
  await cmd('save:engagements',{...narrowed,...removed.value})
  const audit=await(await request('/api/gauge/audit',owner)).json();assert(audit.entries.some(e=>e.action==='appkey:use'));assert(!JSON.stringify(audit).includes(token))
  await page.goto(h.origin+'/app/access');await page.locator(`tr[id="${key.id}"]`).getByRole('button',{name:'Revoke app credential',exact:true}).click()
  await page.goto(h.origin+'/app/access');assert.match(await page.locator(`tr[id="${key.id}"]`).innerText(),/revoked/);await capture('app-credential-revoked')
  assert.equal((await app(token)).status,401);assert.equal((await app(token,'/api/gauge/v1/time',input)).status,401,'Revocation also refuses an exact write replay')
  const expiring=await cmd('appkey:create',{...create,label:'Expired app'})
  assert.equal((await app(expiring.token)).status,200)
  const expiryInput={...input,key:randomUUID(),start:'2026-10-04T11:00:00+10:00',end:'2026-10-04T11:30:00+10:00'}
  assert.equal((await app(expiring.token,'/api/gauge/v1/time',expiryInput)).status,200)
  await h.db.prepare('UPDATE g_app_keys SET expires_at=0 WHERE id=?').bind(expiring.id).run()
  assert.equal((await app(expiring.token)).status,401,'Expiry refuses the next read')
  assert.equal((await app(expiring.token,'/api/gauge/v1/time',expiryInput)).status,401,'Expiry refuses a previously successful write replay')
  await h.db.prepare('UPDATE g_app_keys SET expires_at=1 WHERE id=?').bind(expiring.id).run()
  await page.goto(h.origin+'/app/access');assert.match(await page.locator(`tr[id="${expiring.id}"]`).innerText(),/expired/)
  const used=await h.db.prepare('SELECT last_used_at FROM g_app_keys WHERE id=?').bind(key.id).first();assert(used.last_used_at>=key.created_at)
  const race=await cmd('appkey:create',{...create,label:'Expiry during request'})
  let streamRequest
  const inFlight=new Promise((resolve,reject)=>{
   streamRequest=httpsRequest(new URL('/api/gauge/v1/time',h.origin),{method:'POST',rejectUnauthorized:false,headers:{authorization:`Bearer ${race.token}`,'content-type':'application/json','transfer-encoding':'chunked'}},response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode}))})
   streamRequest.on('error',reject);streamRequest.setTimeout(15000,()=>streamRequest.destroy(new Error('Bounded streamed request timed out')));streamRequest.flushHeaders()
  })
  // Observe the authenticated request before releasing its body on the loopback TLS server.
  inFlight.catch(()=>{})
  let admitted=false
  try{
   for(let attempt=0;attempt<1000;attempt++){
    const row=await h.db.prepare('SELECT last_used_at FROM g_app_keys WHERE id=?').bind(race.id).first()
    if(row.last_used_at){admitted=true;break}
    await new Promise(resolve=>setTimeout(resolve,10))
   }
   assert(admitted,'The authenticated request reached its recorded use before body delivery')
   await h.db.prepare('UPDATE g_app_keys SET expires_at=1 WHERE id=?').bind(race.id).run()
   streamRequest.end(JSON.stringify({...input,key:randomUUID(),start:'2026-10-04T12:00:00+10:00',end:'2026-10-04T12:30:00+10:00'}))
  }finally{if(!admitted)streamRequest.destroy()}
  assert.equal((await inFlight).status,403,'Expiry after admission prevents the in-flight write')
  const afterRace=(await h.state()).data.time;assert(!afterRace.some(r=>r.value.start===Date.parse('2026-10-04T12:00:00+10:00')),'The refused in-flight request leaves no draft')
  const historyLink=page.locator(`tr[id="${key.id}"]`).getByRole('link',{name:'Use history',exact:true});await historyLink.click()
  const history=await page.locator('body').innerText();assert(history.includes('appkey:use')&&history.includes(key.id));assert(!history.includes(token))
  const filteredHistory=await(await request('/api/gauge/audit?kind=appKeys&recordId='+key.id,owner)).json();assert(filteredHistory.entries.length>2);assert(filteredHistory.entries.every(e=>e.recordId===key.id));assert(filteredHistory.entries.some(e=>e.action==='appkey:use'&&e.result.label===create.label&&e.result.method==='GET'&&e.result.path==='/api/gauge/v1/projects'))

  await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true})
  assert.equal((await app(readOnly.token)).status,403,'A changed native grant invalidates existing credentials')
  await page.goto(h.origin+'/app/access');assert.match(await page.locator(`tr[id="${readOnly.id}"]`).innerText(),/grant changed/);await capture('app-credential-lifecycle')
  const issuer=await h.invite('app-continuity-owner','owner')
  const issuerBound=await cmd('appkey:create',{...create,label:'Issuing owner authority'},issuer.cookie)
  assert.equal((await app(issuerBound.token)).status,200)
  await h.db.prepare("UPDATE oa_operators SET status='inactive' WHERE id=?").bind(issuer.id).run()
  try{assert.equal((await app(issuerBound.token)).status,403,'The issuing owner must remain active')}finally{await h.db.prepare("UPDATE oa_operators SET status='active' WHERE id=?").bind(issuer.id).run()}
  const liveBound=await cmd('appkey:create',{...create,label:'Live operator authority'})
  assert.equal((await app(liveBound.token)).status,200)
  await h.db.prepare('UPDATE oa_operators SET version=version+1 WHERE id=?').bind(staff.id).run()
  assert.equal((await app(liveBound.token)).status,403,'A changed principal operator version invalidates the credential')
  await page.goto(h.origin+'/app/access');assert.match(await page.locator(`tr[id="${liveBound.id}"]`).innerText(),/operator changed/)
  if(process.env.GAUGE_UTILIZATION_SHOTS)for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('section.g-card--table').filter({has:page.getByRole('heading',{name:'App credentials',exact:true})}).screenshot({path:`${process.env.GAUGE_UTILIZATION_SHOTS}/app-credential-register-${width}.png`})}
  console.log('PASS CONNECT-020 appApiJourney: scoped native project pagination and filters, stale cursor refusal, one draft per request key, changed replay refusal, read-only and person boundaries, audited SHA-256 custody, finite expiry and expired replay refusal, captured scope non-widening, visible lifecycle, grant change and revoked replay refusal, Access at 1440 and 390')
 }finally{await context.close()}
}
