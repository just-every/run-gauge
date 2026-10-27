import assert from 'node:assert/strict'
import {createHmac,randomUUID} from 'node:crypto'
import {mkdir,rm} from 'node:fs/promises'
import {DatabaseSync} from 'node:sqlite'
import {openWebhookReceiver} from '../scripts/integrations/webhook-receiver.mjs'
import {harness} from './gauge-harness.mjs'

// One custody business flow through the production Worker, native owner forms,
// persisted jobs and a Crank-compatible receiver at the harness's network edge.
export async function providerCustodyJourney(browser){
 let h=await harness({databaseBinding:false,currency:'USD',timezone:'America/New_York'}),owner=h.owner;const logHistory=[]
 const directory=h.directory,cmd=(...args)=>h.cmd(...args),state=(...args)=>h.state(...args),request=(...args)=>h.request(...args),endpoint='https://crank.example.test/api/crank/flows/budget-exception/trigger'
 const queueSigned=async input=>{const preview=await cmd('providerJob:preview-webhook',input);return cmd('providerJob:queue-webhook',{...input,previewId:preview.previewId,confirm:'release-exact-event'})}
 let receiver
 const receiverPath=directory+'/receiver.sqlite'
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
  await cmd('budget:thresholds',{engagementId:project.id,thresholds:[50,75],reason:'Notify the lead and finance before the allowance is exhausted'})
  const task=await cmd('save:tasks',{engagementId:project.id,name:'Customer research workshop',remainingSeconds:3600})
  const actual=await cmd('time:save',{engagementId:project.id,taskId:task.id,personId:person.id,service:'Research',timezone:zone,billable:false,notes:'Submitted actual causes a native budget exception',start:'2026-10-08T09:00:00+10:00',end:'2026-10-08T10:00:00+10:00'})
  await cmd('time:submit',actual)
  const alert=(await state()).data.budgetAlerts.find(r=>r.value.engagementId===project.id&&r.value.metric==='hours'&&r.value.threshold===50)
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
  const connectInput={key:await form('provider:connect').locator('[name=key]').inputValue(),provider:'crank',origin:'',accountLabel,credential:credentials[0]}
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
  logHistory.push(...h.logs);await h.close();h=await harness({databaseBinding:false,currency:'USD',timezone:'America/New_York',persistenceDirectory:directory});owner=h.owner
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

  const revokeAlert=(await state()).data.budgetAlerts.find(r=>r.value.engagementId===project.id&&r.value.metric==='hours'&&r.value.threshold===75);assert(revokeAlert)
  const queuedForRevocation=await cmd('providerJob:queue-crank',{...queueInput,alertId:revokeAlert.id,alertRevision:revokeAlert.revision})
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
  const hook='https://hooks.zapier.com/hooks/catch/synthetic-gauge-5001/synthetic-gauge-5002/',signingKey='synthetic-gauge-5003'
  const bundle=JSON.stringify({endpoint:hook,signingKey})
  receiver=openWebhookReceiver({database:receiverPath,signingKey})
  h.providerEdge.handler=async request=>request.url===hook?((await receiver.receive(request)).status===202?Response.json({status:'success'}):new Response(null,{status:401})):request.url==='https://automation.example.test/events'?Response.json({accepted:true,event_id:request.headers.get('x-gauge-event-id')},{status:202}):undefined
  const zapier=await cmd('provider:connect',{provider:'zapier',accountLabel:'Northline Zapier budget follow-up',credential:bundle})
  const signedInput={connectionId:zapier.id,sourceRef:`budgetAlerts:${alert.id}:${alert.revision}`,reason:'Owner releases this exact budget exception; no automatic subscription'}
  await cmd('providerJob:queue-webhook',signedInput,people.find(p=>p.role==='finance').cookie,403)
  const signedPage=await page.goto(h.origin+'/app/access');assert.equal(signedPage.status(),200,await page.locator('body').innerText());const signedForm=form('providerJob:preview-webhook');assert.equal(await signedForm.count(),1,await page.locator('body').innerText())
  await signedForm.locator('select[name=connectionId]').selectOption(zapier.id);await signedForm.locator('select[name=sourceRef]').selectOption(signedInput.sourceRef)
  await cmd('providerJob:preview-webhook',signedInput,people.find(p=>p.role==='finance').cookie,403)
  await cmd('providerJob:queue-webhook',signedInput,owner,400)
  await signedForm.getByRole('button',{name:'Preview signed event',exact:true}).click()
  const releaseForm=form('providerJob:queue-webhook'),reviewedBody=await releaseForm.locator('[data-webhook-preview]').inputValue()
  await cmd('providerJob:queue-webhook',{...signedInput,previewId:await releaseForm.locator('[name=previewId]').inputValue()},owner,400)
  const reviewed=JSON.parse(reviewedBody)
  assert.equal(reviewed.sourceId,alert.id);assert.equal(reviewed.sourceRevision,alert.revision)
  assert.deepEqual(reviewed.data,{engagementId:project.id,phaseKey:'',metric:'hours',threshold:50,actual:3600,budget:3600,raisedAt:alert.value.raisedAt})
  assert.equal(h.providerRequests.filter(r=>r.url===hook).length,0,'Preview sends nothing')
  await releaseForm.getByLabel('Explicit event release reason',{exact:true}).fill(signedInput.reason)
  await releaseForm.locator('input[name=confirm]').check()
  await capture('signed-event-release',releaseForm.locator('..'))
  await releaseForm.getByRole('button',{name:'Queue signed event',exact:true}).click()
  const signedJob=(await state()).data.providerJobs.find(r=>r.value.connectionId===zapier.id)
  assert(signedJob);assert.equal((await queueSigned(signedInput)).id,signedJob.id,'The same source revision cannot create another signed event')
  assert(!JSON.stringify(signedJob).includes(hook)&&!JSON.stringify(signedJob).includes(signingKey),'Hook URL and signing key stay sealed')
  await Promise.all([cmd('providerJob:dispatch',signedJob),cmd('providerJob:dispatch',signedJob)])
  const signedRequests=h.providerRequests.filter(r=>r.url===hook);assert.equal(signedRequests.length,1)
  const wire=signedRequests[0],signature=wire.headers.signature.match(/^t=(\d+),v1=([a-f0-9]{64})$/)
  assert(signature);assert.equal(createHmac('sha256',signingKey).update(signature[1]+'.'+JSON.stringify(wire.body)).digest('hex'),signature[2],'The exact body is authenticated with HMAC-SHA-256')
  assert.equal(JSON.stringify(wire.body),reviewedBody,'Dispatch sends exactly the bytes reviewed before release')
  assert.equal(wire.headers.eventId,signedJob.value.eventId);assert.equal(wire.headers.idempotencyKey,signedJob.value.eventId)
  assert.equal(wire.body.type,'gauge.budget-exception');assert.equal(wire.body.sourceId,alert.id);assert.equal(wire.body.sourceRevision,alert.revision);assert.equal(wire.body.data.metric,alert.value.metric)
  assert(!JSON.stringify(wire.body).includes('notes')&&!JSON.stringify(wire.body).includes('costMinor'))
  await cmd('providerJob:dispatch',await read('providerJobs',signedJob.id));assert.equal(h.providerRequests.filter(r=>r.url===hook).length,1)
  const receiverRequest=(body,stamp=String(Math.floor(Date.now()/1000)),signatureValue)=>new Request(hook,{method:'POST',headers:{'x-gauge-event-id':wire.body.event_id,'idempotency-key':wire.body.event_id,'x-gauge-signature':`t=${stamp},v1=${signatureValue??createHmac('sha256',signingKey).update(stamp+'.'+body).digest('hex')}`},body})
  const originalBody=JSON.stringify(wire.body)
  const concurrent=await Promise.all([receiver.receive(receiverRequest(originalBody)),receiver.receive(receiverRequest(originalBody))]);for(const response of concurrent){assert.equal(response.status,202);assert.equal((await response.json()).duplicate,true)}
  assert.equal((await receiver.receive(receiverRequest(originalBody,'0'))).status,401,'An authentic stale event is refused')
  const now=String(Math.floor(Date.now()/1000)),authentic=createHmac('sha256',signingKey).update(now+'.'+originalBody).digest('hex')
  assert.equal((await receiver.receive(receiverRequest(originalBody+' ',now,authentic))).status,401,'Changed transmitted bytes are refused')
  const changedEnvelope=JSON.stringify({...wire.body,data:{...wire.body.data,actual:0}})
  assert.equal((await receiver.receive(receiverRequest(changedEnvelope))).status,409,'A signed collision cannot change a retained event')
  receiver.close();receiver=openWebhookReceiver({database:receiverPath,signingKey})
  const redelivery=await receiver.receive(receiverRequest(originalBody));assert.equal(redelivery.status,202);assert.equal((await redelivery.json()).duplicate,true,'Reviewed redelivery after receiver restart has one durable effect')
  const received=new DatabaseSync(receiverPath,{readOnly:true});try{assert.deepEqual(received.prepare('SELECT event_id,body FROM received_events').all().map(r=>({...r})),[{event_id:wire.body.event_id,body:originalBody}])}finally{received.close()}
  const webhook=await cmd('provider:connect',{provider:'webhook',accountLabel:'Northline signed project notifications',credential:JSON.stringify({endpoint:'https://automation.example.test/events',signingKey:'synthetic-gauge-5004'})})
  const projectSource=await read('engagements',project.id),genericJob=await queueSigned({connectionId:webhook.id,sourceRef:`engagements:${projectSource.id}:${projectSource.revision}`,reason:'Owner releases project changes to a signed subscription'})
  await cmd('provider:rotate',{...await read('providerConnections',webhook.id),credential:JSON.stringify({endpoint:'https://automation.example.test/events',signingKey:'synthetic-gauge-5005'})})
  const stalePreview=await cmd('providerJob:preview-webhook',{connectionId:webhook.id,sourceRef:`engagements:${projectSource.id}:${projectSource.revision}`})
  await cmd('providerJob:queue-webhook',{connectionId:webhook.id,sourceRef:`engagements:${projectSource.id}:${projectSource.revision}`,previewId:stalePreview.previewId,confirm:'release-exact-event',reason:'Existing event is still unique'})
  const genericBefore=h.providerRequests.filter(r=>r.url==='https://automation.example.test/events').length
  await cmd('providerJob:dispatch',genericJob);const rotation=await read('providerJobs',genericJob.id)
  assert.equal(rotation.value.exceptionClass,'credential-rotated');assert.equal(h.providerRequests.filter(r=>r.url==='https://automation.example.test/events').length,genericBefore)
  await cmd('providerJob:requeue',rotation,owner,400);const rotationPreview=await cmd('providerJob:preview-webhook',{connectionId:webhook.id,sourceRef:`engagements:${projectSource.id}:${projectSource.revision}`,jobId:rotation.id,jobRevision:rotation.revision});assert.equal(JSON.parse(rotationPreview.body).event_id,rotation.value.eventId)
  await cmd('providerJob:requeue',{...rotation,previewId:rotationPreview.previewId,confirm:'release-exact-event'});await cmd('providerJob:dispatch',await read('providerJobs',rotation.id))
  assert.equal(h.providerRequests.filter(r=>r.url==='https://automation.example.test/events').length,genericBefore+1)
  const projectEvent=h.providerRequests.filter(r=>r.url==='https://automation.example.test/events').at(-1).body
  assert.equal(projectEvent.type,'gauge.project.created');assert.deepEqual(projectEvent.data,{name:'Mariner launch research',clientId:client.id,leadId:person.id,type:'client',currency:'USD',timezone:zone})
  const outdatedPreview=await cmd('providerJob:preview-webhook',{connectionId:webhook.id,sourceRef:`engagements:${projectSource.id}:${projectSource.revision}`})
  const changedProject=await cmd('save:engagements',{...projectSource.value,...projectSource,scope:'Owner-reviewed expanded delivery scope'})
  await cmd('providerJob:queue-webhook',{connectionId:webhook.id,sourceRef:`engagements:${changedProject.id}:${changedProject.revision}`,previewId:outdatedPreview.previewId,confirm:'release-exact-event',reason:'Changed source requires renewed preview'},owner,409)
  const changedJob=await queueSigned({connectionId:webhook.id,sourceRef:`engagements:${changedProject.id}:${changedProject.revision}`,reason:'Owner releases an exact changed project revision'})
  await cmd('providerJob:dispatch',changedJob)
  assert.equal(h.providerRequests.filter(r=>r.url==='https://automation.example.test/events').at(-1).body.type,'gauge.project.changed')
  const approvedTime=await cmd('time:approve',await read('time',actual.id))
  const timeJob=await queueSigned({connectionId:zapier.id,sourceRef:`time:${approvedTime.id}:${approvedTime.revision}`,reason:'Owner releases the approved duration without private notes'})
  await cmd('providerJob:dispatch',timeJob);const timeEvent=h.providerRequests.filter(r=>r.url===hook).at(-1).body
  assert.equal(timeEvent.type,'gauge.time.approved');assert.deepEqual(timeEvent.data,{personId:person.id,engagementId:project.id,taskId:task.id,status:'approved',start:Date.parse('2026-10-08T09:00:00+10:00'),end:Date.parse('2026-10-08T10:00:00+10:00'),durationSeconds:3600,billable:false,workDate:'2026-10-08'})
  const revokedHookJob=await queueSigned({connectionId:webhook.id,sourceRef:`time:${approvedTime.id}:${approvedTime.revision}`,reason:'Owner releases the exact approval'})
  await cmd('provider:revoke',await read('providerConnections',webhook.id));await cmd('providerJob:dispatch',revokedHookJob)
  assert.equal((await read('providerJobs',revokedHookJob.id)).value.status,'revoked');assert.equal(h.providerRequests.filter(r=>r.url==='https://automation.example.test/events').length,genericBefore+2,'Revocation sends no new data')
  // Invoice and payment events are grounded in actual issued and allocated
  // native sources, and keep the user-recorded payment verification label.
  await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',billMinor:15000,costMinor:9000})
  const billedTime=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{engagementId:project.id,taskId:task.id,personId:person.id,service:'Research',timezone:zone,billable:true,notes:'Native invoice event source',start:'2026-10-09T09:00:00+10:00',end:'2026-10-09T10:00:00+10:00'})))
  const billing=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Native issued event source',sources:[`time:${billedTime.id}`]}))
  const invoice=await cmd('invoice:issue',{...billing,issueDate:'2026-10-10',dueDate:'2026-11-09',billTo:'Mariner accounts payable',remitTo:'Agency operating account',reference:'synthetic-gauge-5010'})
  const payment=await cmd('payment:record',{...invoice,date:'2026-10-11',amountMinor:15000,reference:'synthetic-gauge-5011'})
  for(const [kind,row,type]of [['invoices',invoice,'gauge.invoice.issued'],['payments',payment,'gauge.payment.recorded']]){
   const input={connectionId:zapier.id,sourceRef:`${kind}:${row.id}:${row.revision}`,reason:'Owner releases this exact native financial source'}
   const queued=await queueSigned(input);assert.equal((await queueSigned(input)).id,queued.id)
   await cmd('providerJob:dispatch',queued)
   const event=h.providerRequests.filter(r=>r.url===hook).at(-1).body;assert.equal(event.type,type);assert.equal(event.sourceId,row.id);assert.equal(event.data.currency,'USD');assert.equal(kind==='invoices'?event.data.totalMinor:event.data.amountMinor,15000)
   assert(!('billTo'in event.data)&&!('remitTo'in event.data)&&!('lines'in event.data)&&!('reference'in event.data),'Signed financial events disclose only their scoped business summary')
   assert.deepEqual(Object.keys(event.data).sort(),(kind==='invoices'?['engagementId','clientId','number','issueDate','dueDate','currency','totalMinor','issuance']:['engagementId','invoiceId','amountMinor','currency','date','source','verification']).sort(),'Only the documented financial projection is released')
   if(kind==='payments')assert.match(event.data.verification,/not bank or processor verified/)
  }
  assert.equal(h.providerRequests.filter(r=>r.url===hook).length,4,'Budget, approved time, invoice and payment source replays produce one event each')
  const receiptSecret='synthetic-gauge-5101',receiptKey=await cmd('provider:connect',{provider:'receipt',accountLabel:'Northline workflow receipt verification',credential:receiptSecret})
  const proofSignature=receipt=>createHmac('sha256',receiptSecret).update('gauge-followup-v1\n'+JSON.stringify(Object.fromEntries(Object.entries(receipt).sort(([a],[b])=>a.localeCompare(b))))).digest('hex')
  const receiptFor=(job,name)=>({schema:'gauge-followup-v1',eventId:job.value.eventId,sourceRevision:job.value.source.revision,remoteReference:job.value.providerRunId??job.value.eventId,taskName:name})
  const currentSigned=await read('providerJobs',signedJob.id),receipt=receiptFor(currentSigned,'Review budget <script>window.followupInjected=true</script>')
  const required=await cmd('field:define',{scope:'tasks',name:'Follow-up owner note',type:'text',required:true,visibility:'finance-only',reason:'Owner requires a reviewed note before a workflow task exists'})
  const review={...currentSigned,connectionId:receiptKey.id,receipt:JSON.stringify(receipt),signature:proofSignature(receipt),reason:'Owner reviews the exact source and permits this one task',confirm:'apply-exact-followup',customFields:{[required.id]:'Reviewed native workflow follow-up'}}
  const beforeTasks=(await state()).data.tasks.length
  await cmd('providerJob:apply-followup',review,people.find(p=>p.role==='finance').cookie,403)
  await cmd('providerJob:apply-followup',{...review,signature:'0'.repeat(64)},owner,403)
  await cmd('providerJob:apply-followup',{...review,customFields:{}},owner,400)
  assert.equal((await state()).data.tasks.length,beforeTasks,'Refused receipts cannot create tasks')
  await cmd('providerJob:queue-crank',{...queueInput,connectionId:receiptKey.id},owner,403)
  const sourcePage=await page.goto(h.origin+'/app/access');assert.equal(sourcePage.status(),200)
  const followForm=form('providerJob:apply-followup').filter({has:page.locator(`[name=id][value="${currentSigned.id}"]`)})
  await followForm.locator('select[name=connectionId]').selectOption(receiptKey.id);await followForm.getByLabel('Workflow receipt JSON',{exact:true}).fill(review.receipt);await followForm.getByLabel('Workflow receipt signature',{exact:true}).fill(review.signature);await followForm.getByLabel('Follow-up review reason',{exact:true}).fill(review.reason);await followForm.getByLabel('Follow-up owner note',{exact:true}).fill('Reviewed native workflow follow-up');await followForm.locator('[name=confirm]').check()
  await capture('signed-followup-review',followForm.locator('..'))
  await followForm.getByRole('button',{name:'Apply signed follow-up',exact:true}).click()
  const applied=(await state()).data.providerFollowups.find(f=>f.value.jobId===currentSigned.id);assert(applied)
  const nativeTask=(await state()).data.tasks.find(t=>t.id===applied.value.effect.id)
  assert.equal(nativeTask.value.name,receipt.taskName);assert.equal(nativeTask.value.engagementId,project.id);assert.equal(nativeTask.value.billable,false);assert.equal(nativeTask.value.remainingSeconds,0);assert.equal(nativeTask.value.assigneeId,null);assert.equal(nativeTask.value.customFields[required.id],'Reviewed native workflow follow-up')
  const replay={...review,key:randomUUID()},firstReplay=await cmd('providerJob:apply-followup',replay);assert.equal(firstReplay.id,applied.id);assert.deepEqual(await cmd('providerJob:apply-followup',replay),firstReplay);assert.equal((await state()).data.tasks.length,beforeTasks+1,'Signed workflow replay creates one permitted follow-up')
  const changedReceipt={...receipt,taskName:'A different task cannot reuse the event'};await cmd('providerJob:apply-followup',{...review,receipt:JSON.stringify(changedReceipt),signature:proofSignature(changedReceipt)},owner,409)
  await page.reload();await capture('signed-followup-applied',section('Applied workflow follow-ups'));assert.equal(await page.evaluate(()=>window.followupInjected),undefined,'Imported workflow text is inert')
  const crankReceiptConnection=await cmd('provider:connect',{provider:'crank',accountLabel:'Northline approved Crank follow-up',credential:'synthetic-gauge-5102'})
  const crankReceiptJob=await cmd('providerJob:queue-crank',{...queueInput,connectionId:crankReceiptConnection.id});await cmd('providerJob:dispatch',crankReceiptJob)
  const admittedCrank=await read('providerJobs',crankReceiptJob.id),crankReceipt=receiptFor(admittedCrank,'Review the Crank budget exception with the project lead')
  const crankReview={...admittedCrank,connectionId:receiptKey.id,receipt:JSON.stringify(crankReceipt),signature:proofSignature(crankReceipt),reason:'Owner reviews the workflow-authenticated Crank task request',confirm:'apply-exact-followup',customFields:{[required.id]:'Reviewed Crank follow-up'}}
  const crankApplied=await cmd('providerJob:apply-followup',crankReview);assert.equal((await cmd('providerJob:apply-followup',crankReview)).id,crankApplied.id);assert.equal((await state()).data.tasks.length,beforeTasks+2)
  const sourceCases=[['engagements',await read('engagements',project.id),'gauge.project.changed'],['time',await read('time',approvedTime.id),'gauge.time.approved'],['invoices',invoice,'gauge.invoice.issued'],['payments',payment,'gauge.payment.recorded']]
  for(const [kind,source,type]of sourceCases){
   const input={connectionId:crankReceiptConnection.id,sourceRef:`${kind}:${source.id}:${source.revision}`,endpoint,reason:'Owner releases this exact scoped Crank source'}
   const queued=await cmd('providerJob:queue-crank-source',input);assert.equal((await cmd('providerJob:queue-crank-source',input)).id,queued.id);await cmd('providerJob:dispatch',queued)
   const wire=edge().at(-1);assert.equal(wire.body.input.type,type);assert.equal(wire.body.input.sourceId,source.id)
   const signature=wire.headers.signature.match(/^t=(\d+),v1=([a-f0-9]{64})$/);assert(signature);assert.equal(createHmac('sha256','synthetic-gauge-5102').update(signature[1]+'.'+JSON.stringify(wire.body)).digest('hex'),signature[2])
  }
  await page.reload();const scopedCrankForm=form('providerJob:queue-crank-source')
  await scopedCrankForm.locator('select[name=connectionId]').selectOption(crankReceiptConnection.id)
  await scopedCrankForm.locator('select[name=sourceRef]').selectOption(`engagements:${sourceCases[0][1].id}:${sourceCases[0][1].revision}`)
  await scopedCrankForm.getByLabel('Crank HTTPS trigger endpoint',{exact:true}).fill(endpoint);await scopedCrankForm.getByLabel('Explicit Crank event release reason',{exact:true}).fill('Owner reviews this exact native source in the scoped release form')
  const jobsBeforeForm=(await state()).data.providerJobs.length;await capture('scoped-crank-release',scopedCrankForm.locator('..'))
  await scopedCrankForm.getByRole('button',{name:'Queue scoped Crank event',exact:true}).click();assert.equal((await state()).data.providerJobs.length,jobsBeforeForm,'Native scoped release replay keeps the same exact-source event')
  const staleSource=await read('engagements',project.id),staleJob=await queueSigned({connectionId:zapier.id,sourceRef:`engagements:${staleSource.id}:${staleSource.revision}`,reason:'Owner releases a source for a stale-request refusal'})
  await cmd('providerJob:dispatch',staleJob);const staleAdmitted=await read('providerJobs',staleJob.id),staleReceipt=receiptFor(staleAdmitted,'This stale request must not apply')
  await cmd('save:engagements',{...staleSource.value,...staleSource,scope:'Source changed after workflow admission'})
  await cmd('providerJob:apply-followup',{...staleAdmitted,connectionId:receiptKey.id,receipt:JSON.stringify(staleReceipt),signature:proofSignature(staleReceipt),reason:'Attempt a stale workflow result',confirm:'apply-exact-followup',customFields:{[required.id]:'Must not persist'}},owner,409)
  assert.equal((await state()).data.tasks.length,beforeTasks+2)
  await cmd('provider:revoke',await read('providerConnections',receiptKey.id));await cmd('providerJob:apply-followup',crankReview,owner,409)
  assert.deepEqual((await state(people.find(p=>p.role==='finance').cookie)).data.providerFollowups,[])
  const auditProof=await(await request('/api/gauge/audit?action=providerJob:apply-followup',owner)).json();assert(JSON.stringify(auditProof).includes(applied.id))
  for(const path of ['/api/gauge/state','/app/access','/api/gauge/audit/export']){const body=await(await request(path,owner)).text();assert(!body.includes(receiptSecret)&&!body.includes('synthetic-gauge-5102')&&!body.includes(review.signature),'Receipt secrets and authentication proofs are absent from '+path)}
  await page.reload();await capture('signed-event-outcomes',section('Queued work and outcomes'))
  for(const path of ['/api/gauge/state','/app/access','/api/gauge/audit/export']){const body=await(await request(path,owner)).text();for(const value of [bundle,hook,signingKey,'synthetic-gauge-5004','synthetic-gauge-5005'])assert(!body.includes(value),'Signed-hook custody is absent from '+path)}

 }finally{receiver?.close();await context.close();await h.close();await rm(directory,{recursive:true,force:true})}
 console.log('PASS GOVERN-008 owner provider custody: exact secret replay, native rotation and requeue, durable owned exceptions, one concurrent Crank submission, terminal revocation, owner-only metadata, secret-free public surfaces and 1440/390')
}

