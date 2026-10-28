import assert from 'node:assert/strict'
import test from 'node:test'
import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {harness} from './gauge-harness.mjs'
import {seedLearningProjects} from './fixtures/learning-projects.mjs'

const closeTo=(actual,expected,label)=>expected===null?assert.equal(actual,null,label):assert(Math.abs(actual-expected)<1e-8,`${label}: ${actual} versus ${expected}`)
const checkScores=(preview,expected)=>{
 for(const group of ['baseline','candidateScore','difference'])for(const metric of ['effortMape','marginError','paymentTimingError'])closeTo(preview[group][metric],expected[group][metric],`${group}.${metric}`)
 assert.equal(preview.adoption.offered,false,'Incomplete settlement evidence cannot offer adoption')
}
const business=data=>Object.fromEntries(Object.entries(data).filter(([kind])=>kind!=='learningCohorts'))
const readAtCompletion=async h=>{
 const response=await h.request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-16',h.owner)
 assert.equal(response.status,200)
 return response.json()
}

// One public-door sanity journey covers score arithmetic, source custody,
// permissions and the owner-visible comparison flow. No provider is contacted.
test('RECOVER-006 owner backtests immutable original estimates without adopting assumptions',async()=>{
 const h=await harness({currency:'USD'})
 let browser,foreign
 try{
  const seeded=await seedLearningProjects(h),{input,expected,projects,person}=seeded
  const member=await h.invite('Riley'),agent=await h.invite('Morgan')
  await h.cmd('grant',{operatorId:member.id,personId:person.id,role:'finance',enabled:true})
  await h.cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'time',engagementIds:projects.map(p=>p.engagement.id)})
  await h.cmd('receipt:record',{clientId:seeded.usual.id,currency:'USD',amountMinor:35000,date:'2026-10-16',reference:'synthetic-gauge-46001'})
  const before=(await h.state()).data
  assert(before.clientReceipts.some(r=>r.value.source==='manual-bank-receipt'))
  const preview=await h.cmd('learning:preview',input)
  assert.equal(preview.eligibleProjects,6)
  assert.deepEqual(preview.samples.map(s=>s.engagementId).sort(),projects.slice(0,6).map(p=>p.engagement.id).sort())
  assert(preview.exclusions.some(e=>e.engagementId===projects[6].engagement.id&&e.reason===input.excludedClients[0].reason))
  checkScores(preview,expected(12000))
  const final=await readAtCompletion(h)
  for(const p of projects.slice(0,6)){
   const sample=preview.samples.find(s=>s.engagementId===p.engagement.id),finance=final.forecast.engagements.find(f=>f.engagementId===p.engagement.id)
   assert.equal(sample.finalFeesMinor,p.feesMinor,'Candidate never scales the original fixed fee')
   assert.equal(sample.finalCostMinor,p.actualCostMinor)
   assert.equal(finance.complete,true)
   assert.equal(sample.finalCostMinor,finance.eacCostMinor,'Final cost is native FINANCE-006')
   closeTo(sample.finalMarginPercent,finance.marginMinor/finance.eacFeesMinor*100,'Native final margin')
   closeTo(sample.baselineMarginPercent,(p.feesMinor-p.estimatedCostMinor)/p.feesMinor*100,'Original fee less original cost')
   assert.equal(sample.roles.length,1)
   const role=sample.roles[0]
   assert.equal(role.role,'Designer');assert.equal(role.estimatedSeconds,p.estimatedSeconds)
   assert.equal(role.actualSeconds,p.actualSeconds);assert.equal(role.candidateSeconds,Math.round(p.estimatedSeconds*1.2))
   for(const [kind,id]of [['estimates',p.estimate.id],['engagements',p.engagement.id],['tasks',p.taskId]]){
    const source=sample.sources.find(s=>s.kind===kind&&s.id===id)
    assert.equal(source?.revision,before[kind].find(r=>r.id===id).revision,'Scores cite exact business revisions')
   }
   for(const kind of ['time','budgets','milestones','estimateConversions'])assert(sample.sources.some(s=>s.kind===kind),'Approved work and terms retain lineage')
  }
  const second=await h.cmd('learning:preview',{...input,candidate:{role:'Designer',basisPoints:7000}})
  checkScores(second,expected(7000))
  assert.deepEqual(second.samples.map(s=>s.engagementId),preview.samples.map(s=>s.engagementId),'Both proposals use the same held-out observations')
  assert(preview.candidateScore.effortMape<preview.baseline.effortMape)
  assert(second.candidateScore.effortMape>second.baseline.effortMape)
  const small=await h.cmd('learning:preview',{...input,selections:input.selections.slice(0,4),excludedClients:[]})
  assert.equal(small.status,'insufficient history');assert.equal(small.adoption.offered,false)
  for(const scores of [small.baseline,small.candidateScore,small.difference])assert(Object.values(scores).every(v=>v===null),'Four projects offer no scored proposal')
  const saveInput={...input,sourceDigest:preview.sourceDigest}
  for(const cookie of [member.cookie,agent.cookie])for(const action of ['learning:preview','learning:save','learning:adopt'])await h.cmd(action,saveInput,cookie,403)
  for(const cookie of [member.cookie,agent.cookie])assert.deepEqual((await h.state(cookie)).data.learningCohorts,[],'Private financial comparisons are absent from other roles')
  await h.cmd('learning:adopt',saveInput,h.owner,409)
  assert.deepEqual(business((await h.state()).data),business(before),'Preview and refused commands change no business records')

  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  const page=await context.newPage()
  await page.goto(h.origin+'/app/review')
  const panel=page.locator('#forecast-learning')
  await panel.locator(':scope > summary').click()
  const form=panel.locator('form').filter({has:page.locator('input[name="action"][value="learning:preview"]')})
  await form.locator('[name="name"]').fill(input.name)
  await form.locator('[name="reason"]').fill(input.reason)
  await form.locator('[name="completedThrough"]').fill(input.completedThrough)
  await form.locator('[name="candidateRole"]').fill('Designer')
  await form.locator('[name="candidatePercent"]').fill('120')
  for(const checkbox of await form.locator('[name="selectedSamples"]').all())await checkbox.check()
  await form.getByLabel('Learning atypical client',{exact:true}).check()
  await form.locator('[name="exclusionReason"]').fill(input.excludedClients[0].reason)
  await Promise.all([page.waitForNavigation(),form.getByRole('button',{name:'Preview comparison'}).click()])
  const visible=page.getByRole('region',{name:'Forecast comparison preview'})
  assert(await visible.isVisible(),'The form renders scores before save')
  for(const label of ['Current assumption','Candidate assumption','Difference · candidate minus current'])assert(await visible.getByRole('heading',{name:label,exact:true}).isVisible())
  for(const [title,group] of [['Current assumption','baseline'],['Candidate assumption','candidateScore']]){const card=visible.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});assert(await card.getByText(expected(12000)[group].effortMape.toLocaleString('en-US',{maximumFractionDigits:2})+'%',{exact:true}).isVisible(),'Displayed effort score matches independent arithmetic')}
  assert(await visible.getByText('Unknown',{exact:true}).count()>0,'Unknown payment evidence remains visible')
  const sample=visible.locator('details').filter({has:page.locator('summary',{hasText:'Learning project 1 ·'})}).first()
  await sample.locator(':scope > summary').click()
  assert(await sample.getByRole('link',{name:'Estimate revision history'}).isVisible(),'Visible sample links to original history')
  const lineage=sample.locator('details').filter({has:page.locator('summary',{hasText:'Sample lineage'})})
  await lineage.locator(':scope > summary').click()
  assert(await lineage.getByRole('link').count()>0,'Owner can inspect source revision lineage')
  assert.equal(await panel.getByRole('button',{name:/adopt/i}).count(),0,'Read-only comparison has no adoption action')
  if(process.env.GAUGE_LEARNING_SHOTS)await mkdir(process.env.GAUGE_LEARNING_SHOTS,{recursive:true})
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Learning comparison fits ${width}`)
   if(process.env.GAUGE_LEARNING_SHOTS)await page.screenshot({path:`${process.env.GAUGE_LEARNING_SHOTS}/forecast-learning-${width}.png`,fullPage:true})
  }
  await Promise.all([page.waitForNavigation(),visible.getByRole('button',{name:'Keep comparison'}).click()])
  assert.equal((await h.state()).data.learningCohorts.length,1,'Owner form keeps one immutable acknowledgement')
  await panel.locator(':scope > summary').click()
  const retained=panel.locator('details.g-card').filter({has:page.locator('summary',{hasText:input.name})}).first()
  await retained.locator(':scope > summary').click()
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await retained.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(process.env.GAUGE_LEARNING_SHOTS)await page.screenshot({path:`${process.env.GAUGE_LEARNING_SHOTS}/forecast-learning-retained-${width}.png`})}
  await browser.close();browser=null
  const key=randomUUID(),saved=await h.post('/api/gauge/command',{action:'learning:save',key,...saveInput},h.owner)
  assert.equal(saved.status,200);const acknowledgement=await saved.json()
  const replay=await h.post('/api/gauge/command',{action:'learning:save',key,...saveInput},h.owner)
  assert.equal(replay.status,200);assert.deepEqual(await replay.json(),acknowledgement,'Same request key replays the acknowledgement')
  const after=(await h.state()).data
  assert.equal(after.learningCohorts.length,2,'Replay does not append another comparison')
  assert.deepEqual(business(after),business(before),'Only comparison history changes when scores are retained')
  const kept=after.learningCohorts.find(r=>r.id===acknowledgement.id)
  checkScores(kept.value,expected(12000));assert.equal(kept.value.sourceDigest,preview.sourceDigest)
  const ownerAudit=await (await h.request('/api/gauge/audit?kind=learningCohorts',h.owner)).json()
  assert(ownerAudit.entries.some(e=>e.recordId===kept.id&&e.result.sourceDigest===preview.sourceDigest),'Owner sees the audited source binding')
  const financeAudit=await (await h.request('/api/gauge/audit?kind=learningCohorts',member.cookie)).json()
  assert.deepEqual(financeAudit.entries,[],'Audit search cannot disclose owner-only cohort metadata')
  const financeExport=await (await h.request('/api/gauge/audit/export',member.cookie)).json()
  const cohortStubs=financeExport.entries.filter(e=>e.kind==='learningCohorts')
  assert(cohortStubs.length>0&&cohortStubs.every(e=>e.withheld&&!e.data&&!e.view),'Audit export retains hashes without private comparison values')

  const exported=await readAtCompletion(h),csv=await h.request('/api/gauge/report.csv?'+new URLSearchParams({from:exported.from,to:exported.to,asOf:input.completedThrough,fingerprint:exported.fingerprint}),h.owner)
  assert.equal(csv.status,200)
  const csvRows=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:await csv.text(),encoding:'utf8',maxBuffer:32*1024*1024}))
  for(const group of ['baseline','candidateScore','difference'])for(const metric of ['effortMape','marginError','paymentTimingError']){
   const id=`learning:${kept.id}:${group}:${metric}`,row=csvRows.find(r=>r.row==='figure'&&r.figure===id),value=expected(12000)[group][metric]
   assert(row,'Saved scores are present in calculation CSV')
   if(value===null)assert.equal(row.value,'','Unknown evidence exports as empty, never zero')
   else closeTo(Number(row.value),value,'Independently recomputed CSV score')
   assert(csvRows.some(r=>r.row==='source'&&r.figure===id&&r['source kind']==='learningCohorts'&&r['source id']===kept.id&&r['source revision']===kept.revision),'CSV cites the exact immutable comparison revision')
  }
  for(const cookie of [member.cookie,agent.cookie])assert.equal((await h.request(`/api/gauge/history/learningCohorts/${kept.id}`,cookie)).status,403,'Private comparison history cannot bypass its owner boundary')
  const history=await h.request(`/api/gauge/history/learningCohorts/${kept.id}`,h.owner)
  assert.equal(history.status,200);assert.equal((await history.json()).history.length,0,'An immutable comparison has no overwritten revisions')
  const client=after.clients.find(r=>r.id===seeded.usual.id)
  await h.cmd('save:clients',{...client,...client.value,name:'Learning usual client revised'})
  await h.cmd('learning:save',saveInput,h.owner,409)
  assert.deepEqual((await h.state()).data.learningCohorts,after.learningCohorts,'Stale source save cannot alter retained evidence')

  const unpriced=await h.cmd('save:people',{name:'Learning unpriced specialist',timezone:'Australia/Brisbane'})
  const extra=await h.cmd('time:save',{personId:unpriced.id,engagementId:projects[0].engagement.id,taskId:projects[0].taskId,service:'Design',timezone:'Australia/Brisbane',notes:'Additional actual with explicitly missing cost',billable:true,start:'2026-10-14T09:00:00+10:00',end:'2026-10-14T10:00:00+10:00'})
  await h.cmd('time:approve',await h.cmd('time:submit',extra))
  const unknown=await h.cmd('learning:preview',input),unknownSample=unknown.samples.find(s=>s.engagementId===projects[0].engagement.id)
  assert.equal(unknownSample.finalCostMinor,null);assert.equal(unknownSample.finalMarginPercent,null)
  assert.equal(unknown.baseline.marginError,null);assert.equal(unknown.candidateScore.marginError,null)
  assert(unknownSample.unknowns.length>0,'Known subtotal does not disguise missing final cost')

  foreign=await harness({currency:'AUD'})
  const foreignSeed=await seedLearningProjects(foreign),fx=await foreign.cmd('learning:preview',foreignSeed.input)
  assert.equal(fx.eligibleProjects,6)
  for(const sample of fx.samples){assert.equal(sample.currency,'AUD');assert.equal(sample.finalCostMinor,null);assert.equal(sample.finalMarginPercent,null);assert(sample.unknowns.length>0)}
  assert.equal(fx.baseline.marginError,null);assert.equal(fx.candidateScore.marginError,null)
  assert.equal(fx.baseline.paymentTimingError,null);assert.equal(fx.adoption.offered,false,'Declared USD costs cannot become AUD margin silently')
  const replacement=await h.cmd('save:people',{name:'Successor project lead',timezone:'Australia/Brisbane'})
  for(const project of (await h.state()).data.engagements)await h.cmd('save:engagements',{...project,...project.value,leadId:replacement.id,members:[]})
  await h.cmd('grant',{operatorId:member.id,personId:person.id,role:'finance',enabled:false})
  await h.cmd('privacy:policy',{personalDays:0,fileDays:0,evidenceDays:0,reason:'Explicit bounded erasure with financial hold'})
  await h.cmd('privacy:exit',{personId:person.id,date:'2000-01-01',reason:'Designer no longer works here'})
  const erase=await h.cmd('privacy:preview',{personId:person.id})
  assert.deepEqual(erase.blockers,[])
  await h.cmd('privacy:erase',{personId:person.id,fingerprint:erase.fingerprint,confirm:'erase-reviewed-native-scope',lawfulReceiptRemoval:'authorized',reason:'Remove personal profile while retaining numeric financial history'})
  const afterErasure=(await h.state()).data.learningCohorts
  assert.deepEqual(afterErasure,after.learningCohorts,'Erasure never rewrites retained numeric scores')
  assert(!JSON.stringify(afterErasure).includes('Learning designer'),'Cohorts retain no copied person names')
  const erasedReplay=await h.post('/api/gauge/command',{action:'learning:save',key,...saveInput},h.owner)
  assert.equal(erasedReplay.status,200);assert.deepEqual(await erasedReplay.json(),acknowledgement)
  assert.deepEqual((await h.state()).data.learningCohorts,afterErasure,'Replaying a capture cannot recreate erased profile data')
  assert.equal((await h.request('/api/gauge/state',member.cookie)).status,403,'Revoked and erased worker cannot read the old comparison')

 }finally{if(browser)await browser.close();if(foreign)await foreign.dispose();await h.dispose()}
})
