import { Buffer } from 'node:buffer'
import { canonicalJson, sha256, type SourceBundle, type SourceRecord, type TargetEffect } from '../modules/import-kit/src/d1/index'
import { type Value, need, text, integer, date, zone, sum } from './model'
import { parseCsv } from './harvest'
import { harvestWorkbook } from './harvest-workbook'

export interface MoveInSpec {
 provider:string; name:string; versions:string[]; objects:Record<string,string[]>;
 normalize:(kind:string,v:Value,m:Value)=>void;
 validate?:(records:Record<string,Value[]>,m:Value,findings:Value[])=>void
}
export const sourceNumber=(v:unknown,label:string,min=0)=>integer(typeof v==='string'&&/^-?\d+$/.test(v)?Number(v):v,label,min)
export function sourceBoolean(v:unknown,label:string){need([true,false,'true','false','1','0','Yes','No'].includes(v as any),label+' requires an explicit boolean');return [true,'true','1','Yes'].includes(v as any)}
export function sourceInstant(v:unknown,label:string){need(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v)),label+' requires a timezone-bearing timestamp');return v}
export function sourceSeconds(v:unknown,unit:unknown,label:string){need(['seconds','minutes','hours'].includes(String(unit)),label+' requires captured units');const raw=String(v);need(/^\d+(?:\.\d{1,6})?$/.test(raw),label+' requires an exact nonnegative decimal');const [whole,fraction='']=raw.split('.'),den=10n**BigInt(fraction.length),num=(BigInt(whole)*den+BigInt(fraction||'0'))*BigInt(unit==='seconds'?1:unit==='minutes'?60:3600);need(num%den===0n&&num/den<=BigInt(Number.MAX_SAFE_INTEGER),label+' must resolve to exact whole seconds');return Number(num/den)}
export const commonObjects={clients:['name'],people:['name'],projects:['name','clientId'],tasks:['name','projectId'],rates:['personId','effective','billRateMinor','costRateMinor','currency'],expenses:['projectId','date','amountMinor','currency'],invoices:['projectId','date','amountMinor','paidMinor','currency'],payments:['invoiceId','date','amountMinor','currency']}
const references:Record<string,Record<string,string>>={projects:{clientId:'clients'},tasks:{projectId:'projects',parentId:'tasks',phaseId:'phases'},phases:{projectId:'projects'},rates:{personId:'people',projectId:'projects'},time:{projectId:'projects',personId:'people',taskId:'tasks',phaseId:'phases',rateId:'rates',invoiceId:'invoices'},expenses:{projectId:'projects',personId:'people'},invoices:{projectId:'projects'},payments:{invoiceId:'invoices'},bookings:{projectId:'projects',personId:'people'},allocations:{projectId:'projects',personId:'people',phaseId:'phases'},retainers:{projectId:'projects'},proofs:{projectId:'projects',taskId:'tasks'},approvals:{timeId:'time',personId:'people'},history:{recordId:'time'},workweeks:{personId:'people'},leave:{personId:'people'},quotes:{clientId:'clients'},budgets:{projectId:'projects',phaseId:'phases'}}
const metrics=['rawSeconds','billableSeconds','billedSeconds','unbilledSeconds','billMinor','costMinor','expenseMinor','invoiceMinor','paidMinor','scheduledSeconds','leaveSeconds','budgetMinor','openingMinor','closingMinor','carryInMinor','carryOutMinor'] as const
export const emptyControl=()=>Object.fromEntries(metrics.map(k=>[k,0])) as Value
export function sourceControls(records:Record<string,Value[]>,groupBy='project'){
 const groups:Record<string,Value>={},lookup=(kind:string,id:string)=>records[kind]?.find(r=>r.id===id)
 const add=(bucket:Value,k:string,v:number)=>bucket[k]=sum([bucket[k],v])
 for(const [kind,rows] of Object.entries(records))for(const v of rows){
  if(!['time','expenses','invoices','payments','bookings','allocations','leave','budgets','retainers'].includes(kind))continue
  const project=lookup('projects',kind==='payments'?lookup('invoices',v.invoiceId)?.projectId:v.projectId),dimension=groupBy==='client'?project?.clientId:groupBy==='person'?v.personId:project?.id
  const day=v.workDate??v.date??v.from
  if(!day)continue
  const key=[dimension??'Unassigned',day.slice(0,7),v.currency??'non-monetary'].join('/'),g=groups[key]??=emptyControl()
  if(kind==='time'){add(g,'rawSeconds',v.rawSeconds);add(g,'billableSeconds',v.billableSeconds);add(g,v.billed?'billedSeconds':'unbilledSeconds',v.rawSeconds);add(g,'billMinor',v.billMinor);add(g,'costMinor',v.costMinor)}
  if(kind==='expenses')add(g,'expenseMinor',v.amountMinor)
  if(kind==='invoices')add(g,'invoiceMinor',v.amountMinor)
  if(kind==='payments')add(g,'paidMinor',v.amountMinor)
  if(kind==='bookings'||kind==='allocations')add(g,'scheduledSeconds',v.seconds)
  if(kind==='leave')add(g,'leaveSeconds',v.seconds)
  if(kind==='budgets')add(g,'budgetMinor',v.amountMinor)
  if(kind==='retainers')for(const k of ['openingMinor','closingMinor','carryInMinor','carryOutMinor'])add(g,k,v[k])
 }
 return groups
}
export function moveInPackage(spec:MoveInSpec,pkg:Value,agencyCurrency:string){
 need(pkg&&typeof pkg==='object'&&pkg.manifest,'Supply a source package and manifest')
 const m=pkg.manifest;need(m.provider===spec.provider&&m.mappingVersion===`${spec.provider}-v1`,'Use the selected provider-specific reviewed map')
 need(m.currency===agencyCurrency,`${spec.name} package uses ${m.currency}; agency uses ${agencyCurrency}. No import conversion is available`)
 const namespace=spec.provider+':'+text(m.account,'Stable source account identity',150),timezone=zone(m.timezone),findings:Value[]=[],bundle:SourceBundle={records:[],artifacts:[],diagnostics:[]},records:Record<string,Value[]>={},sources=new Map<string,SourceRecord>(),claimed=new Set<string>(),effects=new Map<string,TargetEffect[]>()
 const finding=(kind:string,reason:string,sourceId?:string)=>findings.push({kind,reason,...(sourceId?{sourceId}:{})})
 if(m.authorized!==true)finding('permissions','Explicit source owner/manager authorization is missing')
 need(Array.isArray(m.windows)&&m.windows.length>0&&m.windows.length<=20,'Declare bounded original export windows')
 let previous='';for(const w of m.windows){w.from=date(w.from);w.to=date(w.to);need(w.from<=w.to&&(!previous||w.from>previous),'Source windows must be ordered and non-overlapping');if(previous&&new Date(Date.parse(previous+'T00:00:00Z')+86400000).toISOString().slice(0,10)!==w.from)finding('coverage','Export windows have a historical gap');previous=w.to;if(w.complete!==true)finding('coverage','An original export window is incomplete');if(spec.provider==='float')need(w.from.endsWith('-01-01')&&w.to===w.from.slice(0,4)+'-12-31','Float schedule/report captures require complete year windows')}
 const addArtifact=(name:string,bytes:Uint8Array)=>{need(bytes.length<=2*1024*1024,'Each source artifact is limited to 2 MiB');bundle.artifacts.push({name,sha256:sha256(bytes),size:bytes.length,original:{status:'available',base64:Buffer.from(bytes).toString('base64')}})}
 addArtifact('move-in-manifest.json',Buffer.from(canonicalJson(m)))
 const artifactNames=Object.keys(pkg.files??{});need(artifactNames.length<=80,'Too many source artifacts')
 for(const name of artifactNames){need(/^[A-Za-z0-9_.-]+\.(csv|json|xlsx)$/.test(name)&&name!=='move-in-manifest.json','Use a unique flat CSV/JSON/XLSX artifact filename');need(typeof pkg.files[name]==='string','Source file content must be text or XLSX base64');if(!name.endsWith('.xlsx'))addArtifact(name,Buffer.from(pkg.files[name]))}
 let physicalRows=0
 for(const [kind,fields]of Object.entries(spec.objects)){
  records[kind]=[];if(m.permissions?.[kind]!==true)finding(kind,'Source object permission is missing')
  const configs=m.objects?.[kind];need(Array.isArray(configs)&&configs.length>0&&configs.length<=20,`Map every ${kind} export, including explicitly empty objects`)
  const seen=new Map<string,string>()
  for(const cfg of configs){
   need(cfg.columns&&typeof cfg.columns==='object'&&cfg.columns.id,`Map stable ${kind} source IDs; row numbers are not identities`)
   need(Array.isArray(cfg.grouping)&&cfg.grouping.every((g:unknown)=>typeof g==='string'),'Declare the source report grouping explicitly, including an empty array')
   if(cfg.filters!=='all-records')finding(kind,'Filtered report coverage is not complete; supply the full original export')
   const pages=cfg.format==='json'?cfg.pages:[{artifact:cfg.artifact}];need(Array.isArray(pages)&&pages.length>0&&pages.length<=100,'Declare every captured API page')
   if(cfg.format==='json'){need(spec.versions.includes(cfg.apiVersion),'Select a supported captured API version');need(typeof cfg.array==='string'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(cfg.array),'Map a top-level captured data array');need(cfg.pagination&&['page','next','total'].every(k=>typeof cfg.pagination[k]==='string'),'Map captured page/next/total metadata explicitly')}
   const copyIds=new Set<string>()
   for(const [pageIndex,page]of pages.entries()){
    const name=text(page.artifact,'Original source filename',200);need(Object.hasOwn(pkg.files??{},name),'Mapped original artifact is missing: '+name);claimed.add(name)
    let rows:Value[],rowNumbers:number[]|undefined
    if(cfg.format==='xlsx'){const book=harvestWorkbook(pkg.files[name],cfg.worksheet,cfg.columns.workDate??cfg.columns.date??'Date');rows=book.records.map(r=>r.value);rowNumbers=book.records.map(r=>r.row);if(!bundle.artifacts.some(a=>a.name===name))addArtifact(name,book.bytes)}
    else if(cfg.format==='csv')rows=parseCsv(pkg.files[name])
    else{need(cfg.format==='json','Use a documented CSV, value-only XLSX or paginated JSON capture');const doc=JSON.parse(pkg.files[name]);rows=doc[cfg.array];need(Array.isArray(rows),'The mapped JSON capture array is missing');const p=cfg.pagination;if(doc[p.page]!==pageIndex+1||doc[p.total]!==pages.length||doc[p.next]!== (pageIndex+1===pages.length?null:pages[pageIndex+1].token))finding(kind,'API pagination is incomplete or out of order')}
    physicalRows+=rows.length;need(physicalRows<=1000,'This measured adapter accepts at most 1000 physical source rows, including repeated reports')
    for(const [index,raw]of rows.entries()){
     need(raw&&typeof raw==='object'&&!Array.isArray(raw),'Source rows must be objects');const v:Value={}
     for(const [semantic,column]of Object.entries(cfg.columns)){need(typeof column==='string'&&Object.hasOwn(raw,column),`${kind} mapped column ${String(column)} is missing`);v[semantic]=raw[column]}
     v.id=text(v.id,`${kind} stable source ID`,200);need(!copyIds.has(v.id),`Duplicate ${kind} identity within one report: ${v.id}`);copyIds.add(v.id)
     for(const key of fields)need(v[key]!==undefined&&v[key]!==null&&v[key]!=='',`${kind}.${key} must be explicitly captured`)
     for(const [key,value]of Object.entries(v)){if(key.endsWith('Minor'))v[key]=sourceNumber(value,kind+'.'+key,-1e12);if(['date','workDate','userWorkDate','from','to','effective'].includes(key)&&value)v[key]=date(value);if(key==='currency')need(value===m.currency,'Source row currency differs from the agency; conversion is refused')}
     if(v.from&&v.to)need(v.from<=v.to,'Source period ends before it starts')
     spec.normalize(kind,v,m)
     const day=v.workDate??v.date??v.effective??v.from
     if(day&&!m.windows.some((w:Value)=>w.from<=day&&day<=w.to))finding(kind,'Record lies outside declared source windows',v.id)
     if(v.to&&!m.windows.some((w:Value)=>w.from<=v.to&&v.to<=w.to))finding(kind,'Record ends outside declared source windows',v.id)
     const content=canonicalJson(v),prior=seen.get(v.id)
     if(prior){if(prior!==content)finding(kind,'Repeated report identity has conflicting values; do not sum grouped rows',v.id);continue}
     seen.set(v.id,content);records[kind].push(v)
     const artifact=bundle.artifacts.find(a=>a.name===name)!;sources.set(kind+':'+v.id,{namespace,kind,sourceId:v.id,payload:v,payloadHash:sha256(content),artifactHash:artifact.sha256,location:{artifact:name,row:rowNumbers?.[index]??index+(cfg.format==='csv'?2:0),...(cfg.format==='xlsx'?{pointer:cfg.worksheet}:cfg.format==='json'?{pointer:cfg.array}:{})}})
    }
   }
  }
 }
 for(const name of artifactNames)need(claimed.has(name),'Every original artifact must have a reviewed mapping: '+name)
 const lookup=(kind:string,id:string)=>records[kind]?.find(v=>v.id===id)
 for(const [kind,rows]of Object.entries(records))for(const v of rows){
  for(const [key,parent]of Object.entries(references[kind]??{}))if(v[key]&&!lookup(parent,v[key]))finding(kind,`Unresolved ${parent} relationship ${key}`,v.id)
  for(const key of ['taskId','phaseId','invoiceId'])if(v[key]&&v.projectId){const parent=lookup(({taskId:'tasks',phaseId:'phases',invoiceId:'invoices'} as Value)[key],v[key]);if(parent&&parent.projectId!==v.projectId)finding(kind,key+' belongs to another project',v.id)}
  if(kind==='invoices'){const paid=sum((records.payments??[]).filter(p=>p.invoiceId===v.id).map(p=>p.amountMinor));if(paid!==v.paidMinor)finding(kind,'Invoice paid value differs from source payment allocations',v.id)}
  if(kind==='retainers'){if(sum([v.openingMinor,v.allowanceMinor,-v.usedMinor])!==v.closingMinor||v.carryOutMinor!==v.closingMinor)finding(kind,'Retainer opening, allowance, use and signed carry do not reconcile',v.id)}
 }
 spec.validate?.(records,m,findings)
 const counts=Object.fromEntries(Object.entries(records).map(([kind,rows])=>[kind,rows.length])),financial=sourceControls(records)
 need(m.controls&&typeof m.controls==='object','Supply independent manager/source counts and project/month totals')
 if(canonicalJson(m.controls.counts)!==canonicalJson(counts))finding('controls','Independent source counts do not reconcile')
 if(canonicalJson(m.controls.financial)!==canonicalJson(financial))finding('controls','Independent project/month financial and schedule totals do not reconcile')
 const id=(kind:string,sourceId:string)=>'mi_'+sha256(`${namespace}:${kind}:${sourceId}`).slice(0,32)
 for(const [key,source]of sources){bundle.records.push(source);effects.set(key,[{targetKind:spec.provider+'Records',targetId:id(source.kind,source.sourceId),value:{provider:spec.provider,namespace,sourceKind:source.kind,sourceId:source.sourceId,timezone,currency:m.currency,data:source.payload,meaning:'Historical source evidence; no native approval, access, issuance, settlement or cutover authority.'}}])}
 return {provider:spec.provider,namespace,timezone,currency:m.currency,records,counts,financial,findings,canApply:findings.length===0,bundle,effects,id,mapping:{version:m.mappingVersion,map:(r:SourceRecord)=>({effects:effects.get(r.kind+':'+r.sourceId)??[]})}}
}