// Connector readback is a separate business journey, folded into the existing pipeline suite.
export async function connectorHealthJourney(browser){
 let h=await harness({databaseBinding:false,currency:'USD',timezone:'America/New_York'});const directory=h.directory
 const cmd=(...args)=>h.cmd(...args),state=()=>h.state(),read=async(kind,id)=>(await state()).data[kind].find(r=>r.id===id)
 const originals=new Map(),credentials=['synthetic-gauge-4001','synthetic-gauge-4002'];let expired=false
 const attach=()=>{h.providerEdge.handler=async request=>{
  const id=request.url.match(/^https:\/\/api.resend.com\/emails\/([A-Za-z0-9_-]+)$/)?.[1]
  if(!id)return
  if(expired)return Response.json({error:'Authorization expired'},{status:401})
  const mail=originals.get(id);assert(mail,'Readback requests only native proposal message ids')
  return Response.json({id,to:mail.to,subject:mail.subject,text:mail.text,last_event:'delivered'})
 }}
 const context=await browser.newContext({ignoreHTTPSErrors:true})
 try{
  const zone='America/New_York',person=await cmd('save:people',{name:'Northline proposal lead',employmentType:'contractor',timezone:zone}),client=await cmd('save:clients',{name:'Northline reconciliation'})
  await cmd('save:calendars',{personId:person.id,from:'2026-11-02',to:'2026-11-06',dailySeconds:28800,weekdays:'1,2,3,4,5',timezone:zone})
  await h.invite('synthetic-gauge-4003')
  const connection=await cmd('provider:connect',{provider:'resend',accountLabel:'Northline reconciliation mail',credential:credentials[0]})
  for(const [index,price]of [10000,20000].entries()){
   const opportunity=await cmd('save:opportunities',{name:'Northline signed work '+index,clientId:client.id,ownerId:person.id,stage:'proposal',probability:75,amountMinor:price,demandSeconds:3600,services:'Design',from:'2026-11-02',to:'2026-11-06'})
   const estimate=await cmd('estimate:save',{opportunityId:opportunity.id,name:'Northline offer '+index,phases:[{key:'design',name:'Design',service:'Design',mode:'fixed',from:'2026-11-02',to:'2026-11-06'}],lines:[{key:'design',phaseKey:'design',kind:'subcontractor',name:'Design',personId:person.id,role:'Designer',effortSeconds:3600,billRateMinor:price,costRateMinor:5000,costReference:'synthetic-gauge-4004'}],reason:'Native immutable reconciliation source'})
   const proposal=await cmd('commercial:prepare',{estimateId:estimate.id,estimateRevision:estimate.revision,agencyName:'Northline',title:'Northline proposal '+index,recipientName:'Northline client',recipientContact:'synthetic-gauge-4003@example.test',scope:'One hour of design',deliverables:['Design handover'],exclusions:['Production'],from:'2026-11-02',to:'2026-11-06',expiry:new Date(Date.now()+7*86400000).toISOString().slice(0,10),paymentSchedule:[{name:'Handover',due:'2026-11-06',amountMinor:price}],signatureRequired:false,reason:'Reviewed customer version'})
   await cmd('commercial:send',{...proposal,connectionId:connection.id,reason:'Owner sends reviewed version'})
   const delivery=(await state()).data.commercialEvents.find(r=>r.value.proposalId===proposal.id&&r.value.type==='delivery');originals.set(delivery.value.providerMessageId,h.mails.at(-1))
  }
  attach()
  const sync=await cmd('providerSync:start',{connectionId:connection.id}),initial=await read('providerSyncs',sync.id)
  assert.equal(initial.value.sourceCount,2);assert.deepEqual(initial.value.sourceTotals,{USD:30000})
  const first=await cmd('providerSync:advance',initial),one=await read('providerSyncs',sync.id)
  assert.equal(one.value.cursor,1);assert.equal(one.value.outcomes.length,1)
  expired=true;await cmd('providerSync:advance',first)
  const interrupted=await read('providerSyncs',sync.id);assert.equal(interrupted.value.cursor,1);assert.equal(interrupted.value.status,'exception');assert.equal(interrupted.value.exceptionClass,'authorization-expired')
  const kept=structuredClone(interrupted.value.reconciledTotals)
  await h.close();h=await harness({databaseBinding:false,currency:'USD',timezone:zone,persistenceDirectory:directory});attach()
  const afterRestart=await read('providerSyncs',sync.id);assert.deepEqual(afterRestart.value,interrupted.value,'Real Worker restart preserves the exact mid-page checkpoint and controls')
  const oldConnection=await read('providerConnections',connection.id);await cmd('provider:rotate',{...oldConnection,credential:credentials[1]});expired=false
  const key=randomUUID(),resume={id:sync.id,revision:afterRestart.revision,key},result=await cmd('providerSync:advance',resume)
  assert.deepEqual(await cmd('providerSync:advance',resume),result,'Exact resumed page replay returns its original checkpoint')
  const done=await read('providerSyncs',sync.id)
  assert.equal(done.value.status,'completed');assert.equal(done.value.cursor,2);assert.equal(done.value.reconciledCount,done.value.sourceCount)
  assert.deepEqual(done.value.reconciledTotals,{USD:30000});assert.deepEqual(done.value.reconciledTotals,done.value.sourceTotals)
  assert.equal(new Set(done.value.outcomes.map(o=>o.jobId)).size,2,'Sources reconcile once across expiration, restart and exact replay')
  assert.notDeepEqual(kept,done.value.reconciledTotals)
  assert(h.providerRequests.filter(r=>r.url.startsWith('https://api.resend.com/emails/')).every(r=>r.method==='GET'),'Recovery never submits mail')
  const finance=await h.invite('synthetic-gauge-4005');await cmd('grant',{operatorId:finance.id,personId:person.id,role:'finance',enabled:true})
  await cmd('providerSync:start',{connectionId:connection.id},finance.cookie,403);await cmd('providerSync:advance',done,finance.cookie,403)
  assert.deepEqual((await h.state(finance.cookie)).data.providerSyncs,[]);assert.equal((await h.request('/api/gauge/history/providerSyncs/'+done.id,finance.cookie)).status,403)
  const exported=JSON.stringify(await(await h.request('/api/gauge/audit/export',finance.cookie)).json());assert(!exported.includes('Northline reconciliation mail'))
  await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  const page=await context.newPage();await page.goto(h.origin+'/app/access')
  const shots=process.env.GAUGE_PROVIDER_SHOTS;if(shots)await mkdir(shots,{recursive:true})
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
   for(const [name,heading]of [['connector-health','Connector health'],['connector-checkpoints','Reconciliation checkpoints']]){
    const section=page.locator('section.g-card').filter({has:page.getByRole('heading',{name:heading,exact:true})});assert.equal(await section.count(),1)
    assert((await section.innerText()).includes(name==='connector-health'?'Northline reconciliation mail':'2 / 2 sources'))
    if(shots)await section.screenshot({path:`${shots}/${name}-${width}.png`})
   }
  }
  for(const path of ['/api/gauge/state','/app/access','/api/gauge/audit/export']){
   const value=await(await h.request(path,h.owner)).text();for(const credential of credentials)assert(!value.includes(credential),'No credential enters connector state, page or export')
  }
 }finally{await context.close();await h.close();await rm(directory,{recursive:true,force:true})}
 console.log('PASS connectorHealthJourney: exact source/value snapshot, expired token mid-page, durable cursor after restart and reauthorization, once-only controls, owner-only health and 1440/390')
}

