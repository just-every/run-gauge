import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// Part of the existing commercial proposal journey, through built HTTP and forms.
export async function scopeExtractionJourney(h,browser,{signed,estimate,estimateInput,unsigned,staff,person}) {
 const {cmd,request,state,owner}=h
 const finance=await h.invite('synthetic-gauge-701'),agent=await h.invite('synthetic-gauge-702')
 const financePerson=await cmd('save:people',{name:'Rowan Finance',timezone:'America/New_York'})
 await cmd('grant',{operatorId:finance.id,personId:financePerson.id,role:'finance',enabled:true})
 const otherProject=await cmd('save:engagements',{name:'Scope review access fixture',clientId:(await state()).data.clients[0].id,leadId:person.id,members:[person.id],scope:'Internal planning',timezone:'America/New_York'})
 await cmd('grant',{operatorId:agent.id,role:'agent',purpose:'staffing',engagementIds:[otherProject.id],enabled:true})
 const path='/api/gauge/scope-previews/'+signed.id,pagePath='/app/scope-previews/'+signed.id
 const read=async(cookie=owner)=>{const response=await request(path,cookie);assert.equal(response.status,200,await response.clone().text());return response.json()}
 const protectedKinds=['engagements','staffing','resourceRequests','budgets','milestones','retainers','retainerPeriods','retainerSchedules','retainerCharges','fixedCharges','invoices','packets']
 const effects=async()=>{const data=(await state()).data;return Object.fromEntries(protectedKinds.map(k=>[k,data[k]]))}
 const before=await effects(),networkBefore=h.providerRequests.length
 for(const who of [staff,agent]) {
  assert.equal((await request(path,who.cookie)).status,403)
  assert.equal((await request(pagePath,who.cookie)).status,403)
  await cmd('scope:preview',{proposalId:signed.id,proposalRevision:signed.revision,reason:'Unauthorized document read'},who.cookie,403)
 }
 assert.equal((await request(path,'')).status,401)
 assert.equal((await request(path,'',{headers:{authorization:'Bearer synthetic-gauge-703'}})).status,403)
 assert.equal((await request('/api/gauge/scope-previews/'+unsigned.id,owner)).status,409)
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const cookies=cookie=>cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}})
 const shots=process.env.GAUGE_SCOPE_SHOTS
 if(shots)await mkdir(shots,{recursive:true})
 const capture=async(name)=>{
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits '+width)
   assert(await page.locator('#scope-extraction input,#scope-extraction select,#scope-extraction textarea,#scope-extraction button,#scope-extraction p,#scope-extraction li,#scope-extraction code').evaluateAll(nodes=>nodes.every(n=>parseFloat(getComputedStyle(n).fontSize)>=13)))
   if(shots)await page.locator('#scope-extraction').screenshot({path:`${shots}/${name}-${width}.png`})
  }
 }
 try {
  await context.addCookies(cookies(finance.cookie));await page.goto(h.origin+pagePath)
  await page.getByLabel('Preview reason',{exact:true}).fill('Review signed milestone and retainer conflict')
  await page.getByRole('button',{name:'Prepare scope preview',exact:true}).click()
  const readback=await read(finance.cookie),preview=readback.previews.at(-1),x=preview.value.extraction
  assert.equal(preview.status,'blocked-human-resolution');assert.equal(preview.resolution,null)
  assert.equal(x.deliverables[0].field,'document.deliverables[0]');assert.equal(x.deliverables[0].quote,'Three concepts')
  assert.equal(x.exclusions[0].quote,'Media buying and printing');assert.equal(x.roles[0].quote,'Designer')
  assert.equal(x.retainerTerms.length,1);assert.equal(x.retainerTerms[0].field,'document.scope')
  const scope=readback.source.proposal.value.document.scope,citation=x.retainerTerms[0]
  assert.equal(scope.slice(citation.start,citation.end),citation.quote)
  assert.match(citation.quote,/retainer.*monthly/i)
  assert.equal(x.billingTriggers[0].field,'document.paymentSchedule[0]')
  assert.deepEqual(JSON.parse(x.billingTriggers[0].quote),{name:'Kickoff',due:'2026-11-02',amountMinor:75000,currency:'USD'})
  assert.equal(x.ambiguities[0].interpretations.length,3)
  assert(preview.value.sources.some(s=>s.id===readback.source.signatureEvidenceId&&s.revision))
  assert.equal(preview.value.originalSha256,readback.source.proposal.value.nativeOriginal.sha256)
  const card=page.locator('#scope-'+preview.id)
  await card.getByText('Source citations and competing interpretations',{exact:true}).click()
  await capture('blocked')
  const resolution={proposalId:signed.id,proposalRevision:signed.revision,id:preview.id,revision:preview.revision,ambiguityId:'meaning',interpretation:'schedule',meaning:'Only the two milestone payments apply. The monthly retainer requires a separately accepted amendment.',reason:'Finance reviewed both contradictory clauses',confirm:'record-interpretation-only'}
  await cmd('scope:resolve',resolution,agent.cookie,403)
  await cmd('scope:resolve',{...resolution,revision:'synthetic-gauge-704'},finance.cookie,409)
  await cmd('scope:resolve',{...resolution,confirm:''},finance.cookie,400)
  assert.equal((await read()).previews.at(-1).status,'blocked-human-resolution')
  await card.getByLabel('Interpretation',{exact:true}).selectOption('schedule')
  await card.getByLabel('Accepted interpretation',{exact:true}).fill(resolution.meaning)
  await card.getByLabel('Resolution reason',{exact:true}).fill(resolution.reason)
  await card.locator('[name=confirm]').check()
  await card.getByRole('button',{name:'Record human resolution',exact:true}).click()
  const resolved=(await read()).previews.find(r=>r.id===preview.id)
  assert.equal(resolved.status,'resolved-for-review');assert.equal(resolved.resolution.value.meaning,resolution.meaning)
  assert.equal(resolved.resolution.value.previewRevision,preview.revision);assert.equal(resolved.resolution.value.operatorId,finance.id)
  await page.locator('#scope-'+preview.id).getByText('Source citations and competing interpretations',{exact:true}).click()
  await capture('resolved')
  await cmd('scope:resolve',resolution,finance.cookie,409)
  const replay={proposalId:signed.id,proposalRevision:signed.revision,reason:'Exact preview replay',key:crypto.randomUUID()}
  const first=await cmd('scope:preview',replay);assert.deepEqual(await cmd('scope:preview',replay),first)
  assert.deepEqual(await effects(),before,'Quoted instructions, extraction, resolution and replay create no staffing or financial effects')
  assert.equal(h.providerRequests.length,networkBefore,'Review reads retained originals without calling providers')
  assert.equal((await request('/api/gauge/history/commercialEvents/'+preview.id,staff.cookie)).status,403)
  assert.equal((await request('/api/gauge/history/commercialEvents/'+resolved.resolution.id,agent.cookie)).status,403)
  for(const who of [staff,agent])assert.equal((await state(who.cookie)).data.commercialEvents.length,0)
  await cmd('grant',{operatorId:finance.id,personId:financePerson.id,role:'finance',enabled:false})
  assert.equal((await request(path,finance.cookie)).status,403)
  await cmd('scope:resolve',resolution,finance.cookie,403)
  await cmd('grant',{operatorId:finance.id,personId:financePerson.id,role:'finance',enabled:true})
  // Native erasure fences the same person's session and cannot be bypassed by replay.
  await cmd('privacy:policy',{personalDays:0,fileDays:0,evidenceDays:0,reason:'Owner reviewed native erasure'})
  await cmd('privacy:exit',{personId:financePerson.id,date:'2020-01-01',reason:'Former finance reviewer'})
  const erasure=await cmd('privacy:preview',{personId:financePerson.id});assert.deepEqual(erasure.blockers,[])
  await cmd('privacy:erase',{personId:financePerson.id,fingerprint:erasure.fingerprint,reason:'Explicit native erasure',confirm:'erase-reviewed-native-scope',lawfulReceiptRemoval:'authorized'})
  assert.equal((await request(path,finance.cookie)).status,403)
  await cmd('scope:preview',replay,finance.cookie,403)
  await cmd('estimate:save',{...estimateInput,opportunityId:estimate.value.opportunityId,previousId:estimate.id,reason:'Revise signed source effort after review',lines:estimateInput.lines.map(l=>({...l,effortSeconds:39600}))})
  assert.equal((await request(path,owner)).status,409)
  await cmd('scope:resolve',resolution,owner,409)
  assert.deepEqual((await state()).data.commercialEvents.find(r=>r.id===preview.id).value,preview.value,'Source changes invalidate use without rewriting retained citations')
  console.log('PASS scopeExtractionJourney: retained signed originals, exact citations, competing interpretations, explicit human resolution, authority refusal, erasure, source invalidation and no effects; 1440 and 390')
 } finally {await context.close()}
}
