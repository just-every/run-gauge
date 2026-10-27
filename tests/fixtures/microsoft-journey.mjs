import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {harness} from '../gauge-harness.mjs'

export const tenantId='10000000-0000-4000-8000-000000000001',clientId='10000000-0000-4000-8000-000000000002',mailboxId='10000000-0000-4000-8000-000000000003'
const credential=`${tenantId}:${clientId}:synthetic-gauge-900001`,mailbox='jordan@example.test',contact='casey@example.test'
export function microsoftEdge(){
 const edge={roles:['User.Read.All','Calendars.Read','Mail.Read','MailboxSettings.Read'],requests:[],users:[{id:mailboxId,mail:mailbox,userType:'Member',accountEnabled:true,assignedLicenses:[{skuId:'synthetic-gauge-2'}]}],purpose:'user',events:[],messages:[],original:null,fail:null,next:null}
 edge.handler=async(req,body)=>{
  const url=new URL(req.url)
  if(url.origin==='https://login.microsoftonline.com'){
   assert.equal(url.pathname,`/${tenantId}/oauth2/v2.0/token`);assert.equal(req.method,'POST');assert.equal(body.client_id,clientId);assert.equal(body.client_secret,'synthetic-gauge-900001');assert.equal(body.scope,'https://graph.microsoft.com/.default');assert.equal(body.grant_type,'client_credentials')
   edge.requests.push({kind:'token'})
   const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
   return Response.json({token_type:'Bearer',access_token:`${b64({alg:'RS256'})}.${b64({tid:tenantId,appid:clientId,aud:'https://graph.microsoft.com',exp:Math.floor(Date.now()/1000)+300,roles:edge.roles})}.c3ludGhldGljLWdhdWdlLTk`})
  }
  if(url.origin!=='https://graph.microsoft.com')return null
  assert.equal(req.method,'GET','Work context never writes to Microsoft');assert.match(req.headers.get('prefer'),/ImmutableId/)
  edge.requests.push({kind:'graph',path:url.pathname,query:url.search})
  if(edge.fail)return Response.json({error:{code:'ErrorAccessDenied',message:'synthetic-private-error'}},{status:edge.fail})
  if(url.pathname==='/v1.0/users')return Response.json({value:edge.users})
  assert(url.pathname.startsWith(`/v1.0/users/${mailboxId}`),'Only the exact selected mailbox is contacted')
  if(url.pathname===`/v1.0/users/${mailboxId}`)return Response.json(edge.users[0])
  if(url.pathname.endsWith('/mailboxSettings'))return Response.json({userPurpose:edge.purpose})
  if(url.pathname.endsWith('/calendar/calendarView'))return Response.json({value:edge.events,...(edge.next?{'@odata.nextLink':edge.next}:{})})
  if(url.pathname.endsWith('/messages/synthetic-gauge-20'))return Response.json(edge.original)
  if(url.pathname.endsWith('/mailFolders/inbox/messages')){assert.equal(url.searchParams.get('$filter'),"conversationId eq 'synthetic-gauge-21'");return Response.json({value:edge.messages})}
  throw Error('Unexpected Microsoft resource')
 }
 return edge
}
const event=(id,subject,over={})=>({id,subject,sensitivity:'normal',showAs:'busy',start:{dateTime:'2026-10-19T09:00:00.0000000',timeZone:'UTC'},end:{dateTime:'2026-10-19T10:00:00.0000000',timeZone:'UTC'},isCancelled:false,...over})

