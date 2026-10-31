import assert from 'node:assert/strict'
import { harness } from './gauge-harness.mjs'

// An unchanged price does not renew an approval bound to the replaced source.
export async function recoveryCashComparison() {
 const now=new Date().toISOString(),asOf=now.slice(0,10),day=new Date(Date.parse(asOf)+86400000).toISOString().slice(0,10)
 const h=await harness({currency:'USD',timezone:'UTC',now})
 try {
 const {cmd,owner}=h
 const people=[]
 for(const suffix of ['original','replacement']) {
  const person=await cmd('save:people',{name:'synthetic-gauge-9340 '+suffix,timezone:'UTC'});people.push(person)
  await cmd('save:calendars',{personId:person.id,from:asOf,to:day,dailySeconds:28800,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 }
 await cmd('save:rates',{service:'Design',effective:asOf,costMinor:9000,billMinor:15000,currency:'USD'})
 const client=await cmd('save:clients',{name:'synthetic-gauge-9341',paymentTermsDays:0})
 const project=await cmd('save:engagements',{name:'synthetic-gauge-9342',clientId:client.id,leadId:people[0].id,members:[people[0].id],scope:'Equal-price staffing replacement',timezone:'UTC',currency:'USD'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:3600,roundingSeconds:60,reason:'Approved native service'}))
 const booking=await cmd('save:staffing',{engagementId:project.id,personId:people[0].id,service:'Design',from:day,to:day,dailySeconds:3600,commitment:'committed'})
 const read=async()=>{const response=await h.request('/api/gauge/state?'+new URLSearchParams({asOf,from:asOf,to:day}),owner);assert.equal(response.status,200);return response.json()}
 const itemOf=data=>data.cash.engagements.find(p=>p.engagementId===project.id).items[0]
 const item=itemOf(await read())
 assert.equal(item.amountMinor,15000)
 const approve={asOf,from:asOf,to:day,engagementId:project.id,sourceKey:item.probabilityBasis.key,fingerprint:item.probabilityBasis.fingerprint,collectionPercent:25,reason:'Owner reviews this exact scheduled source'}
 const assumption=await cmd('cash:approve',approve)
 assert.equal(itemOf(await read()).expectedMinor,3750)
 const input={asOf,changes:[{type:'staffing',...booking,personId:people[1].id,effectiveFrom:day}]}
 const preview=await cmd('projectScenario:preview',input)
 const prepared=await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:'synthetic-gauge-9343',reason:'Review equal-price replacement'})
 const selection={...prepared,asOf,selectedIds:[booking.id]},selected=await cmd('projectScenario:preview',selection)
 const adopted=await cmd('projectScenario:adopt',{...selection,fingerprint:selected.fingerprint,reason:'Adopt the reviewed replacement'})
 const compare=async()=>cmd('recovery:outcome-compare',await cmd('recovery:outcome-capture',{id:adopted.id,revision:adopted.revision}))
 const result=await compare(),sum=s=>s.cash.months.reduce((total,month)=>total+month.expectedMinor,0)
 assert.equal(sum(result.before),3750)
 assert.equal(sum(result.expected),15000,'Replacement invalidates source-bound collection approval in the retained prediction')
 assert.equal(sum(result.observed),15000)
 assert.equal(selected.scenario.cash.months.reduce((total,month)=>total+month.expectedMinor,0),15000)
 assert.equal(itemOf(await read()).expectedMinor,15000,'Observed comparison agrees with the ordinary cash report')
 assert.deepEqual(result.changedInputs,[])
 assert(result.months.every(month=>month.varianceMinor===0&&month.historicalVarianceMinor===0))
 assert(result.projects.every(p=>p.marginVarianceMinor===0&&p.costVarianceMinor===0&&p.feesVarianceMinor===0))
 const current=itemOf(await read())
 assert(current.staleAssumption,'The earlier approval requires renewal for the replacement source')
 await cmd('cash:approve',{...approve,...assumption,fingerprint:current.probabilityBasis.fingerprint})
 const renewed=await compare()
 assert.equal(sum(renewed.observed),3750)
 assert.equal(renewed.months.reduce((total,month)=>total+month.varianceMinor,0),-11250)
 assert(renewed.changedInputs.some(source=>source.kind==='cashAssumptions'&&source.id===assumption.id))
 assert.deepEqual(renewed.expected,result.expected,'Renewing the assumption never rewrites the approved prediction')
 console.log('PROBE RECOVER-003 A: built command door, 25% scheduled approval then equal-price staffing adoption -> before 3750, expected 15000, observed 15000 cents, zero variance and no changed inputs; explicit renewal -> observed 3750 and variance -11250 cents')
 } finally {await h.dispose()}
}
