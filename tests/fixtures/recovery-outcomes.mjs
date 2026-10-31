import assert from 'node:assert/strict'

// Native setup and adoption, shared with the complete installation restore journey.
export async function adoptedOutcome(h, label = 'synthetic-gauge-9300', currencyB = 'USD') {
 const {cmd}=h,agency=(await h.state()).agency,asOf=new Intl.DateTimeFormat('en-CA',{timeZone:agency.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now()),day=n=>new Date(Date.parse(asOf)+n*86400000).toISOString().slice(0,10)
 const person=await cmd('save:people',{name:label+' designer',timezone:'UTC'})
 const replacement=await cmd('save:people',{name:label+' contractor',employmentType:'contractor',timezone:'UTC'})
 const client=await cmd('save:clients',{name:label+' client',billingCurrency:'USD',paymentTermsDays:0,collectionPercent:50,daysLate:5})
 for(const p of [person,replacement])await cmd('save:calendars',{personId:p.id,from:asOf,to:day(20),dailySeconds:28800,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 await cmd('save:rates',{personId:person.id,service:'*',effective:asOf,costMinor:9000,billMinor:15000,currency:'USD'})
 await cmd('save:rates',{personId:replacement.id,service:'*',effective:asOf,costMinor:5000,billMinor:20000,currency:'USD'})
 const projects=[],bookings=[],tasks=[],plans=[],milestones=[]
 for(const [index,mode] of ['fixed','hourly'].entries()) {
  const p=await cmd('save:engagements',{name:label+' '+mode,clientId:client.id,leadId:person.id,members:[person.id],scope:'Native outcome observation',timezone:'UTC',currency:index?currencyB:'USD'});projects.push(p)
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:p.id,mode,amountMinor:1000000,effortSeconds:360000,roundingSeconds:60,reason:'Agreed native scope'}))
  const t=await cmd('save:tasks',{engagementId:p.id,name:label+' task '+index,assigneeId:person.id,from:day(2),to:day(3),remainingSeconds:(index?4:8)*3600});tasks.push(t)
  const m=await cmd('save:milestones',{engagementId:p.id,name:label+' handover '+index,due:day(4),amountMinor:index?0:1000000});milestones.push(m)
  if(!index)await cmd('milestone:approve',m)
  const b=await cmd('save:staffing',{engagementId:p.id,personId:person.id,service:'Design',from:day(2),to:day(3),dailySeconds:(index?2:4)*3600,commitment:'committed'});bookings.push(b)
  const preview=await cmd('delivery:preview',{engagementId:p.id,previousId:null,operation:'baseline',plan:{calendar:{weekdays:[0,1,2,3,4,5,6],holidays:[]},nodes:[
   {id:t.id,kind:'task',sourceId:t.id,name:label+' design',start:day(2),durationDays:2,predecessors:[],staffingIds:index?[]:[b.id]},
   {id:m.id,kind:'milestone',sourceId:m.id,name:label+' handover',start:day(4),durationDays:1,predecessors:[t.id],staffingIds:[]}
  ]}})
  plans.push(await cmd('delivery:approve',{...preview.input,fingerprint:preview.fingerprint,acceptEffects:true,reason:'Ordinary approved delivery baseline'}))
 }
 const input={asOf,changes:[{type:'deadline',...plans[0],nodeId:tasks[0].id,delayBusinessDays:1},{type:'staffing',...bookings[1],personId:replacement.id,effectiveFrom:day(2)}]}
 const preview=await cmd('projectScenario:preview',input)
 const prepared=await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:label+' adopted comparison',reason:'Human reviews native effects'})
 const selection={...prepared,asOf,selectedIds:[plans[0].id,bookings[1].id]},selected=await cmd('projectScenario:preview',selection)
 await cmd('recovery:outcome-capture',{id:prepared.id,revision:prepared.revision},h.owner,409)
 const adopted=await cmd('projectScenario:adopt',{...selection,fingerprint:selected.fingerprint,reason:'Human adopts the exact selected native changes'})
 const row=(await h.state()).data.projectScenarios.find(p=>p.id===adopted.id)
 assert.deepEqual(row.value.approvedComparison.observation,selected.observation)
 return {asOf,day,person,replacement,client,projects,bookings,tasks,plans,milestones,adopted:{id:adopted.id,revision:adopted.revision},retained:row.value.approvedComparison.observation}
}