/** Native owner page and API doors, with only Microsoft itself replaced at the network boundary. */
export async function microsoftJourney(browser){
 console.log('Microsoft journey: starting native Worker')
 const h=await harness({currency:'USD',timezone:'America/New_York',databaseBinding:false,beforeLogin:async()=>console.log('Microsoft journey: native owner bootstrapped')}),{cmd,state,request}=h,edge=microsoftEdge();h.providerEdge.handler=edge.handler
 const context=await browser.newContext({ignoreHTTPSErrors:true})
 try{
  console.log('Microsoft journey: native setup ready')
  const person=await cmd('save:people',{name:'Jordan Lane',timezone:'America/New_York'}),other=await h.invite('synthetic-gauge-27')
  const connected=await cmd('provider:connect',{provider:'microsoft',accountLabel:'Harbor Microsoft tenant',credential})
  console.log('Microsoft journey: credential sealed')
  const inspect=await cmd('graph:inspect',{connectionId:connected.id});assert.equal(inspect.status,'connected')
  let data=(await state()).data
  assert.equal(data.graphTenants.length,1);assert.equal(data.graphTenants[0].value.directoryUsers,1);assert.equal(data.graphTenants[0].value.licensedUsers,1);assert.equal(data.graphTenants[0].value.tenantId,tenantId)
  const select={connectionId:connected.id,personId:person.id,mailboxId,mailboxKind:'staff',confirm:'reviewed-exact-mailbox',scopes:'calendar mail',from:'2026-10-01',to:'2026-10-31',reason:'Tenant admin approved these exact staff mailbox scopes'}
  let before=edge.requests.length
  await cmd('graph:select',{...select,mailboxKind:'shared'},h.owner,403);assert.equal(edge.requests.length,before,'A shared mailbox never reaches the provider')
  await cmd('graph:select',{...select,confirm:''},h.owner,400)
  edge.users[0].assignedLicenses=[];await cmd('graph:select',select,h.owner,409);edge.users[0].assignedLicenses=[{skuId:'synthetic-gauge-2'}]
  edge.purpose='shared';await cmd('graph:select',select,h.owner,403);assert.equal((await state()).data.graphSelections.length,0,'Provider-classified shared mailbox is refused even with staff selected');edge.purpose='user'
  await cmd('graph:select',select,other.cookie,403)
  console.log('Microsoft journey: tenant and mailbox refusals passed')
  // Select the exact mailbox through the built page, as the owner does.
  await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  const page=await context.newPage(),form=action=>page.locator('form').filter({has:page.locator(`input[name="action"][value="${action}"]`)})
  await page.goto(h.origin+'/app/access')
  const selectionForm=form('graph:select');await selectionForm.getByLabel('Microsoft user GUID').fill(mailboxId);await selectionForm.getByLabel('Collection scopes').selectOption('calendar mail');await selectionForm.getByLabel('Calendar window start').fill('2026-10-01');await selectionForm.getByLabel('Calendar window end').fill('2026-10-31');await selectionForm.getByLabel('Consent review reason').fill(select.reason);await selectionForm.getByRole('checkbox').check()
  await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),selectionForm.getByRole('button',{name:'Select mailbox',exact:true}).click()])
  data=(await state()).data;assert.equal(data.graphSelections.length,1);let s=data.graphSelections[0];assert.equal(s.value.personId,person.id);assert.deepEqual(s.value.scopes,{calendar:'active',mail:'active'})
  const latest=async()=>{s=(await state()).data.graphSelections.find(r=>r.id===s.id);return {id:s.id,revision:s.revision}}
  const sync=async scope=>cmd('graph:sync',{...await latest(),scope})
  edge.events=[event('synthetic-gauge-10','Harbor planning'),event('synthetic-gauge-11','synthetic-private-title',{sensitivity:'private',body:{content:'synthetic-private-body'},attendees:[{emailAddress:{address:'synthetic-private-person'}}]})]
  await page.goto(h.origin+'/app/access')
  await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),form('graph:sync').filter({has:page.locator('input[name="scope"][value="calendar"]')}).getByRole('button',{name:'Read calendar',exact:true}).click()])
  data=(await state()).data;assert.equal(data.graphEvidence.length,2);assert.deepEqual(data.graphEvidence.map(r=>r.value.subject).sort(),['Harbor planning','Private event'])
  assert.equal(data.graphEvidence.find(r=>r.value.private).value.start,'2026-10-19T09:00:00.000Z')
  assert(!JSON.stringify(data).includes('synthetic-private-'),'Private details are absent from state')
  assert.equal(data.time.length,0);assert.equal(data.leave.length,0);assert.equal(data.staffing.length,0,'Calendar context changes no contractual capacity')
  const original=data.graphEvidence.find(r=>r.value.sourceId==='synthetic-gauge-10')
  edge.events[0]=event('synthetic-gauge-10','Harbor planning revised',{start:{dateTime:'2026-10-19T11:00:00',timeZone:'UTC'},end:{dateTime:'2026-10-19T12:00:00',timeZone:'UTC'}})
  assert.equal((await sync('calendar')).changed,1)
  data=(await state()).data;const revised=data.graphEvidence.find(r=>r.id===original.id);assert.equal(revised.value.start,'2026-10-19T11:00:00.000Z');assert.equal(revised.value.subject,'Harbor planning revised');assert.notEqual(revised.revision,original.revision);assert.equal(data.graphEvidence.length,2)
  assert.equal((await sync('calendar')).changed,0,'Identical evidence is not rewritten')
  const history=await(await request(`/api/gauge/history/graphEvidence/${original.id}`,h.owner)).json();assert(JSON.stringify(history).includes('Harbor planning'),'The previous observed event remains inspectable')
  edge.next=`https://graph.microsoft.com/v1.0/users/10000000-0000-4000-8000-000000000099/calendar/calendarView?$skiptoken=synthetic-gauge-31`
  assert.equal((await sync('calendar')).status,'exception');assert.equal((await state()).data.graphEvidence.length,2,'Unsafe pagination commits no partial snapshot');assert(!edge.requests.some(r=>r.path?.includes('000000000099')))
  edge.next=null;assert.equal((await sync('calendar')).status,'read')

  console.log('Microsoft journey: changed calendar and privacy passed')
  // Issue a real native invoice and bind its exact released recipient to the reviewed outgoing message.
  const client=await cmd('save:clients',{name:'Harbor Studio'}),project=await cmd('save:engagements',{name:'Harbor October support',clientId:client.id,leadId:person.id,members:[person.id],scope:'Support',timezone:'America/New_York'})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:3600,roundingSeconds:60,reason:'Support terms'}))
  await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',billMinor:12000,costMinor:6000})
  const task=await cmd('save:tasks',{engagementId:project.id,name:'Support handover',remainingSeconds:0})
  const time=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:'Support',notes:'Reviewed support work',timezone:'America/New_York',billable:true,start:'2026-10-07T09:00:00-04:00',end:'2026-10-07T10:00:00-04:00'})))
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'October support',sources:[`time:${time.id}`]}))
  const invoice=await cmd('invoice:issue',{...packet,issueDate:'2026-10-10',dueDate:'2026-11-09',billTo:'Harbor accounts payable',remitTo:'Agency',reference:'October support'})
  await h.invite('casey')
  const release=await cmd('invoice:release',{...invoice,contact,days:7,reason:'Review exact support invoice'})
  const issued=(await state()).data.invoices.find(r=>r.id===invoice.id)
  edge.original={id:'synthetic-gauge-20',conversationId:'synthetic-gauge-21',internetMessageId:'<synthetic-gauge-22@example.test>',isDraft:false,from:{emailAddress:{address:mailbox}},toRecipients:[{emailAddress:{address:contact}}],subject:`Invoice ${issued.value.number} · ${issued.value.document.agencyName}`,sentDateTime:'2026-10-10T12:00:00Z'}
  const binding={...await latest(),release:release.id+'@'+release.revision,messageId:'synthetic-gauge-20',reason:'Reviewed outgoing exact invoice'}
  edge.original.toRecipients=[{emailAddress:{address:'synthetic-gauge-23@example.test'}}];await cmd('graph:bind-invoice',binding,h.owner,409);assert.equal((await state()).data.graphThreads.length,0)
  edge.original.toRecipients=[{emailAddress:{address:contact}}]
  await page.goto(h.origin+'/app/access');await form('graph:bind-invoice').getByLabel('Reviewed outgoing Microsoft message id').fill('synthetic-gauge-20');await form('graph:bind-invoice').getByLabel('Invoice thread review reason').fill(binding.reason)
  await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),form('graph:bind-invoice').getByRole('button',{name:'Bind conversation',exact:true}).click()])
  assert.equal((await state()).data.graphThreads.length,1)
  const reply={id:'synthetic-gauge-24',conversationId:'synthetic-gauge-21',from:{emailAddress:{address:contact}},toRecipients:[{emailAddress:{address:mailbox}}],subject:'Re: October support invoice',receivedDateTime:'2026-10-20T14:00:00Z',isDraft:false,internetMessageHeaders:[{name:'In-Reply-To',value:'<synthetic-gauge-22@example.test>'}],bodyPreview:'synthetic-private-mail-body'}
  edge.messages=[reply,{...reply,id:'synthetic-gauge-25',from:{emailAddress:{address:'outsider@example.test'}}},{...reply,id:'synthetic-gauge-26',conversationId:'synthetic-gauge-other'}, {...reply,id:'synthetic-gauge-28',internetMessageHeaders:[]}]
  assert.equal((await sync('mail')).found,1)
  data=(await state()).data;assert.equal(data.graphEvidence.filter(r=>r.value.scope==='mail').length,1);const received=data.graphEvidence.find(r=>r.value.scope==='mail');assert.equal(received.value.invoiceId,invoice.id);assert.equal(received.value.invoiceRevision,invoice.revision);assert.equal(received.value.subject,reply.subject);assert.equal(received.value.receivedAt,'2026-10-20T14:00:00.000Z');assert.equal(received.value.billable,false)
  assert(!JSON.stringify(data.graphEvidence).includes(reply.bodyPreview));assert.equal(data.payments.length,0);assert.equal(data.invoiceDisputes.length,0);assert.equal(data.time.length,1)
  assert.equal((await sync('mail')).changed,0,'One reply is retained once under replayed polling')

  console.log('Microsoft journey: exact invoice reply passed')
  // Every other principal and history and audit projections preserve owner-only work context.
  for(const [n,role] of ['finance','lead','staff','agent'].entries()){
   const user=await h.invite('synthetic-gauge-4'+n);await cmd('grant',{operatorId:user.id,role,enabled:true,...(role==='agent'?{purpose:'time',engagementIds:[project.id]}:{personId:person.id})})
   const seen=await state(user.cookie)
   for(const kind of ['graphTenants','graphSelections','graphThreads','graphEvidence'])assert.deepEqual(seen.data[kind],[],`${role} sees no Microsoft context`)
   for(const action of ['graph:inspect','graph:select','graph:sync','graph:bind-invoice','graph:revoke-scope','graph:stop'])await cmd(action,{...await latest(),scope:'calendar'},user.cookie,403)
   const historyText=await(await request(`/api/gauge/history/graphEvidence/${original.id}`,user.cookie)).text();assert(!historyText.includes('Harbor planning'))
   if(role==='finance'){const audit=await(await request('/api/gauge/audit/export',user.cookie)).text();assert(!audit.includes(mailbox)&&!audit.includes('Harbor planning revised'))}
  }
  const shots=process.env.GAUGE_MICROSOFT_SHOTS;if(shots)await mkdir(shots,{recursive:true})
  const capture=async(label)=>{for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/access');await page.evaluate(()=>document.fonts.ready)
   if(shots)await page.locator('#microsoft-context').screenshot({path:`${shots}/microsoft-${label}-full-${width}.png`})
   const fit=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth+1,overflow:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,class:el.className}))}))
   assert(fit.fits,`Microsoft context fits ${width}: ${JSON.stringify(fit.overflow)}`)
   if(shots)for(const title of ['Tenant approval','Selected mailboxes','Microsoft context']){
    const card=page.locator('#microsoft-context section').filter({has:page.getByRole('heading',{name:title,exact:true})})
    await card.screenshot({path:`${shots}/microsoft-${label}-${title.replaceAll(' ','-').toLowerCase()}-${width}.png`})
   }
  }}
  await capture('active')
  // A fresh app token omitting one permission stops that scope before any mailbox request; the other keeps working.
  edge.roles=edge.roles.filter(r=>r!=='Mail.Read');before=edge.requests.filter(r=>r.kind==='graph').length
  const revoked=await sync('mail');assert.equal(revoked.status,'exception');assert.equal(revoked.exceptionClass,'permission-revoked');assert.equal(edge.requests.filter(r=>r.kind==='graph').length,before)
  before=edge.requests.length;await cmd('graph:sync',{...await latest(),scope:'mail'},h.owner,409);assert.equal(edge.requests.length,before,'A stopped scope no longer requests tokens or data')
  edge.events=[edge.events[0]];assert.equal((await sync('calendar')).status,'read');assert.equal((await state()).data.graphEvidence.find(r=>r.value.sourceId==='synthetic-gauge-11').value.removed,true)
  // An actual provider denial is visible and freezes collection too.
  edge.fail=403;assert.equal((await sync('calendar')).exceptionClass,'permission-revoked');edge.fail=null
  before=edge.requests.length;await cmd('graph:sync',{...await latest(),scope:'calendar'},h.owner,409);assert.equal(edge.requests.length,before)
  // Phone and desktop proof includes both successful context and stopped-scope end states.
  await capture('stopped')
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/access');await page.evaluate(()=>document.fonts.ready)
   if(shots)await page.locator('#microsoft-context').screenshot({path:`${shots}/microsoft-${label}-full-${width}.png`})
   const fit=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth+1,overflow:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,class:el.className}))}))
   assert(fit.fits,`Microsoft context fits ${width}: ${JSON.stringify(fit.overflow)}`)
   const section=page.locator('#microsoft-context');assert.match(await section.innerText(),/permission-revoked/);assert.match(await section.innerText(),/Re: October support invoice/)
   assert.equal(await section.getByRole('button',{name:'Read mail',exact:true}).count(),0)
   if(shots)await section.screenshot({path:`${shots}/microsoft-stopped-${width}.png`})
   const iconControls=await page.locator('button,a[role="button"]').evaluateAll(nodes=>nodes.filter(el=>!el.textContent.trim()).map(el=>({label:el.getAttribute('aria-label'),tip:el.getAttribute('data-tooltip')})))
   assert(iconControls.every(c=>c.label&&c.tip),'Every icon-only control has a tooltip')
  }
  // Stop is audited and immediately prevents every mailbox read. Connection revocation also blocks tenant inspection.
  await cmd('graph:stop',{...await latest(),reason:'Stop all mailbox context'})
  const connection=(await state()).data.providerConnections.find(r=>r.id===connected.id);await cmd('provider:revoke',connection)
  before=edge.requests.length;await cmd('graph:inspect',{connectionId:connected.id},h.owner,409);await cmd('graph:sync',{...await latest(),scope:'calendar'},h.owner,409);assert.equal(edge.requests.length,before)
  const audit=await(await request('/api/gauge/audit?action=graph:',h.owner)).text();assert(audit.includes('graph:stop')&&audit.includes('permission-revoked'))
  const persisted=await(await request('/api/gauge/audit/export',h.owner)).text()
  for(const secret of [credential,'synthetic-gauge-900001','synthetic-private-title','synthetic-private-body','synthetic-private-mail-body','synthetic-private-error'])assert(!persisted.includes(secret),'Secrets and excluded private provider fields never reach the business audit')
  console.log('PASS microsoftJourney: tenant consent, exact licensed staff mailbox, changed event and previous revision, private-event projection, exact invoice reply and sender refusals, independent scope revocation, provider denial, no non-owner exposure, no automatic business effects, owner page at 1440 and 390')
 }finally{await context.close();await h.dispose()}
}
