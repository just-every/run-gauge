import { changeClientResponse } from './scope-review'
import { intakeResponse } from './intake-http'
import { clientPortalResponse } from './client-portal'
import { clientDeliveryResponse, clientDeliveryPage } from './ui-client-delivery'
import { escape as escapeHtml } from './ui-forms'
import { stripeWebhook } from './stripe'
import { milestoneClientResponse } from './milestone-review'
import { accountantProjection } from './accountant-projection'
import { resourceActions } from './resource-manager'
import { accountantInputs } from './accountant'
import { invoiceClientResponse } from './invoice-access'
import { invoiceDocumentResponse } from './invoice-documents'
import { kantataCommand } from './kantata'
import { privacyJournal } from './privacy'
import { commercialClientResponse } from './commercial-client'
import { filters as customFilters } from './custom-values'
import { savedRead } from './custom-fields'
import { receivablesRead, receivablesCsv } from './receivables'
import { handoffDownload } from './specialist-handoff'
import { Buffer } from 'node:buffer'
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server'
import { type Actor, actor, access, finance, fence, get, Transaction } from './store'
import { need, Fault, kind, kinds, type Kind } from './model'
import { command, publicResult } from './commands'
import { redact, reports, visible } from './reports'
import { appPage, historyPage, tabsFor } from './ui'
import { importCommand } from './imports'
import { formInput } from './form-input'
import { reportCsv } from './report-export'
import { resourceCandidates } from './resource-candidates'
import { explainRate } from './rate-cards'
import { appKeyCommand, appKeyRequest } from './app-keys'
import { apiKeyCommand, utilizationKeyRead, revokePresentedKey } from './api-keys'
import { auditSearch, auditExport, auditVerify, type AuditQuery } from './audit'
import { auditPage } from './ui-audit'
import { clientSearchRead } from './clients'
// The page an /app/action form belongs to: its result (or refusal) shows there.
const sectionFor=(action:string)=>action==='expense:rate'?'access':action.startsWith('kantataAdopt:')?'imports':action.startsWith('kantata:')?'imports':action.startsWith('case:')?'review':action.startsWith('privacy:')||action.startsWith('provider:')||action.startsWith('providerJob:')||action.startsWith('github:')?'access':action.startsWith('field:import')?'imports':action==='field:define'?'access':action==='saved:save'?'review':action.startsWith('period:')?'review':action==='calendar:change'||action.startsWith('leave:')||action.startsWith('staffing:')||action.startsWith('resource:')||action==='save:resourceRequests'?'capacity':action.startsWith('proposal:')?'review':action.startsWith('import:')?'imports':action.startsWith('cap:')||action.startsWith('fixed:')||action.startsWith('invoice:')||action.startsWith('stripe:')||action.startsWith('payment:')||action.startsWith('receipt:')||action.startsWith('packet:')||action.startsWith('handoff:')?'billing':action.startsWith('expense:')?'expenses':action.startsWith('time:')||action.startsWith('timer:')?'time':action==='grant'||action==='invite'||action==='agency:profile'||action==='fx:approve'||action.startsWith('approval:')||/^(?:api|app)key:/.test(action)?'access':action==='save:rates'||action.startsWith('rate:')?'rates':['save:calendars','save:leave','save:staffing'].includes(action)?'capacity':'engagements'
const auditQuery=(url:URL):AuditQuery=>Object.fromEntries(['kind','recordId','actor','action','text','from','to'].map(k=>[k,url.searchParams.get(k)||null]))
function customOptions(url:URL,a:Actor){const parse=(name:string,defaultValue:any)=>{const raw=url.searchParams.get(name);if(!raw)return defaultValue;try{return JSON.parse(raw)}catch{need(false,'Use valid custom report filters')}};return {customGroup:url.searchParams.get('customGroup'),customFilters:{...parse('customFilters',{}),...customFilters(a,Object.fromEntries([...url.searchParams].filter(([k,v])=>k.startsWith('filter:')&&v.trim()).map(([k,v])=>[k.slice(7),v])),undefined,true)},customMeasures:url.searchParams.has('customMeasure')?url.searchParams.getAll('customMeasure'):parse('customMeasures',[]),...(url.searchParams.get('customProfitGroup')?{portfolioGroup:'custom:'+url.searchParams.get('customProfitGroup')}:{})}}
const headers={'cache-control':'no-store','referrer-policy':'strict-origin','x-content-type-options':'nosniff','x-robots-tag':'noindex','content-security-policy':"default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}
export async function gaugeResponse(request:Request,original:Bindings):Promise<Response|null> {
 const url=new URL(request.url),path=url.pathname;if(path!=='/api/gauge'&&!path.startsWith('/api/gauge/')&&path!=='/app'&&!path.startsWith('/app/'))return null
 if(path.startsWith('/app/client-intake/')||path.startsWith('/api/gauge/intake-files/'))return intakeResponse(request,runtimeBindings(original))
 if(path==='/api/gauge/stripe/webhook')return stripeWebhook(request,runtimeBindings(original))
 if(path==='/app/client-projects'||path==='/api/gauge/client-projects'||path.startsWith('/app/client-projects/')||path.startsWith('/api/gauge/client-projects/'))return clientPortalResponse(request,runtimeBindings(original))
 if(path.startsWith('/app/client-milestones/'))return clientDeliveryResponse(request,runtimeBindings(original))
 if(path.startsWith('/api/gauge/client-changes/'))return changeClientResponse(request,runtimeBindings(original))
 if(path.startsWith('/api/gauge/client-milestones/'))return milestoneClientResponse(request,runtimeBindings(original))
 // Resolve complete declared paths before admitting a command or reading its body.
 if(path.startsWith('/app/client-invoices/'))return invoiceClientResponse(request,runtimeBindings(original))
 if(path.startsWith('/app/client-proposals/')||path.startsWith('/app/proposal-originals/'))return commercialClientResponse(request,runtimeBindings(original))
 const invoiceDocumentRoute=path.match(/^\/api\/gauge\/(invoice-drafts|invoice-documents)\/([^/%]+)$/)
 const mutation=path==='/api/gauge/command'||path==='/app/action'
 const historyRoute=path.match(/^\/api\/gauge\/history\/([^/%]+)\/([^/%]+)$/)
 const savedRoute=path.match(/^\/api\/gauge\/saved\/([^/%]+)$/)
 const resourceRoute=path.match(/^\/api\/gauge\/resources\/([^/%]+)$/)
 const download=path.match(/^\/api\/gauge\/(files|packets|archives|imports|handoffs|closes)\/([^/%]+)$/)
 const page=path==='/app'?'review':path.match(/^\/app\/(review|engagements|time|expenses|capacity|rates|billing|imports|access)$/)?.[1]
 if((!mutation&&!invoiceDocumentRoute&&!historyRoute&&!resourceRoute&&!savedRoute&&!download&&!path.startsWith('/api/gauge/v1/')&&!['/api/gauge/accountant','/api/gauge/privacy/journal','/api/gauge/receivables','/api/gauge/receivables.csv','/api/gauge/state','/api/gauge/clients','/api/gauge/report.csv','/api/gauge/rates/explain','/api/gauge/keys/revoke','/api/gauge/audit','/api/gauge/audit/export','/api/gauge/audit/verify','/app/audit'].includes(path)&&!page)||(historyRoute&&!kinds.includes(historyRoute[1] as Kind)))return new Response('Not found',{status:404,headers})
 const env=runtimeBindings(original)
 // A refused page form shows its reason on the page it came from; programs keep the JSON answer.
 let refused:{a:Actor,action:string}|undefined
 try{
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  // CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032: a scoped key can read aggregate state and revoke only itself.
  const bearer=request.headers.get('authorization')
  if(path==='/api/gauge/keys/revoke'){
   if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,allow:'POST'}})
   const token=bearer?.match(/^Bearer (\S{1,200})$/)?.[1];need(token,'Send Authorization: Bearer <key>',401)
   await revokePresentedKey(env,token)
   return new Response(null,{status:200,headers})
  }
  if(bearer!==null){
   if(path.startsWith('/api/gauge/v1/'))return await appKeyRequest(env,request,url,headers)
   need(path==='/api/gauge/state','API keys read only /api/gauge/state',403)
   if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Method not allowed'},{status:405,headers:{...headers,allow:'GET, HEAD'}})
   const token=bearer.match(/^Bearer (\S{1,200})$/)?.[1];need(token,'Send Authorization: Bearer <key>',401)
   return Response.json(await utilizationKeyRead(env,token,url.searchParams.get('from'),url.searchParams.get('to')),{headers})
  }
  const session=await operatorAuth(env).getSession(request);if(!session&&path.startsWith('/app'))return new Response(null,{status:303,headers:{...headers,location:'/signin?returnTo=%2Fapp'}});need(session,'Sign in required',401)
  const a=await actor(env,session)
  if(a.role==='none'&&path==='/app'&&request.method==='GET')return new Response(null,{status:303,headers:{...headers,location:'/app/client-projects'}})
  await fence(env,a)
  if(a.role==='resource-manager')need(mutation||path==='/api/gauge/state'||resourceRoute||path==='/app'||path==='/app/capacity','Resource managers read scoped planning only',403)
  if(a.role==='accountant')need(!mutation&&(path==='/api/gauge/accountant'||path==='/app'||path==='/app/review'||download?.[1]==='handoffs'||download?.[1]==='closes'),'Accountants read reviewed accounting exports and close evidence only',403)
  if(a.role==='agent')need(mutation||historyRoute||path==='/api/gauge/state'||path==='/app'||path==='/app/review','Agent read door is outside its purpose',403)
  const allowed=mutation?['POST']:['GET','HEAD']
  if(!allowed.includes(request.method))return Response.json({error:'Method not allowed'},{status:405,headers:{...headers,allow:allowed.join(', ')}})
  if(path==='/api/gauge/accountant')return Response.json(await accountantInputs(env,a),{headers})
  if(mutation) {
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   need(Number(request.headers.get('content-length')??0)<=8*1024*1024,'Request too large',413)
   const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;if(reader){for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();need(false,'Request too large',413)}chunks.push(value)}}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}const parsed=new Request(request.url,{method:request.method,headers:request.headers,body:bytes})
   let input:any
   if(request.headers.get('content-type')?.includes('application/json'))input=await parsed.json()
   else { const form=await parsed.formData();if(path==='/app/action')refused={a,action:String(form.get('action')??'')};input=formInput(form);if(input.package)input.package=JSON.parse(input.package);else if(input.manifest){const files:Record<string,string>={},archives:any[]=[];let workbook:undefined|{base64:string};for(const file of form.getAll('files'))if(file instanceof File&&file.size){if(file.name==='time.xlsx'){need(!workbook,'Supply only one time.xlsx');need(file.size<=2*1024*1024,'Workbook is limited to 2 MiB');workbook={base64:Buffer.from(await file.arrayBuffer()).toString('base64')}}else if(file.type==='application/pdf')archives.push({name:file.name,mediaType:file.type,base64:Buffer.from(await file.arrayBuffer()).toString('base64')});else{need(file.name.endsWith('.csv')||['forecast.json','forecast-metadata.json','finance.json'].includes(file.name),'Use CSV, time.xlsx, forecast.json, forecast-metadata.json, finance.json or PDF source files');need(!Object.hasOwn(files,file.name),'Duplicate source filename');files[file.name]=await file.text()}}input.package={manifest:JSON.parse(input.manifest),files,archives,...(workbook?{workbook}:{})}} }
   const action=String(input.action??'');need(a.role!=='resource-manager'||resourceActions.includes(action),'Resource managers plan permitted staffing only',403);let result:any; if(action==='invite'){need(a.role==='owner','Only the owner invites operators',403);result=await operatorAuth(env).invite(request,{email:input.email,displayName:input.displayName,role:'member'})}else if(action.startsWith('appkey:'))result=await appKeyCommand(env,a,action,input);else if(action.startsWith('apikey:'))result=await apiKeyCommand(env,a,action,input);else result=publicResult(await command(env,a,action,input))
   if(path.startsWith('/api/'))return Response.json(result,{headers})
   if(action==='milestone:release-review'){const row=await get(env,'milestones',result.id),review=row.value.delivery.clientReviews.at(-1);return clientDeliveryPage(`<section class="g-card"><h2>Share this review key once</h2><p>Share the link and key only with ${escapeHtml(review.contact)}. Gauge sends no notification.</p><p><a href="/app/client-milestones/${escapeHtml(row.id)}/${escapeHtml(review.id)}">Open client delivery review</a></p>${result.token?`<label class="g-field"><span>Review key (shown once)</span><input readonly value="${escapeHtml(result.token)}"></label>`:'<p>The key was already shown. Revoke this release and create another if it was lost.</p>'}<p><a href="/app/engagements?edit=${escapeHtml(row.value.engagementId)}">Return to delivery</a></p></section>`)}
   // A new key's value shows once, on the page that created it; the redirect pattern would lose it.
   if(action==='apikey:create'||action==='appkey:create')return new Response(await appPage(env,a,'access',{createdKey:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='invoice:queue-mail'||action==='invoice:delivery-readback'){const delivery=await get(env,'commercialEvents',result.id);return new Response(null,{status:303,headers:{...headers,location:'/api/gauge/invoice-documents/'+encodeURIComponent(delivery.value.invoiceId)}})}
   if(['providerJob:dispatch','providerJob:cancel','providerJob:requeue','providerJob:resume-refused'].includes(action)&&result.id){const job=await get(env,'providerJobs',result.id);if(job.value.source.kind==='invoiceAccess'){const release=await get(env,'invoiceAccess',job.value.source.id);return new Response(null,{status:303,headers:{...headers,location:'/api/gauge/invoice-documents/'+encodeURIComponent(release.value.invoiceId)}})}}
   if(action.startsWith('provider:')||action.startsWith('providerJob:'))return new Response(null,{status:303,headers:{...headers,location:'/app/access#provider-connections'}})
   if(action==='invoice:release'||action==='invoice:revoke-access'){const released=await get(env,'invoiceAccess',result.id);return new Response(null,{status:303,headers:{...headers,location:'/api/gauge/invoice-documents/'+encodeURIComponent(released.value.invoiceId)}})}
   if(action==='estimate:compare')return new Response(await appPage(env,a,'engagements',{estimate:input.afterId,estimateComparison:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action.startsWith('providerSync:'))return new Response(null,{status:303,headers:{...headers,location:'/app/access#provider-health'}})
   if(action.startsWith('commercial:')){const estimateId=input.estimateId??(await get(env,'commercialProposals',input.id)).value.estimateId;return new Response(null,{status:303,headers:{...headers,location:`/app/engagements?estimate=${encodeURIComponent(estimateId)}#commercial-proposals`}})}
   if(action==='estimate:convert')return new Response(null,{status:303,headers:{...headers,location:`/app/engagements?edit=${encodeURIComponent(result.id)}`}})
   if(action==='estimate:save'||action==='estimate:approve'||action==='estimate:withdraw')return new Response(null,{status:303,headers:{...headers,location:`/app/engagements?estimate=${encodeURIComponent(input.id??result.id)}#estimates`}})
   if(action==='floatAdopt:deletion-preview')return new Response(await appPage(env,a,'imports',{floatDeletionPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='floatAdopt:preview')return new Response(await appPage(env,a,'imports',{floatAdoptionPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='kantataAdopt:preview')return new Response(await appPage(env,a,'imports',{nativeAdoptionPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='kantata:preview'||action==='kantata:report')return new Response(await appPage(env,a,'imports',{[action==='kantata:preview'?'kantataPreview':'kantataReport']:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='case:preview-close')return new Response(await appPage(env,a,'review',{caseClosePreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='privacy:preview')return new Response(await appPage(env,a,'access',{privacyPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='field:import-preview')return new Response(await appPage(env,a,'imports',{customPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='period:preview')return new Response(await appPage(env,a,'review',{closePreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='retainer:preview')return new Response(await appPage(env,a,'engagements',{edit:result.engagementId,retainerPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='delivery:preview')return new Response(await appPage(env,a,'engagements',{edit:result.engagementId,deliveryPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='staffing:preview')return new Response(await appPage(env,a,'capacity',{edit:input.id,from:result.parts[0].from,schedulePreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='import:rocketlane:cutover-preview')return new Response(await appPage(env,a,'imports',{rocketlaneCutover:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(/^import:[a-z]+:(preview|report)$/.test(action))return new Response(await appPage(env,a,'imports',{[action.endsWith(':preview')?'moveInPreview':'moveInReport']:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='import:preview')return new Response(await appPage(env,a,'imports',{preview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='template:apply')return new Response(null,{status:303,headers:{...headers,location:`/app/engagements?edit=${encodeURIComponent(input.engagementId)}&saved=1#delivery-schedule`}})
   if(action==='target:set')return new Response(null,{status:303,headers:{...headers,location:`/app/capacity?${new URLSearchParams({saved:'1',from:String(input.utilizationFrom??''),utilizationFrom:String(input.utilizationFrom??''),utilizationTo:String(input.utilizationTo??'')})}#performance`}})
   if((action.startsWith('retainer:')||action==='agency:calendar')&&input.engagementId)return new Response(null,{status:303,headers:{...headers,location:`/app/engagements?edit=${encodeURIComponent(input.engagementId)}&saved=1#retainers`}})
   // A form may name the page it sits on (the Staffing panel's approvals): the result shows there.
   const back=typeof input.page==='string'&&tabsFor(a).includes(input.page)?input.page:sectionFor(action)
   return new Response(null,{status:303,headers:{...headers,location:`/app/${back}?saved=1`}})
  }
  if(invoiceDocumentRoute)return await invoiceDocumentResponse(env,a,url,invoiceDocumentRoute[2],invoiceDocumentRoute[1]==='invoice-documents')
  if(path==='/api/gauge/privacy/journal')return Response.json(await privacyJournal(env,a),{headers:{...headers,'content-disposition':'attachment; filename="gauge-erasure-journal.json"'}})
  if(savedRoute)return Response.json(await savedRead(env,a,savedRoute[1]),{headers})
  if(resourceRoute)return Response.json(await resourceCandidates(env,a,await get(env,'resourceRequests',resourceRoute[1])),{headers})
  if(historyRoute){const k=kind(historyRoute[1]),id=historyRoute[2];await get(env,k,id);const data=await visible(env,a);need(data[k].some(r=>r.id===id),'This record is not visible to you',403);const history=(await env.DB.prepare('SELECT revision,data,actor,action,at FROM g_history WHERE kind=? AND record_id=? ORDER BY id').bind(k,id).all<any>()).results.map(h=>({revision:h.revision,value:redact(a,k,JSON.parse(h.data)),actor:h.actor,action:h.action,at:h.at}));await fence(env,a);if(request.headers.get('accept')?.includes('text/html'))return new Response(await historyPage(env,a,k,id,data,history),{headers:{...headers,'content-type':'text/html; charset=utf-8',vary:'accept'}});return Response.json({id,kind:k,history},{headers:{...headers,vary:'accept'}})}
  if(download?.[1]==='closes'){need(finance(a)||a.role==='accountant','Finance access required',403);const close=await get(env,'periodCloses',download[2]);await fence(env,a);return Response.json(a.role==='accountant'?accountantProjection(close):close,{headers:{...headers,'content-disposition':`attachment; filename="gauge-close-${close.value.month}.json"`}})}
  if(download?.[1]==='handoffs')return await handoffDownload(env,a,download[2])
  if(download?.[1]==='files'){const id=download[2];const file=await env.DB.prepare('SELECT *,hex(bytes) AS bytes_hex FROM g_files WHERE id=?').bind(id).first<any>();need(file,'Attachment not found',404);const expense=await get(env,'expenses',file.expense_id);await access(env,a,expense.value.engagementId);need(finance(a)||a.personId===expense.value.personId,'Attachment access requires finance or ownership',403);await fence(env,a);return new Response(Buffer.from(file.bytes_hex,'hex'),{headers:{...headers,'content-type':'application/octet-stream','content-disposition':`attachment; filename="receipt-${id}"`}})}
  if(download?.[1]==='packets'){need(finance(a),'Finance access required',403);const packet=await get(env,'packets',download[2]);need(packet.value.status==='approved','Approve the exact packet before downloading',409);const tx=new Transaction(env,a);tx.observe('packets',packet);tx.sql('INSERT INTO g_exports(packet_id,actor,exported_at) VALUES(?,?,?) ON CONFLICT(packet_id) DO NOTHING',packet.id,a.session.operator.id,Date.now());tx.audit('packet:export','packets',packet.id,{revision:packet.revision,title:packet.value.title??null});await tx.commit();return new Response(packet.value.artifact,{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="gauge-${packet.id}.csv"`}})}
  if(download?.[1]==='archives'){need(finance(a),'Finance access required',403);const archive=await get(env,'archives',download[2]);await fence(env,a);return new Response(Buffer.from(archive.value.base64,'base64'),{headers:{...headers,'content-type':archive.value.mediaType==='application/json'?'application/json':'application/octet-stream','content-disposition':archive.value.mediaType==='application/json'?'attachment; filename=forecast-source.json':'attachment; filename=historical-document.pdf'}})}
  if(download?.[1]==='imports')return Response.json((await env.DB.prepare("SELECT 1 FROM ik_jobs WHERE id=? AND destination='gauge-kantata'").bind(download[2]).first())?await kantataCommand(env,a,'kantata:originals',{id:download[2]}):await importCommand(env,a,'import:originals',{id:download[2]}),{headers:{...headers,'content-disposition':`attachment; filename="gauge-import-${download[2]}.json"`}})
  if(path==='/api/gauge/rates/explain'){const q=Object.fromEntries(['personId','engagementId','service','date','taskId','phaseKey'].map(k=>[k,url.searchParams.get(k)??''])) as any;const result=await explainRate(env,a,q);await fence(env,a);return Response.json(result,{headers})}
  // SETUP-002 / SETUP-007 / SETUP-008: finance searches clients by name, PO or external ID.
  if(path==='/api/gauge/clients')return Response.json(await clientSearchRead(env,a,url.searchParams.get('q')),{headers})
  if(path==='/api/gauge/receivables'||path==='/api/gauge/receivables.csv'){
   const report=await receivablesRead(env,a,url.searchParams.get('asOf'),url.searchParams.get('clientId'))
   if(path.endsWith('.csv')){
    need(url.searchParams.get('fingerprint')===report.fingerprint,'Receivables changed; refresh the statement before exporting',409)
    return new Response(receivablesCsv(report),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="gauge-client-statements.csv"'}})
   }
   return Response.json(report,{headers})
  }
  if(path==='/api/gauge/state'){const now=new Date(),from=url.searchParams.get('from')??now.toISOString().slice(0,10),to=url.searchParams.get('to')??from;const report=await reports(env,a,from,to,undefined,url.searchParams.get('asOf'),{...customOptions(url,a),portfolioGroup:url.searchParams.get('customProfitGroup')?'custom:'+url.searchParams.get('customProfitGroup'):url.searchParams.get('portfolioGroup'),portfolioClient:url.searchParams.get('portfolioClient'),portfolioProject:url.searchParams.get('portfolioProject'),portfolioTeam:url.searchParams.get('portfolioTeam'),portfolioService:url.searchParams.get('portfolioService'),portfolioLead:url.searchParams.get('portfolioLead'),portfolioPerson:url.searchParams.get('portfolioPerson')});return Response.json(a.role==='resource-manager'?{data:report.data,capacity:report.capacity,resourceDemand:report.resourceDemand,from,to,agency:report.agency}:report,{headers})}
  if(path==='/api/gauge/report.csv'){
   const report=await reports(env,a,url.searchParams.get('from')??'',url.searchParams.get('to')??'',undefined,url.searchParams.get('asOf'),{...customOptions(url,a),portfolioGroup:url.searchParams.get('customProfitGroup')?'custom:'+url.searchParams.get('customProfitGroup'):url.searchParams.get('portfolioGroup'),portfolioClient:url.searchParams.get('portfolioClient'),portfolioProject:url.searchParams.get('portfolioProject'),portfolioTeam:url.searchParams.get('portfolioTeam'),portfolioService:url.searchParams.get('portfolioService'),portfolioLead:url.searchParams.get('portfolioLead'),portfolioPerson:url.searchParams.get('portfolioPerson')})
   need(url.searchParams.get('fingerprint')===report.fingerprint,'Report inputs changed; refresh the report before exporting',409)
   await fence(env,a);return new Response(reportCsv(report),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="gauge-report-calculations.csv"'}})
  }
  // GOVERN-005 / GOVERN-011: finance and the owner search, export and verify the business audit.
  if(path==='/api/gauge/audit')return Response.json(await auditSearch(env,a,auditQuery(url)),{headers})
  if(path==='/api/gauge/audit/export')return Response.json(await auditExport(env,a),{headers:{...headers,'content-disposition':'attachment; filename="gauge-audit.json"'}})
  if(path==='/api/gauge/audit/verify')return Response.json(await auditVerify(env,a,url.searchParams.get('seq'),url.searchParams.get('hash')),{headers})
  if(path==='/app/audit')return new Response(await auditPage(env,a,{...auditQuery(url),checkSeq:url.searchParams.get('checkSeq')||null,checkHash:url.searchParams.get('checkHash')||null}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
  if(page)return new Response(await appPage(env,a,page,{estimate:url.searchParams.get('estimate'),...customOptions(url,a),asOf:url.searchParams.get('asOf'),portfolioGroup:url.searchParams.get('customProfitGroup')?'custom:'+url.searchParams.get('customProfitGroup'):url.searchParams.get('portfolioGroup'),portfolioClient:url.searchParams.get('portfolioClient'),portfolioProject:url.searchParams.get('portfolioProject'),portfolioTeam:url.searchParams.get('portfolioTeam'),portfolioService:url.searchParams.get('portfolioService'),portfolioLead:url.searchParams.get('portfolioLead'),portfolioPerson:url.searchParams.get('portfolioPerson'),sheetView:url.searchParams.get('sheetView'),sheetFrom:url.searchParams.get('sheetFrom'),sheetPerson:url.searchParams.get('sheetPerson'),copyTime:url.searchParams.get('copyTime'),favorite:url.searchParams.get('favorite'),taskView:url.searchParams.get('taskView'),taskClient:url.searchParams.get('taskClient'),taskProject:url.searchParams.get('taskProject'),schedulePerson:url.searchParams.get('schedulePerson'),scheduleRole:url.searchParams.get('scheduleRole'),scheduleSkill:url.searchParams.get('scheduleSkill'),from:url.searchParams.get('from'),to:url.searchParams.get('to'),edit:url.searchParams.get('edit'),clientSearch:url.searchParams.get('clientSearch'),opportunity:url.searchParams.get('opportunity'),calculation:url.searchParams.get('calculation'),view:url.searchParams.get('view'),resourceRequest:url.searchParams.get('resourceRequest'),utilizationFrom:url.searchParams.get('utilizationFrom'),utilizationTo:url.searchParams.get('utilizationTo'),utilizationGroup:url.searchParams.get('utilizationGroup'),performanceGroup:url.searchParams.get('performanceGroup'),explainTask:url.searchParams.get('explainTask'),explainPerson:url.searchParams.get('explainPerson'),explainEngagement:url.searchParams.get('explainEngagement'),explainService:url.searchParams.get('explainService'),explainDate:url.searchParams.get('explainDate'),saved:url.searchParams.get('saved')==='1'}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
  return new Response('Not found',{status:404,headers})
 }catch(error){
  const message=error instanceof Fault?error.message:error instanceof Error&&/IMPORT_|NATIVE_EDIT|SOURCE_|PLAN_|RECONCIL|CONFLICT/.test(error.message)?error.message:'Operation refused: data changed, overlaps, dependencies or unavailable storage. Reload and review before retrying.',status=error instanceof Fault?error.status:409
  if(refused){const section=tabsFor(refused.a).includes(sectionFor(refused.action))?sectionFor(refused.action):'review';return new Response(await appPage(env,refused.a,section,{error:message}),{status,headers:{...headers,'content-type':'text/html; charset=utf-8'}})}
  return Response.json({error:message},{status,headers})
 }
}
