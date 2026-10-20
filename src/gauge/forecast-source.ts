import {Buffer} from 'node:buffer'
import {canonicalJson, type TargetEffect} from '../modules/import-kit/src/d1/index'
import {date, integer, need, text, type Value} from './model'
import {forecastDates,forecastSeconds} from './forecast'

export interface ForecastContext {
 manifest:Value; people:Map<string,string>; projects:Map<string,string>
 id:(kind:string,source:string)=>string
 add:(file:string,index:number,kind:string,source:string,payload:Value,effects:TargetEffect[])=>void
}
export function forecastSource(ctx:ForecastContext, rows:Record<string,string>[], capture?:Value) {
 const {manifest:m,people,projects,id,add}=ctx,summary:Value[]=[]
 const person=(key:string)=>{const source=m.schedulePeople?.[key];need(!(people.has(source)&&m.schedulePlaceholders?.[key]),'A Forecast identity cannot be both a person and placeholder');need(people.has(source)||m.schedulePlaceholders?.[key],`Unresolved Forecast person ${key}`);return {personId:people.get(source)??null,placeholder:m.schedulePlaceholders?.[key]??null}}
 const project=(key:string)=>{const source=m.scheduleProjects?.[key];need(projects.has(source),`Unresolved Forecast project ${key}`);return projects.get(source)!}
 const seen=new Set<string>(),legacyRows=new Map<number,{raw:Value,effects:TargetEffect[]}>()
 const save=(file:string,index:number,key:string,raw:Value,entry:Value,effects:TargetEffect[])=>{
  need(!seen.has(key),'Duplicate Forecast source identity');seen.add(key)
  const source={namespace:`harvest:${m.namespace}`,externalId:key},name=`Forecast ${entry.view} ${entry.person} ${entry.from} – ${entry.to}`
  const bytes=Buffer.from(canonicalJson({...entry,source,raw}))
  const value={name,mediaType:'application/json',base64:bytes.toString('base64'),semantics:entry.resolution,forecast:entry,source}
  const all=[{targetKind:'archives',targetId:id('archives',`forecast:${key}`),value},...effects]
  if(file==='forecast.csv'&&!m.forecast){const row=legacyRows.get(index)??{raw,effects:[]};row.effects.push(...all);legacyRows.set(index,row)}else add(file,index,'forecast',key,raw,all)
  summary.push(entry)
 }
 const settings=m.forecast??{},view=settings.view??'project',orientation=settings.orientation??'columns',cols=settings.columns??{}
 need(['project','team'].includes(view)&&['rows','columns'].includes(orientation),'Choose Forecast project/team and rows/columns')
 rows.forEach((row,index)=>{
  const who=text(row[cols.person??'Person'],'Forecast person'),p=person(who)
  const engagementId=view==='project'?project(`${row[cols.client??'Client']}/${row[cols.project??'Project']}`):null
  const periods=orientation==='rows'?[[text(row[cols.period??'Period'],'Forecast period'),row[cols.hours??'Hours']]]:Object.keys(m.schedulePeriods??{}).map(k=>[k,row[k]])
  need(periods.length,'Map Forecast schedule periods')
  for(const [label,rawHours]of periods){
   if(rawHours===undefined||rawHours==='')continue
   const period=m.schedulePeriods?.[label];need(period,'Map every Forecast period')
   const from=date(period.from),to=date(period.to);need(to>=from&&Date.parse(to)-Date.parse(from)<366*86400000,'Forecast period must span at most one year')
   const totalSeconds=forecastSeconds(rawHours),commitment=(cols.commitment?row[cols.commitment]:settings.commitment)??'tentative'
   need(['tentative','committed'].includes(commitment),'Declare Forecast commitment')
   if(period.workingDays!==undefined)integer(period.workingDays,'Forecast working-day count',1,366)
   const days=period.workingDates===undefined?[]:forecastDates(period,totalSeconds)
   const detail=cols.id?text(row[cols.id],'Forecast row id'):[who,engagementId??'team',row[cols.task??'Task']??''].join(':')
   const key=`csv:${view}:${detail}:${label}`,effects:TargetEffect[]=[]
   if(engagementId&&p.personId)for(const {day,dailySeconds}of days)effects.push({targetKind:'staffing',targetId:id('staffing',m.forecast?`${key}:${day}`:`${index}:${label}:${day}`),value:{personId:p.personId,engagementId,from:day,to:day,dailySeconds,commitment,source:{namespace:`harvest:${m.namespace}`,externalId:m.forecast?key:`${index}:${label}`,periodTotalSeconds:totalSeconds,granularity:'reviewed distribution; not original daily facts'}}})
   save('forecast.csv',index,key,row,{view,person:who,...p,engagementId,project:view==='project'?`${row[cols.client??'Client']} / ${row[cols.project??'Project']}`:null,period:label,from,to,workingDays:period.workingDays??null,workingDates:period.workingDates??null,totalSeconds,commitment,resolution:effects.length?'Reviewed distribution; not original daily facts':'Aggregate only; excluded from daily staffing'},effects)
  }
 })
 for(const [index,row]of legacyRows)add('forecast.csv',index,'staffing',String(index),row.raw,row.effects)
 if(capture)apiCapture(ctx,capture,save)
 return summary
}

