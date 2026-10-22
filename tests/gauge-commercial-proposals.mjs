import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

export async function commercialProposalJourney(h,browser){
 const {cmd,state,request,post,owner}=h,zone='America/New_York'
 const connection=await cmd('provider:connect',{provider:'resend',accountLabel:'Northline proposal mail',credential:'synthetic-gauge-2001'})
 const person=await cmd('save:people',{name:'Avery Brooks',timezone:zone})
 const client=await cmd('save:clients',{name:'Northline Studio'})
 await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',billMinor:15000,costMinor:9000})
 await cmd('save:calendars',{personId:person.id,from:'2026-11-02',to:'2026-11-06',dailySeconds:28800,weekdays:'1,2,3,4,5',timezone:zone})
 const opportunity=await cmd('save:opportunities',{name:'Northline launch',clientId:client.id,ownerId:person.id,stage:'proposal',probability:75,amountMinor:150000,demandSeconds:36000,services:'Design',from:'2026-11-02',to:'2026-11-06'})
 const estimateInput={opportunityId:opportunity.id,name:'Northline launch design',reason:'Price a ten-hour design engagement',phases:[{key:'design',name:'Launch design',service:'Design',mode:'fixed',from:'2026-11-02',to:'2026-11-06'}],lines:[{key:'design',phaseKey:'design',kind:'labor',name:'Launch design package',role:'Designer',personId:person.id,effortSeconds:36000,billRateMinor:15000}],contingencyBasisPoints:0,discountBasisPoints:0}
 const estimate=await cmd('estimate:save',estimateInput),recipient=await h.invite('maya.ortiz'),outsider=await h.invite('other.client'),staff=await h.invite('proposal-staff')
 await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true})
 const expiry=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
 const input={estimateId:estimate.id,estimateRevision:estimate.revision,agencyName:'Northline Creative',title:'Launch design proposal',recipientName:'Maya Ortiz',recipientContact:'maya.ortiz@example.test',scope:'Design and hand over the launch campaign.',deliverables:['Three concepts','Final production artwork'],exclusions:['Media buying and printing'],from:'2026-11-02',to:'2026-11-06',expiry,signatureRequired:false,paymentSchedule:[{name:'Kickoff',due:'2026-11-02',amountMinor:75000},{name:'Handover',due:'2026-11-06',amountMinor:75000}],reason:'Owner prepares the exact commercial offer'}
 await cmd('commercial:prepare',input,staff.cookie,403)
 await cmd('commercial:prepare',{...input,paymentSchedule:[{name:'Wrong total',due:'2026-11-02',amountMinor:1}]},owner,400)
 const one=await cmd('commercial:prepare',input),record=async id=>(await state()).data.commercialProposals.find(p=>p.id===id),path=id=>'/app/client-proposals/'+id
 assert.equal((await request(path(one.id),recipient.cookie)).status,403,'Prepared documents are not released')
 const key=randomUUID(),send={...one,connectionId:connection.id,reason:'Owner authorizes sending this reviewed document',key},before=h.mails.length
 const sends=await Promise.all([post('/api/gauge/command',{action:'commercial:send',...send},owner),post('/api/gauge/command',{action:'commercial:send',...send},owner)])
 assert(sends.every(r=>r.status===200));const acknowledgements=await Promise.all(sends.map(r=>r.json()));assert.deepEqual(acknowledgements[0],acknowledgements[1]);assert.equal(h.mails.length,before+1,'Concurrent exact send replay submits one message')
 assert(h.providerRequests.at(-1).headers.authorization==='Bearer synthetic-gauge-2001','Proposal transport uses the selected sealed credential, independently of auth mail');
 assert(h.mails.at(-1).text.includes(path(one.id)));assert(!h.mails.at(-1).html.includes('costMinor'));assert(!h.mails.at(-1).html.includes('Estimated cost'))
 const mail=h.mails.at(-1);assert.deepEqual(mail.to,['maya.ortiz@example.test']);assert(mail.html.includes('Media buying and printing'));assert(mail.html.includes('$1,500.00'))
 assert.deepEqual(await cmd('commercial:send',send),acknowledgements[0]);assert.equal(h.mails.length,before+1)
 const delivery=(await state()).data.commercialEvents.find(e=>e.value.proposalId===one.id&&e.value.type==='delivery');assert.equal(delivery.value.status,'accepted');assert.match(delivery.value.meaning,/mailbox delivery unconfirmed/)
 assert.equal((await request(path(one.id))).status,303);assert.equal((await request(path(one.id),outsider.cookie)).status,403);assert.equal((await request('/api/gauge/state',recipient.cookie)).status,403,'Recipient gains no Gauge staff data')
 const respond=async(row,outcome,reason,expected=200)=>{const r=await record(row.id);const response=await post(path(row.id),{key:randomUUID(),revision:r.revision,fingerprint:r.value.fingerprint,outcome,reason,confirm:'accept-exact-proposal'},recipient.cookie);assert.equal(response.status,expected,await response.text())}
 assert.equal((await request(path(one.id),recipient.cookie)).status,200)
 await respond(one,'question','Does the handover include editable artwork?')
 await respond(one,'rejected','Please explicitly include editable source artwork.')
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage(),cookies=cookie=>cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}})
 const shots=process.env.GAUGE_PROPOSAL_SHOTS;if(shots)await mkdir(shots,{recursive:true})
 const capture=async(name,selector)=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits '+width);if(shots)await page.locator(selector).screenshot({path:`${shots}/${name}-${width}.png`})}}
 try{
  await context.addCookies(cookies(owner));const initialPage=await page.goto(h.origin+`/app/engagements?estimate=${estimate.id}`);assert.equal(initialPage.status(),200,await page.locator('body').innerText())
  const prepare=page.locator('form').filter({has:page.locator('[name=action][value="commercial:prepare"]')})
  assert.equal(await prepare.count(),1,'Native proposal version form is present');
  await prepare.locator('textarea[name=deliverables]').fill([...input.deliverables,'Editable source artwork'].join('\n'));await prepare.getByLabel('Proposal version reason').fill('Address the client question in a new version')
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await prepare.screenshot({path:`${shots}/owner-preparation-${width}.png`})}
  await prepare.getByRole('button',{name:'Prepare proposal',exact:true}).click()
  const two=(await state()).data.commercialProposals.find(r=>r.value.previousId===one.id);assert(two,'Native preparation saves a new immutable version')
  const card=page.locator('#commercial-'+two.id);await card.getByText('Review the exact customer document',{exact:true}).click();await capture('owner-reviewed-document','#commercial-'+two.id)
  const sendForm=card.locator('form').filter({has:page.locator('[name=action][value="commercial:send"]')});await sendForm.getByLabel('Sending reason').fill('Owner sends revised deliverables');await sendForm.getByRole('button',{name:'Send proposal',exact:true}).click()
  assert.equal((await record(two.id)).value.status,'released');await respond(one,'accepted','Old document cannot accept',409)
  await context.clearCookies();await context.addCookies(cookies(recipient.cookie));await page.goto(h.origin+path(two.id));await capture('client-proposal','#proposal-document')
  await page.getByLabel('Your response').selectOption('accepted');await page.getByLabel('Question or decision reason').fill('I accept the revised launch design offer.');await page.locator('[name=confirm]').check();await capture('client-response','#client-response');const [decisionResponse]=await Promise.all([page.waitForResponse(r=>r.url()===h.origin+path(two.id)&&r.request().method()==='POST'),page.getByRole('button',{name:'Submit response',exact:true}).click()]);assert.equal(decisionResponse.status(),303,await decisionResponse.text().catch(()=>''));assert.match(await page.locator('#client-response').innerText(),/accepted by maya.ortiz/);await capture('client-accepted','#client-response')
  const old=(await state()).data.commercialEvents.find(e=>e.value.proposalId===two.id&&e.value.type==='accepted');assert(old)
  const changed=await cmd('estimate:save',{...estimateInput,previousId:estimate.id,lines:[{...estimateInput.lines[0],billRateMinor:16000}],reason:'Client requested a higher-priced design package'})
  await cmd('estimate:convert',changed,owner,409)
  const three=await cmd('commercial:prepare',{...input,estimateId:changed.id,estimateRevision:changed.revision,previousId:two.id,paymentSchedule:[{name:'Kickoff',due:'2026-11-02',amountMinor:80000},{name:'Handover',due:'2026-11-06',amountMinor:80000}],reason:'Fresh proposal for the exact changed price'})
  await cmd('commercial:send',{...three,connectionId:connection.id,reason:'Owner sends the new price for fresh acceptance'})
  await respond(two,'accepted','Prior decision cannot approve a new price',409)
  await respond(three,'accepted','I accept the new $1600 price and payment schedule.')
  assert.equal((await state()).data.commercialEvents.find(e=>e.id===old.id).value.fingerprint,old.value.fingerprint)
  const converted=await cmd('estimate:convert',changed),budget=(await state()).data.budgets.find(b=>b.value.engagementId===converted.id)
  assert.equal(budget.value.amountMinor,160000);assert.match(budget.value.acceptanceNotice,/Accepted through client link/);assert.equal(budget.value.commercialProposalId,three.id)
  assert.equal((await cmd('estimate:convert',changed)).id,converted.id)
  await context.clearCookies();await context.addCookies(cookies(owner));await page.goto(h.origin+`/app/engagements?estimate=${changed.id}`);await capture('proposal-versions','#commercial-proposals');await page.goto(h.origin+`/app/engagements?edit=${converted.id}`);await capture('client-converted','.g-detail-top')
  await cmd('budget:approve',budget)
  const task=(await state()).data.tasks.find(t=>t.value.engagementId===converted.id)
  await page.goto(h.origin+'/app/rates?'+new URLSearchParams({explainPerson:person.id,explainEngagement:converted.id,explainTask:task.id,explainService:'Design',explainDate:'2026-11-02'}));assert.match(await page.locator('#rate-explain').innerText(),/Client-accepted estimate/);await capture('client-rate-provenance','#rate-explain')
  await cmd('commercial:revoke',{...await record(three.id),reason:'Owner revokes recipient access after handover'});assert.equal((await request(path(three.id),recipient.cookie)).status,403)
  // A signature requirement is preserved and cannot be bypassed with ordinary client-link acceptance.
  const signatureOpportunity=await cmd('save:opportunities',{...estimateInput,clientId:client.id,ownerId:person.id,name:'Signature-required work',stage:'proposal',probability:50,amountMinor:150000,demandSeconds:36000,services:'Design',from:'2026-11-02',to:'2026-11-06'})
  const signatureEstimate=await cmd('estimate:save',{...estimateInput,opportunityId:signatureOpportunity.id})
  const signature=await cmd('commercial:prepare',{...input,estimateId:signatureEstimate.id,estimateRevision:signatureEstimate.revision,signatureRequired:true})
  await cmd('commercial:send',{...signature,connectionId:connection.id,reason:'Request review while signature evidence is pending'})
  await respond(signature,'accepted','A checkbox must never manufacture a signature',409)
  assert((await state()).data.commercialEvents.some(e=>e.value.type==='viewed'&&e.value.proposalId===two.id))
  const audit=await(await request('/api/gauge/audit?action=commercial:',owner)).json();assert(JSON.stringify(audit).includes('commercial:respond'));assert(JSON.stringify(audit).includes('commercial:revoke'))
  assert.equal((await state(staff.cookie)).data.commercialProposals.length,0)
  console.log('PASS commercialProposalJourney: exact version delivery, private-cost exclusion, recipient proof, question/rejection/acceptance, fresh price acceptance, primary native conversion, revoked links, signature refusal and 1440/390')
 }finally{await context.close()}
}
