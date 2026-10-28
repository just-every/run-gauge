// All history enters through production HTTP commands. Expected economics below
// are fixture arithmetic, independent of Gauge's scoring implementation.
export async function seedLearningProjects(h) {
 const timezone='Australia/Brisbane',currency=(await h.state()).agency.currency
 const person=await h.cmd('save:people',{name:'Learning designer',timezone,role:'Designer'})
 await h.cmd('save:calendars',{personId:person.id,from:'2026-10-01',to:'2026-10-31',dailySeconds:28800,weekdays:'0,1,2,3,4,5,6',timezone})
 await h.cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:5000,billMinor:20000})
 const usual=await h.cmd('save:clients',{name:'Learning usual client'})
 const atypical=await h.cmd('save:clients',{name:'Learning atypical client'})
 const estimatedHours=[1.5,2,3,4,4.5,3,1],actualHours=[2,3,4,5,6,4,6],projects=[]
 for(let i=0;i<estimatedHours.length;i++){
  const date=`2026-10-${String(5+i).padStart(2,'0')}`,client=i===6?atypical:usual
  const opportunity=await h.cmd('save:opportunities',{name:`Learning opportunity ${i+1}`,clientId:client.id,ownerId:person.id,stage:'proposal',probability:75,from:date,to:date,services:'Design',amountMinor:estimatedHours[i]*20000,demandSeconds:estimatedHours[i]*3600})
  const estimate=await h.cmd('estimate:save',{opportunityId:opportunity.id,name:`Learning project ${i+1}`,phases:[{key:'design',name:'Design',service:'Design',mode:'fixed',from:date,to:date}],lines:[{key:'design-work',name:'Design work',kind:'labor',phaseKey:'design',role:'Designer',personId:person.id,effortSeconds:estimatedHours[i]*3600,billRateMinor:20000,costRateMinor:5000,costReference:'Recorded original design cost assumption'}],reason:'Original accepted project forecast'})
  await h.cmd('estimate:approve',{...estimate,attest:'owner-recorded-external-acceptance',acceptorName:'Casey Client',acceptorContact:'Recorded client contact',acceptanceDate:date,channel:'signed document',evidenceRef:`Learning acceptance ${i+1}`,reason:'Owner records external acceptance of original estimate'})
  const engagement=await h.cmd('estimate:convert',estimate),data=(await h.state()).data
  for(const budget of data.budgets.filter(r=>r.value.engagementId===engagement.id))await h.cmd('budget:approve',{id:budget.id,revision:budget.revision})
  for(const milestone of data.milestones.filter(r=>r.value.engagementId===engagement.id))await h.cmd('milestone:approve',{id:milestone.id,revision:milestone.revision})
  const task=data.tasks.find(r=>r.value.engagementId===engagement.id)
  await h.cmd('task:progress',{id:task.id,revision:task.revision,status:'done',remainingSeconds:0})
  const time=await h.cmd('time:save',{personId:person.id,engagementId:engagement.id,taskId:task.id,service:'Design',timezone,notes:'Completed design work actual',billable:true,start:`${date}T09:00:00+10:00`,end:`${date}T${String(9+actualHours[i]).padStart(2,'0')}:00:00+10:00`})
  await h.cmd('time:approve',await h.cmd('time:submit',time))
  projects.push({engagement,estimate,taskId:task.id,date,estimatedSeconds:estimatedHours[i]*3600,actualSeconds:actualHours[i]*3600,feesMinor:estimatedHours[i]*20000,estimatedCostMinor:estimatedHours[i]*5000,actualCostMinor:actualHours[i]*5000})
 }
 const input={name:'Design completed-project comparison',reason:'Compare the same completed design work and exclude an atypical client',completedThrough:'2026-10-16',candidate:{role:'Designer',basisPoints:12000},selections:projects.map(p=>({engagementId:p.engagement.id,engagementRevision:p.engagement.revision,estimateId:p.estimate.id,estimateRevision:p.estimate.revision})),excludedClients:[{id:atypical.id,revision:atypical.revision,reason:'Atypical one-off client scope'}]}
 const expected=basisPoints=>{
  const samples=projects.slice(0,6),mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length
  const score=multiplier=>({effortMape:mean(samples.map(p=>Math.abs(Math.round(p.estimatedSeconds*multiplier)-p.actualSeconds)/p.actualSeconds*100)),marginError:currency==='USD'?mean(samples.map(p=>Math.abs(p.actualCostMinor-Math.round(Math.round(p.estimatedSeconds*multiplier)/3600*5000))/p.feesMinor*100)):null,paymentTimingError:null})
  const baseline=score(1),candidateScore=score(basisPoints/10000)
  return {baseline,candidateScore,difference:Object.fromEntries(Object.keys(baseline).map(k=>[k,baseline[k]===null?null:candidateScore[k]-baseline[k]]))}
 }
 return {input,expected,projects,person,usual,atypical}
}
