import assert from 'node:assert/strict'
import { mkdir,readFile } from 'node:fs/promises'
import { recordMilestoneAcceptance, harness } from './gauge-harness.mjs'

// Extends the existing public financial/import journey rather than duplicating it.
// The caller closes the source before passing this verifier to portability().
export async function prepareCurrentPortability(h,{importJob}) {
 const {cmd,state,request,owner}=h,zone='Australia/Brisbane'
 const initial=await state(),engagement=initial.data.engagements.find(r=>!r.value.source&&r.value.type!=='internal')
 const person=await cmd('save:people',{name:'Portability resource specialist',timezone:zone,skills:[{name:'Research',proficiency:4}],team:'Strategy',location:'Brisbane',role:'Researcher',employmentType:'contractor'})
 await cmd('save:calendars',{personId:person.id,from:'2026-10-01',to:'2026-10-31',dailySeconds:28800,weekdays:'1,2,3,4,5',holidays:['2026-10-05'],timezone:zone})
 await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:6500,billMinor:14000})
 const opportunity={name:'Research renewal',clientId:engagement.value.clientId,ownerId:engagement.value.leadId,stage:'qualified',probability:50,from:'2026-11-02',to:'2026-11-30',services:'Research',amountMinor:240000,demandSeconds:72000}
 const deal=await cmd('save:opportunities',opportunity)
 await cmd('save:opportunities',{...deal,...opportunity,stage:'proposal',probability:75})
 const demand={engagementId:engagement.id,role:'Researcher',skill:'Research',minProficiency:4,from:'2026-10-06',to:'2026-10-07',dailySeconds:7200,service:'Research',billable:true}
 const fill=await cmd('save:resourceRequests',demand)
 const candidatesResponse=await request(`/api/gauge/resources/${fill.id}`,owner);assert.equal(candidatesResponse.status,200)
 const candidates=await candidatesResponse.json();assert(candidates.candidates.some(c=>c.personId===person.id))
 await cmd('resource:fill',{...fill,personId:person.id,fingerprint:candidates.fingerprint})
 await cmd('save:resourceRequests',{...demand,from:'2026-10-08',to:'2026-10-09'})
 const internal=await cmd('save:engagements',{type:'internal',internalCategory:'training',name:'Research training',leadId:engagement.value.leadId,members:[person.id],scope:'Declared internal professional development',timezone:zone})
 const task=await cmd('save:tasks',{engagementId:internal.id,name:'Research methods',assigneeId:person.id,priority:'high',status:'in-progress',estimateSeconds:3600,remainingSeconds:3600,from:'2026-10-08',to:'2026-10-09',billable:false,checklist:[{id:'review',label:'Review research methods',done:false}],repeatEveryDays:7,repeatUntil:'2026-10-15'})
 const subtask=await cmd('save:tasks',{engagementId:internal.id,parentId:task.id,name:'Prepare research notes',assigneeId:person.id,priority:'normal',status:'todo',estimateSeconds:900,remainingSeconds:900,from:'2026-10-08',to:'2026-10-08',billable:false,checklist:[{id:'notes',label:'Collect workshop notes',done:false}]})
 const time=await cmd('time:save',{personId:person.id,engagementId:internal.id,taskId:task.id,service:'Research',timezone:zone,notes:'Internal training actual',billable:false,start:'2026-10-08T09:00:00+10:00',end:'2026-10-08T10:00:00+10:00'})
 const submitted=await cmd('time:submit',time);await cmd('time:approve',submitted)
 await cmd('expense:save',{engagementId:internal.id,personId:person.id,taskId:subtask.id,date:'2026-10-08',description:'Research workshop materials',amountMinor:1250,reimbursable:false})
 await cmd('task:progress',{...subtask,status:'done',remainingSeconds:0,completedItems:['notes']})
 await cmd('task:progress',{...task,status:'done',remainingSeconds:0,completedItems:['review']})
 // DELIVERY-002 / BASE-002: immutable dependency baselines travel with their source tasks.
 const delivery=await cmd('delivery:preview',{engagementId:internal.id,operation:'baseline',plan:{calendar:{weekdays:[1,2,3,4,5],holidays:['2026-10-05']},nodes:[{id:subtask.id,kind:'task',sourceId:subtask.id,name:'Prepare research notes',start:'2026-10-08',durationDays:1,predecessors:[],staffingIds:[]}]}})
 await cmd('delivery:approve',{...delivery.input,fingerprint:delivery.fingerprint,reason:'Portability delivery baseline',acceptEffects:true})
 // DELIVERY-005 / BASE-002: risks, dated dependencies, delivered snapshots and attributed client decisions travel with milestone history.
 const acceptedMilestone=await cmd('save:milestones',{engagementId:engagement.id,name:'Portable delivery decision',due:'2026-10-21',amountMinor:2500})
 let trackedMilestone=await cmd('milestone:health',{...acceptedMilestone,health:'at-risk',reason:'Waiting for client assets'})
 trackedMilestone=await cmd('milestone:issue',{...trackedMilestone,name:'Assets missing',ownerId:person.id,mitigation:'Prepare complete source package',status:'open',reason:'Client reported missing work'})
 trackedMilestone=await cmd('milestone:dependency',{...trackedMilestone,name:'Client brand input',contact:'Casey Client',due:'2026-10-20',status:'received',reason:'Input recorded as received'})
 await recordMilestoneAcceptance(h,acceptedMilestone.id)
 const savedDelivery=(await state()).data.milestones.find(r=>r.id===acceptedMilestone.id).value.delivery
 assert.equal(savedDelivery.decisions[0].notice,'recorded by Test owner, not confirmed by the client','DELIVERY-005 archive includes the honest client-decision label')
 // DELIVERY-003 / BASE-002: immutable template versions and the plan applied from one round-trip.
 const kickoff={key:'kickoff',kind:'task',name:'Portable kickoff',offsetDays:0,durationDays:1,predecessors:[],owner:'lead',effortSeconds:3600}
 const template=await cmd('template:save',{name:'Portable onboarding',purpose:'client-onboarding',items:[kickoff],reason:'Portable onboarding template'})
 await cmd('template:save',{previousId:template.id,items:[kickoff,{key:'close',kind:'milestone',name:'Portable close',offsetDays:0,durationDays:1,predecessors:['kickoff'],amountMinor:50000}],reason:'Add a priced close'})
 const onboarding=await cmd('save:engagements',{name:'Portable onboarding project',clientId:engagement.value.clientId,leadId:engagement.value.leadId,members:[],scope:'Started from a template',timezone:zone})
 await cmd('template:apply',{templateId:template.id,engagementId:onboarding.id,start:'2026-10-12',reason:'Portable template application'})
 // RETAINER-001 / RETAINER-002 / BASE-002: commercial terms, calendars and individual periods round-trip.
 await cmd('agency:calendar',{weekdays:[1,2,3,4,5],holidays:['2026-10-05'],reason:'Agency calendar for retained commercial periods'})
 const retainer=await cmd('retainer:preview',{engagementId:engagement.id,operation:'terms',terms:{name:'Quarterly research retainer',feeMinor:225100,frequency:'quarterly',unit:'hours',allowance:144000,services:['Research'],consumes:'billable',proration:'working',start:'2026-10-16',end:null,renewal:'automatic',noticeDays:14,rules:{carryCap:28800,carryPeriods:2,deficit:false,overage:'bill',overageRate:18000}}})
 const portableRetainer=await cmd('retainer:approve',{...retainer.input,fingerprint:retainer.fingerprint,reason:'Reviewed quarterly research allowance'})
 const portableSchedule=await cmd('retainer:schedule',{retainerId:portableRetainer.id,basis:'advance',from:'2026-10-16',enabled:true,heldPeriodIds:[],reason:'Portable draft schedule with fresh installation consent'})
 await cmd('retainer:run',{...portableSchedule,asOf:'2026-10-16'})
 // RETAINER-002/003 / BASE-002: exact overage source/artifact and pending projection survive restore.
 const overageTerms=await cmd('retainer:preview',{engagementId:engagement.id,operation:'terms',terms:{name:'Review service retainer',frequency:'monthly',unit:'hours',allowance:3600,services:['Retained review'],consumes:'billable',proration:'calendar',start:'2026-10-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:18000}}})
 const reviewRetainer=await cmd('retainer:approve',{...overageTerms.input,fingerprint:overageTerms.fingerprint,reason:'Reviewed overage billing for retained reviews'})
 const reviewTask=await cmd('save:tasks',{engagementId:engagement.id,name:'Retained review work',remainingSeconds:3600})
 let reviewTime=await cmd('time:save',{personId:person.id,engagementId:engagement.id,taskId:reviewTask.id,service:'Retained review',timezone:zone,start:'2026-10-18T09:00:00+10:00',end:'2026-10-18T11:00:00+10:00',notes:'Approved review service',billable:true});reviewTime=await cmd('time:submit',reviewTime);await cmd('time:approve',reviewTime)
 const reviewPeriod=(await state()).data.retainerPeriods.find(p=>p.value.retainerId===reviewRetainer.id)
 const overagePacket=await cmd('packet:create',{engagementId:engagement.id,title:'Reviewed retainer overage',sources:[`retainerPeriods:${reviewPeriod.id}`]});await cmd('packet:approve',overagePacket)
 await cmd('time:save',{personId:person.id,engagementId:engagement.id,taskId:reviewTask.id,service:'Retained review',timezone:zone,start:'2026-10-18T11:00:00+10:00',end:'2026-10-18T12:00:00+10:00',notes:'Pending review service',billable:true})
 const reviewBalance=(await state()).retainerBalances.find(b=>b.periodId===reviewPeriod.id);assert.equal(reviewBalance.overageMinor,18000);assert.equal(reviewBalance.pending,3600);assert.equal(reviewBalance.projectedRemaining,-7200)
 // RETAINER-004 / BASE-002: an immutable close and approved linked adjustment survive restore.
 const closeTerms=await cmd('retainer:preview',{engagementId:engagement.id,operation:'terms',from:'2026-08-01',to:'2026-09-30',terms:{...overageTerms.terms,name:'Portable closed allowance',services:['Portable close'],start:'2026-08-01'}})
 const closeRetainer=await cmd('retainer:approve',{...closeTerms.input,fingerprint:closeTerms.fingerprint,reason:'Portable completed periods'})
 const closePeriod=(await state()).data.retainerPeriods.find(p=>p.value.retainerId===closeRetainer.id&&p.value.periodStart==='2026-08-01')
 await cmd('retainer:close',{...closePeriod,reason:'Portable immutable August statement'})
 const adjustment=await cmd('retainer:adjust-prepare',{...closePeriod,kind:'refund',amountMinor:2500,reason:'Externally recorded refund for portable closed service'})
 await cmd('retainer:adjust-approve',adjustment)
 const favoriteUser=await h.invite('portability-timesheet-person');await cmd('grant',{operatorId:favoriteUser.id,personId:person.id,role:'staff',enabled:true})
 const favorite=await cmd('time:favorite',{personId:person.id,taskId:task.id,name:'Research training',service:'Research',timezone:zone,billable:false},favoriteUser.cookie)
 await cmd('time:favorite',{...favorite,personId:person.id,taskId:task.id,name:'Research workshop',service:'Research',timezone:zone,billable:false},favoriteUser.cookie)
 // REPORT-002 / BASE-002: billability targets travel as business records.
 await cmd('target:set',{scope:'person',personId:person.id,percent:'72.5',effectiveFrom:'2026-10-01'})
 // CONNECT-020 / BASE-002: a live utilization key is installation authority and never travels.
 assert.match((await cmd('apikey:create',{label:'Portability source key'})).token,/^gauge_util_/)
 await cmd('time:policy',{lockThrough:'2020-12-31',reason:'Historical migration cutoff; current work remains open'})
 await cmd('save:staffing',{personId:person.id,engagementId:internal.id,from:'2026-10-09',to:'2026-10-09',dailySeconds:3600,commitment:'tentative',service:'Research',billable:false})
 const agent=await h.invite('portability-agent');await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'staffing',engagementIds:[engagement.id]})
 const proposal=await cmd('proposal:prepare',{kind:'staffing',engagementId:engagement.id,assumptions:'Research capacity reviewed by the lead',evidence:[{source:'Agency planning meeting',summary:'A researcher is needed for the next delivery period'}],plan:{alternatives:[{personId:person.id,from:'2026-10-12',to:'2026-10-12',dailySeconds:3600,rationale:'Qualified researcher with declared availability'}]}},agent.cookie)
 await cmd('proposal:approve',proposal)
 const fixture=new URL('./fixtures/harvest/',import.meta.url),files={}
 for(const name of ['clients.csv','people.csv','projects.csv','time.csv'])files[name]=await readFile(new URL(name,fixture),'utf8')
 const manifest=JSON.parse(await readFile(new URL('manifest.json',fixture),'utf8'));manifest.namespace='portability-historical-document';manifest.currency=(await state()).agency.currency
 const historicalBytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
 const {capturedForecastPackage}=await import('./fixtures/forecast.mjs'),forecast=await capturedForecastPackage()
 Object.assign(manifest,{schedulePeople:forecast.manifest.schedulePeople,scheduleProjects:forecast.manifest.scheduleProjects,schedulePlaceholders:forecast.manifest.schedulePlaceholders,forecastApi:forecast.manifest.forecastApi})
 files['forecast.json']=forecast.files['forecast.json']
 const sourcePackage={manifest,files,archives:[{name:'historical-invoice.pdf',mediaType:'application/pdf',base64:historicalBytes.toString('base64')}]}
 const preview=await cmd('import:preview',{package:sourcePackage})
 let retainedImport=await cmd('import:create',{package:sourcePackage,fingerprint:preview.fingerprint})
 while(['applying','queued'].includes(retainedImport.state))retainedImport=await cmd('import:resume',{id:retainedImport.id})
 assert.equal(retainedImport.state,'completed')
 // TIME-004 / BASE-002: dated delegations and versioned submission/review policy travel as business records, never authority.
 const portableLead=await h.invite('portable-review-lead'),portableDelegate=await h.invite('portable-review-delegate')
 await cmd('grant',{operatorId:portableLead.id,personId:engagement.value.leadId,role:'lead',enabled:true})
 await cmd('grant',{operatorId:portableDelegate.id,personId:person.id,role:'finance',enabled:true})
 await cmd('time:delegate',{engagementId:engagement.id,delegateId:person.id,from:'2026-10-01',to:'2026-12-31',reason:'Portable review cover'},portableLead.cookie)
 const portablePolicy=(await state()).data.timePolicies[0]
 await cmd('time:policy',{...portablePolicy,review:{dueWeekday:5,dueTime:'16:30',minimumNotes:8,maxEntrySeconds:28800,maxDaySeconds:43200,reviewLevels:2,separation:true,serviceBillability:{Research:false}},reason:'Portable independent review policy'})
 // BOUNDARY-001 / BASE-002: exact prepared inputs, receiver acknowledgement, artifact and history survive restore.
 const handoffState=await state(),handoffSources=['time','expenses','packets'].flatMap(kind=>handoffState.data[kind].filter(r=>r.value.status==='approved').map(r=>({kind,id:r.id,revision:r.revision})))
 const handoff=await cmd('handoff:prepare',{recipient:'Portable accountant',purpose:'accounting',reason:'Approved inputs retained with their receiver reconciliation',sources:handoffSources})
 const prepared=(await state()).data.specialistHandoffs.find(r=>r.id===handoff.id)
 await cmd('handoff:record-result',{...handoff,result:{handoffId:handoff.id,artifactHash:prepared.value.artifactHash,lines:prepared.value.lines.map((l,i)=>({id:l.id,status:i?'accepted':'rejected',...(i?{}:{reason:'Portable receiver requested supporting evidence'}),currency:l.currency,amountMinor:l.amountMinor,durationSeconds:l.durationSeconds}))}})
 // REPORT-003 / BASE-002: native issued sources, numbering and receipts round-trip with the agency.
 const invoiceProject=await cmd('save:engagements',{name:'Portable invoice engagement',clientId:engagement.value.clientId,leadId:engagement.value.leadId,members:[person.id],scope:'Portable source ledger',timezone:zone})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:invoiceProject.id,mode:'hourly',amountMinor:100000,effortSeconds:3600,roundingSeconds:60,reason:'Portable invoice terms'}))
 let invoiceExpense=await cmd('expense:save',{engagementId:invoiceProject.id,personId:person.id,date:'2026-10-10',description:'Portable reimbursable materials',amountMinor:2500,reimbursable:true})
 invoiceExpense=await cmd('expense:approve',await cmd('expense:submit',invoiceExpense))
 const invoicePacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:invoiceProject.id,title:'Portable invoice packet',sources:[`expenses:${invoiceExpense.id}`]}))
 const invoiceClient=(await state()).data.clients.find(r=>r.id===engagement.value.clientId)
 const invoiceDue=new Date(Date.parse('2026-10-11')+(invoiceClient.value.paymentTermsDays??30)*86400000).toISOString().slice(0,10)
 const portableInvoice=await cmd('invoice:issue',{...invoicePacket,issueDate:'2026-10-11',dueDate:invoiceDue,billTo:invoiceClient.value.name,remitTo:'Portable agency account',reference:invoiceClient.value.poRequired?invoiceClient.value.poNumbers[0]:'Portable October invoice'})
 await cmd('invoice:promise',{...portableInvoice,date:'2026-11-20',amountMinor:1500,reference:'Portable payment promise'})
 await cmd('payment:record',{...portableInvoice,date:'2026-10-12',amountMinor:1000,reference:'Portable bank receipt'})
 // INVOICE-004 credit notes travel with their invoice through BASE-002.
 await cmd('invoice:credit',{...portableInvoice,type:'discount',line:0,amountMinor:500,date:'2026-10-13',reason:'Portable agreed discount'})
 // INVOICE-002 / BASE-002: percentage schedule, approvals and its exact invoice source travel whole.
 const fixedProject=await cmd('save:engagements',{name:'Portable percentage billing',clientId:engagement.value.clientId,leadId:engagement.value.leadId,members:[],scope:'Portable deposit and progress',timezone:zone})
 const fixedTerms=await cmd('budget:approve',await cmd('save:budgets',{engagementId:fixedProject.id,mode:'fixed',amountMinor:100000,effortSeconds:3600,roundingSeconds:60,reason:'Portable fixed terms'}))
 const fixedCharge=await cmd('fixed:approve',await cmd('fixed:prepare',{engagementId:fixedProject.id,budgetId:fixedTerms.id,budgetRevision:fixedTerms.revision,chargeType:'deposit',cumulativeBasisPoints:2000,name:'Portable deposit',date:'2026-10-11',reason:'Portable billing schedule'}))
 const supersededCharge=await cmd('fixed:prepare',{engagementId:fixedProject.id,budgetId:fixedTerms.id,budgetRevision:fixedTerms.revision,chargeType:'progress',cumulativeBasisPoints:5000,name:'Portable withdrawn progress',date:'2026-10-20',reason:'A reviewed draft schedule'})
 await cmd('fixed:withdraw',{...supersededCharge,reason:'Portable draft retired after review'})
 const fixedPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:fixedProject.id,title:'Portable deposit packet',sources:[`fixedCharges:${fixedCharge.id}`]}))
 await cmd('invoice:issue',{...fixedPacket,issueDate:'2026-10-11',dueDate:invoiceDue,billTo:invoiceClient.value.name,remitTo:'Portable agency account',reference:invoiceClient.value.poRequired?invoiceClient.value.poNumbers[0]:'Portable deposit invoice'})
 const before=await state()
 assert.equal(before.data.archives.filter(r=>r.value.forecast).length,4,'MIGRATE-003 source snapshots are available before BASE-002 export')
 assert(before.data.calendars.some(r=>r.value.source?.externalId==='api:availability:v1'),'MIGRATE-003 captured availability is native before export')
 assert(before.data.leave.some(r=>r.value.source?.externalId==='api:assignment:a2'),'MIGRATE-003 captured time off is native before export')
 assert(before.data.archives.some(r=>r.value.base64===historicalBytes.toString('base64')),'native historical document is available before export')
 assert.equal(before.data.time.find(r=>r.id===time.id).value.economics.costMinor,6500)
 const completedTask=before.data.tasks.find(r=>r.id===task.id),nextTask=before.data.tasks.find(r=>r.id===completedTask.value.nextOccurrenceId)
 assert(nextTask,'completed recurring work has a durable next occurrence before export')
 assert.equal(nextTask.value.previousOccurrenceId,task.id)
 assert.equal(nextTask.value.status,'todo')
 assert.equal(nextTask.value.remainingSeconds,nextTask.value.estimateSeconds)
 assert(nextTask.value.checklist.every(item=>!item.done),'next occurrence resets checklist progress')
 assert(before.data.tasks.some(r=>r.value.parentId===nextTask.id&&r.value.previousOccurrenceId===subtask.id),'recurrence copies the subtask tree before export')
 assert(before.data.expenses.some(r=>r.value.taskId===subtask.id),'expense task relationship is present before export')
 assert(before.data.resourceRequests.some(r=>r.value.status==='filled'))
 assert(before.data.resourceRequests.some(r=>r.value.status==='open'))
 assert.equal(before.capacity.find(p=>p.personId===person.id).days.find(d=>d.date==='2026-10-05').holiday,true)
 const downloads=before.data.specialistHandoffs.map(r=>`/api/gauge/handoffs/${r.id}`)
 for(const packet of before.data.packets.filter(r=>r.value.status==='approved'))downloads.push(`/api/gauge/packets/${packet.id}`)
 for(const expense of before.data.expenses)for(const file of expense.value.attachmentIds??[])downloads.push(`/api/gauge/files/${file}`)
 for(const archive of before.data.archives)downloads.push(`/api/gauge/archives/${archive.id}`)
 downloads.push(`/api/gauge/imports/${importJob}`,`/api/gauge/imports/${retainedImport.id}`)
 const getBytes=async(app,path)=>{const response=await app.request(path,app.owner);assert.equal(response.status,200,path);return Buffer.from(await response.arrayBuffer())}
 const bytes=await Promise.all(downloads.map(path=>getBytes(h,path)))
 const records=Object.entries(before.data).flatMap(([kind,rows])=>rows.map(row=>`/api/gauge/history/${kind}/${row.id}`))
 const histories=await Promise.all(records.map(path=>getBytes(h,path)))
 // Restore preserves business values, not SQLite insertion order. Compare records
 // by stable identity; derived groups and source sets have no positional meaning.
 const unordered=value=>Array.isArray(value)?value.map(unordered).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unordered(v)])):value
 const stable=report=>({agency:report.agency,data:Object.fromEntries(Object.entries(report.data).map(([kind,rows])=>[kind,[...rows].sort((a,b)=>a.id.localeCompare(b.id))])),...Object.fromEntries(['capacity','economics','pipeline','resourceDemand','utilization','correctionReviews','retainerBalances'].map(key=>[key,unordered(report[key])]))})
 return async persistenceDirectory=>{
  const restored=await harness({persistenceDirectory,beforeLogin:async({request,post})=>{
   for(const cookie of [owner,agent.cookie,favoriteUser.cookie,portableLead.cookie,portableDelegate.cookie]){
    assert.equal((await request('/api/gauge/state',cookie)).status,401,'old session cannot read restored business data')
    assert.equal((await post('/api/gauge/command',{key:'restored-stale-session',action:'save:clients',name:'Unapproved restored write'},cookie)).status,401,'old session cannot write restored business data')
   }
  }})
  try{
   const favoritePage=await restored.request(`/app/time?sheetPerson=${person.id}&sheetFrom=2026-10-05`,restored.owner);assert.equal(favoritePage.status,200);assert((await favoritePage.text()).includes('Research workshop'),'Restored private favorite is available when the owner acts for its person on Time')
   assert.notEqual(restored.vars.SESSION_SECRET,h.vars.SESSION_SECRET,'restore uses fresh private settings')
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM g_retainer_schedule_authority').first()).n,0,'Restored schedules carry no execution consent')
   const restoredRuns=(await restored.state()).data.retainerRuns
   assert.equal((await restored.scheduled()).status,200)
   assert.deepEqual((await restored.state()).data.retainerRuns,restoredRuns,'Archive history never replays scheduled billing')
   assert.deepEqual(stable(await restored.state()),stable(before),'fresh native login sees the same current records, money and capacity')
   const restoredBytes=await Promise.all(downloads.map(path=>getBytes(restored,path)))
   assert.deepEqual(restoredBytes,bytes,'packet artifacts, receipts and retained source originals round-trip byte for byte')
   assert.deepEqual(await Promise.all(records.map(path=>getBytes(restored,path))),histories,'all business revision history survives')
   if(process.env.GAUGE_BASE_SHOTS){
    const {chromium}=await import('@playwright/test')
    await mkdir(process.env.GAUGE_BASE_SHOTS,{recursive:true})
    const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
    try{
     const context=await browser.newContext({ignoreHTTPSErrors:true})
     await context.addCookies(restored.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:restored.origin}}))
     const page=await context.newPage()
     for(const width of [1440,390])for(const screen of ['billing','capacity']){
      await page.setViewportSize({width,height:1000});await page.goto(`${restored.origin}/app/${screen}?from=2026-10-05`)
      await page.evaluate(()=>document.fonts.ready)
      assert.equal(new URL(page.url()).pathname,`/app/${screen}`,'restored screen opens under fresh authority')
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${screen} fits ${width}`)
      await page.screenshot({path:`${process.env.GAUGE_BASE_SHOTS}/restored-${screen}-${width}.png`,fullPage:true})
     }
    }finally{await browser.close()}
   }
  }finally{await restored.dispose()}
 }
}
