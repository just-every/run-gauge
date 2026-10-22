import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,rm} from 'node:fs/promises'
import {harness} from './gauge-harness.mjs'

// One custody business flow through the production Worker, native owner forms,
// persisted jobs and a Crank-compatible receiver at the harness's network edge.
export async function providerCustodyJourney(browser){
 let h=await harness({currency:'USD',timezone:'America/New_York'}),owner=h.owner;const logHistory=[]
 const directory=h.directory,cmd=(...args)=>h.cmd(...args),state=(...args)=>h.state(...args),request=(...args)=>h.request(...args),endpoint='https://crank.example.test/api/crank/flows/budget-exception/trigger'
 const credentials=['synthetic-gauge-1001','synthetic-gauge-1002','synthetic-gauge-1003'],accountLabel='Northline budget notifications'
 const scan=(label,value)=>{const serialized=typeof value==='string'?value:JSON.stringify(value);for(const credential of credentials)assert(!serialized.includes(credential),`Full provider credential is absent from ${label}`)}
 const metadataOnly=value=>{for(const [key,child]of Object.entries(value??{})){assert(!['credential','ciphertext','iv','authorization','payload','requestBody','responseBody'].includes(key),`Provider use excludes ${key}`);if(child&&typeof child==='object')metadataOnly(child)}}
 const edge=()=>h.providerRequests.filter(r=>r.url===endpoint)
 const read=async(kind,id)=>(await state()).data[kind].find(r=>r.id===id)
 const ownerSession=await(await request('/auth/session',owner)).json(),ownerId=ownerSession.operator.id
 const context=await browser.newContext({ignoreHTTPSErrors:true})
 try{
  await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  const page=await context.newPage(),shots=process.env.GAUGE_PROVIDER_SHOTS
  if(shots)await mkdir(shots,{recursive:true})
  const capture=async(name,section)=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await section.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Provider ${name} fits ${width}`);scan(`provider ${name} page`,await page.content());if(shots)await section.screenshot({path:`${shots}/${name}-${width}.png`})}}
  const form=action=>page.locator('form').filter({has:page.locator(`input[name="action"][value="${action}"]`)})
  const section=heading=>page.locator('section.g-card').filter({has:page.getByRole('heading',{name:heading,exact:true})})

  // A real submitted actual crosses an owner-selected budget threshold. No alert
  // or job is manufactured by SQL or by the receiver.
  const zone='Australia/Brisbane',person=await cmd('save:people',{name:'Jordan Lane',timezone:zone}),client=await cmd('save:clients',{name:'Mariner Studio'})
  const project=await cmd('save:engagements',{name:'Mariner launch research',clientId:client.id,leadId:person.id,members:[person.id],scope:'Budget exception delivery custody',timezone:zone})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:3600,roundingSeconds:60,reason:'Reviewed allowance for provider custody journey'}))
  await cmd('budget:thresholds',{engagementId:project.id,thresholds:[50],reason:'Notify the lead and finance before the allowance is exhausted'})
  const task=await cmd('save:tasks',{engagementId:project.id,name:'Customer research workshop',remainingSeconds:3600})
  const actual=await cmd('time:save',{engagementId:project.id,taskId:task.id,personId:person.id,service:'Research',timezone:zone,billable:false,notes:'Submitted actual causes a native budget exception',start:'2026-10-08T09:00:00+10:00',end:'2026-10-08T10:00:00+10:00'})
  await cmd('time:submit',actual)
  const alert=(await state()).data.budgetAlerts.find(r=>r.value.engagementId===project.id&&r.value.metric==='hours')
  assert(alert,'Submitting actual work creates a budget alert through the native budget policy')

  const people=[]
  for(const [index,role]of ['finance','lead','staff','agent'].entries()){
   const user=await h.invite('synthetic-gauge-'+(1010+index));people.push({...user,role})
   await cmd('grant',{operatorId:user.id,role,enabled:true,...(role==='agent'?{purpose:'time',engagementIds:[project.id]}:{personId:person.id})})
  }
  await page.goto(h.origin+'/app/access')
  assert.equal(await form('provider:initialize').count(),0,'Fresh setup initialized provider custody')
  assert.equal(await form('provider:connect').count(),1)
  assert.equal(await form('provider:connect').locator('[name="credential"]').inputValue(),'','Credential fields start blank')
  await form('provider:connect').locator('select[name=provider]').selectOption('crank');await form('provider:connect').getByLabel('Account label',{exact:true}).fill(accountLabel)
  await capture('connect-form',form('provider:connect').locator('..'))

  // Secret-bearing receipts bind the exact secret without returning it. A
  // changed credential under the same request key cannot create another record.
  const connectInput={key:await form('provider:connect').locator('[name=key]').inputValue(),provider:'crank',accountLabel,credential:credentials[0]}
  await form('provider:connect').getByLabel('Provider credential',{exact:true}).fill(credentials[0])
  const [connectResponse]=await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),form('provider:connect').getByRole('button',{name:'Connect provider',exact:true}).click()]);assert.equal(connectResponse.status(),303)
  const connected=await cmd('provider:connect',connectInput)
  assert.deepEqual(await cmd('provider:connect',connectInput),connected,'Exact credential request replay acknowledges the original connection')
  scan('changed-credential replay refusal',await cmd('provider:connect',{...connectInput,credential:credentials[2]},owner,409))
  scan('connection acknowledgement',connected)
  const firstConnection=await read('providerConnections',connected.id)
  assert(firstConnection);assert.equal(firstConnection.value.lastFour,credentials[0].slice(-4));scan('connected owner state',await state())
  const queueInput={connectionId:connected.id,alertId:alert.id,alertRevision:alert.revision,endpoint}
  await cmd('providerJob:queue-crank',{...queueInput,alertRevision:actual.revision},owner,409)
  await page.reload();const queueForm=form('providerJob:queue-crank').filter({has:page.locator(`[name=alertId][value="${alert.id}"]`)})
  await queueForm.getByLabel('Crank HTTPS trigger endpoint',{exact:true}).fill(endpoint);await capture('queue-budget-event',queueForm.locator('..'))
  const [queueResponse]=await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),queueForm.getByRole('button',{name:'Queue Crank event',exact:true}).click()]);assert.equal(queueResponse.status(),303)
  const queued=(await state()).data.providerJobs.find(j=>j.value.source.id===alert.id),originalJob=await read('providerJobs',queued.id),networkBefore=edge().length
  assert.equal(originalJob.value.status,'queued');assert.equal(originalJob.value.ownerId,ownerId)
  assert.deepEqual(originalJob.value.source,{kind:'budgetAlerts',id:alert.id,revision:alert.revision})
  assert.equal(originalJob.value.credentialVersion,firstConnection.value.version)
  metadataOnly(originalJob.value)
  const expectedEvent={type:'gauge.budget-exception',alertId:alert.id,alertRevision:alert.revision,engagementId:project.id,phaseKey:alert.value.phaseKey,metric:alert.value.metric,threshold:alert.value.threshold,actual:alert.value.actual,budget:alert.value.budget,raisedAt:alert.value.raisedAt}

  await page.reload();await capture('connection-register',section('Connections'))
  const rotate=page.locator(`[id="provider-rotate-${connected.id}"] form`)
  assert.equal(await rotate.locator('[name="credential"]').inputValue(),'')
  await capture('rotate-form',rotate.locator('..'))
  await rotate.getByLabel('Provider credential',{exact:true}).fill(credentials[1])
  const [rotationResponse]=await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),rotate.getByRole('button',{name:'Rotate credential',exact:true}).click()]);assert.equal(rotationResponse.status(),303)
  await page.waitForURL('**/app/access#provider-connections')
  const rotatedConnection=await read('providerConnections',connected.id)
  assert(rotatedConnection.value.version>firstConnection.value.version)
  assert.equal(rotatedConnection.value.lastFour,credentials[1].slice(-4))
  // Restart the real Worker with its persisted database before dispatching the queued work.
  logHistory.push(...h.logs);await h.close();h=await harness({currency:'USD',timezone:'America/New_York',persistenceDirectory:directory});owner=h.owner
  await context.clearCookies();await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.goto(h.origin+'/app/access')
  assert.equal((await read('providerJobs',queued.id)).revision,originalJob.revision,'Queued source and credential version survive a real process restart')
  await cmd('providerJob:dispatch',queued)
  const refused=await read('providerJobs',queued.id)
  assert.equal(edge().length,networkBefore,'Rotation prevents any request under either credential version')
  assert.equal(refused.value.status,'exception');assert.equal(refused.value.exceptionClass,'credential-rotated');assert.equal(refused.value.ownerId,ownerId)
  assert.deepEqual(refused.value.source,originalJob.value.source,'Credential changes cannot rewrite the approved business source')
  await page.reload();await capture('owned-rotation-exception',page.locator(`[id="${refused.id}"]`))
  const requeue=page.locator(`[id="${refused.id}"] form`).filter({has:page.locator('input[value="providerJob:requeue"]')})
  assert.equal(await requeue.count(),1)
  const [requeueResponse]=await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),requeue.getByRole('button',{name:'Re-queue with current credential',exact:true}).click()]);assert.equal(requeueResponse.status(),303)
  const requeued=await read('providerJobs',queued.id)
  assert.equal(requeued.value.status,'queued');assert.equal(requeued.value.ownerId,ownerId)
  assert.equal(requeued.value.credentialVersion,rotatedConnection.value.version)
  assert.deepEqual(requeued.value.source,originalJob.value.source)
  const dispatch={id:requeued.id,revision:requeued.revision}
  await Promise.all([cmd('providerJob:dispatch',dispatch),cmd('providerJob:dispatch',dispatch)])
  assert.equal(edge().length,networkBefore+1,'Concurrent dispatch claims result in one external submission')
  const sent=edge().at(-1),envelope=typeof sent.body==='string'?JSON.parse(sent.body):sent.body
  assert(sent.headers.authorization===`Bearer ${credentials[1]}`,'Only the current credential reaches the provider network edge')
  assert.equal(envelope.event_id,requeued.value.eventId);assert.deepEqual(envelope.input,expectedEvent)
  const submitted=await read('providerJobs',queued.id)
  assert.equal(submitted.value.status,'submitted');assert.equal(typeof submitted.value.providerRunId,'string');assert(submitted.value.providerRunId.length>0)
  await cmd('providerJob:dispatch',{id:submitted.id,revision:submitted.revision})
  await cmd('providerJob:requeue',{id:submitted.id,revision:submitted.revision},owner,409)
  assert.equal(edge().length,networkBefore+1,'A completed submission never replays the external action')

  const queuedForRevocation=await cmd('providerJob:queue-crank',queueInput)
  await cmd('provider:revoke',{id:rotatedConnection.id,revision:rotatedConnection.revision})
  await cmd('providerJob:dispatch',queuedForRevocation)
  const revoked=await read('providerJobs',queuedForRevocation.id)
  assert.equal(revoked.value.status,'revoked');assert.equal(revoked.value.exceptionClass,'credential-revoked')
  await cmd('providerJob:dispatch',{id:revoked.id,revision:revoked.revision})
  await cmd('providerJob:requeue',{id:revoked.id,revision:revoked.revision},owner,409)
  const revokedConnection=await read('providerConnections',connected.id)
  await cmd('provider:rotate',{id:revokedConnection.id,revision:revokedConnection.revision,credential:credentials[2]},owner,409)
  assert.equal(edge().length,networkBefore+1,'Revocation permanently prevents queued work from reaching the network')

  for(const person of people){const auth=await h.post('/auth/magic-link',{email:'synthetic-gauge-'+(1010+people.indexOf(person))+'@example.test'});assert.equal(auth.status,202);const link=new URL(h.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]);const confirmed=await h.post('/auth/confirm',{token:link.searchParams.get('token')});assert.equal(confirmed.status,303);person.cookie=confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')}
  const ownerState=await state(),uses=ownerState.data.providerUses.filter(r=>r.value.connectionId===connected.id)
  assert(uses.some(r=>r.value.jobId===queued.id&&r.value.credentialVersion===firstConnection.value.version&&r.value.outcome==='credential-rotated'))
  assert(uses.some(r=>r.value.jobId===queued.id&&r.value.credentialVersion===rotatedConnection.value.version&&r.value.outcome==='accepted'))
  assert(uses.some(r=>r.value.jobId===revoked.id&&r.value.outcome==='credential-revoked'))
  for(const use of uses){assert(Number.isSafeInteger(use.value.at));assert.equal(use.value.operation,'trigger:submit');metadataOnly(use.value)}
  await page.reload();await capture('provider-use',section('Provider use'));await capture('owned-revocation',page.locator(`[id="${revoked.id}"]`))

  // Owner-only means every native business role, agent and aggregate API key.
  // The provider-use ledger exposes metadata, never the business request body.
  const mutations=[['provider:initialize',{}],['provider:connect',{provider:'crank',accountLabel:'synthetic-gauge-1020',credential:credentials[2]}],['provider:rotate',{id:connected.id,revision:revokedConnection.revision,credential:credentials[2]}],['provider:revoke',{id:connected.id,revision:revokedConnection.revision}],['providerJob:queue-crank',queueInput],['providerJob:dispatch',{id:submitted.id,revision:submitted.revision}],['providerJob:requeue',{id:refused.id,revision:refused.revision}]]
  const protectedRows=[['providerConnections',connected.id],['providerUses',uses[0].id],['providerJobs',queued.id]]
  for(const person of people){
   for(const [action,input]of mutations)scan('nonowner mutation refusal',await cmd(action,input,person.cookie,403))
   const visible=await state(person.cookie)
   for(const kind of ['providerConnections','providerUses','providerJobs'])assert.deepEqual(visible.data[kind],[],'Nonowners receive no provider metadata')
   scan('nonowner state',visible)
   for(const [kind,id]of protectedRows)assert.equal((await request(`/api/gauge/history/${kind}/${id}`,person.cookie)).status,403)
   const auditResponse=await request('/api/gauge/audit?kind=providerJobs',person.cookie)
   assert.equal(auditResponse.status,person.role==='finance'?200:403)
   if(person.role==='finance'){
    const audit=await auditResponse.json();assert.equal(audit.entries.length,0)
    const exported=await(await request('/api/gauge/audit/export',person.cookie)).json()
    assert(!JSON.stringify(exported).includes(accountLabel)&&!JSON.stringify(exported).includes(connected.id),'Finance audit exports withhold owner-only connection metadata')
    scan('finance audit export',exported)
    const access=await request('/app/access',person.cookie);assert([403,404].includes(access.status));const html=await access.text();assert(!html.includes(accountLabel),'Finance cannot inspect the owner provider page');scan('refused finance provider page',html)
   }
  }
  const apiKey=await cmd('apikey:create',{label:'synthetic-gauge-1021'})
  for(const [action,input]of mutations){const response=await request('/api/gauge/command','',{method:'POST',headers:{origin:h.origin,authorization:`Bearer ${apiKey.token}`,'content-type':'application/json'},body:JSON.stringify({key:randomUUID(),action,...input})});assert.equal(response.status,403);scan('API bearer refusal',await response.text())}
  assert.equal((await request(`/api/gauge/history/providerConnections/${connected.id}`,'',{headers:{authorization:`Bearer ${apiKey.token}`}})).status,403)

  scan('owner state',ownerState)
  for(const [kind,id]of protectedRows){const response=await request(`/api/gauge/history/${kind}/${id}`,owner);assert.equal(response.status,200);scan('owner provider history',await response.text())}
  for(const path of ['/app/access','/app/review','/app/audit','/api/gauge/audit','/api/gauge/audit/export']){const response=await request(path,owner);assert.equal(response.status,200);scan(path,await response.text())}
  const finalReport=await state(),csv=await request('/api/gauge/report.csv?'+new URLSearchParams({from:'2026-10-01',to:'2026-10-31',fingerprint:finalReport.fingerprint}),owner)
  assert.equal(csv.status,200);scan('report export',await csv.text());scan('captured application logs',[...logHistory,...h.logs])
  assert.equal(edge().length,networkBefore+1,'Permission refusals, inspections and exports never submit provider work')
 }finally{await context.close();await h.close();await rm(directory,{recursive:true,force:true})}
 console.log('PASS GOVERN-008 owner provider custody: exact secret replay, native rotation and requeue, durable owned exceptions, one concurrent Crank submission, terminal revocation, owner-only metadata, secret-free public surfaces and 1440/390')
}
