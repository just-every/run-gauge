import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtemp,readdir,readFile,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createServer} from 'node:net'
const {Miniflare,convertV4MiniflareOptions,Log,LogLevel}=createRequire(await realpath('node_modules/wrangler/package.json'))('miniflare')
// The emitted Worker with production mail; outbound capture stands in for the mail provider and never reaches it.
export async function harness({currency='AUD',timezone='Australia/Brisbane',finishSetup=true,persistenceDirectory,beforeLogin,databaseBinding=true,mailFrom='Gauge <auth@example.test>'}={}){
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
 const directory=persistenceDirectory??await mkdtemp(join(tmpdir(),'gauge-flow-')),origin=`https://127.0.0.1:${port}`,secret=()=>randomBytes(32).toString('hex'),mails=[],providerRequests=[],providerEdge={handler:null}
 const vars={AUTH_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:secret(),SETUP_TOKEN:secret(),MAIL_PROVIDER:'resend',MAIL_FROM:mailFrom,MAIL_API_KEY:'synthetic-gauge-900001'}
 const config=JSON.parse(await readFile('dist/server/wrangler.json','utf8')),server=resolve('dist/server')
 if(!persistenceDirectory){
  try{
   execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--persist-to',directory,'--config','dist/server/wrangler.json'],{stdio:'pipe',maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}})
  }finally{
   // Wrangler scratch beside the emitted config must not become artifact input, even if migration fails.
   await rm('dist/server/.wrangler',{recursive:true,force:true})
  }
 }
 const logs=[]
 const log=new class extends Log {log(message){logs.push(String(message))}}(LogLevel.INFO)
 const mf=new Miniflare({log,...convertV4MiniflareOptions({
  host:'127.0.0.1',port,https:true,
  modulesRoot:server,modules:[config.main,...(await readdir(join(server,'assets'))).filter(f=>f.endsWith('.js')).map(f=>`assets/${f}`)].map(f=>({type:'ESModule',path:join(server,f)})),
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,assets:{directory:resolve('dist/client'),routerConfig:{has_user_worker:true}},
  d1Databases:{DB:config.d1_databases[0].database_id},bindings:vars,
  outboundService:async request=>{const body=request.method==='GET'?null:request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(await request.clone().text())):await request.clone().json();providerRequests.push({url:request.url,method:request.method,headers:{authorization:request.headers.get('authorization'),signature:request.headers.get('x-gauge-signature'),eventId:request.headers.get('x-gauge-event-id'),idempotencyKey:request.headers.get('idempotency-key')},body});if(providerEdge.handler){const response=await providerEdge.handler(request,body);if(response)return response}if(request.url==='https://crank.example.test/api/crank/flows/budget-exception/trigger')return Response.json({id:`synthetic-gauge-run-${providerRequests.length}`,state:'pending'},{status:201});if(request.url!=='https://api.resend.com/emails')throw Error(`Unexpected test network destination ${new URL(request.url).origin}`);mails.push(body);return Response.json({id:`test-receipt-${mails.length}`})},
 }),unsafeTriggerHandlers:true,resourcePersistencePath:join(directory,'v3')})
 // Miniflare's fetch does not encode Node's FormData; send it as the browser would.
 const encoded=async options=>{if(!(options.body instanceof FormData))return options;const form=new Request(origin,{method:'POST',body:options.body});return {...options,body:await form.arrayBuffer(),headers:{...options.headers,'content-type':form.headers.get('content-type')}}}
 const request=async(path,cookie='',options={})=>{const sent=await encoded(options);return mf.dispatchFetch(origin+path,{redirect:'manual',...sent,headers:{...(cookie?{cookie}:{}),...sent.headers}})}
 const post=(path,input,cookie='')=>request(path,cookie,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)})
 let closed;const close=()=>closed??=mf.dispose()
 try{await mf.ready
 const cookieOf=response=>response.headers.getSetCookie().map(l=>l.split(';')[0]).join('; ')
 const confirmLatest=async()=>{const link=new URL(mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]),response=await post('/auth/confirm',{token:link.searchParams.get('token')});assert.equal(response.status,303,'native confirmation');return cookieOf(response)}
 if(!persistenceDirectory){const claim=await post('/auth/bootstrap',{token:vars.SETUP_TOKEN,displayName:'Test owner'});assert.equal(claim.status,303,`owner claim: ${(await claim.text()).slice(0,300)}`)}
 if(beforeLogin)await beforeLogin({request,post})
 assert.equal((await post('/auth/magic-link',{email:vars.OWNER_EMAIL})).status,202);const owner=await confirmLatest()
 if(finishSetup&&!persistenceDirectory)assert.equal((await request('/setup',owner,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({confirm:'yes',...(currency===null?{}:{currency}),timezone}).toString()})).status,303)
 const invite=async(name,role='member',email=`${name}@example.test`)=>{const response=await post('/auth/invite',{email,displayName:name,role},owner);assert.equal(response.status,202);const cookie=await confirmLatest(),session=await(await request('/auth/session',cookie)).json();return {cookie,id:session.operator.id}}
 const cmd=async(action,input={},cookie=owner,expected=200)=>{const response=await post('/api/gauge/command',{key:randomUUID(),action,...input},cookie),body=await response.json();assert.equal(response.status,expected,`${action}: ${JSON.stringify(body)}`);return body}
 const state=async(cookie=owner)=>{const r=await request('/api/gauge/state?from=2026-10-01&to=2026-10-31',cookie);assert.equal(r.status,200);return r.json()}
 return {logs,mails,providerRequests,providerEdge,scheduled:(time)=>request('/cdn-cgi/local/scheduled'+(time==null?'':'?time='+encodeURIComponent(time))),...(databaseBinding?{db:await mf.getD1Database('DB')}:{}),directory,origin,owner,vars,request,post,cmd,state,invite,close,dispose:async()=>{await close();if(!persistenceDirectory)await rm(directory,{recursive:true,force:true})}}
 }catch(error){await close();if(!persistenceDirectory)await rm(directory,{recursive:true,force:true});throw error}
}

// Record an explicit, attributed client acceptance through the production HTTP door.
export async function recordMilestoneAcceptance(h,id,cookie=h.owner) {
 const row=(await h.state()).data.milestones.find(r=>r.id===id)
 const delivered=await h.cmd('milestone:deliver',{id,revision:row.revision,date:'2026-12-02',reason:'Completed handover delivered'},cookie)
 const delivery=(await h.state()).data.milestones.find(r=>r.id===id).value.delivery.deliveries.at(-1)
 const accepted=await h.cmd('milestone:decision',{...delivered,deliveryId:delivery.id,outcome:'accepted',contact:'Casey Client',date:'2026-12-02',reason:'Client reported all agreed work complete'},cookie)
 return row.value.status==='approved'?h.cmd('milestone:authorize',accepted,cookie):accepted
}
