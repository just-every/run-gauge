import { sourceFieldJourney } from './fixtures/source-custom-fields.mjs'
import { harvestFinancePackage } from './fixtures/harvest-finance.mjs'
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import { mkdir,readFile } from 'node:fs/promises'
import { recordMilestoneAcceptance, harness } from './gauge-harness.mjs'

// Extends the existing public financial/import journey rather than duplicating it.
// The caller closes the source before passing this verifier to portability().
export async function prepareCurrentPortability(h,{importJob}) {
 const {cmd,state,request,owner}=h,zone='Australia/Brisbane'
 // COST-002: retain receipt economics, unit rates, once-only reimbursement and honest receiver history.
 const expensePerson=await cmd('save:people',{name:'synthetic-gauge-7201',timezone:zone})
 const expenseClient=await cmd('save:clients',{name:'Portable travel client'})
 const expenseProject=await cmd('save:engagements',{name:'Portable expense policy',clientId:expenseClient.id,leadId:expensePerson.id,members:[expensePerson.id],scope:'Portable travel review',timezone:zone})
 await cmd('expense:rate',{unit:'mileage',currency:'USD',effective:'2026-01-01',unitMinor:70,reason:'Portable finance unit policy'})
 let portableClaim=await cmd('expense:save',{engagementId:expenseProject.id,personId:expensePerson.id,date:'2026-10-06',description:'Portable 120 mile claim',unit:'mileage',quantity:120,amountMinor:0,reimbursable:true,clientBillable:false,policyException:'Reviewed travel allowance'})
 const upload=new FormData();for(const[k,v]of Object.entries({...portableClaim,key:crypto.randomUUID(),action:'expense:file'}))upload.set(k,String(v));upload.set('file',new File(['synthetic-gauge-7202 receipt'],'claim.txt',{type:'text/plain'}));const added=await request('/api/gauge/command',owner,{method:'POST',headers:{origin:h.origin},body:upload});assert.equal(added.status,200);portableClaim=await added.json()
 portableClaim=await cmd('expense:approve',{...await cmd('expense:submit',portableClaim),reason:'Finance reviews portable exception'})
 const reimbursement=await cmd('handoff:prepare',{purpose:'reimbursement',recipient:'Portable payroll desk',reason:'Portable exact claim',sources:[{kind:'expenses',id:portableClaim.id,revision:portableClaim.revision}]})
 const reimbursementRow=(await state()).data.specialistHandoffs.find(r=>r.id===reimbursement.id)
 await cmd('handoff:record-result',{...reimbursement,result:{handoffId:reimbursement.id,artifactHash:reimbursementRow.value.artifactHash,lines:reimbursementRow.value.lines.map(l=>({id:l.id,status:'accepted',currency:l.currency,amountMinor:l.amountMinor,durationSeconds:null,quantity:l.details.quantity,unit:l.details.unit}))}})
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
 // Exact client review is retained business history with disconnected recipient authority.
 const portableRecipient=await h.invite('synthetic-gauge-7305')
 const reviewMilestone=await cmd('milestone:deliver',{...await cmd('save:milestones',{engagementId:engagement.id,name:'Portable direct client review',due:'2020-01-02',amountMinor:0}),date:'2020-01-01',reason:'Internal retained delivery'})
 const portableRelease=await cmd('milestone:release-review',{...reviewMilestone,contact:'synthetic-gauge-7305@example.test',description:'Retained explicit client description',reason:'Portable exact recipient release'})
 const portableReviewRow=(await state()).data.milestones.find(r=>r.id===reviewMilestone.id),portableReview=portableReviewRow.value.delivery.clientReviews.at(-1)
 const portableReviewPath=`/api/gauge/client-milestones/${reviewMilestone.id}/${portableReview.id}`
 const portableDecision=await h.request(portableReviewPath,portableRecipient.cookie,{method:'POST',headers:{origin:h.origin,'content-type':'application/json','x-gauge-review-token':portableRelease.token},body:JSON.stringify({key:crypto.randomUUID(),revision:portableReviewRow.revision,outcome:'accepted',reason:'Client confirms the retained delivery'})})
 assert.equal(portableDecision.status,200,await portableDecision.clone().text())
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
 const portableClient=(await state()).data.clients.find(c=>c.id===engagement.value.clientId)
 await cmd('save:clients',{...portableClient,...portableClient.value,paymentTermsDays:30})
 const portableApprovalPolicy=(await state()).data.approvalPolicies[0]
 await cmd('approval:limit',{...portableApprovalPolicy,reviewAboveMinor:300000,reason:'Portable bounded automatic invoice consent'})
 const portableSchedule=await cmd('retainer:schedule',{retainerId:portableRetainer.id,basis:'advance',from:'2026-10-16',enabled:true,heldPeriodIds:[],autoIssue:true,capMinor:300000,includeOverages:true,billTo:'Portable client',remitTo:'Portable agency',reference:'Portable service',reason:'Portable automatic schedule with fresh installation consent'})
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
 assert.match((await cmd('appkey:create',{label:'Portability app credential',operatorId:favoriteUser.id,projectIds:[engagement.id],scope:'projects:read time:write'})).token,/^gauge_app_/)
 await cmd('time:policy',{lockThrough:'2020-12-31',reason:'Historical migration cutoff; current work remains open'})
 await cmd('save:staffing',{personId:person.id,engagementId:internal.id,from:'2026-10-09',to:'2026-10-09',dailySeconds:3600,commitment:'tentative',service:'Research',billable:false})
 const agent=await h.invite('portability-agent');await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'staffing',engagementIds:[engagement.id]})
 const proposal=await cmd('proposal:prepare',{kind:'staffing',engagementId:engagement.id,assumptions:'Research capacity reviewed by the lead',evidence:[{source:'Agency planning meeting',summary:'A researcher is needed for the next delivery period'}],plan:{alternatives:[{personId:person.id,from:'2026-10-12',to:'2026-10-12',dailySeconds:3600,rationale:'Qualified researcher with declared availability'}]}},agent.cookie)
 await cmd('proposal:approve',proposal)
 const fixture=new URL('./fixtures/harvest/',import.meta.url),files={}
 for(const name of ['clients.csv','people.csv','projects.csv','time.csv','finance.json'])files[name]=await readFile(new URL(name,fixture),'utf8')
 const manifest=JSON.parse(await readFile(new URL('manifest.json',fixture),'utf8'));manifest.namespace='portability-historical-document';manifest.currency=(await state()).agency.currency
 const historicalBytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
 const {capturedForecastPackage}=await import('./fixtures/forecast.mjs'),forecast=await capturedForecastPackage()
 Object.assign(manifest,{schedulePeople:forecast.manifest.schedulePeople,scheduleProjects:forecast.manifest.scheduleProjects,schedulePlaceholders:forecast.manifest.schedulePlaceholders,forecastApi:forecast.manifest.forecastApi})
 files['forecast.json']=forecast.files['forecast.json']
 files['forecast-metadata.json']=forecast.files['forecast-metadata.json']
 manifest.sourceCoverage.forecast=forecast.manifest.sourceCoverage.forecast
 const sourcePackage={manifest,files,archives:[{name:'historical-invoice.pdf',mediaType:'application/pdf',base64:historicalBytes.toString('base64')}]}
 harvestFinancePackage(sourcePackage)
 const preview=await cmd('import:preview',{package:sourcePackage})
 let retainedImport=await cmd('import:create',{package:sourcePackage,fingerprint:preview.fingerprint})
 while(['applying','queued'].includes(retainedImport.state))retainedImport=await cmd('import:resume',{id:retainedImport.id})
 assert.equal(retainedImport.state,'completed')
 // BUDGET-002: exact capped source slices, alert records and budget-bearing templates round-trip.
 const capProject=await cmd('save:engagements',{name:'Portable capped service',clientId:engagement.value.clientId,leadId:person.id,members:[person.id],scope:'Portable held excess',timezone:zone})
 const capBudget=await cmd('budget:approve',await cmd('save:budgets',{engagementId:capProject.id,mode:'hourly',notToExceed:true,amountMinor:7000,effortSeconds:3600,roundingSeconds:1,reason:'Portable cap'}))
 const capTask=await cmd('save:tasks',{engagementId:capProject.id,name:'Portable capped work',remainingSeconds:0})
 let capTime=await cmd('time:save',{engagementId:capProject.id,taskId:capTask.id,personId:person.id,service:'Research',timezone:zone,start:'2026-10-20T09:00:00+10:00',end:'2026-10-20T10:00:00+10:00',billable:true,notes:'Portable exact cap source'})
 capTime=await cmd('time:approve',await cmd('time:submit',capTime))
 await cmd('cap:draft',{engagementId:capProject.id,budgetId:capBudget.id,budgetRevision:capBudget.revision,title:'Portable half-hour billing slice'})
 const phaseTemplate=await cmd('template:save',{name:'Portable phase budget',purpose:'project',reason:'Portable immutable phase allowances',budget:{mode:'hourly',amountMinor:30000,effortSeconds:7200,roundingSeconds:60,expenseBudgetMinor:0,phases:[{key:'research',name:'Research',service:'Research',mode:'hourly',hourBudgetSeconds:3600,feeBudgetMinor:10000,expenseBudgetMinor:0,marginBasisPoints:2500},{key:'delivery',name:'Delivery',service:'Delivery',mode:'fixed',hourBudgetSeconds:3600,feeBudgetMinor:20000,expenseBudgetMinor:0,marginBasisPoints:2500}]},items:[{key:'research',kind:'task',name:'Portable phased research',phaseKey:'research',offsetDays:0,durationDays:1,predecessors:[],owner:'lead',effortSeconds:3600},{key:'delivery',kind:'task',name:'Portable phased delivery',phaseKey:'delivery',offsetDays:0,durationDays:1,predecessors:[],owner:'lead',effortSeconds:3600}]})
 const phaseProject=await cmd('save:engagements',{name:'Portable phased project',clientId:engagement.value.clientId,leadId:person.id,members:[person.id],scope:'Portable phase template application',timezone:zone})
 await cmd('template:apply',{templateId:phaseTemplate.id,engagementId:phaseProject.id,start:'2026-11-02',reason:'Portable selected phase version'})
 const phaseBudget=(await state()).data.budgets.find(b=>b.value.engagementId===phaseProject.id)
 await cmd('budget:approve',phaseBudget)
 const portablePartialProject=await cmd('save:engagements',{name:'Portable partial hourly',clientId:engagement.value.clientId,leadId:person.id,members:[person.id],scope:'Portable partial sources',timezone:zone})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:portablePartialProject.id,mode:'hourly',amountMinor:100000,effortSeconds:7200,roundingSeconds:60,reason:'Portable partial terms'}))
 const portableTask=await cmd('save:tasks',{engagementId:portablePartialProject.id,name:'Portable partial work',remainingSeconds:0})
 const portableTime=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{engagementId:portablePartialProject.id,personId:person.id,taskId:portableTask.id,service:'Research',timezone:zone,notes:'Portable partial source',billable:true,start:'2026-10-09T15:00:00+10:00',end:'2026-10-09T16:00:00+10:00'})))
 const portableTerms=(await state()).data.budgets.find(b=>b.value.engagementId===portablePartialProject.id&&b.value.status==='approved')
 const portablePartial=await cmd('packet:approve',await cmd('packet:partial',{engagementId:portablePartialProject.id,budgetId:portableTerms.id,budgetRevision:portableTerms.revision,sourceId:portableTime.id,sourceRevision:portableTime.revision,durationSeconds:1200,title:'Portable partial time'}))
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
 await cmd('invoice:settings',{clientId:invoiceClient.id,timeMode:'entry',expenseMode:'itemized',attachDetail:true,footer:'Portable remittance details',additionalDetails:'<p>Portable invoice details</p>',reason:'Portable document defaults'})
 await cmd('invoice:issue',{...portablePartial,issueDate:'2026-10-11',dueDate:invoiceDue,billTo:invoiceClient.value.name,remitTo:'Portable agency account',reference:invoiceClient.value.poRequired?invoiceClient.value.poNumbers[0]:'Portable partial invoice'})
 const portableInvoice=await cmd('invoice:issue',{...invoicePacket,issueDate:'2026-10-11',dueDate:invoiceDue,billTo:invoiceClient.value.name,remitTo:'Portable agency account',reference:invoiceClient.value.poRequired?invoiceClient.value.poNumbers[0]:'Portable October invoice'})
 const invoiceRecipient=await h.invite('synthetic-gauge-5303'),portableInvoiceAccess=await cmd('invoice:release',{...portableInvoice,contact:'synthetic-gauge-5303@example.test',days:7,reason:'Portable exact document authorization'})
 assert.equal((await request('/app/client-invoices/'+portableInvoiceAccess.id,invoiceRecipient.cookie)).status,200)
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
 const extraExpense=await cmd('expense:approve',await cmd('expense:submit',await cmd('expense:save',{engagementId:invoiceProject.id,personId:person.id,date:'2026-10-10',description:'Portable consolidated materials',amountMinor:100,reimbursable:true})))
 const fixedPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:fixedProject.id,consolidate:true,title:'Portable deposit packet',sources:[`fixedCharges:${fixedCharge.id}`,`expenses:${extraExpense.id}`]}))
 await cmd('invoice:issue',{...fixedPacket,issueDate:'2026-10-11',dueDate:invoiceDue,billTo:invoiceClient.value.name,remitTo:'Portable agency account',reference:invoiceClient.value.poRequired?invoiceClient.value.poNumbers[0]:'Portable deposit invoice'})
 // FINANCE-004: an agency close and manual reconciliation are business history, not authority.
 const closeMonth='2019-04'
 const agencyPreview=await cmd('period:preview',{month:closeMonth})
 assert.deepEqual(agencyPreview.snapshot.checklist.blocking,[])
 const agencyDraft=await cmd('period:prepare',{...agencyPreview.input,fingerprint:agencyPreview.fingerprint,acknowledgeWip:true,wipReconciliation:'Portable agency close retains source-linked WIP; no 2019 dated facts or expected calendar time recorded',reason:'Portable immutable April agency close'})
 const agencyClose=await cmd('period:approve',agencyDraft)
 await cmd('period:reopen-prepare',{...agencyClose,reason:'Portable prepared request; never an execution instruction'})
 const nativeInvoice=(await state()).data.invoices.find(i=>i.id===portableInvoice.id),invoiceCredits=(await state()).data.invoiceCorrections.filter(c=>c.value.invoiceId===nativeInvoice.id&&c.value.status==='issued'&&c.value.type!=='void'),nativeNet=nativeInvoice.value.totalMinor-invoiceCredits.reduce((n,c)=>n+c.value.amountMinor,0)
 await cmd('period:match',{month:'2026-10',invoiceId:nativeInvoice.id,invoiceRevision:nativeInvoice.revision,system:'synthetic-gauge-accounting',externalId:'synthetic-gauge-portable-invoice',amountMinor:nativeNet,currency:nativeInvoice.value.currency,reference:'Portable native invoice reconciliation',reason:'User-recorded exact net control for archive proof'})
 await cmd('save:calendars',{personId:person.id,from:'2026-11-02',to:'2026-11-06',dailySeconds:28800,weekdays:'1,2,3,4,5',timezone:zone})
 const estimateOpportunity=await cmd('save:opportunities',{name:'Portable quoted project',clientId:engagement.value.clientId,ownerId:engagement.value.leadId,stage:'proposal',probability:75,from:'2026-11-02',to:'2026-11-06',services:'Research',amountMinor:40000,demandSeconds:7200})
 const estimateInput={opportunityId:estimateOpportunity.id,name:'Portable research estimate',phases:[{key:'research',name:'Research',service:'Research',mode:'fixed',from:'2026-11-02',to:'2026-11-06'}],lines:[{key:'research',name:'Research work',kind:'subcontractor',phaseKey:'research',role:'Researcher',personId:person.id,effortSeconds:7200,billRateMinor:20000,costRateMinor:14000,costReference:'Synthetic AUD contractor quote; no FX conversion'}],reason:'Portable estimate source version'}
 const portableAttestation={attest:'owner-recorded-external-acceptance',acceptorName:'synthetic-gauge-4',acceptorContact:'synthetic-gauge-5',acceptanceDate:'2026-10-21',channel:'signed document',evidenceRef:'synthetic-gauge-6',reason:'Owner-recorded acceptance remains unverified history'}
 const estimateOne=await cmd('estimate:save',estimateInput),withdrawnApproval=await cmd('estimate:approve',{...estimateOne,...portableAttestation})
 await cmd('estimate:withdraw',{...estimateOne,approvalId:withdrawnApproval.id,approvalRevision:withdrawnApproval.revision,reason:'Portable withdrawal of reported acceptance'})
 const estimateTwo=await cmd('estimate:save',{...estimateInput,previousId:estimateOne.id,discountBasisPoints:1000,reason:'Portable immutable discounted version'})
 const portableApproval=await cmd('estimate:approve',{...estimateTwo,...portableAttestation})
 const estimateConverted=await cmd('estimate:convert',estimateTwo)
 const portableCrank=await cmd('provider:connect',{provider:'crank',accountLabel:'Portable budget notifications',credential:'synthetic-gauge-3002'})
 await cmd('budget:thresholds',{engagementId:capProject.id,thresholds:[50,75],reason:'Portable Crank budget exception source'})
 const portableAlert=(await state()).data.budgetAlerts.find(a=>a.value.engagementId===capProject.id);assert(portableAlert)
 const portableCrankJob=await cmd('providerJob:queue-crank',{connectionId:portableCrank.id,alertId:portableAlert.id,alertRevision:portableAlert.revision,endpoint:'https://crank.example.test/api/crank/flows/budget-exception/trigger'})
 const portableZapier=await cmd('provider:connect',{provider:'zapier',accountLabel:'Portable signed budget hook',credential:JSON.stringify({endpoint:'https://hooks.zapier.com/hooks/catch/synthetic-gauge-3005/synthetic-gauge-3006/',signingKey:'synthetic-gauge-3007'})})
 const portableHookInput={connectionId:portableZapier.id,sourceRef:`budgetAlerts:${portableAlert.id}:${portableAlert.revision}`,reason:'Owner explicitly releases one portable source'}
 const expiredHookPreview=await cmd('providerJob:preview-webhook',portableHookInput)
 await h.db.prepare('UPDATE g_webhook_previews SET expires_at=1 WHERE id=?').bind(expiredHookPreview.previewId).run()
 await cmd('providerJob:queue-webhook',{...portableHookInput,previewId:expiredHookPreview.previewId,confirm:'release-exact-event'},h.owner,409)
 const portableHookPreview=await cmd('providerJob:preview-webhook',portableHookInput)
 const portableZapierJob=await cmd('providerJob:queue-webhook',{...portableHookInput,previewId:portableHookPreview.previewId,confirm:'release-exact-event'})
 const portableProvider=await cmd('provider:connect',{provider:'resend',accountLabel:'Portable proposal mail',credential:'synthetic-gauge-3001'})
 const proposalRecipient=await h.invite('portable-client')
 const proposalOpportunity=await cmd('save:opportunities',{name:'Portable client proposal',clientId:engagement.value.clientId,ownerId:engagement.value.leadId,stage:'proposal',probability:75,from:'2026-11-02',to:'2026-11-06',services:'Research',amountMinor:40000,demandSeconds:7200})
 const proposalEstimate=await cmd('estimate:save',{...estimateInput,opportunityId:proposalOpportunity.id,name:'Portable client research'})
 const portableProposalInput={estimateId:proposalEstimate.id,estimateRevision:proposalEstimate.revision,agencyName:'Research Agency',title:'Research proposal',recipientName:'Casey Client',recipientContact:'portable-client@example.test',scope:'Two hours of research',deliverables:['Research findings'],exclusions:['Implementation'],from:'2026-11-02',to:'2026-11-06',expiry:new Date(Date.now()+7*86400000).toISOString().slice(0,10),signatureRequired:false,paymentSchedule:[{name:'Research handover',due:'2026-11-06',amountMinor:40000}],reason:'Portable proposal history'}
 const firstPortableProposal=await cmd('commercial:prepare',portableProposalInput)
 let portableProposal=await cmd('commercial:prepare',{...portableProposalInput,previousId:firstPortableProposal.id,deliverables:['Research findings','Executive summary'],reason:'Latest portable proposal includes the executive summary'})
 await cmd('commercial:send',{...portableProposal,connectionId:portableProvider.id,reason:'Owner sends exact reviewed proposal'})
 portableProposal=(await state()).data.commercialProposals.find(p=>p.id===portableProposal.id)
 assert.equal((await request('/app/client-proposals/'+portableProposal.id,proposalRecipient.cookie)).status,200)
 // Signed artifacts are business evidence; provider credentials and execution authority never travel.
 let signatureOriginal,signatureHash
 const portableInkwell=await cmd('provider:connect',{provider:'inkwell',accountLabel:'Portable signed evidence',origin:'https://inkwell.example.test',credential:'synthetic-gauge-3003'})
 const signedOpportunity=await cmd('save:opportunities',{...opportunity,name:'Portable signed proposal',stage:'proposal'})
 const signedEstimate=await cmd('estimate:save',{...estimateInput,opportunityId:signedOpportunity.id})
 const signedProposal=await cmd('commercial:prepare',{...portableProposalInput,estimateId:signedEstimate.id,estimateRevision:signedEstimate.revision,signatureRequired:true})
 await cmd('commercial:send',{...signedProposal,connectionId:portableProvider.id,reason:'Portable signed proposal delivery'})
 const releasedSigned=(await state()).data.commercialProposals.find(r=>r.id===signedProposal.id)
 signatureOriginal=Buffer.from(releasedSigned.value.nativeOriginal.base64,'base64');signatureHash=createHash('sha256').update(signatureOriginal).digest('hex');assert.equal(signatureHash,releasedSigned.value.nativeOriginal.sha256)
 await cmd('commercial:signature-bind',{...releasedSigned,connectionId:portableInkwell.id,envelopeId:'synthetic-gauge-3004',originalSha256:signatureHash,confirm:'reviewed-exact-pdf',reason:'Portable owner-reviewed exact PDF'})
 h.providerEdge.handler=async request=>request.url.endsWith('/artifacts/original')||request.url.endsWith('/artifacts/signed')||request.url.endsWith('/artifacts/certificate')?new Response(signatureOriginal):request.url==='https://inkwell.example.test/api/v1/envelopes/synthetic-gauge-3004'?Response.json({envelope:{id:'synthetic-gauge-3004',status:'completed',originalSha256:signatureHash,signedSha256:signatureHash,certificateSha256:signatureHash,signers:[{email:'portable-client@example.test',signedAt:new Date().toISOString()}]}}):undefined
 await cmd('commercial:signature-readback',releasedSigned);h.providerEdge.handler=null
 assert((await state()).data.commercialEvents.some(r=>r.value.proposalId===signedProposal.id&&r.value.status==='verified'))
 const signedEvidence=(await state()).data.commercialEvents.find(r=>r.value.proposalId===signedProposal.id&&r.value.status==='verified')
 const signedDecision=await h.post('/app/client-proposals/'+signedProposal.id,{key:crypto.randomUUID(),revision:releasedSigned.revision,fingerprint:releasedSigned.value.fingerprint,outcome:'accepted',reason:'Client confirms the exact signed portable proposal',confirm:'accept-exact-proposal'},proposalRecipient.cookie);assert.equal(signedDecision.status,200)
 assert.equal((await state()).data.commercialEvents.find(r=>r.value.proposalId===signedProposal.id&&r.value.type==='accepted').value.signatureEvidenceId,signedEvidence.id)

 const portableSync=await cmd('providerSync:start',{connectionId:portableProvider.id})
 const portableReceiptKey=await cmd('provider:connect',{provider:'receipt',accountLabel:'Portable workflow request key',credential:'synthetic-gauge-3008'})
 const portableSecondAlert=(await state()).data.budgetAlerts.find(a=>a.value.engagementId===capProject.id&&a.id!==portableAlert.id);assert(portableSecondAlert)
 const completedCrank=await cmd('providerJob:queue-crank',{connectionId:portableCrank.id,alertId:portableSecondAlert.id,alertRevision:portableSecondAlert.revision,endpoint:'https://crank.example.test/api/crank/flows/budget-exception/trigger'})
 await cmd('providerJob:dispatch',completedCrank)
 const admittedPortable=(await state()).data.providerJobs.find(j=>j.id===completedCrank.id)
 const portableWorkflowReceipt={schema:'gauge-followup-v1',eventId:admittedPortable.value.eventId,sourceRevision:portableSecondAlert.revision,remoteReference:admittedPortable.value.providerRunId,taskName:'Portable approved workflow follow-up'}
 const portableReceiptSignature=createHmac('sha256','synthetic-gauge-3008').update('gauge-followup-v1\n'+JSON.stringify(Object.fromEntries(Object.entries(portableWorkflowReceipt).sort(([a],[b])=>a.localeCompare(b))))).digest('hex')
 const portableFollowupInput={...admittedPortable,connectionId:portableReceiptKey.id,receipt:JSON.stringify(portableWorkflowReceipt),signature:portableReceiptSignature,confirm:'apply-exact-followup',reason:'Owner reviews and applies a portable workflow request'}
 const portableFollowup=await cmd('providerJob:apply-followup',portableFollowupInput)
 assert.equal((await cmd('providerJob:apply-followup',portableFollowupInput)).id,portableFollowup.id)
 const fieldPackage={format:'kantata-ox-custom-fields-v1',namespace:'synthetic-gauge-portable-fields',fields:[{id:'office',scope:'people',name:'Portable office',type:'single-select',options:[{id:'Austin',name:'Austin'}]}],records:[{scope:'people',id:'worker',values:{office:'Austin'}}],controls:{people:1}},fieldMap={people:{worker:person.id}},fieldPolicies={office:{visibility:'everyone'}}
 const fieldPreview=await cmd('field:import-preview',{package:fieldPackage,mapping:fieldMap,policies:fieldPolicies})
 const fieldImport=await cmd('field:import',{package:fieldPackage,mapping:fieldMap,policies:fieldPolicies,fingerprint:fieldPreview.fingerprint,reason:'Portable source field custody'})
 const officeField=(await state()).data.customFields.find(f=>f.value.sourceId==='office')
 const savedFieldReport=await cmd('saved:save',{name:'Portable office utilization',dataset:'utilization',group:officeField.id,from:'2026-10-01',to:'2026-10-31'})
 const privateField=await cmd('field:define',{scope:'engagements',name:'Portable contract value',type:'currency',currency:'AUD',visibility:'finance-only',required:true,reason:'Portable required finance definition; legacy records remain intact'})
 const fieldEngagement=(await state()).data.engagements.find(e=>e.id===engagement.id)
 await cmd('field:values',{scope:'engagements',...fieldEngagement,customFields:{[privateField.id]:123456}})
 const replayPreview=await cmd('import:preview',{package:sourcePackage});assert.deepEqual(replayPreview.customFieldFindings,[],'Required-on-create fields never block replay of existing imported records')
 const nativeCounts=(await state()).data.engagements.length;let replayedImport=await cmd('import:create',{package:sourcePackage,fingerprint:replayPreview.fingerprint});while(['applying','queued'].includes(replayedImport.state))replayedImport=await cmd('import:resume',{id:replayedImport.id});assert.equal(replayedImport.state,'completed');assert.equal((await state()).data.engagements.length,nativeCounts,'Required-field-safe import replay creates no duplicate native entities')
 const unmappedPackage=structuredClone(sourcePackage);unmappedPackage.manifest.namespace='synthetic-gauge-required-import-1';const requiredPreview=await cmd('import:preview',{package:unmappedPackage});assert(requiredPreview.customFieldFindings.some(f=>f.field===privateField.id&&f.scope==='engagements'));const requiredForm=new FormData();for(const [name,value]of Object.entries({action:'import:preview',key:crypto.randomUUID(),package:JSON.stringify(unmappedPackage)}))requiredForm.set(name,value);const requiredPage=await request('/app/action',owner,{method:'POST',headers:{origin:h.origin},body:requiredForm});assert.equal(requiredPage.status,200);assert((await requiredPage.text()).includes('Portable contract value'),'Native preview explains each required custom field before apply');await cmd('import:create',{package:unmappedPackage,fingerprint:requiredPreview.fingerprint},owner,400);assert.equal((await state()).data.engagements.length,nativeCounts,'A new import with unmapped required fields refuses before any native write')
 const portableCase=await cmd('case:open',{type:'blocked-input',title:'Portable missing source input',sourceRef:`engagements:${engagement.id}@${(await state()).data.engagements.find(e=>e.id===engagement.id).revision}`,ownerId:person.id,nextAction:'Obtain reviewed input',dueAt:new Date(Date.now()+86400000).toISOString(),reason:'Portable manual case'})
 await cmd('case:reply',{...portableCase,replyState:'ambiguous',externalReference:'synthetic-gauge-4201',quotedReply:'Maybe next week',reason:'Owner records an unverified reply'})
 const portableCaseCurrent=(await state()).data.operationalCases.find(r=>r.id===portableCase.id)
 await cmd('case:snooze',{...portableCaseCurrent,until:new Date(Date.now()+86400000).toISOString(),reason:'Wait for reviewed input'})
 await sourceFieldJourney(h,{client:expenseClient,project:expenseProject,person:expensePerson,task:await cmd('save:tasks',{engagementId:expenseProject.id,name:'Source custom field carrier',remainingSeconds:0})})
 // SALES-005: immutable reviewed change comparisons are portable, without live effects.
 const scopeSource=(await state()).data.engagements.find(r=>r.id===engagement.id)
 const scopeInput={asOf:'2026-10-01',changes:[{type:'scope',id:scopeSource.id,revision:scopeSource.revision,scope:'Portable proposed alternative'}]}
 const scopePreview=await cmd('change:preview',scopeInput)
 let portableChange=await cmd('change:prepare',{...scopeInput,fingerprint:scopePreview.fingerprint,name:'Portable scope request',reason:'Retain the reviewed comparison'})
 const scopeReviewer=await h.invite('synthetic-gauge-7306')
 await cmd('grant',{operatorId:scopeReviewer.id,personId:person.id,role:'finance',enabled:true})
 await cmd('change:review',{...portableChange,outcome:'declined',reason:'Review asks for a revised version'},scopeReviewer.cookie)
 const previousPortableChange=portableChange
 portableChange=await cmd('change:prepare',{...scopeInput,previousId:previousPortableChange.id,fingerprint:scopePreview.fingerprint,name:'Portable revised scope request',reason:'Retain the reviewed second version'})
 portableChange=await cmd('change:review',{...portableChange,outcome:'approved',reason:'Independent internal review, no client acceptance'},scopeReviewer.cookie)
 const portableChangeRecipient=await h.invite('synthetic-gauge-92504')
 const portableChangeRelease=await cmd('change:release-review',{...portableChange,contact:'synthetic-gauge-92504@example.test',description:'Exact portable change description',reason:'Retain direct response history without authority'})
 const portableChangeRow=(await state()).data.projectScenarios.find(r=>r.id===portableChange.id),portableChangeReview=portableChangeRow.value.clientReview
 const portableChangePath=`/api/gauge/client-changes/${portableChange.id}/${portableChangeReview.id}`
 const portableChangeResponse=await request(portableChangePath,portableChangeRecipient.cookie,{method:'POST',headers:{origin:h.origin,'content-type':'application/json','x-gauge-review-token':portableChangeRelease.token},body:JSON.stringify({key:crypto.randomUUID(),revision:portableChangeRow.revision,outcome:'accepted',reason:'Portable exact direct response, unsigned'})})
 assert.equal(portableChangeResponse.status,200,await portableChangeResponse.clone().text())
 const before=await state()
 assert.equal(before.data.customImports.find(r=>r.id===fieldImport.id).value.package.records[0].values.office,'Austin')
 assert.equal(before.data.people.find(r=>r.id===person.id).value.customFields[officeField.id],'Austin')
 assert(before.data.savedReports.some(r=>r.id===savedFieldReport.id));assert(before.data.estimates.some(r=>r.id===estimateOne.id)&&before.data.estimates.some(r=>r.id===estimateTwo.id));assert(before.data.estimateApprovals.some(r=>r.value.estimateId===estimateTwo.id));assert(before.data.estimateConversions.some(r=>r.value.engagementId===estimateConverted.id))
 const savedAttestation=before.data.estimateApprovals.find(r=>r.id===portableApproval.id).value
 for(const key of ['acceptorName','acceptorContact','acceptanceDate','channel','evidenceRef'])assert.equal(savedAttestation[key],portableAttestation[key],'Structured external acceptance survives export preparation: '+key)
 const notice='recorded by agency, client identity unverified'
 assert.equal(savedAttestation.notice,notice)
 assert.equal(before.data.estimateApprovals.find(r=>r.id===withdrawnApproval.id).value.status,'withdrawn')
 const portableConversion=before.data.estimateConversions.find(r=>r.value.engagementId===estimateConverted.id).value
 for(const row of [before.data.estimates.find(r=>r.id===estimateTwo.id),before.data.engagements.find(r=>r.id===estimateConverted.id),before.data.budgets.find(r=>r.id===portableConversion.budgetId),...before.data.milestones.filter(r=>portableConversion.milestoneIds.includes(r.id))])assert.equal(row.value.acceptanceNotice,notice,'Every exported estimate-derived surface keeps the agency label')
 assert.equal(before.data.archives.filter(r=>r.value.forecast).length,4,'MIGRATE-003 source snapshots are available before BASE-002 export')
 assert(before.data.calendars.some(r=>r.value.source?.externalId==='api:availability:v1'),'MIGRATE-003 captured availability is native before export')
 assert(before.data.leave.some(r=>r.value.source?.externalId==='api:assignment:a2'),'MIGRATE-003 captured time off is native before export')
 assert.equal(before.data.archives.filter(r=>r.value.harvestFinance&&r.value.source.namespace==='harvest:portability-historical-document').length,9,'All financial source records are retained for full custody restore')
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
 const documentDownloads=before.data.invoices.filter(i=>i.value.document).flatMap(i=>['pdf','detail-pdf','csv'].map(format=>`/api/gauge/invoice-documents/${i.id}?format=${format}`))
 const downloads=documentDownloads.concat(before.data.periodCloses.map(c=>`/api/gauge/closes/${c.id}`).concat(before.data.specialistHandoffs.map(r=>`/api/gauge/handoffs/${r.id}`)))
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
   for(const cookie of [owner,agent.cookie,favoriteUser.cookie,portableLead.cookie,portableDelegate.cookie,proposalRecipient.cookie,portableRecipient.cookie]){
    assert.equal((await request('/api/gauge/state',cookie)).status,401,'old session cannot read restored business data')
    assert.equal((await post('/api/gauge/command',{key:'restored-stale-session',action:'save:clients',name:'Unapproved restored write'},cookie)).status,401,'old session cannot write restored business data')
   }
  }})
  try{
   const favoritePage=await restored.request(`/app/time?sheetPerson=${person.id}&sheetFrom=2026-10-05`,restored.owner);assert.equal(favoritePage.status,200);assert((await favoritePage.text()).includes('Research workshop'),'Restored private favorite is available when the owner acts for its person on Time')
   assert.notEqual(restored.vars.SESSION_SECRET,h.vars.SESSION_SECRET,'restore uses fresh private settings')
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM g_milestone_review_authority').first()).n,0,'Client delivery review authority never travels')
   assert.equal((await restored.post('/auth/magic-link',{email:'synthetic-gauge-7305@example.test'})).status,202)
   const reviewConfirmation=new URL(restored.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
   const reviewConfirmed=await restored.post('/auth/confirm',{token:reviewConfirmation.searchParams.get('token')});assert.equal(reviewConfirmed.status,303)
   const restoredRecipientCookie=reviewConfirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
   assert.equal((await restored.request(portableReviewPath,restoredRecipientCookie,{headers:{'x-gauge-review-token':portableRelease.token}})).status,403,'Fresh matching email cannot revive restored review authority')
   const restoredReview=(await restored.state()).data.milestones.find(r=>r.id===reviewMilestone.id)
   assert.equal(restoredReview.value.delivery.decisions[0].confirmedByClient,true,'Direct decision history remains direct evidence after restore')
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM g_retainer_schedule_authority').first()).n,0,'Restored schedules carry no execution consent')
   await restored.cmd('handoff:prepare',{purpose:'reimbursement',recipient:'Portable payroll desk',reason:'Restored replay must not reimburse twice',sources:[{kind:'expenses',id:portableClaim.id,revision:portableClaim.revision}]},restored.owner,409)
   const restoredChange=(await restored.state()).data.projectScenarios.find(r=>r.id===portableChange.id)
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM g_change_review_authority').first()).n,0,'Change recipient authority never travels')
   assert.deepEqual(restoredChange.value.clientDecision,before.data.projectScenarios.find(r=>r.id===portableChange.id).value.clientDecision,'Direct change evidence retains exact recipient, reason and fingerprint')
   assert.equal((await restored.post('/auth/magic-link',{email:'synthetic-gauge-92504@example.test'})).status,202)
   const changeConfirmation=new URL(restored.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
   const changeConfirmed=await restored.post('/auth/confirm',{token:changeConfirmation.searchParams.get('token')});assert.equal(changeConfirmed.status,303)
   const freshChangeCookie=changeConfirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
   assert.equal((await(await restored.request('/auth/session',freshChangeCookie)).json()).operator.email,'synthetic-gauge-92504@example.test')
   assert.equal((await restored.request(portableChangePath,freshChangeCookie,{headers:{'x-gauge-review-token':portableChangeRelease.token}})).status,403,'Fresh matching email and old key cannot revive restored change authority')
   assert.equal(restoredChange.value.reviewStatus,'approved');assert.equal(restoredChange.value.status,'prepared')
   assert.deepEqual(restoredChange.value.baseline,scopePreview.baseline);assert.deepEqual(restoredChange.value.scenario,scopePreview.scenario)
   await restored.cmd('projectScenario:adopt',{id:restoredChange.id,revision:restoredChange.revision,asOf:'2026-10-01',selectedIds:[engagement.id],fingerprint:scopePreview.fingerprint,reason:'Restored internal review grants no client acceptance'},restored.owner,409)
   const restoredBefore=await restored.state(),restoredRuns=restoredBefore.data.retainerRuns
   await restored.cmd('retainer:run',{...portableSchedule,asOf:'2026-10-16'},restored.owner,403)
   assert.equal((await restored.state()).data.invoices.length,restoredBefore.data.invoices.length,'Restored schedule cannot issue without fresh consent')
   assert.equal((await restored.scheduled()).status,200)
   assert.deepEqual((await restored.state()).data.retainerRuns,restoredRuns,'Archive history never replays scheduled billing')
   const restoredEstimates=await restored.state(),restoredAttestation=restoredEstimates.data.estimateApprovals.find(r=>r.id===portableApproval.id).value
   for(const key of ['acceptorName','acceptorContact','acceptanceDate','channel','evidenceRef','notice'])assert.equal(restoredAttestation[key],savedAttestation[key],'Restore keeps the structured acceptance field '+key)
   assert.equal(restoredEstimates.data.estimateApprovals.find(r=>r.id===withdrawnApproval.id).value.status,'withdrawn')
   const restoredWithdrawalHistory=await(await restored.request(`/api/gauge/history/estimateApprovals/${withdrawnApproval.id}`,restored.owner)).json()
   assert.equal(restoredWithdrawalHistory.history[0].value.notice,notice);assert.equal(restoredWithdrawalHistory.history[0].value.acceptorContact,portableAttestation.acceptorContact)
   assert.deepEqual(restoredEstimates.data.operationalCases,before.data.operationalCases,'Case owners, next actions, reply state, snooze and baseline survive restore')
   assert.deepEqual(restoredEstimates.data.caseEvents,before.data.caseEvents,'Case attempt/reply history survives without authority or automatic action')
   assert.deepEqual(stable(restoredEstimates),stable(before),'fresh native login sees the same current records, money and capacity')
   const restoredBytes=await Promise.all(downloads.map(path=>getBytes(restored,path)))
   assert.deepEqual(restoredBytes,bytes,'packet artifacts, receipts and retained source originals round-trip byte for byte')
   assert.deepEqual(await Promise.all(records.map(path=>getBytes(restored,path))),histories,'all business revision history survives')
   const restoredScopePreview=await restored.cmd('change:preview',scopeInput)
   const continuedChange=await restored.cmd('change:prepare',{...scopeInput,previousId:portableChange.id,fingerprint:restoredScopePreview.fingerprint,name:'Continued restored change request',reason:'Version order is business order after restore'})
   const continuedRow=(await restored.state()).data.projectScenarios.find(r=>r.id===continuedChange.id)
   assert.equal(continuedRow.value.number,3);assert.equal(continuedRow.value.previousId,portableChange.id)
   await restored.cmd('change:prepare',{...scopeInput,previousId:previousPortableChange.id,fingerprint:restoredScopePreview.fingerprint,name:'Superseded restored change',reason:'Older versions cannot be revised'},restored.owner,409)
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM g_invoice_access_authority').first()).n,0,'Invoice recipient authority never travels in an archive')
   assert.equal((await restored.post('/auth/magic-link',{email:'synthetic-gauge-5303@example.test'})).status,202)
   const invoiceConfirmation=new URL(restored.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
   const invoiceConfirmed=await restored.post('/auth/confirm',{token:invoiceConfirmation.searchParams.get('token')});assert.equal(invoiceConfirmed.status,303)
   const freshInvoiceCookie=invoiceConfirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
   assert.equal((await restored.request('/app/client-invoices/'+portableInvoiceAccess.id,freshInvoiceCookie)).status,403,'Even a fresh matching email cannot revive restored invoice authority')
   assert.deepEqual(restoredEstimates.data.invoiceAccess,before.data.invoiceAccess);assert.deepEqual(restoredEstimates.data.invoiceViews,before.data.invoiceViews)
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM g_commercial_proposal_authority').first()).n,0,'Client proposal access does not travel in business archives')
   assert.deepEqual(restoredEstimates.data.commercialProposals,before.data.commercialProposals)
   assert.deepEqual(restoredEstimates.data.commercialEvents,before.data.commercialEvents,'Delivery and client view history remain business facts, never replay instructions')
   for(const table of ['g_webhook_previews','g_provider_installation_key','g_provider_credentials','g_provider_receipts','g_provider_job_authority','g_provider_sync_authority'])assert.equal((await restored.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0,'Restore excludes provider secrets and authority')
   const restoredAccess=await(await restored.request('/app/access',restored.owner)).text();assert(restoredAccess.includes('disconnected'));for(const credential of ['synthetic-gauge-3001','synthetic-gauge-3002','synthetic-gauge-3003','synthetic-gauge-3007','synthetic-gauge-3008',portableReceiptSignature,'https://hooks.zapier.com/hooks/catch/synthetic-gauge-3005/synthetic-gauge-3006/'])assert(!restoredAccess.includes(credential))
   const restoredProviderJob=restoredEstimates.data.providerJobs.find(j=>j.value.connectionId===portableProvider.id);assert(restoredProviderJob)
   await restored.cmd('providerJob:queue-webhook',{...portableHookInput,previewId:portableHookPreview.previewId,confirm:'release-exact-event'},restored.owner,409);const providerTraffic=restored.providerRequests.length;await restored.cmd('providerJob:apply-followup',portableFollowupInput,restored.owner,409);await restored.cmd('providerSync:advance',portableSync,restored.owner,409);await restored.cmd('providerJob:dispatch',portableCrankJob,restored.owner,409);await restored.cmd('providerJob:dispatch',portableZapierJob,restored.owner,409);await restored.cmd('providerJob:dispatch',restoredProviderJob,restored.owner,409);assert.equal(restored.providerRequests.length,providerTraffic,'Restored job history never replays a provider write')
   const auth=await restored.post('/auth/magic-link',{email:'portable-client@example.test'});assert.equal(auth.status,202)
   const confirmation=new URL(restored.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
   const confirmed=await restored.post('/auth/confirm',{token:confirmation.searchParams.get('token')});assert.equal(confirmed.status,303)
   const freshClient=confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
   assert.equal((await restored.request('/app/client-proposals/'+portableProposal.id,freshClient)).status,403,'Fresh client sign-in alone cannot restore an old release')
   assert.equal((await restored.request('/app/client-proposals/'+signedProposal.id+'/evidence/signed',freshClient)).status,403,'Signed artifacts keep the same disconnected recipient authority after restore')
   const restoredEvidence=restoredEstimates.data.commercialEvents.find(r=>r.value.proposalId===signedProposal.id&&r.value.status==='verified');assert.equal(restoredEvidence.value.artifacts.signed.base64,signatureOriginal.toString('base64'))
   await restored.cmd('commercial:signature-readback',releasedSigned,restored.owner,409)
   const mailCount=restored.mails.length
   await restored.cmd('commercial:reconnect',{...portableProposal,reason:'New installation owner explicitly restores this recipient access'})
   assert.equal((await restored.request('/app/client-proposals/'+portableProposal.id,freshClient)).status,200)
   assert.equal(restored.mails.length,mailCount,'Restoring access never repeats the proposal send')
   await restored.cmd('commercial:reconnect',{...releasedSigned,reason:'Owner restores access to retained signed evidence without provider authority'})
   const restoredSigned=await restored.request('/app/client-proposals/'+signedProposal.id+'/evidence/signed',freshClient);assert.equal(restoredSigned.status,200);assert.deepEqual(Buffer.from(await restoredSigned.arrayBuffer()),signatureOriginal)
   assert.equal(restored.mails.length,mailCount,'Restoring signed evidence access never submits another message')

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
