import type { Bindings } from '../auth.server'
import { type Row,type Value,type Kind,integer,money,need,text,sum } from './model'
import { type Actor,type Transaction,all,access,finance } from './store'
import { explain,activeRates,billPricing } from './rate-cards'
import { latestBudget } from './budget-caps'

export function normalizePhases(input:unknown,budget:Value):Value[]{
 if(input==null)return []
 need(Array.isArray(input)&&input.length<=30,'Use at most 30 phases')
 const phases=input.map(p=>{need(p&&typeof p==='object','Each phase must be an object');need(['hourly','fixed'].includes(p.mode),'Choose each phase billing basis');return {key:text(p.key,'Phase key',100),name:text(p.name,'Phase name',200),service:text(p.service,'Phase service',200),mode:p.mode,hourBudgetSeconds:integer(p.hourBudgetSeconds,'Phase hour budget'),feeBudgetMinor:money(p.feeBudgetMinor),expenseBudgetMinor:money(p.expenseBudgetMinor??0),marginBasisPoints:integer(p.marginBasisPoints??0,'Phase margin target basis points',0,10000)}})
 need(new Set(phases.map(p=>p.key)).size===phases.length,'Phase keys must be unique')
 if(phases.length){need(sum(phases.map(p=>p.feeBudgetMinor))===budget.amountMinor,'Phase fees must equal the engagement budget');need(sum(phases.map(p=>p.hourBudgetSeconds))===budget.effortSeconds,'Phase hours must equal the engagement effort');need(sum(phases.map(p=>p.expenseBudgetMinor))===(budget.expenseBudgetMinor??0),'Phase expenses must equal the engagement expense budget')}
 return phases
}
export async function phaseFor(env:Bindings,tx:Transaction,engagementId:string,key:unknown,kind?:string,service?:string){
 const budgets=await all(env,'budgets'),budget=latestBudget(budgets,engagementId),phases:Value[]=budget?.value.phases??[]
 for(const b of budgets)tx.observe('budgets',b);tx.guard('(SELECT COUNT(*) FROM g_budgets)=?',budgets.length)
 if(!phases.length){need(!key,'Approve phase budgets before assigning work to them');return null}
 const eligible=kind?phases.filter(p=>p.mode===kind):phases,matching=service?eligible.filter(p=>p.service.toLowerCase()===service.toLowerCase()):eligible,phase=eligible.find(p=>p.key===key)??(!key&&matching.length===1?matching[0]:undefined)
 need(phase,'Choose a phase in the approved engagement budget');return phase
}

/** A report projection, never stored replacement records. Global pricing inputs
 * remain available to the forecast so overtime across phases is priced once. */
