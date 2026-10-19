import { Buffer } from 'node:buffer'
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server'
import { type Actor, actor, access, finance, fence, get, Transaction } from './store'
import { need, Fault, kind, kinds, type Kind } from './model'
import { command, publicResult } from './commands'
import { redact, reports, visible } from './reports'
import { appPage, historyPage, tabsFor } from './ui'
import { importCommand } from './imports'
import { formInput } from './form-input'
// The page an /app/action form belongs to: its result (or refusal) shows there.
const sectionFor=(action:string)=>action.startsWith('proposal:')?'review':action.startsWith('import:')?'imports':action.startsWith('packet:')?'billing':action.startsWith('expense:')?'expenses':action.startsWith('time:')||action.startsWith('timer:')?'time':action==='grant'||action==='invite'?'access':action==='save:rates'?'rates':['save:calendars','save:leave','save:staffing'].includes(action)?'capacity':'engagements'
const headers={'cache-control':'no-store','referrer-policy':'strict-origin','x-content-type-options':'nosniff','x-robots-tag':'noindex','content-security-policy':"default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}
export async function gaugeResponse(request:Request,original:Bindings):Promise<Response|null> {
 const url=new URL(request.url),path=url.pathname;if(path!=='/api/gauge'&&!path.startsWith('/api/gauge/')&&path!=='/app'&&!path.startsWith('/app/'))return null
 // Resolve complete declared paths before admitting a command or reading its body.
 const mutation=path==='/api/gauge/command'||path==='/app/action'
 const historyRoute=path.match(/^\/api\/gauge\/history\/([^/%]+)\/([^/%]+)$/)
 const download=path.match(/^\/api\/gauge\/(files|packets|archives|imports)\/([^/%]+)$/)
 const page=path==='/app'?'review':path.match(/^\/app\/(review|engagements|time|expenses|capacity|rates|billing|imports|access)$/)?.[1]
 if((!mutation&&!historyRoute&&!download&&path!=='/api/gauge/state'&&!page)||(historyRoute&&!kinds.includes(historyRoute[1] as Kind)))return new Response('Not found',{status:404,headers})
 const env=runtimeBindings(original)
 // A refused page form shows its reason on the page it came from; programs keep the JSON answer.
 let refused:{a:Actor,action:string}|undefined
 try{
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
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
   const action=String(input.action??'');let result:any; if(action==='invite'){need(a.role==='owner','Only the owner invites operators',403);result=await operatorAuth(env).invite(request,{email:input.email,displayName:input.displayName,role:'member'})}else result=publicResult(await command(env,a,action,input))
   if(path.startsWith('/api/'))return Response.json(result,{headers})
   if(action==='import:preview')return new Response(await appPage(env,a,'imports',{preview:result}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
   // A form may name the page it sits on (the Staffing panel's approvals): the result shows there.
   const back=typeof input.page==='string'&&tabsFor(a).includes(input.page)?input.page:sectionFor(action)
   return new Response(null,{status:303,headers:{...headers,location:`/app/${back}?saved=1`}})
  }
  if(historyRoute){const k=kind(historyRoute[1]),id=historyRoute[2];await get(env,k,id);const data=await visible(env,a);need(data[k].some(r=>r.id===id),'This record is not visible to you',403);const history=(await env.DB.prepare('SELECT revision,data,actor,action,at FROM g_history WHERE kind=? AND record_id=? ORDER BY id').bind(k,id).all<any>()).results.map(h=>({revision:h.revision,value:redact(a,k,JSON.parse(h.data)),actor:h.actor,action:h.action,at:h.at}));await fence(env,a);if(request.headers.get('accept')?.includes('text/html'))return new Response(await historyPage(env,a,k,id,data,history),{headers:{...headers,'content-type':'text/html; charset=utf-8',vary:'accept'}});return Response.json({id,kind:k,history},{headers:{...headers,vary:'accept'}})}
  if(download?.[1]==='files'){const id=download[2];const file=await env.DB.prepare('SELECT *,hex(bytes) AS bytes_hex FROM g_files WHERE id=?').bind(id).first<any>();need(file,'Attachment not found',404);const expense=await get(env,'expenses',file.expense_id);await access(env,a,expense.value.engagementId);need(finance(a)||a.personId===expense.value.personId,'Attachment access requires finance or ownership',403);await fence(env,a);return new Response(Buffer.from(file.bytes_hex,'hex'),{headers:{...headers,'content-type':'application/octet-stream','content-disposition':`attachment; filename="receipt-${id}"`}})}
  if(download?.[1]==='packets'){need(finance(a),'Finance access required',403);const packet=await get(env,'packets',download[2]);need(packet.value.status==='approved','Approve the exact packet before downloading',409);const tx=new Transaction(env,a);tx.observe('packets',packet);tx.sql('INSERT INTO g_exports(packet_id,actor,exported_at) VALUES(?,?,?) ON CONFLICT(packet_id) DO NOTHING',packet.id,a.session.operator.id,Date.now());await tx.commit();return new Response(packet.value.artifact,{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="gauge-${packet.id}.csv"`}})}
  if(download?.[1]==='archives'){need(finance(a),'Finance access required',403);const archive=await get(env,'archives',download[2]);await fence(env,a);return new Response(Buffer.from(archive.value.base64,'base64'),{headers:{...headers,'content-type':'application/octet-stream','content-disposition':'attachment; filename=historical-document.pdf'}})}
  if(download?.[1]==='imports')return Response.json(await importCommand(env,a,'import:originals',{id:download[2]}),{headers:{...headers,'content-disposition':`attachment; filename="gauge-import-${download[2]}.json"`}})
  if(path==='/api/gauge/state'){const now=new Date(),from=url.searchParams.get('from')??now.toISOString().slice(0,10),to=url.searchParams.get('to')??from;return Response.json(await reports(env,a,from,to),{headers})}
  if(page)return new Response(await appPage(env,a,page,{from:url.searchParams.get('from'),to:url.searchParams.get('to'),edit:url.searchParams.get('edit'),opportunity:url.searchParams.get('opportunity'),view:url.searchParams.get('view'),saved:url.searchParams.get('saved')==='1'}),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
  return new Response('Not found',{status:404,headers})
 }catch(error){
  const message=error instanceof Fault?error.message:error instanceof Error&&/IMPORT_|NATIVE_EDIT|SOURCE_|PLAN_|RECONCIL|CONFLICT/.test(error.message)?error.message:'Operation refused: data changed, overlaps, dependencies or unavailable storage. Reload and review before retrying.',status=error instanceof Fault?error.status:409
  if(refused){const section=tabsFor(refused.a).includes(sectionFor(refused.action))?sectionFor(refused.action):'review';return new Response(await appPage(env,refused.a,section,{error:message}),{status,headers:{...headers,'content-type':'text/html; charset=utf-8'}})}
  return Response.json({error:message},{status,headers})
 }
}
