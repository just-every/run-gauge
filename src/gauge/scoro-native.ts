import { type Value, need } from './model'
/** Explicitly reviewed drafts use the same source fences as Harvest. No grants,
 * terms, native approvals, invoices or settlements are imported. */
export function moveInDrafts(p:ReturnType<typeof import('./scoro-common').moveInPackage>,m:Value){
 if(m.nativeDrafts!==true)return
 const rows=p.records,id=p.id,namespace=p.namespace,source=(kind:string,v:Value)=>({namespace,externalId:v.id,sourceKind:kind}),add=(kind:string,v:Value,targetKind:string,value:Value)=>p.effects.get(kind+':'+v.id)!.push({targetKind,targetId:id(targetKind,v.id),value})
 for(const v of rows.clients??[])add('clients',v,'clients',{name:v.name,source:source('clients',v)})
 for(const v of rows.people??[])add('people',v,'people',{name:v.name,timezone:p.timezone,contractor:false,source:source('people',v)})
 for(const v of rows.projects??[]){const lead=m.projectLeads?.[v.id],members=m.projectMembers?.[v.id];need(rows.people.some(person=>person.id===lead),'Review a captured responsible lead for every native project');need(Array.isArray(members)&&new Set(members).size===members.length&&members.every(member=>rows.people.some(person=>person.id===member)),'Review every native project membership explicitly');add('projects',v,'engagements',{name:v.name,clientId:id('clients',v.clientId),leadId:id('people',lead),members:members.map(member=>id('people',member)),scope:v.scope??'Imported source work requires fresh review',currency:p.currency,timezone:p.timezone,source:{...source('projects',v),archived:v.archived??false}})}
 for(const v of rows.tasks??[])add('tasks',v,'tasks',{name:v.name,engagementId:id('engagements',v.projectId),remainingSeconds:0,source:source('tasks',v)})
 for(const v of rows.rates??[])add('rates',v,'rates',{personId:id('people',v.personId),...(v.projectId?{engagementId:id('engagements',v.projectId)}:{}),service:v.service??'*',effective:v.effective,costMinor:v.costRateMinor,billMinor:v.billRateMinor,currency:p.currency,source:source('rates',v)})
 for(const v of rows.time??[])add('time',v,'time',{engagementId:id('engagements',v.projectId),personId:id('people',v.personId),taskId:v.taskId?id('tasks',v.taskId):null,service:rows.tasks?.find(t=>t.id===v.taskId)?.name??v.service??'Imported work',notes:v.notes??'',billable:v.billableSeconds>0,start:null,end:null,durationSeconds:v.rawSeconds,workDate:v.workDate,timezone:p.timezone,status:'draft',currency:p.currency,source:{...source('time',v),billed:v.billed,billingSeconds:v.billableSeconds,billMinor:v.billMinor,costMinor:v.costMinor,sourceEvidence:v}})
}
