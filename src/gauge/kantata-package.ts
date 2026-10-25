import { parseApiJson } from '../modules/import-kit/src/readers/numeric-lexemes'
import { ReaderError } from '../modules/import-kit/src/readers/errors'
import { definition } from './custom-fields'
import { Buffer } from 'node:buffer'
import { Unzip,UnzipInflate } from 'fflate'
import { canonicalJson,sha256,type SourceBundle,type TargetEffect,type SourceRecord } from '../modules/import-kit/src/d1/index'
import { type Value,need,text,integer,date,zone,sum } from './model'
import { parseCsv } from './harvest'
import { harvestWorkbook } from './harvest-workbook'
export const kantataObjects=['clients','people','skills','projects','estimates','tasks','schedules','time','expenses','rates','invoices','payments','wip','retainers','customFields','customValues'] as const
const links:Record<string,Record<string,string>>={people:{},skills:{personId:'people'},projects:{clientId:'clients',leadId:'people'},estimates:{projectId:'projects'},tasks:{projectId:'projects'},schedules:{projectId:'projects',personId:'people'},time:{projectId:'projects',personId:'people',taskId:'tasks'},expenses:{projectId:'projects',personId:'people'},rates:{personId:'people'},invoices:{projectId:'projects'},payments:{invoiceId:'invoices'},wip:{projectId:'projects'},retainers:{projectId:'projects'},customValues:{fieldId:'customFields'}}
const required:Record<string,string[]>={clients:['name'],people:['name'],skills:['name'],projects:['name','scope'],estimates:['name','date','amountMinor','currency'],tasks:['name'],schedules:['from','to','seconds'],time:['date','seconds','billable','billMinor','costMinor','currency'],expenses:['date','amountMinor','currency'],rates:['effective','costRateMinor','billRateMinor','currency'],invoices:['date','amountMinor','paidMinor','outstandingMinor','currency'],payments:['date','amountMinor','currency'],wip:['date','amountMinor','currency'],retainers:['projectId','familyId','date','from','to','openingMinor','allowanceMinor','usedMinor','closingMinor','carryInMinor','carryOutMinor','currency'],customFields:['name','scope','type'],customValues:['scope','recordId','value']}
const n=(v:unknown,name:string,min=-1e12)=>integer(typeof v==='string'&&/^-?\d+$/.test(v)?Number(v):v,name,min)
const json=(v:any)=>typeof v==='string'?JSON.parse(v):v
function unzip(base64:unknown){
 need(typeof base64==='string'&&base64.length<=2800000,'SX ZIP is limited to 2 MiB base64')
 const bytes=Buffer.from(base64,'base64');need(bytes.length>0&&bytes.length<=2*1024*1024&&bytes.toString('base64')===base64,'Invalid SX ZIP')
 const files=new Map<string,string>(),decoder=new TextDecoder('utf-8',{fatal:true});let expanded=0,count=0,pending=0
 const zip=new Unzip(file=>{need(++count<=64,'SX ZIP has too many members');need(/^[A-Za-z0-9_.-]+\.csv$/.test(file.name)&&!files.has(file.name),'SX ZIP needs unique flat object CSV filenames');need(file.originalSize===undefined||file.originalSize<=8*1024*1024,'Expanded SX ZIP exceeds limit');files.set(file.name,'');pending++;const chunks:Uint8Array[]=[];let size=0;file.ondata=(error,data,final)=>{need(!error,'Invalid SX ZIP member');expanded+=data.length;size+=data.length;need(expanded<=8*1024*1024,'Expanded SX ZIP exceeds 8 MiB');chunks.push(data);if(final){const b=new Uint8Array(size);let at=0;for(const c of chunks){b.set(c,at);at+=c.length}files.set(file.name,decoder.decode(b));pending--}};file.start()});zip.register(UnzipInflate)
 for(let i=0;i<bytes.length;i+=512)zip.push(bytes.subarray(i,i+512),i+512>=bytes.length);need(pending===0,'Truncated SX ZIP');return {bytes,files}
}
function scalar(raw:any,field:Value){
 const value=typeof raw==='string'?(()=>{try{return JSON.parse(raw)}catch{return raw}})():raw
 if(field.type==='text'){need(typeof value==='string','Text custom value required');return value}
 if(field.type==='number'){const s=typeof raw==='string'&&/^-?\d/.test(raw)?raw:String(value);need(/^-?\d{1,9}(?:\.\d{1,6})?$/.test(s),'Use an exact source decimal with at most nine integer digits and six places');const [whole,fraction='']=s.replace('-','').split('.'),digits=whole.replace(/^0+(?=\d)/,''),decimals=fraction.replace(/0+$/,'');return (s.startsWith('-')&&/[1-9]/.test(digits+decimals)?'-':'')+digits+(decimals?'.'+decimals:'')}
 if(field.type==='date')return date(value)
 if(field.type==='person')return text(value,'Source person custom value',200)
 if(field.type==='boolean'){need([true,false,'true','false'].includes(value),'Boolean custom value required');return value===true||value==='true'}
 if(field.type==='currency'){need(value&&typeof value==='object'&&!Array.isArray(value)&&value.currency===field.currency,'Custom currency must be explicit and match its definition');return {amountMinor:n(value.amountMinor,'Custom currency minor units'),currency:value.currency}}
 const options=field.options??[]
 if(field.type==='single-select'){need(options.some((o:Value)=>o.id===value),'Undefined custom option '+String(value));return value}
 need(field.type==='multi-select'&&Array.isArray(value)&&new Set(value).size===value.length&&value.every(v=>options.some((o:Value)=>o.id===v)),'Undefined multi-select custom option');return value
}
export function kantataPackage(pkg:Value){
 need(pkg&&typeof pkg==='object'&&pkg.manifest,'Supply a Kantata package and manifest')
 const m=pkg.manifest,flavor=m.flavor;need(['ox','sx'].includes(flavor),'Identify Kantata OX or Salesforce-native SX explicitly')
 need(m.mapping?.flavor===flavor&&m.mapping?.version===`kantata-${flavor}-v1`,'The selected flavor requires its own reviewed relationship map; OX and SX maps are never interchangeable')
 need((flavor==='ox'?['ox-insights-and-time','ox-data-export']:['sx-salesforce-export','sx-salesforce-api']).includes(m.sourceKind),'Source artifact kind does not match the selected Kantata flavor')
 const namespace=`kantata-${flavor}:`+text(m.account,'Source account or Salesforce org identity',150),timezone=zone(m.timezone),findings:Value[]=[],records:Record<string,Value[]>={},bundle:SourceBundle={records:[],artifacts:[],diagnostics:[]},effects=new Map<string,TargetEffect[]>(),artifacts=new Map<string,{sha256:string;name:string}>(),locations=new Map<string,Value>()
 need(Array.isArray(m.windows)&&m.windows.length>0&&m.windows.length<=7,'Declare complete year export windows')
 let previous=0;for(const w of m.windows){const year=n(w.year,'Export year',1970);need(year<=9998&&w.from===`${year}-01-01`&&w.to===`${year}-12-31`&&(!previous||year===previous+1),'Export windows must be complete consecutive calendar years');previous=year;if(w.complete!==true)findings.push({kind:'coverage',year,reason:'Incomplete export window blocks cutover'})}
 if(!m.historyRange?.from||!m.historyRange?.to||date(m.historyRange.from)!==m.windows[0].from||date(m.historyRange.to)!==m.windows.at(-1).to)findings.push({kind:'coverage',reason:'Complete year windows must cover the independent source history range'})
 if(flavor==='ox'&&m.sourceKind==='ox-data-export'&&(!m.exportJob?.id||m.exportJob.status!=='complete'||m.exportJob.downloaded!==true))findings.push({kind:'coverage',reason:'Asynchronous OX export completion and downloaded artifacts are required'})
 if(flavor==='sx'&&m.sourceKind==='sx-salesforce-api'&&(m.capture?.complete!==true||m.capture?.nextPageToken!=null))findings.push({kind:'coverage',reason:'All Salesforce API pages must be captured'})
 if(m.administrator!==true)findings.push({kind:'permissions',reason:'Source administrator permission was not declared'})
 const addArtifact=(name:string,bytes:Uint8Array)=>{need(bytes.length<=2*1024*1024,'Each source artifact is limited to 2 MiB');const a={name,sha256:sha256(bytes),size:bytes.length,original:{status:'available' as const,base64:Buffer.from(bytes).toString('base64')}};bundle.artifacts.push(a);artifacts.set(name,a)}
 addArtifact('kantata-manifest.json',Buffer.from(canonicalJson(m)))
 for(const [name,content]of Object.entries(pkg.files??{})){need(/^[A-Za-z0-9_.-]+\.(csv|json)$/.test(name)&&typeof content==='string','Use explicit flat CSV/JSON source files');need(name!=='kantata-manifest.json','Source filename conflicts with the retained manifest');addArtifact(name,Buffer.from(content))}
 const zipped=pkg.zip?unzip(pkg.zip):null
 need(!zipped||flavor==='sx'&&m.sourceKind==='sx-salesforce-export','Only SX Salesforce object exports accept the source ZIP')
 if(zipped)addArtifact('salesforce.zip',zipped.bytes)
 const workbookRows=new Map<string,ReturnType<typeof harvestWorkbook>>()
 for(const [name,base64]of Object.entries(pkg.workbooks??{})){need(flavor==='ox'&&name==='time.xlsx','Only OX time.xlsx is a supported workbook');const config=m.mapping.objects?.time;need(config?.artifact===name&&config.format==='xlsx','Declare the exact OX worksheet and mapping');const parsed=harvestWorkbook(base64,config.worksheet,config.columns?.date);workbookRows.set(name,parsed);addArtifact(name,parsed.bytes)}
 need(flavor!=='sx'||m.sourceKind!=='sx-salesforce-export'||zipped,'Supply the original Salesforce object ZIP')
 const claimed=new Set<string>()
 for(const kind of kantataObjects){
  if(m.permissions?.[kind]!==true)findings.push({kind,reason:'Missing source object permission blocks cutover'})
  const cfg=m.mapping.objects?.[kind];need(cfg&&typeof cfg==='object'&&cfg.columns?.id,`Review the ${kind} object mapping, including stable source ID`)
  if(cfg.complete!==true||cfg.filters!=='all-records')findings.push({kind,reason:'Filtered or truncated original object export cannot establish completeness'})
  const file=text(cfg.artifact,`${kind} source artifact`,200);let raw:Value[],artifact=file
  if(cfg.format==='xlsx'){need(kind==='time'&&flavor==='ox'&&workbookRows.has(file),'XLSX is supported for OX time only');const book=workbookRows.get(file)!;raw=book.records.map(r=>r.value);locations.set(kind,{artifact:file,pointer:book.worksheet})}
  else{
   let content:string
   if(zipped){need(cfg.format==='csv'&&zipped.files.has(file),'SX object ZIP mappings must name their actual CSV member');content=zipped.files.get(file)!;artifact='salesforce.zip';claimed.add(file)}else{need(Object.hasOwn(pkg.files??{},file),'Mapped source artifact is missing');content=pkg.files[file];claimed.add(file)}
   need(['csv','json'].includes(cfg.format),'Use a declared CSV, API JSON capture or OX time worksheet')
   if(cfg.format==='csv')raw=parseCsv(content)
   else{need(typeof cfg.array==='string'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(cfg.array),'Declare one top-level JSON object array');let doc:Value;try{doc=parseApiJson(content,{artifact:file},[],{namespace,url:'https://source.invalid/',preserveNumberLexeme:()=>true,parsePage:()=>({records:[]})}).value as Value}catch(error){if(error instanceof ReaderError)need(false,'Invalid original Kantata JSON: '+error.code);throw error}raw=doc[cfg.array];need(Array.isArray(raw),`JSON capture has no ${cfg.array} array`)}
   locations.set(kind,{artifact,...(zipped?{pointer:file}:cfg.format==='json'?{pointer:cfg.array}:{})})
  }
  records[kind]=raw.map((source,index)=>{
   need(source&&typeof source==='object'&&!Array.isArray(source),'Object rows must be records')
   const data:Value={};for(const [semantic,column]of Object.entries(cfg.columns)){need(typeof column==='string'&&Object.hasOwn(source,column),`${kind} mapped column ${column} is absent`);data[semantic]=source[column]}
   data.id=text(data.id,`${kind} stable source ID`,200)
   for(const field of required[kind]??[])need(data[field]!==undefined&&data[field]!==null&&data[field]!=='',`${kind}.${field} requires an explicit source value`)
   for(const field of ['seconds','amountMinor','paidMinor','outstandingMinor','billMinor','costMinor','costRateMinor','billRateMinor','openingMinor','allowanceMinor','usedMinor','closingMinor','carryInMinor','carryOutMinor'])if(data[field]!==undefined)data[field]=n(data[field],`${kind}.${field}`,field==='seconds'?0:-1e12)
   for(const field of ['date','from','to','effective'])if(data[field])data[field]=date(data[field])
   if(data.from&&data.to)need(data.from<=data.to,'Source schedule ends before it starts')
   if(kind==='retainers'&&(!m.windows.some((w:Value)=>w.from<=data.from&&data.from<=w.to)||!m.windows.some((w:Value)=>w.from<=data.to&&data.to<=w.to)))findings.push({kind,sourceId:data.id,reason:'Retainer period falls outside captured export windows'})
   if(data.date&&!m.windows.some((w:Value)=>w.from<=data.date&&data.date<=w.to))findings.push({kind,sourceId:data.id,reason:'Record falls outside captured export windows'})
   if(data.currency)need(/^[A-Z]{3}$/.test(data.currency)&&Intl.supportedValuesOf('currency').includes(data.currency),'Source money requires an explicit ISO currency')
   if(kind==='time'){need([true,false,'true','false','Yes','No'].includes(data.billable),'Resolve source billability');data.billable=[true,'true','Yes'].includes(data.billable);need(data.seconds>0,'Source time must have positive duration')}
   if(kind==='customFields'){need(['text','number','date','person','single-select','multi-select','currency'].includes(data.type),'Unsupported source custom field type');data.options=data.options?json(data.options):[];need(Array.isArray(data.options)&&data.options.every((o:any)=>o&&typeof o.id==='string'&&typeof o.name==='string')&&new Set(data.options.map((o:Value)=>o.id)).size===data.options.length,'Custom options need unique stable IDs');if(['single-select','multi-select'].includes(data.type))need(data.options.length>0,'Source selectable field needs declared options')}
   return {kind,sourceId:data.id,data,raw:source,location:{...locations.get(kind),row:cfg.format==='xlsx'?workbookRows.get(file)!.records[index].row:index+(cfg.format==='csv'?2:0)}}
  })
  need(new Set(records[kind].map(r=>r.sourceId)).size===records[kind].length,`Duplicate ${kind} source identity`)
 }
 const rowCount=Object.values(records).reduce((n,rows)=>n+rows.length,0);need(rowCount<=1000,'This bounded Kantata importer accepts at most 1000 source records; split at complete project boundaries')
 for(const name of [...(zipped?zipped.files.keys():Object.keys(pkg.files??{}))])need(claimed.has(name),'Every supplied artifact must be included in the reviewed object mapping: '+name)
 const lookup=(kind:string,id:any)=>records[kind]?.find(r=>r.sourceId===id)
 for(const [kind,rows]of Object.entries(records))for(const row of rows){
  for(const [field,parent]of Object.entries(links[kind]??{}))if(!lookup(parent,row.data[field]))findings.push({kind,sourceId:row.sourceId,field,reason:`Unresolved ${parent} relationship`})
  if(row.data.invoiceId&&kind!=='payments'&&!lookup('invoices',row.data.invoiceId))findings.push({kind,sourceId:row.sourceId,reason:'Unresolved source invoice join'})
  if(row.data.invoiceId&&kind!=='payments'){const invoice=lookup('invoices',row.data.invoiceId);if(invoice&&row.data.projectId!==invoice.data.projectId)findings.push({kind,sourceId:row.sourceId,reason:'Source invoice belongs to another project'})}
  if(kind==='time'&&lookup('tasks',row.data.taskId)?.data.projectId!==row.data.projectId)findings.push({kind,sourceId:row.sourceId,reason:'Source task belongs to another project'})
  if(kind==='customFields')row.data.mappedScope=m.mapping.fieldScopes?.[row.data.scope]??null
  if(kind==='customFields'&&!['clients','engagements','people','tasks'].includes(m.mapping.fieldScopes?.[row.data.scope]))findings.push({kind,sourceId:row.sourceId,reason:'Custom source scope needs a reviewed client/project/person/task mapping (including Group)'})
  else if(kind==='customFields')try{definition({...row.data,scope:row.data.mappedScope,visibility:'finance-only',required:false,retired:false})}catch(error){findings.push({kind,sourceId:row.sourceId,reason:error instanceof Error?error.message:'Invalid native custom definition'})}
  if(kind==='customValues'){
   const f=lookup('customFields',row.data.fieldId),targetKind=({clients:'clients',engagements:'projects',people:'people',tasks:'tasks'} as Value)[m.mapping.fieldScopes?.[row.data.scope]]
   if(!f||f.data.scope!==row.data.scope||!targetKind||!lookup(targetKind,row.data.recordId))findings.push({kind,sourceId:row.sourceId,reason:'Custom value needs its exact definition, scope and source record'})
   else try{row.data.value=scalar(row.data.value,f.data);if(f.data.type==='person')need(lookup('people',row.data.value),'Unresolved custom person value')}catch(error){findings.push({kind,sourceId:row.sourceId,reason:error instanceof Error?error.message:'Invalid custom value'})}
  }
 }
 for(const inv of records.invoices){const payments=records.payments.filter(p=>p.data.invoiceId===inv.sourceId);if(payments.some(p=>p.data.currency!==inv.data.currency)||sum(payments.map(p=>p.data.amountMinor))!==inv.data.paidMinor||inv.data.amountMinor-inv.data.paidMinor!==inv.data.outstandingMinor)findings.push({kind:'invoices',sourceId:inv.sourceId,reason:'Invoice, payment allocations and outstanding balance do not reconcile'})}
 for(const row of records.retainers){const v=row.data;if(v.openingMinor!==v.carryInMinor||v.allowanceMinor<0||v.usedMinor<0||sum([v.openingMinor,v.allowanceMinor,-v.usedMinor])!==v.closingMinor||v.closingMinor!==v.carryOutMinor)findings.push({kind:'retainers',sourceId:row.sourceId,reason:'Signed retainer opening, allowance, use and closing carry do not reconcile'})}
 for(const family of new Set(records.retainers.map(r=>r.data.familyId))){const rows=records.retainers.filter(r=>r.data.familyId===family).sort((a,b)=>a.data.from.localeCompare(b.data.from));for(let i=1;i<rows.length;i++){const v=rows[i].data,prior=rows[i-1].data;if(v.from<=prior.to||v.projectId!==prior.projectId||v.currency!==prior.currency||v.carryInMinor!==prior.carryOutMinor)findings.push({kind:'retainers',sourceId:rows[i].sourceId,reason:'Retainer family periods or signed carry continuity do not reconcile'})}}
 const counts=Object.fromEntries(kantataObjects.map(k=>[k,records[k].length])),financial:Record<string,Value>={}
 const blank=()=>({timeSeconds:0,billableSeconds:0,timeCostMinor:0,timeValueMinor:0,expenseMinor:0,invoiceMinor:0,paidMinor:0,outstandingMinor:0,wipMinor:0,openingMinor:0,closingMinor:0,carryInMinor:0,carryOutMinor:0})
 for(const kind of ['time','expenses','invoices','payments','wip','retainers'])for(const r of records[kind]){
  const v=r.data,project=lookup('projects',kind==='payments'?lookup('invoices',v.invoiceId)?.data.projectId:v.projectId),client=project?.data.clientId
  if(!client)continue
  const key=`${client}/${v.date.slice(0,7)}/${v.currency}`,total=financial[key]??=blank(),add=(field:string,amount:number)=>total[field]=sum([total[field],amount])
  if(kind==='time'){add('timeSeconds',v.seconds);if(v.billable){add('billableSeconds',v.seconds);add('timeValueMinor',v.billMinor)}add('timeCostMinor',v.costMinor)}
  if(kind==='expenses')add('expenseMinor',v.amountMinor)
  if(kind==='invoices'){add('invoiceMinor',v.amountMinor);add('outstandingMinor',v.outstandingMinor)}
  if(kind==='payments')add('paidMinor',v.amountMinor)
  if(kind==='wip')add('wipMinor',v.amountMinor)
  if(kind==='retainers')for(const field of ['openingMinor','closingMinor','carryInMinor','carryOutMinor'])add(field,v[field])
 }
 need(m.controls&&typeof m.controls==='object','Supply independent source control counts and client/month/currency totals')
 if(canonicalJson(m.controls.counts)!==canonicalJson(counts))findings.push({kind:'controls',reason:'Independent source object counts do not reconcile'})
 if(canonicalJson(m.controls.financial)!==canonicalJson(financial))findings.push({kind:'controls',reason:'Independent client/month/currency financial totals do not reconcile'})
 const id=(kind:string,sourceId:string)=>'kt_'+sha256(`${namespace}:${kind}:${sourceId}`).slice(0,32)
 for(const [kind,rows]of Object.entries(records))for(const row of rows){
  const artifact=artifacts.get(row.location.artifact)!;const source:SourceRecord={namespace,kind,sourceId:row.sourceId,payload:row.raw,payloadHash:sha256(canonicalJson(row.raw)),artifactHash:artifact.sha256,location:row.location as SourceRecord['location']};bundle.records.push(source)
  const related=Object.fromEntries(Object.entries(links[kind]??{}).map(([field,parent])=>[field,{kind:parent,sourceId:row.data[field],id:id(parent,row.data[field])}]))
  effects.set(kind+':'+row.sourceId,[{targetKind:'kantataRecords',targetId:id(kind,row.sourceId),value:{sourceTimezone:timezone,flavor,namespace,sourceKind:kind,sourceId:row.sourceId,data:row.data,related,raw:row.raw,location:row.location,meaning:'Historical source evidence only; no native approval, access, current invoice issuance or payment settlement authority.'}}])
 }
 return {namespace,flavor,records,bundle,mapping:{version:`kantata-${flavor}-v1`,map:(r:SourceRecord)=>({effects:effects.get(r.kind+':'+r.sourceId)??[]})},findings,counts,financial,canApply:!findings.length,fieldScopes:m.mapping.fieldScopes,timezone}
}