function apiCapture(ctx:ForecastContext,capture:Value,save:(file:string,index:number,key:string,raw:Value,entry:Value,effects:TargetEffect[])=>void) {
 const {manifest:m,people,projects,id}=ctx,cfg=m.forecastApi
 need(cfg?.authorized===true,'Confirm authorization for the supplied Forecast API capture')
 need(['seconds','decimal-hours'].includes(cfg.durationUnit),'Declare captured API duration units')
 const fields=cfg.fields??{},read=(row:Value,kind:string,key:string)=>row[fields[kind]?.[key]??key]
 const arrays:Record<string,Value[]>={}
 for(const kind of ['people','projects','assignments','availability']){const rows=capture[cfg.arrays?.[kind]??kind];need(Array.isArray(rows),`Supply captured Forecast ${kind}`);arrays[kind]=rows;const ids=rows.map(r=>text(String(read(r,kind,'id')??''),`Captured ${kind} id`));need(new Set(ids).size===ids.length,`Duplicate captured ${kind} id`)}
 need(Object.values(arrays).reduce((n,rows)=>n+rows.length,0)<=1000,'Captured Forecast arrays exceed 1000 source rows')
 const personIds=new Set(arrays.people.map(r=>String(read(r,'people','id')))),projectIds=new Set(arrays.projects.map(r=>String(read(r,'projects','id'))))
 const who=(raw:Value,kind:string)=>{const key=String(read(raw,kind,'personId'));need(personIds.has(key),'Assignment/availability person missing from capture');const personId=people.get(m.schedulePeople?.[key]),placeholder=m.schedulePlaceholders?.[key]??null;need(!(personId&&placeholder),'A Forecast identity cannot be both a person and placeholder');need(personId||placeholder,'Map captured person or placeholder');return {key,personId:personId??null,placeholder}}
 arrays.availability.forEach((raw,index)=>{
  const p=who(raw,'availability');need(p.personId&&!p.placeholder,'Placeholders cannot carry availability or leave')
  const from=date(read(raw,'availability','from')),to=date(read(raw,'availability','to'));need(to>=from,'Availability ends before it starts')
  const dailySeconds=forecastSeconds(read(raw,'availability','dailySeconds'),cfg.durationUnit,86400),weekdays=text(read(raw,'availability','weekdays'),'Captured working weekdays')
  need(/^[0-6](,[0-6])*$/.test(weekdays),'Map captured working weekdays explicitly')
  const holidays=read(raw,'availability','holidays');need(Array.isArray(holidays),'Supply captured holidays (empty if none)');holidays.forEach((value:unknown)=>{const day=date(value);need(day>=from&&day<=to,'Holiday outside captured availability')})
  const sourceId=String(read(raw,'availability','id')),key=`api:availability:${sourceId}`
  save('forecast.json',index,key,raw,{view:'availability',person:String(read(arrays.people.find(r=>String(read(r,'people','id'))===p.key)!,'people','name')??p.key),...p,from,to,dailySeconds,weekdays,holidays,resolution:'Captured availability'},[{targetKind:'calendars',targetId:id('calendars',key),value:{personId:p.personId,from,to,dailySeconds,weekdays,holidays,timezone:m.timezone,source:{namespace:`harvest:${m.namespace}`,externalId:key}}}])
 })
 arrays.assignments.forEach((raw,index)=>{
  const p=who(raw,'assignments'),sourceId=String(read(raw,'assignments','id')),sourceProject=String(read(raw,'assignments','projectId'));need(projectIds.has(sourceProject),'Assignment project missing from capture')
  const leave=(cfg.leaveProjectIds??[]).includes(sourceProject),engagementId=leave?null:projects.get(m.scheduleProjects?.[sourceProject]);need(leave||engagementId,'Map captured project')
  need(!leave||!p.placeholder,'Placeholders cannot carry leave');if(p.placeholder)need(read(raw,'assignments','commitment')==='tentative','Placeholder demand must be tentative')
  const from=date(read(raw,'assignments','from')),to=date(read(raw,'assignments','to'));need(to>=from,'Assignment ends before it starts')
  const totalSeconds=forecastSeconds(read(raw,'assignments','totalSeconds'),cfg.durationUnit),commitment=read(raw,'assignments','commitment');need(['committed','tentative'].includes(commitment),'Map captured commitment explicitly')
  const supplied=cfg.allocations?.[sourceId],days:Value[]=supplied??(from===to?[{date:from,seconds:totalSeconds}]:[])
  need(Array.isArray(days),'Supply exact captured date allocations')
  const dates=new Set<string>();let resolved=0;const effects:TargetEffect[]=[],key=`api:assignment:${sourceId}`
  for(const item of days){const day=date(item.date),dailySeconds=integer(item.seconds,'Captured date seconds',0,86400);need(day>=from&&day<=to&&!dates.has(day),'Captured dates must be unique and inside the assignment');dates.add(day);resolved+=dailySeconds
   if(p.personId)effects.push({targetKind:leave?'leave':'staffing',targetId:id(leave?'leave':'staffing',`${key}:${day}`),value:{personId:p.personId,...(leave?{note:'Imported time off'}:{engagementId:engagementId!,commitment}),from:day,to:day,dailySeconds,source:{namespace:`harvest:${m.namespace}`,externalId:key,periodTotalSeconds:totalSeconds,granularity:'captured date allocations'}}})
  }
  need(!days.length||resolved===totalSeconds,'Captured daily allocations do not reconcile to assignment total')
  save('forecast.json',index,key,raw,{view:leave?'leave':'assignment',person:String(read(arrays.people.find(r=>String(read(r,'people','id'))===p.key)!,'people','name')??p.key),...p,engagementId:engagementId??null,project:String(read(arrays.projects.find(r=>String(read(r,'projects','id'))===sourceProject)!,'projects','name')??sourceProject),from,to,totalSeconds,commitment,workingDates:[...dates],resolution:effects.length?'Captured date allocations':'Aggregate only; excluded from daily staffing'},effects)
 })
}
