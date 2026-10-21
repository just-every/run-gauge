import { type Row, type Value, need, sum } from './model'
import { projectFieldLabels,projectMatches,customMeasures } from './custom-report'
import { portfolioLabor } from './portfolio-labor'
import { retainerFees } from './retainer-fees'
import type { financeForecast } from './finance-forecast'

const groups=['firm','client','project','team','service','lead','person']
/** REPORT-001: whole-engagement cohorts; team/service cohorts can overlap and are never summed into the firm total. */
export function portfolio(data:Record<string,Row[]>,forecast:ReturnType<typeof financeForecast>,balances:Value[],from:string,to:string,options:Value={}) {
 const group:string=options.portfolioGroup||'project',custom=group.startsWith('custom:')?data.customFields.find(f=>f.id===group.slice(7)):undefined;need(groups.includes(group)||custom,'Choose an available portfolio grouping')
 const fees=retainerFees(data,forecast.asOf),filters=Object.fromEntries(['Client','Project','Team','Service','Lead','Person'].map(k=>[k.toLowerCase(),String(options['portfolio'+k]??'')]))
 const slice=(from:string,to:string)=>forecast.engagements.map(f=>{
  const project=data.engagements.find(e=>e.id===f.engagementId)!,id=project.id,end=to<forecast.asOf?to:forecast.asOf
  const mine=(kind:string)=>(data[kind]??[]).filter(r=>r.value.engagementId===id)
  const time=mine('time').filter(r=>r.value.status==='approved'&&r.value.workDate>=from&&r.value.workDate<=end)
  const expenses=mine('expenses').filter(r=>r.value.status==='approved'&&r.value.date>=from&&r.value.date<=end)
  const milestones=mine('milestones').filter(r=>r.value.status==='approved'&&r.value.due>=from&&r.value.due<=end)
  const budget=mine('budgets').filter(r=>r.value.status==='approved').sort((a,b)=>b.value.approvedAt-a.value.approvedAt)[0]
  const periodFees=fees.filter(fee=>fee.engagementId===id&&fee.activeStart<=end&&fee.activeEnd>=from)
  const costUnknown:string[]=[],feeUnknown:string[]=[],sources:Record<string,string[]>={engagements:[id],clients:[project.value.clientId],people:[],time:time.map(t=>t.id),expenses:expenses.map(t=>t.id),budgets:budget?[budget.id]:[],milestones:[],retainers:[],retainerPeriods:[]}
  let costMinor=sum(expenses.map(r=>r.value.amountMinor)),earnedMinor=sum(expenses.filter(r=>r.value.reimbursable).map(r=>r.value.amountMinor))
  for(const row of time){const x=row.value.economics??{};if(x.costMinor==null)costUnknown.push(`time:${row.id}: frozen cost unknown`);else if((x.costCurrency??x.currency)!==f.currency)costUnknown.push(`time:${row.id}: unconverted ${x.costCurrency??x.currency} cost`);else costMinor+=x.costMinor
   if((f.basis==='hourly'||f.basis==='mixed'&&x.mode==='hourly')&&row.value.billable){if(x.billMinor==null)feeUnknown.push(`time:${row.id}: frozen bill value unknown`);else earnedMinor+=x.billMinor}}
  if(f.basis==='fixed'||f.basis==='mixed'){earnedMinor+=sum(milestones.map(m=>m.value.amountMinor));sources.milestones=milestones.map(m=>m.id)}
  if(f.basis==='retainer'){
   for(const fee of periodFees){sources.retainers.push(fee.retainerId);sources.retainerPeriods.push(fee.periodId);const earned=fee.earnedBetween(from,to);if(earned===null)feeUnknown.push(`retainers:${fee.retainerId}: period fee not recorded`);else earnedMinor+=earned}
   for(const p of mine('retainerPeriods').filter(p=>p.value.periodEnd>=from&&p.value.periodEnd<=end)){
    const b=balances.find(b=>b.periodId===p.id),t=data.retainers.find(r=>r.id===p.value.retainerId)?.value.terms
    if(t?.rules.overage==='bill'){sources.retainerPeriods.push(p.id);if(b?.overageMinor==null)feeUnknown.push(`retainerPeriods:${p.id}: overage unknown`);else earnedMinor+=b.overageMinor}
   }
  }
  const involved=new Set([project.value.leadId,...(project.value.members??[]),...mine('staffing').map(r=>r.value.personId),...mine('time').map(r=>r.value.personId)])
  const people=data.people.filter(p=>involved.has(p.id));sources.people=people.map(p=>p.id)
  const teams=[...new Set(people.map(p=>String(p.value.team||'Unassigned')))].sort()
  const services=[...new Set([...mine('time'),...mine('staffing')].map(r=>String(r.value.service||'Unspecified')))].sort()
  const unknown=[...costUnknown,...feeUnknown]
  return {engagementId:id,name:project.value.name,peopleIds:people.map(p=>p.id),clientId:project.value.clientId,leadId:project.value.leadId,teams,services:services.length?services:['Unspecified'],currency:f.currency,basis:f.basis,budgetMinor:budget?.value.amountMinor??null,costMinor:costUnknown.length?null:costMinor,knownCostMinor:costMinor,earnedMinor:feeUnknown.length?null:earnedMinor,knownEarnedMinor:earnedMinor,marginMinor:unknown.length?null:earnedMinor-costMinor,knownMarginMinor:earnedMinor-costMinor,eacFeesMinor:f.complete?f.eacFeesMinor:null,eacCostMinor:f.complete?f.eacCostMinor:null,forecastMarginMinor:f.complete?f.marginMinor:null,forecastUnknown:f.incomplete,forecastSources:f.sources,sources,unknown}
 }).filter(p=>projectMatches(data,p.engagementId,options.customFilters??{})&&(!filters.client||p.clientId===filters.client)&&(!filters.project||p.engagementId===filters.project)&&(!filters.lead||p.leadId===filters.lead)&&(!filters.team||p.teams.includes(filters.team))&&(!filters.service||p.services.includes(filters.service))&&(!filters.person||p.peopleIds.includes(filters.person)))
 const dimensions=(p:ReturnType<typeof slice>[number])=>custom?projectFieldLabels(data,custom,p.engagementId).map(l=>l.id):group==='firm'?['Firm']:group==='project'?[p.name]:group==='client'?[data.clients.find(c=>c.id===p.clientId)?.value.name??'Unknown client']:group==='lead'?[data.people.find(c=>c.id===p.leadId)?.value.name??'Unassigned']:group==='team'?p.teams:group==='person'?p.peopleIds:p.services
 const groupRows=(projects:ReturnType<typeof slice>)=>{
  const rows=new Map<string,{key:string,label:string,subject:string,currency:string,projects:typeof projects}>()
  for(const p of projects)for(const label of dimensions(p)){
   // Client/project/lead group identity is the stable id; equal display names never merge unrelated records.
   const identity=group==='project'?p.engagementId:group==='client'?p.clientId:group==='lead'?p.leadId:label
   const customLabel=custom?projectFieldLabels(data,custom,p.engagementId).find(l=>l.id===label)?.name:null
   const subject=customLabel??(group==='person'?(data.people.find(r=>r.id===label)?.value.name??'Unassigned'):label),display=['team','service','person'].includes(group)?`Engagements involving ${subject}`:subject
   const key=JSON.stringify([group,identity,p.currency]),row=rows.get(key)??{key,label:display,subject,currency:p.currency,projects:[] as typeof projects};row.projects.push(p);rows.set(key,row)
  }
  return [...rows.values()].map(r=>{
   const total=(field:'budgetMinor'|'costMinor'|'earnedMinor'|'marginMinor'|'eacFeesMinor'|'eacCostMinor'|'forecastMarginMinor')=>r.projects.some(p=>p[field]===null)?null:sum(r.projects.map(p=>p[field]!))
   return {...r,customMeasures:customMeasures(data,r.projects.map(p=>p.engagementId),options.customMeasures??[]),projectIds:r.projects.map(p=>p.engagementId),budgetMinor:total('budgetMinor'),costMinor:total('costMinor'),earnedMinor:total('earnedMinor'),marginMinor:total('marginMinor'),knownCostMinor:sum(r.projects.map(p=>p.knownCostMinor)),knownEarnedMinor:sum(r.projects.map(p=>p.knownEarnedMinor)),knownMarginMinor:sum(r.projects.map(p=>p.knownMarginMinor)),eacFeesMinor:total('eacFeesMinor'),eacCostMinor:total('eacCostMinor'),forecastMarginMinor:total('forecastMarginMinor')}
  })
 }
 const projects=slice(from,to),rows=groupRows(projects),trends=[]
 const feesByCurrency=new Map<string,{currency:string;projects:typeof projects;knownMinor:number;minor:number|null}>()
 for(const p of projects.filter(p=>p.basis!=='hourly')){const bucket=feesByCurrency.get(p.currency)??{currency:p.currency,projects:[] as typeof projects,knownMinor:0,minor:0};bucket.projects.push(p);const passThrough=sum(p.sources.expenses.map(id=>data.expenses.find(r=>r.id===id)!).filter(r=>r.value.reimbursable).map(r=>r.value.amountMinor));const hourly=p.basis==='mixed'?sum(p.sources.time.map(id=>data.time.find(t=>t.id===id)!).filter(t=>t.value.billable&&t.value.economics?.mode==='hourly').map(t=>t.value.economics.billMinor??0)):0;bucket.knownMinor+=p.knownEarnedMinor-passThrough-hourly;if(p.earnedMinor===null)bucket.minor=null;feesByCurrency.set(p.currency,bucket)}
 const unattributedFees=[...feesByCurrency.values()].map(r=>({...r,minor:r.minor===null?null:r.knownMinor}))
 for(let cursor=from.slice(0,7)+'-01';cursor<=to;){
  const date=new Date(cursor+'T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);const next=date.toISOString().slice(0,10),last=new Date(Date.parse(next)-86400000).toISOString().slice(0,10)
  const monthFrom=cursor<from?from:cursor,monthTo=last>to?to:last
  trends.push({month:cursor.slice(0,7),from:monthFrom,to:monthTo,rows:groupRows(slice(monthFrom,monthTo))});cursor=next
 }
 return {customFilters:options.customFilters??{},customMeasureIds:options.customMeasures??[],customField:custom??null,from,to,asOf:forecast.asOf,group,filters,projects,rows,trends,unattributedFees,labor:portfolioLabor(data,projects,from,to<forecast.asOf?to:forecast.asOf)}
}
