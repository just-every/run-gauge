import { Buffer } from 'node:buffer'
import { canonicalJson, sha256, type SourceBundle, type SourceRecord, type TargetEffect } from '../modules/import-kit/src/d1/index'
import { need, text, date, zone, type Value, charge } from './model'
import { harvestWorkbook } from './harvest-workbook'
import { forecastSource } from './forecast-source'
import { harvestSeconds, harvestTimeEvidence, addHarvestTimeControl, type HarvestTimeControl } from './harvest-time'
import { normalizeHarvestRates, harvestRateAt } from './harvest-rates'
export function parseCsv(source: string): Record<string,string>[] {
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}
 need(!quoted,'Unclosed CSV quote');if(cell||row.length){row.push(cell);rows.push(row)}
 const header=rows.shift();need(header?.length,'CSV needs headers');header[0]=header[0].replace(/^\uFEFF/,'');need(new Set(header).size===header.length,'Duplicate CSV column')
 return rows.map((r,i)=>{need(r.length===header.length,`CSV row ${i+2} has the wrong column count`);return Object.fromEntries(header.map((h,j)=>[h,r[j]]))})
}
export interface HarvestInput { manifest: Value; files: Record<string,string>; workbook?: {base64:string}; archives?: {name:string;mediaType:string;base64:string}[] }
export function harvest(input:HarvestInput,expectedCurrency:string) {
 const m=input.manifest;need(m && typeof m==='object','Manifest required');need(typeof m.currency==='string'&&/^[A-Z]{3}$/.test(m.currency),'Declare the Harvest package currency as a three-letter ISO currency code');const currency=m.currency
 need(currency===expectedCurrency,`Harvest package uses ${currency}; agency uses ${expectedCurrency}. No currency conversion is performed.`)
 need(m.units==='decimal-hours'&&m.coverage==='all-time','Declare decimal-hours and all-time coverage');zone(m.timezone);text(m.namespace,'Stable source account namespace')
 const bundle:SourceBundle={records:[],artifacts:[],diagnostics:[]},effects=new Map<string,TargetEffect[]>(),totals:Record<string,{count:number;seconds:number;amountMinor:number}>={}
 const timeControls: Record<string, HarvestTimeControl> = {}, historicalRates = new Map<string, ReturnType<typeof normalizeHarvestRates>>()
 const namespace=`harvest:${m.namespace}`,id=(k:string,s:string)=>`hv_${sha256(`${namespace}:${k}:${s}`).slice(0,32)}`
 const records:Record<string,Record<string,string>[]>={}
 need(!input.workbook || !Object.hasOwn(input.files,'time.csv'),'Supply time.csv or time.xlsx, never both')
 const workbook=input.workbook?harvestWorkbook(input.workbook.base64,m.timeWorksheet):undefined
 const timeFile=workbook?'time.xlsx':'time.csv'
 if(workbook){records['time.csv']=workbook.records.map(r=>r.value);bundle.artifacts.push({name:timeFile,sha256:sha256(workbook.bytes),size:workbook.bytes.length,original:{status:'available',base64:input.workbook!.base64}})}
 for(const name of ['clients.csv','people.csv','projects.csv',...(workbook?[]:['time.csv'])]){need(typeof input.files[name]==='string',`Supply ${name}`);records[name]=parseCsv(input.files[name])}
 for(const [name,content]of Object.entries(input.files)){need(['clients.csv','people.csv','projects.csv','time.csv','forecast.csv','forecast.json'].includes(name),'Unsupported source file; review omissions explicitly');const bytes=Buffer.from(content);need(bytes.length<=2*1024*1024,'Each source file is limited to 2 MiB');bundle.artifacts.push({name,sha256:sha256(bytes),size:bytes.length,original:{status:'available',base64:bytes.toString('base64')}})}
 need(Object.values(records).reduce((n,r)=>n+r.length,0)<=1000,'This pilot importer accepts at most 1000 rows per reviewed package; split at complete engagement boundaries')
 const columns=(file:string)=>m.columns?.[file]??{}
 const field=(r:Record<string,string>,file:string,key:string,def:string)=>text(r[columns(file)[key]??def],`${file}: ${key}`)
 const add=(file:string,index:number,k:string,s:string,payload:Value,ef:TargetEffect[])=>{const artifact=bundle.artifacts.find(f=>f.name===file)!;const record:SourceRecord={namespace,kind:k,sourceId:s,payload,payloadHash:sha256(canonicalJson(payload)),artifactHash:artifact.sha256,location:{artifact:file,row:workbook&&file===timeFile?workbook.records[index].row:index+2,...(workbook&&file===timeFile?{pointer:workbook.worksheet}:{})}};bundle.records.push(record);effects.set(`${k}:${s}`,ef)}
 const clients=new Map<string,string>(),people=new Map<string,string>(),projects=new Map<string,string>(),clientNames=new Map<string,string>(),tasks=new Set<string>()
 records['clients.csv'].forEach((r,i)=>{const s=field(r,'clients','id','Client ID'),name=field(r,'clients','name','Client');need(!clients.has(s),'Duplicate client id');clients.set(s,id('clients',s));clientNames.set(s,name);add('clients.csv',i,'clients',s,r,[{targetKind:'clients',targetId:id('clients',s),value:{name,source:{namespace,externalId:s}}}])})
 records['people.csv'].forEach((r,i)=>{const s=field(r,'people','id','Person ID'),name=field(r,'people','name','Name');need(!people.has(s),'Duplicate person id');people.set(s,id('people',s));const rates=normalizeHarvestRates(m.rates?.[s]);historicalRates.set(s,rates);add('people.csv',i,'people',s,r,[{targetKind:'people',targetId:id('people',s),value:{name,timezone:m.timezone,contractor:r.Contractor==='Yes',source:{namespace,externalId:s}}}])})
 records['projects.csv'].forEach((r,i)=>{const s=field(r,'projects','id','Project ID'),client=field(r,'projects','clientId','Client ID'),lead=String(m.projectLeads?.[s]??'');need(clients.has(client)&&people.has(lead),`Resolve client and responsible lead for project ${s}`);need(!projects.has(s),'Duplicate project id');projects.set(s,id('engagements',s));add('projects.csv',i,'engagements',s,r,[{targetKind:'engagements',targetId:id('engagements',s),value:{name:field(r,'projects','name','Project'),clientId:clients.get(client)!,leadId:people.get(lead)!,members:(m.projectMembers?.[s]??[]).map((person:string)=>{need(people.has(person),'Resolve every project member');return people.get(person)!}),scope:r.Notes||'Imported scope requires review',currency,timezone:m.timezone,source:{namespace,externalId:s}}}])})
 // Dates and durations are retained; Harvest's date-only export does not assert clock instants.
 records['time.csv'].forEach((r,i)=>{
  const s=field(r,'time','id','Time Entry ID'),person=field(r,'time','personId','Person ID'),project=field(r,'time','projectId','Project ID'),day=date(field(r,'time','date','Date')),duration=harvestSeconds(field(r,'time','hours','Hours')),task=field(r,'time','task','Task')
  need(people.has(person)&&projects.has(project),`Unresolved time identity ${s}`);need(duration>0,'Actual duration must be positive');const rate=harvestRateAt(historicalRates.get(person)!,day,s)
  const taskKey=`${project}:${task}`,taskId=id('tasks',taskKey),ef:TargetEffect[]=[]
  if(!tasks.has(taskKey)){tasks.add(taskKey);ef.push({targetKind:'tasks',targetId:taskId,value:{engagementId:projects.get(project)!,name:task,remainingSeconds:0,source:{namespace,externalId:taskKey}}})}
  const billed=field(r,'time','billed','Invoiced?');need(['Yes','No'].includes(billed),'Resolve source invoiced status explicitly')
  const billable=field(r,'time','billable','Billable?');need(['Yes','No'].includes(billable),'Resolve source billable flag explicitly')
  const evidence=harvestTimeEvidence(r,columns('time'),duration),source={namespace,externalId:s,billed:billed==='Yes',clockInstants:'not-supplied',currency,...evidence,rateEffective:rate.effective,billMinor:charge(evidence.billingSeconds??duration,rate.billMinor),costMinor:rate.costMinor===null?null:charge(duration,rate.costMinor)}
  ef.push({targetKind:'time',targetId:id('time',s),value:{engagementId:projects.get(project)!,personId:people.get(person)!,taskId,service:task,notes:r[columns('time').notes??'Notes']??'',billable:billable==='Yes',start:null,end:null,durationSeconds:duration,workDate:day,timezone:m.timezone,status:'draft',currency,source}})
  add(timeFile,i,'time',s,r,ef)
  const projectRow=records['projects.csv'].find(p=>field(p,'projects','id','Project ID')===project)!,client=field(projectRow,'projects','clientId','Client ID'),key=`${client}/${day.slice(0,7)}`;addHarvestTimeControl(timeControls,key,source,billable==='Yes');totals[key]??={count:0,seconds:0,amountMinor:0};totals[key].count++;totals[key].seconds+=duration;totals[key].amountMinor+=billable==='Yes'?source.billMinor:0;need(Number.isSafeInteger(totals[key].amountMinor),'Client period total exceeds exact integer range')
 })
 // Explicit rates remain native data, never account grants; all imported work awaits review.
 for(const [person,personId]of people)for(const [index,r]of historicalRates.get(person)!.entries()){const sourceId=index===0?person:`${person}:${r.effective}`;add('people.csv',records['people.csv'].findIndex(p=>field(p,'people','id','Person ID')===person),'rates',sourceId,{person,...r},[{targetKind:'rates',targetId:id('rates',sourceId),value:{personId,service:'*',effective:r.effective,costMinor:r.costMinor,billMinor:r.billMinor,currency,source:{namespace,externalId:sourceId}}}])}
 const schedule=forecastSource({manifest:m,people,projects,id,add},input.files['forecast.csv']?parseCsv(input.files['forecast.csv']):[],input.files['forecast.json']?JSON.parse(input.files['forecast.json']):undefined)
 if([...historicalRates.values()].some(r=>r.length>1)||Object.values(timeControls).some(t=>t.billingSeconds!==null))need(m.timeReconciliation,'Supply independent timeReconciliation for rounded time or historical rates')
 if(m.timeReconciliation!==undefined)need(canonicalJson(m.timeReconciliation)===canonicalJson(timeControls),'Independent raw, rounded, billed/unbilled and cost time controls do not reconcile')
 const expected=m.reconciliation;need(expected&&canonicalJson(expected)===canonicalJson(totals),'Independent client/month count, seconds and billable amount totals do not reconcile')
 for(const archive of input.archives??[]){need(archive.mediaType==='application/pdf','Historical archives must be PDF');const bytes=Buffer.from(archive.base64,'base64');need(bytes.length<=1024*1024&&bytes.toString('base64')===archive.base64,'Invalid or oversized PDF');const name=text(archive.name,'Archive filename',200);need(name.endsWith('.pdf'),'PDF filename required');bundle.artifacts.push({name,sha256:sha256(bytes),size:bytes.length,original:{status:'available',base64:archive.base64}});add(name,-1,'archives',name,{name,kind:'historical-document'},[{targetKind:'archives',targetId:id('archives',name),value:{name,mediaType:archive.mediaType,base64:archive.base64,semantics:'Historical document only; no editable invoice or active authority',source:{namespace,externalId:name}}}])}
 need(bundle.records.length<=1000,'The complete package exceeds 1000 source records including rates and optional files')
 const manifestBytes=Buffer.from(JSON.stringify(m));bundle.artifacts.push({name:'manifest.json',sha256:sha256(manifestBytes),size:manifestBytes.length,original:{status:'available',base64:manifestBytes.toString('base64')}})
 return {bundle,namespace,memberships:m.projectMembers??{},mapping:{version:'gauge-harvest-1',map:(r:SourceRecord)=>({effects:effects.get(`${r.kind}:${r.sourceId}`)??[]})},totals,timeControls,schedule,omissions:['No native authority or approval imported.','Date-only time has unknown clock instants.','Historical rates and source approval/lock flags are supplied evidence; native time remains draft. Full source approval decision history is unavailable.','Invoice PDFs are historical documents, not editable invoices.','Forecast aggregate periods stay labeled; only explicitly reviewed dates or supplied captured date allocations create daily records. Source snapshots retain their granularity; imported commitment is a reviewed mapping, never commercial approval.']}
}