export function phaseViews(data:Record<string,Row[]>){
 return (data.engagements??[]).flatMap(e=>{
  const budget=latestBudget(data.budgets??[],e.id),phases:Value[]=budget?.value.phases??[]
  return phases.map(phase=>{
   const sourcePhase=(kind:string,id:string)=>data[kind]?.find(r=>r.id===id)?.value.phaseKey
   const linePhase=(line:Value)=>line.phaseKey??sourcePhase(line.kind,line.sourceId)
   const view={...data}
   view.budgets=(data.budgets??[]).filter(b=>b.value.engagementId!==e.id).concat([{...budget!,value:{...budget!.value,phases:[],mode:phase.mode,amountMinor:phase.feeBudgetMinor,effortSeconds:phase.hourBudgetSeconds,expenseBudgetMinor:phase.expenseBudgetMinor}}])
   for(const kind of ['time','expenses','tasks','milestones','staffing','fixedCharges'])view[kind]=(data[kind]??[]).filter(r=>r.value.engagementId!==e.id||r.value.phaseKey===phase.key)
   for(const kind of ['packets','invoices'])view[kind]=(data[kind]??[]).flatMap(r=>{if(r.value.engagementId!==e.id)return [r];const lines=r.value.lines.filter((l:Value)=>linePhase(l)===phase.key);return lines.length?[{...r,value:{...r.value,lines,totalMinor:sum(lines.map((l:Value)=>l.amountMinor))}}]:[]})
   const invoiceIds=new Set(view.invoices.filter(i=>i.value.engagementId===e.id).map(i=>i.id))
   view.invoiceCorrections=(data.invoiceCorrections??[]).flatMap(c=>{if(c.value.engagementId!==e.id)return [c];if(!invoiceIds.has(c.value.invoiceId))return [];if(c.value.type==='void')return [c];const invoice=data.invoices.find(i=>i.id===c.value.invoiceId)!,lines=c.value.lines.filter((l:Value)=>linePhase(invoice.value.lines[l.index])===phase.key);return lines.length?[{...c,value:{...c.value,lines,amountMinor:sum(lines.map((l:Value)=>l.amountMinor))}}]:[]})
   view.payments=(data.payments??[]).flatMap(payment=>{
    if(payment.value.engagementId!==e.id)return [payment]
    const invoice=data.invoices.find(i=>i.id===payment.value.invoiceId);if(!invoice)return []
    const weights=phases.map(p=>sum(invoice.value.lines.filter((l:Value)=>linePhase(l)===p.key).map((l:Value)=>l.amountMinor))),i=phases.indexOf(phase),before=sum(weights.slice(0,i)),through=before+weights[i]
    const share=(n:number)=>Number((BigInt(payment.value.amountMinor)*BigInt(n)*2n+BigInt(invoice.value.totalMinor))/(2n*BigInt(invoice.value.totalMinor)))
    const minor=share(through)-share(before);return minor?[{...payment,value:{...payment.value,amountMinor:minor,allocationBasis:'Proportion of immutable invoice phase amounts; cumulative half-up cents'}}]:[]
   })
   return {engagementId:e.id,phase,budget:budget!,data:view}
  })
 })
}
export async function phaseCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(action==='budget:thresholds'){
  need(a.role==='owner','Only the owner sets alert thresholds',403)
  const e=await access(env,a,text(input.engagementId,'Engagement')),key=input.phaseKey?text(input.phaseKey,'Phase key'):''
  if(key)await phaseFor(env,tx,e.id,key)
  const policies=await all(env,'budgetAlertPolicies'),old=policies.find(p=>p.value.engagementId===e.id&&p.value.phaseKey===key)
  need(!old||old.id===input.id&&old.revision===input.revision,'Alert policy changed; reload',409)
  const thresholds=(Array.isArray(input.thresholds)?input.thresholds:String(input.thresholds??'').split(',')).map((n:unknown)=>integer(n,'Threshold percent',1,1000))
  need(thresholds.some(n=>n<100),'Keep at least one alert threshold below the cap')
  need(thresholds.length>0&&thresholds.length<=10&&new Set(thresholds).size===thresholds.length,'Choose one to ten unique thresholds')
  tx.guard('(SELECT COUNT(*) FROM g_budgetAlertPolicies)=?',policies.length)
  return tx.record('budgetAlertPolicies',{engagementId:e.id,phaseKey:key,thresholds:thresholds.sort((a,b)=>a-b),reason:text(input.reason,'Threshold reason'),setBy:a.session.operator.id,setAt:Date.now()},old)
 }
 if(action!=='budget:transfer')return null
 const e=await access(env,a,text(input.engagementId,'Engagement'),true),budgets=await all(env,'budgets'),budget=latestBudget(budgets,e.id)
 need(budget&&budget.id===input.id&&budget.revision===input.revision,'Review the latest approved budget',409)
 const phases=structuredClone(budget.value.phases??[]),from=phases.find((p:Value)=>p.key===input.fromPhase),to=phases.find((p:Value)=>p.key===input.toPhase)
 need(from&&to&&from!==to,'Choose two distinct phases');need(['hourBudgetSeconds','feeBudgetMinor','expenseBudgetMinor'].includes(input.metric),'Choose hours, fee or expenses')
 const amount=integer(input.amount,'Transfer quantity',1,from[input.metric]);from[input.metric]-=amount;to[input.metric]+=amount
 for(const row of budgets)tx.observe('budgets',row);tx.guard('(SELECT COUNT(*) FROM g_budgets)=?',budgets.length)
 return tx.record('budgets',{...budget.value,phases,status:'draft',createdAt:Date.now(),reason:text(input.reason,'Transfer reason'),transfer:{from:input.fromPhase,to:input.toPhase,metric:input.metric,amount,fromBudgetId:budget.id,fromBudgetRevision:budget.revision},approvedAt:null,approvedBy:null})
}
export async function observeBudgetAlerts(env:Bindings,tx:Transaction,action:string){
 if(!/^(time:|timer:|expense:|milestone:|budget:|save:budgets)/.test(action))return null
 const kinds:Kind[]=['engagements','budgets','time','expenses','milestones','budgetAlertPolicies','budgetAlerts','rates','rateWithdrawals','people']
 const data=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<string,Row[]>
 for(const kind of kinds){for(const row of data[kind])tx.observe(kind,row);tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`,data[kind].length)}
 return data
}
export async function recordBudgetAlerts(tx:Transaction,data:Record<string,Row[]>|null,action:string,result:Value){
 if(!data||!result.value)return
 const kind=action.startsWith('time:')||action.startsWith('timer:')?'time':action.startsWith('expense:')?'expenses':action==='budget:thresholds'?'budgetAlertPolicies':action.startsWith('milestone:')?'milestones':'budgets'
 data[kind]=data[kind].filter(r=>r.id!==result.id).concat([result as Row])
 for(const e of data.engagements){
  const budget=latestBudget(data.budgets,e.id);if(!budget)continue
  const groups=[{key:'',hourBudgetSeconds:budget.value.effortSeconds,feeBudgetMinor:budget.value.amountMinor,expenseBudgetMinor:budget.value.expenseBudgetMinor??0,mode:budget.value.mode},...(budget.value.phases??[])]
  const provisionalBill=(t:Row)=>{if(t.value.economics?.billMinor!=null)return t.value.economics.billMinor;const person=data.people.find(p=>p.id===t.value.personId),card=person?explain(activeRates(data.rates,data.rateWithdrawals),person,e,t.value.service,t.value.workDate).bill?.chosen:undefined,override=t.value.rateOverride,rate=override?.billRateMinor??card?.value.billMinor;if(rate==null)return 0;const rounded=Math.ceil(t.value.durationSeconds/budget.value.roundingSeconds)*budget.value.roundingSeconds,before=sum(data.time.filter(r=>r.id!==t.id&&r.value.status==='approved'&&r.value.personId===t.value.personId&&r.value.workDate===t.value.workDate).map(r=>r.value.durationSeconds)),overtime=!override&&card?.value.overtimeAfterSeconds!=null?Math.min(rounded,Math.max(0,before+t.value.durationSeconds-card.value.overtimeAfterSeconds)):0;return billPricing(rounded,rate,overtime,!override?card?.value.overtimeBps:undefined,override?.writeDownBps??card?.value.writeDownBps??0).billMinor}
  for(const phase of groups){
   const included=(r:Row)=>r.value.engagementId===e.id&&(!phase.key||r.value.phaseKey===phase.key),time=data.time.filter(r=>included(r)&&['submitted','approved'].includes(r.value.status)),expenses=data.expenses.filter(r=>included(r)&&['submitted','approved'].includes(r.value.status))
   const phaseFee=()=>{if(phase.key||!budget.value.phases?.length)return phase.mode==='fixed'?sum(data.milestones.filter(m=>included(m)&&m.value.status==='approved').map(m=>m.value.amountMinor)):sum(time.filter(t=>t.value.billable).map(provisionalBill));return sum(budget.value.phases.map((p:Value)=>p.mode==='fixed'?sum(data.milestones.filter(m=>m.value.engagementId===e.id&&m.value.phaseKey===p.key&&m.value.status==='approved').map(m=>m.value.amountMinor)):sum(time.filter(t=>t.value.phaseKey===p.key&&t.value.billable).map(provisionalBill))))};const actuals={hours:sum(time.map(t=>t.value.durationSeconds??0)),fee:phaseFee(),expenses:sum(expenses.map(x=>x.value.amountMinor))},limits={hours:phase.hourBudgetSeconds,fee:phase.feeBudgetMinor,expenses:phase.expenseBudgetMinor}
   const thresholds=[...new Set<number>([...(data.budgetAlertPolicies.find(p=>p.value.engagementId===e.id&&p.value.phaseKey===phase.key)?.value.thresholds??[75,90]),100])]
   for(const metric of ['hours','fee','expenses'] as const)for(const threshold of thresholds){
    if(!limits[metric]||(threshold===100?actuals[metric]<=limits[metric]:BigInt(actuals[metric])*100n<BigInt(limits[metric])*BigInt(threshold))||data.budgetAlerts.some(a=>a.value.engagementId===e.id&&a.value.phaseKey===phase.key&&a.value.metric===metric&&a.value.threshold===threshold))continue
    const alert=await tx.record('budgetAlerts',{engagementId:e.id,phaseKey:phase.key,metric,threshold,actual:actuals[metric],budget:limits[metric],budgetId:budget.id,budgetRevision:budget.revision,leadId:e.value.leadId,recipients:['engagement lead','finance'],sourceRevisions:[...time,...expenses].map(r=>({id:r.id,revision:r.revision})),raisedAt:Date.now()})
    data.budgetAlerts.push(alert)
   }
  }
 }
}
