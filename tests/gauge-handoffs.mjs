import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {harness} from './gauge-harness.mjs'

// BOUNDARY-001: actual built-worker forms/downloads and a test-only network-edge
// accounting receiver. The app never substitutes a simulated provider outcome.
const h=await harness({currency:'USD',timezone:'America/New_York'})
let browser,receiver
try{
 const {cmd,state,request,owner}=h,zone='America/New_York'
 const lead=await cmd('save:people',{name:'Morgan Operations',timezone:zone}),worker=await cmd('save:people',{name:'Avery Designer',timezone:zone}),unknown=await cmd('save:people',{name:'Casey Contractor',timezone:zone,contractor:true})
 const staff=await h.invite('handoff-worker'),manager=await h.invite('handoff-lead'),finance=await h.invite('handoff-finance'),agent=await h.invite('handoff-agent')
 for(const [user,role,person] of [[staff,'staff',worker],[manager,'lead',lead],[finance,'finance',lead]])await cmd('grant',{operatorId:user.id,personId:person.id,role,enabled:true})
 const client=await cmd('save:clients',{name:'Cascade Studio'}),project=await cmd('save:engagements',{name:'October specialist handoff',clientId:client.id,leadId:lead.id,members:[worker.id,unknown.id],scope:'Approved services and actuals for the accountant',timezone:zone})
 await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'billing',engagementIds:[project.id]})
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Identity delivery',remainingSeconds:7200})
 const terms=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:500000,effortSeconds:7200,roundingSeconds:1,reason:'Approved October services'});await cmd('budget:approve',terms)
 await cmd('save:rates',{personId:worker.id,service:'Design',effective:'2026-01-01',costMinor:5000,billMinor:15000})
 const input={personId:worker.id,engagementId:project.id,taskId:task.id,service:'Design',timezone:zone,notes:'Actual approved campaign delivery',billable:true,start:'2026-10-06T09:00:00-04:00',end:'2026-10-06T10:00:00-04:00'}
 let known=await cmd('time:save',input,staff.cookie);known=await cmd('time:submit',known,staff.cookie);await cmd('time:approve',known,manager.cookie)
 let missing=await cmd('time:save',{...input,personId:unknown.id,service:'Specialist research',notes:'Declared cost not yet supplied'});missing=await cmd('time:submit',missing);await cmd('time:approve',missing,manager.cookie)
 let expense=await cmd('expense:save',{engagementId:project.id,personId:worker.id,taskId:task.id,date:'2026-10-06',description:'Approved project materials',amountMinor:1250,reimbursable:true},staff.cookie);expense=await cmd('expense:submit',expense,staff.cookie);await cmd('expense:approve',expense,manager.cookie)
 let packet=await cmd('packet:create',{engagementId:project.id,title:'October approved billing inputs',sources:[`time:${known.id}`,`expenses:${expense.id}`]});packet=await cmd('packet:approve',packet)
 let adjustment=await cmd('packet:adjust',{...packet,sourceId:known.id,correctedAmountMinor:12000,reason:'Reviewed commercial reduction'});await cmd('packet:approve',adjustment)
 const before=await state(),snapshots=Object.fromEntries(['time','expenses','packets'].map(kind=>[kind,before.data[kind]]))
 const sources=[...before.data.time.map(r=>({kind:'time',id:r.id,revision:r.revision})),...before.data.expenses.map(r=>({kind:'expenses',id:r.id,revision:r.revision})),...before.data.packets.map(r=>({kind:'packets',id:r.id,revision:r.revision}))]
 await cmd('handoff:prepare',{recipient:'Accountant test receiver',purpose:'accounting',reason:'Stale selected revision',sources:[{...sources[0],revision:'stale'}]},owner,409)
 await cmd('handoff:prepare',{recipient:'Accountant test receiver',purpose:'accounting',reason:'No exact source revision',sources:[{kind:sources[0].kind,id:sources[0].id}]},owner,400)
 await cmd('handoff:prepare',{recipient:'Accountant test receiver',purpose:'accounting',reason:'Duplicate source review',sources:[sources[0],sources[0]]},owner,400)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 await context.addCookies(finance.cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 const capture=async (name,focus=page.locator('#specialist-handoffs'))=>{if(!process.env.GAUGE_HANDOFF_SHOTS)return;await mkdir(process.env.GAUGE_HANDOFF_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);await focus.scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_HANDOFF_SHOTS}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_HANDOFF_SHOTS}/${name}-viewport-${width}.png`})}}
 await page.goto(h.origin+'/app/billing')
 const form=page.locator('form').filter({has:page.locator('[name=action][value="handoff:prepare"]')})
 await form.locator('[name=recipient]').fill('Cascade accountant · October inputs');await form.locator('[name=purpose]').selectOption('accounting');await form.locator('[name=reason]').fill('Finance reviewed exact approved labor, expenses and billing-preparation sources')
 for(const box of await form.locator('[name=handoffSources]').all())await box.check()
 await capture('BOUNDARY-001-prepare');await form.getByRole('button',{name:'Prepare approved inputs',exact:true}).click()
 let handoff=(await state()).data.specialistHandoffs[0]
 assert(handoff);assert.equal(handoff.value.status,'awaiting-result');assert.equal(handoff.value.approvedBy,finance.id)
 const download=await request(`/api/gauge/handoffs/${handoff.id}`,finance.cookie);assert.equal(download.status,200)
 const artifact=await download.text();assert.equal(createHash('sha256').update(artifact).digest('hex'),handoff.value.artifactHash)
 const parsed=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:artifact,encoding:'utf8'}))
 assert.equal(parsed.length,6);assert.equal(parsed.filter(r=>r.category==='labor').length,2)
 assert.equal(parsed.find(r=>r.sourceId===known.id&&r.category==='labor').amountMinor,'5000')
 assert.equal(parsed.find(r=>r.sourceId===missing.id).amountKnown,'false');assert.equal(parsed.find(r=>r.sourceId===missing.id).amountMinor,'')
 assert.equal(parsed.filter(r=>r.category==='expense').reduce((n,r)=>n+Number(r.amountMinor),0),1250)
 assert.equal(parsed.filter(r=>r.category==='revenue-input').reduce((n,r)=>n+Number(r.amountMinor),0),13250)
 assert(parsed.some(r=>r.amountMinor==='-3000'),'Signed adjustment stays a negative input, never positive revenue')
 for(const source of sources)assert(parsed.some(r=>r.sourceId===source.id&&r.sourceRevision===source.revision))
 const labor=handoff.value.controlTotals.find(t=>t.category==='labor');assert.equal(labor.amountMinor,null);assert.equal(labor.knownAmountMinor,5000);assert.equal(labor.unknownAmountCount,1);assert.equal(labor.durationSeconds,7200)
 assert.equal((await request(`/api/gauge/handoffs/${handoff.id}`)).status,401)
 assert.equal((await request('/app/billing',finance.cookie)).status,200);await capture('BOUNDARY-001-awaiting-result',page.locator('#specialist-handoffs article').last())
 // Test receiver consumes the downloaded bytes, independently of app internals.
 receiver=createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);const csv=Buffer.concat(chunks).toString();assert.equal(csv,artifact);const received=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:csv,encoding:'utf8'}));res.setHeader('content-type','application/json');res.end(JSON.stringify({handoffId:received[0].handoffId,artifactHash:createHash('sha256').update(csv).digest('hex'),lines:received.map(r=>({id:r.id,status:r.amountKnown==='false'?'rejected':'accepted',...(r.amountKnown==='false'?{reason:'Supply the declared contractor cost'}:{}),currency:r.currency,amountMinor:r.amountKnown==='false'?null:Number(r.amountMinor),durationSeconds:r.durationSeconds===''?null:Number(r.durationSeconds)}))}))})
 await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve))
 const outcome=await(await fetch(`http://127.0.0.1:${receiver.address().port}`,{method:'POST',body:artifact})).json()
 const badResults=[{...outcome,artifactHash:'wrong'}, {...outcome,lines:outcome.lines.slice(1)}, {...outcome,lines:outcome.lines.map((l,i)=>i===1?outcome.lines[0]:l)}, {...outcome,lines:outcome.lines.map((l,i)=>i?l:{...l,amountMinor:123})}, {...outcome,lines:outcome.lines.map(l=>l.status==='rejected'?{...l,reason:''}:l)}]
 for(const result of badResults){const r=await h.post('/api/gauge/command',{action:'handoff:record-result',key:randomUUID(),id:handoff.id,revision:handoff.revision,result},finance.cookie);assert([400,409].includes(r.status));assert.equal((await state()).data.specialistHandoffs[0].revision,handoff.revision,'Malformed receiver results change no data')}
 const resultForm=page.locator('form').filter({has:page.locator('[name=action][value="handoff:record-result"]')})
 await resultForm.locator('[name=file]').setInputFiles({name:'accountant-receiver.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(outcome))})
 await resultForm.getByRole('button',{name:'Record result',exact:true}).click()
 const recorded=(await state()).data.specialistHandoffs[0]
 assert.equal(recorded.value.result.acceptedCount,5);assert.equal(recorded.value.result.rejectedCount,1);assert.equal(recorded.value.status,'recorded-with-rejections')
 assert.deepEqual(recorded.value.result.rejectedTotals.map(t=>[t.category,t.currency,t.amountMinor,t.unknownAmountCount]),[['labor','USD',null,1]])
 await capture('BOUNDARY-001-reconciled-rejections',page.locator('#specialist-handoffs article').last())
 const section=page.locator('#specialist-handoffs');assert((await section.innerText()).includes(outcome.lines.find(l=>l.status==='rejected').reason),'The receiver rejection remains actionable on the page')
 assert.equal(recorded.value.delivery,'manual-export');assert.equal(recorded.value.financialEffect,'none');assert.equal(recorded.value.result.verification,'user-recorded')
 assert.equal(await(await request(`/api/gauge/handoffs/${handoff.id}`,owner)).text(),artifact,'Recording outcomes never changes the approved artifact')
 await cmd('handoff:record-result',{...recorded,result:outcome},finance.cookie,409)
 // Native request keys make exact retries safe, while another result is refused.
 const payroll=await cmd('handoff:prepare',{recipient:'Payroll test receiver',purpose:'payroll',reason:'Approved labor input, never wages or tax filing',sources:sources.filter(s=>s.kind==='time')})
 const payrollRow=(await state()).data.specialistHandoffs.find(r=>r.id===payroll.id),result={handoffId:payroll.id,artifactHash:payrollRow.value.artifactHash,lines:payrollRow.value.lines.map(l=>({id:l.id,status:'accepted',currency:l.currency,amountMinor:l.amountMinor,durationSeconds:l.durationSeconds}))}
 const payload={action:'handoff:record-result',key:randomUUID(),...payroll,result}
 const first=await(await h.post('/api/gauge/command',payload,owner)).json();assert.deepEqual(await(await h.post('/api/gauge/command',payload,owner)).json(),first)
 for(const user of [staff,manager,agent]){
  assert.equal((await state(user.cookie)).data.specialistHandoffs.length,0)
  assert.equal((await request(`/api/gauge/handoffs/${handoff.id}`,user.cookie)).status,403)
  assert.equal((await request(`/api/gauge/history/specialistHandoffs/${handoff.id}`,user.cookie)).status,403)
  await cmd('handoff:prepare',{recipient:'Unauthorized',purpose:'accounting',reason:'Refused',sources},user.cookie,403)
  await cmd('handoff:record-result',{...recorded,result:outcome},user.cookie,403)
 }
 await cmd('grant',{operatorId:finance.id,personId:lead.id,role:'finance',enabled:false})
 assert.equal((await request(`/api/gauge/handoffs/${handoff.id}`,finance.cookie)).status,403)
 const after=await state();for(const kind of ['time','expenses','packets'])assert.deepEqual(after.data[kind],snapshots[kind],'Handoff outcomes do not perform accounting, payroll, tax or source mutations')
 const history=await(await request(`/api/gauge/history/specialistHandoffs/${handoff.id}`,owner)).json();assert(history.history.some(r=>r.value.status==='awaiting-result'&&!r.value.result))
 console.log('PASS BOUNDARY-001: exact approved labor/expense/revenue input export, unknown and signed reconciliation, real test-receiver acceptance/rejection, honest labels, immutable results, replay and scoped privacy')
}finally{await browser?.close();if(receiver)await new Promise(resolve=>receiver.close(resolve));await h.dispose()}