// Run outside push Verify on the committed candidate for the real elapsed-time proof.
export async function providerRetryJourney(browser){
 let h=await harness({databaseBinding:false,currency:'USD',timezone:'America/New_York'});const directory=h.directory
 const cmd=(...args)=>h.cmd(...args),state=()=>h.state(),read=async id=>(await state()).data.providerJobs.find(j=>j.id===id)
 let attempts=0
 const attach=()=>{h.providerEdge.handler=async request=>{if(request.url==='https://crank.example.test/api/crank/flows/budget-exception/trigger'){attempts++;return Response.json({error:'Rate limited'},{status:429})}}}
 const context=await browser.newContext({ignoreHTTPSErrors:true})
 try{
  const zone='America/New_York',person=await cmd('save:people',{name:'Northline retry lead',timezone:zone}),client=await cmd('save:clients',{name:'Northline retry controls'})
  const project=await cmd('save:engagements',{name:'Northline bounded jobs',clientId:client.id,leadId:person.id,members:[person.id],scope:'Bounded provider job controls',timezone:zone})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:10000,effortSeconds:3600,roundingSeconds:60,reason:'One-hour allowance'}))
  await cmd('budget:thresholds',{engagementId:project.id,thresholds:[50,75],reason:'Owner wants a budget-risk event'})
  const task=await cmd('save:tasks',{engagementId:project.id,name:'Design',remainingSeconds:3600})
  await cmd('time:submit',await cmd('time:save',{engagementId:project.id,taskId:task.id,personId:person.id,service:'Design',timezone:zone,billable:false,notes:'Native threshold source',start:'2026-10-08T09:00:00-04:00',end:'2026-10-08T10:00:00-04:00'}))
  const alert=(await state()).data.budgetAlerts.find(a=>a.value.engagementId===project.id&&a.value.metric==='hours'&&a.value.threshold===50),retryAlert=(await state()).data.budgetAlerts.find(a=>a.value.engagementId===project.id&&a.value.metric==='hours'&&a.value.threshold===75)
  const connection=await cmd('provider:connect',{provider:'crank',accountLabel:'Northline bounded retry connection',credential:'synthetic-gauge-6001'})
  const input={connectionId:connection.id,alertId:alert.id,alertRevision:alert.revision,endpoint:'https://crank.example.test/api/crank/flows/budget-exception/trigger'}
  attach()
  const cancelled=await cmd('providerJob:queue-crank',input);await cmd('providerJob:dispatch',cancelled)
  let job=await read(cancelled.id);assert.equal(job.value.status,'retry-wait');assert(job.value.nextAttemptAt>=job.value.attemptedAt+60000)
  const noRetry=attempts;await cmd('providerJob:dispatch',job);assert.equal(attempts,noRetry,'Dispatch before the persisted due time sends nothing')
  await cmd('providerJob:cancel',{...job,reason:'Owner cancels before a provider retry'});job=await read(cancelled.id);assert.equal(job.value.status,'cancelled');await cmd('providerJob:dispatch',job);assert.equal(attempts,noRetry)
  const queued=await cmd('providerJob:queue-crank',{...input,alertId:retryAlert.id,alertRevision:retryAlert.revision});await cmd('providerJob:dispatch',queued);job=await read(queued.id)
  await h.close();h=await harness({databaseBinding:false,currency:'USD',timezone:zone,persistenceDirectory:directory});attach()
  assert.deepEqual((await read(queued.id)).value,job.value,'Actual Worker restart retains attempt count and backoff')
  for(const expected of [2,3]){
   const delay=Math.max(0,job.value.nextAttemptAt-Date.now()+30)
   console.log(`WAIT providerRetryJourney: attempt ${expected}, persisted backoff ${delay} ms`)
   await new Promise(resolve=>setTimeout(resolve,delay))
   await cmd('providerJob:dispatch',job);job=await read(job.id)
   assert.equal(job.value.attempts,expected)
   if(expected===2){assert.equal(job.value.status,'retry-wait');assert(job.value.nextAttemptAt>=job.value.attemptedAt+120000)}
  }
  assert.equal(job.value.status,'exception');assert.equal(job.value.exceptionClass,'retry-exhausted');assert.equal(job.value.nextAttemptAt,null)
  const exhausted=attempts;await cmd('providerJob:dispatch',job);assert.equal(attempts,exhausted,'Exhaustion cannot silently create another attempt')
  const limited=await cmd('provider:connect',{provider:'crank',accountLabel:'Northline ten-job provider limit',credential:'synthetic-gauge-6002'})
  const countBefore=attempts
  for(let i=0;i<11;i++){
   const projectLimit=await cmd('save:engagements',{name:'Native limited source '+i,clientId:client.id,leadId:person.id,members:[],scope:'Independent reviewed limit source',timezone:zone});const queuedLimit=await cmd('providerJob:queue-crank-source',{connectionId:limited.id,endpoint:input.endpoint,sourceRef:`engagements:${projectLimit.id}:${projectLimit.revision}`,reason:'Owner releases an independent native source'});await cmd('providerJob:dispatch',queuedLimit)
   if(i===10){const held=await read(queuedLimit.id);assert.equal(held.value.status,'retry-wait');assert.equal(held.value.attempts,0);assert.equal(held.value.exceptionClass,'provider-rate-limit')}
  }
  assert.equal(attempts-countBefore,10,'The eleventh source job cannot exceed the durable per-connection minute limit')
  await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  const page=await context.newPage();await page.goto(h.origin+'/app/access');const shots=process.env.GAUGE_PROVIDER_SHOTS;if(shots)await mkdir(shots,{recursive:true})
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const row=page.locator('[id="'+job.id+'"]');assert.match(await row.innerText(),/retry-exhausted/);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await row.screenshot({path:`${shots}/bounded-retry-exhausted-${width}.png`})}
  await cmd('providerJob:resume-refused',{...job,reason:''},h.owner,400)
  const oldEventId=job.value.eventId,oldAttempts=attempts
  const review=page.locator('[id="'+job.id+'"] details').filter({has:page.locator('[name=action][value="providerJob:resume-refused"]')})
  await review.locator('summary').click();await review.locator('[name=reason]').fill('Owner reviewed provider non-admission and explicitly authorizes one new bounded round')
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});if(shots)await review.screenshot({path:`${shots}/owned-dead-letter-review-${width}.png`})}
  const [reviewResponse]=await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),review.getByRole('button',{name:'Review and resume refused work',exact:true}).click()]);assert.equal(reviewResponse.status(),303)
  const resumed=await read(job.id);assert.equal(resumed.value.eventId,oldEventId);assert.equal(resumed.value.status,'queued');assert.equal(resumed.value.attempts,0);assert.equal(resumed.value.refusedRounds[0].attempts,3);assert.equal(attempts,oldAttempts,'Dead-letter review queues only; it never sends without another explicit dispatch')
  const history=await(await h.request('/api/gauge/history/providerJobs/'+job.id,h.owner)).json();assert(history.history.some(r=>r.value.exceptionClass==='retry-exhausted'&&r.value.attempts===3))
  await cmd('providerJob:cancel',{...resumed,reason:'Owner cancels the reviewed round before dispatch'})
 }finally{await context.close();await h.close();await rm(directory,{recursive:true,force:true})}
 console.log('PASS providerRetryJourney: real 60/120-second backoff, cancellation, restart, exactly three bounded attempts, owned exhaustion and 1440/390')
}

// Dedicated outside-Verify command; importing this file into the pipeline never
// starts an elapsed-time journey or another browser.
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href&&process.argv.includes('--retry-timing')){
 const {chromium}=await import('@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{await providerRetryJourney(browser)}finally{await browser.close()}
}
