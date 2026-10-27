import { Buffer } from 'node:buffer'
import { operatorAuth, type Bindings } from '../auth.server'
import { actor, fence, access, get, type Actor } from './store'
import { Fault, need } from './model'
import { command } from './commands'
import { clientDeliveryPage } from './ui-client-delivery'
import { escape as e } from './ui-forms'

export async function intakeResponse(request:Request,env:Bindings){
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
 try{
  const url=new URL(request.url),upload=url.pathname.match(/^\/app\/client-intake\/([^/%]+)\/([^/%]+)$/),download=url.pathname.match(/^\/api\/gauge\/intake-files\/([^/%]+)$/)
  need(upload||download,'Intake route not found',404)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  const session=await operatorAuth(env).getSession(request);need(session?.kind==='native','Sign in with your invited email',401)
  let a:Actor=await actor(env,session)
  const file=download?await env.DB.prepare('SELECT *,hex(bytes) AS hex_bytes FROM g_intake_files WHERE id=?').bind(download[1]).first<any>():null
  need(!download||file,'File not found',404)
  const row=await get(env,'intakeRequests',upload?upload[2]:file.request_id),project=await get(env,'engagements',row.value.engagementId)
  need(!upload||upload[1]===project.id,'Wrong project',403)
  need(project.value.clientId===row.value.clientId,'Project client changed',403)
  if(a.role==='none'){
   const grant=await env.DB.prepare('SELECT id,revision FROM g_client_portal_authority WHERE engagement_id=? AND recipient_id=?').bind(project.id,session.operator.id).first<{id:string;revision:string}>()
   need(grant,'Project is not invited',403);a={...a,role:'client',clientPortal:grant};await fence(env,a)
  }else{await fence(env,a);await access(env,a,project.id,true)}
  if(download){
   need(request.method==='GET','Use GET',405)
   need(!a.clientPortal||row.value.submissions.some((s:any)=>s.by===session.operator.id&&s.file?.id===file.id),'File is outside your submission',403)
   await fence(env,a)
   return new Response(Buffer.from(file.hex_bytes,'hex'),{headers:{...headers,'content-type':'application/octet-stream','content-disposition':`attachment; filename="intake-${file.id}"`,'content-security-policy':"default-src 'none'; sandbox"}})
  }
  need(request.method==='POST','Use POST',405)
  need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>600*1024){await reader.cancel();need(false,'Intake upload too large',413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const form=await new Request(request.url,{method:'POST',headers:request.headers,body:bytes}).formData()
  const answers=row.value.questions.map((_:string,n:number)=>form.get('answer'+n)??'')
  await command(env,a,'intake:submit',{id:row.id,revision:form.get('revision'),key:form.get('key'),answers,file:form.get('file')})
  return new Response(null,{status:303,headers:{...headers,location:`/app/client-projects/${project.id}#client-intake`}})
 }catch(error){const status=error instanceof Fault?error.status:409,message=error instanceof Fault?error.message:'Intake changed; reload and retry';return request.url.includes('/app/')?clientDeliveryPage(`<p role="alert">${e(message)}</p>`,status,'Client intake'):Response.json({error:message},{status,headers})}
}
