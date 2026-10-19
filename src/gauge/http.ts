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
import { apiKeyCommand, utilizationKeyRead, revokePresentedKey } from './api-keys'
// The page an /app/action form belongs to: its result (or refusal) shows there.
const sectionFor=(action:string)=>action.startsWith('staffing:')||action.startsWith('resource:')||action==='save:resourceRequests'?'capacity':action.startsWith('proposal:')?'review':action.startsWith('import:')?'imports':action.startsWith('packet:')||action.startsWith('handoff:')?'billing':action.startsWith('expense:')?'expenses':action.startsWith('time:')||action.startsWith('timer:')?'time':action==='grant'||action==='invite'||action.startsWith('apikey:')||action.startsWith('approval:')?'access':action==='save:rates'||action==='rate:entry'?'rates':['save:calendars','save:leave','save:staffing'].includes(action)?'capacity':'engagements'
const headers={'cache-control':'no-store','referrer-policy':'strict-origin','x-content-type-options':'nosniff','x-robots-tag':'noindex','content-security-policy':"default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}
export async function gaugeResponse(request:Request,original:Bindings):Promise<Response|null> {
 const url=new URL(request.url),path=url.pathname;if(path!=='/api/gauge'&&!path.startsWith('/api/gauge/')&&path!=='/app'&&!path.startsWith('/app/'))return null
 // Resolve complete declared paths before admitting a command or reading its body.
 const mutation=path==='/api/gauge/command'||path==='/app/action'
 const historyRoute=path.match(/^\/api\/gauge\/history\/([^/%]+)\/([^/%]+)$/)
 const resourceRoute=path.match(/^\/api\/gauge\/resources\/([^/%]+)$/)
 const download=path.match(/^\/api\/gauge\/(files|packets|archives|imports|handoffs)\/([^/%]+)$/)
 const page=path==='/app'?'review':path.match(/^\/app\/(review|engagements|time|expenses|capacity|rates|billing|imports|access)$/)?.[1]
 if((!mutation&&!historyRoute&&!resourceRoute&&!download&&!['/api/gauge/state','/api/gauge/report.csv','/api/gauge/rates/explain','/api/gauge/keys/revoke'].includes(path)&&!page)||(historyRoute&&!kinds.includes(historyRoute[1] as Kind)))return new Response('Not found',{status:404,headers})
 const env=runtimeBindings(original)
 // A refused page form shows its reason on the page it came from; programs keep the JSON answer.
 let refused:{a:Actor,action:string}|undefined
 try{
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  // CONNECT-020: a scoped key can read aggregate state and revoke only itself.
  const bearer=request.headers.get('authorization')
  if(path==='/api/gauge/keys/revoke'){
   if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,allow:'POST'}})
   const token=bearer?.match(/^Bearer (\S{1,200})$/)?.[1];need(token,'Send Authorization: Bearer <key>',401)
   await revokePresentedKey(env,token)
   return new Response(null,{status:200,headers})
  }
  if(bearer!==null){
   need(path==='/api/gauge/state','API keys read only /api/gauge/state',403)
   if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Method not allowed'},{status:405,headers:{...headers,allow:'GET, HEAD'}})
   const token=bearer.match(/^Bearer (\S{1,200})$/)?.[1];need(token,'Send Authorization: Bearer <key>',401)
   return Response.json(await utilizationKeyRead(env,token,url.searchParams.get('from'),url.searchParams.get('to')),{headers})
  }
  const session=await operatorAuth(env).getSession(request);if(!session&&path.startsWith('/app'))return new Response(null,{status:303,headers:{...headers,location:'/signin?returnTo=%2Fapp'}});need(session,'Sign in required',401)
  const a=await actor(env,session);await fence(env,a)
  const allowed=mutation?['POST']:['GET','HEAD']
  if(!allowed.includes(request.method))return Response.json({error:'Method not allowed'},{status:405,headers:{...headers,allow:allowed.join(', ')}})
  if(mutation) {
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   need(Number(request.headers.get('content-length')??0)<=8*1024*1024,'Request too large',413)
   const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;if(reader){for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();need(false,'Request too large',413)}chunks.push(value)}}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}const parsed=new Request(request.url,{method:request.method,headers:request.headers,body:bytes})
   let input:any
   if(request.headers.get('content-type')?.includes('application/json'))input=await parsed.json()
   else { const form=await parsed.formData();if(path==='/app/action')refused={a,action:String(form.get('action')??'')};input=formInput(form);if(input.package)input.package=JSON.parse(input.package);else if(input.manifest){const files:Record<string,string>={},archives:any[]=[];for(const file of form.getAll('files'))if(file instanceof File&&file.size){if(file.type==='application/pdf')archives.push({name:file.name,mediaType:file.type,base64:Buffer.from(await file.arrayBuffer()).toString('base64')});else{need(file.name.endsWith('.csv'),'Use CSV or PDF source files');files[file.name]=await file.text()}}input.package={manifest:JSON.parse(input.manifest),files,archives}} }
   const action=String(input.action??'');let result:any; if(action==='invite'){need(a.role==='owner','Only the owner invites operators',403);result=await operatorAuth(env).invite(request,{email:input.email,displayName:input.displayName,role:'member'})}else if(action.startsWith('apikey:'))result=await apiKeyCommand(env,a,action,input);else result=publicResult(await command(env,a,action,input))
   if(path.startsWith('/api/'))return Response.json(result,{headers})
   // A new key's value shows once, on the page that created it; the redirect pattern would lose it.
   if(action==='apikey:create')return new Response(await appPage(env,a,'access',{createdKey:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='retainer:preview')return new Response(await appPage(env,a,'engagements',{edit:result.engagementId,retainerPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='delivery:preview')return new Response(await appPage(env,a,'engagements',{edit:result.engagementId,deliveryPreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='staffing:preview')return new Response(await appPage(env,a,'capacity',{edit:input.id,from:result.parts[0].from,schedulePreview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='import:preview')return new Response(await appPage(env,a,'imports',{preview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   if(action==='template:apply')return new Response(null,{status:303,headers:{...headers,location:`/app/engagements?edit=${encodeURIComponent(input.engagementId)}&saved=1#delivery-schedule`}})
   if(action==='target:set')return new Response(null,{status:303,headers:{...headers,location:`/app/capacity?${new URLSearchParams({saved:'1',from:String(input.utilizationFrom??''),utilizationFrom:String(input.utilizationFrom??''),utilizationTo:String(input.utilizationTo??'')})}#performance`}})
   if((action.startsWith('retainer:')||action==='agency:calendar')&&input.engagementId)return new Response(null,{status:303,headers:{...headers,location:`/app/engagements?edit=${encodeURIComponent(input.engagementId)}&saved=1#retainers`}})
   // A form may name the page it sits on (the Staffing panel's approvals): the result shows there.
   const back=typeof input.page==='string'&&tabsFor(a).includes(input.page)?input.page:sectionFor(action)
   return new Response(null,{status:303,headers:{...headers,location:`/app/${back}?saved=1`}})
  }
  if(resourceRoute)return Response.json(await resourceCandidates(env,a,await get(env,'resourceRequests',resourceRoute[1])),{headers})
  if(historyRoute){const k=kind(historyRoute[1]),id=historyRoute[2];await get(env,k,id);const data=await visible(env,a);need(data[k].some(r=>r.id===id),'This record is not visible to you',403);const history=(await env.DB.prepare('SELECT revision,data,actor,action,at FROM g_history WHERE kind=? AND record_id=? ORDER BY id').bind(k,id).all<any>()).results.map(h=>({revision:h.revision,value:redact(a,k,JSON.parse(h.data)),actor:h.actor,action:h.action,at:h.at}));await fence(env,a);if(request.headers.get('accept')?.includes('text/html'))return new Response(await historyPage(env,a,k,id,data,history),{headers:{...headers,'content-type':'text/html; charset=utf-8',vary:'accept'}});return Response.json({id,kind:k,history},{headers:{...headers,vary:'accept'}})}
  if(download?.[1]==='handoffs')return await handoffDownload(env,a,download[2])
  if(download?.[1]==='files'){const id=download[2];const file=await env.DB.prepare('SELECT *,hex(bytes) AS bytes_hex FROM g_files WHERE id=?').bind(id).first<any>();need(file,'Attachment not found',404);const expense=await get(env,'expenses',file.expense_id);await access(env,a,expense.value.engagementId);need(finance(a)||a.personId===expense.value.personId,'Attachment access requires finance or ownership',403);await fence(env,a);return new Response(Buffer.from(file.bytes_hex,'hex'),{headers:{...headers,'content-type':'application/octet-stream','content-disposition':`attachment; filename="receipt-${id}"`}})}
  if(download?.[1]==='packets'){need(finance(a),'Finance access required',403);const packet=await get(env,'packets',download[2]);need(packet.value.status==='approved','Approve the exact packet before downloading',409);const tx=new Transaction(env,a);tx.observe('packets',packet);tx.sql('INSERT INTO g_exports(packet_id,actor,exported_at) VALUES(?,?,?) ON CONFLICT(packet_id) DO NOTHING',packet.id,a.session.operator.id,Date.now());await tx.commit();return new Response(packet.value.artifact,{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="gauge-${packet.id}.csv"`}})}
  if(download?.[1]==='archives'){need(finance(a),'Finance access required',403);const archive=await get(env,'archives',download[2]);await fence(env,a);return new Response(Buffer.from(archive.value.base64,'base64'),{headers:{...headers,'content-type':'application/octet-stream','content-disposition':'attachment; filename=historical-document.pdf'}})}
  if(download?.[1]==='imports')return Response.json(await importCommand(env,a,'import:originals',{id:download[2]}),{headers:{...headers,'content-disposition':`attachment; filename="gauge-import-${download[2]}.json"`}})
  if(path==='/api/gauge/rates/explain'){const q=Object.fromEntries(['personId','engagementId','service','date'].map(k=>[k,url.searchParams.get(k)??''])) as any;const result=await explainRate(env,a,q);await fence(env,a);return Response.json(result,{headers})}
  if(path==='/api/gauge/state'){const now=new Date(),from=url.searchParams.get('from')??now.toISOString().slice(0,10),to=url.searchParams.get('to')??from;return Response.json(await reports(env,a,from,to),{headers})}
  if(path==='/api/gauge/report.csv'){
   const report=await reports(env,a,url.searchParams.get('from')??'',url.searchParams.get('to')??'')
   need(url.searchParams.get('fingerprint')===report.fingerprint,'Report inputs changed; refresh the report before exporting',409)
   await fence(env,a);return new Response(reportCsv(report),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="gauge-report-calculations.csv"'}})
  }
  if(page)return new Response(await appPage(env,a,page,{sheetView:url.searchParams.get('sheetView'),sheetFrom:url.searchParams.get('sheetFrom'),sheetPerson:url.searchParams.get('sheetPerson'),copyTime:url.searchParams.get('copyTime'),favorite:url.searchParams.get('favorite'),taskView:url.searchParams.get('taskView'),taskClient:url.searchParams.get('taskClient'),taskProject:url.searchParams.get('taskProject'),schedulePerson:url.searchParams.get('schedulePerson'),scheduleRole:url.searchParams.get('scheduleRole'),scheduleSkill:url.searchParams.get('scheduleSkill'),from:url.searchParams.get('from'),to:url.searchParams.get('to'),edit:url.searchParams.get('edit'),opportunity:url.searchParams.get('opportunity'),calculation:url.searchParams.get('calculation'),view:url.searchParams.get('view'),resourceRequest:url.searchParams.get('resourceRequest'),utilizationFrom:url.searchParams.get('utilizationFrom'),utilizationTo:url.searchParams.get('utilizationTo'),utilizationGroup:url.searchParams.get('utilizationGroup'),performanceGroup:url.searchParams.get('performanceGroup'),explainPerson:url.searchParams.get('explainPerson'),explainEngagement:url.searchParams.get('explainEngagement'),explainService:url.searchParams.get('explainService'),explainDate:url.searchParams.get('explainDate'),saved:url.searchParams.get('saved')==='1'}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
  return new Response('Not found',{status:404,headers})
 }catch(error){
  const message=error instanceof Fault?error.message:error instanceof Error&&/IMPORT_|NATIVE_EDIT|SOURCE_|PLAN_|RECONCIL|CONFLICT/.test(error.message)?error.message:'Operation refused: data changed, overlaps, dependencies or unavailable storage. Reload and review before retrying.',status=error instanceof Fault?error.status:409
  if(refused){const section=tabsFor(refused.a).includes(sectionFor(refused.action))?sectionFor(refused.action):'review';return new Response(await appPage(env,refused.a,section,{error:message}),{status,headers:{...headers,'content-type':'text/html; charset=utf-8'}})}
  return Response.json({error:message},{status,headers})
 }
}
