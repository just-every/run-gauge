import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {createServer} from 'node:net'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
export async function harness(){
 const directory=await mkdtemp(join(tmpdir(),'gauge-flow-')),socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`,secret=()=>randomBytes(32).toString('hex')
 const vars={AUTH_LOCAL:'true',AUTH_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:secret(),SETUP_TOKEN:secret(),MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test',RER_DEV_KEY:secret()}
 await writeFile(join(directory,'private.env'),Object.entries(vars).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600})
 const wrangler='node_modules/wrangler/bin/wrangler.js',config='dist/server/wrangler.json',env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true',CLOUDFLARE_INCLUDE_PROCESS_ENV:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'true'}
 execFileSync(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--persist-to',directory,'--config',config],{stdio:'pipe',env})
 const worker=spawn(process.execPath,[wrangler,'dev','--config',config,'--local','--persist-to',directory,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--env-file',join(directory,'private.env')],{stdio:['ignore','pipe','pipe'],env});let output='';worker.stdout.on('data',c=>output+=c);worker.stderr.on('data',c=>output+=c)
 const request=(path,cookie='',options={})=>fetch(origin+path,{redirect:'manual',...options,headers:{cookie,...options.headers}})
 const post=(path,input,cookie='')=>request(path,cookie,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)})
 const close=async()=>{worker.kill('SIGTERM');await new Promise(r=>worker.exitCode!==null||worker.signalCode!==null?r():worker.once('exit',r))}
 try{let ready=false;for(let n=0;n<240&&!ready;n++){if(worker.exitCode!==null)throw Error('Worker exited');try{ready=(await request('/health')).ok}catch{}if(!ready)await new Promise(r=>setTimeout(r,250))}assert(ready,'Worker became healthy')
 const confirmLatest=async()=>{const listing=await(await request('/__dev/outbox','',{headers:{'x-rer-dev-key':vars.RER_DEV_KEY}})).text(),message=listing.match(/href="(\/__dev\/outbox\?message=[^"]+)"/)?.[1];assert(message,'outbox message');const detail=await(await request(message.replaceAll('&amp;','&'),'',{headers:{'x-rer-dev-key':vars.RER_DEV_KEY}})).text(),link=new URL(detail.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)[1].replaceAll('&amp;','&'),origin),response=await post('/auth/confirm',{token:link.searchParams.get('token')});assert.equal(response.status,303,'native confirmation');return response.headers.getSetCookie().map(l=>l.split(';')[0]).join('; ')}
 const claim=await post('/auth/bootstrap',{token:vars.SETUP_TOKEN,displayName:'Test owner'});if(claim.status!==303)throw Error(`owner claim answered ${claim.status}: ${(await claim.text()).slice(0,300)}; worker: ${output.split('\n').filter(l=>/error|Error|✘/.test(l)).slice(-8).join(' | ')}`)
 assert.equal((await post('/auth/magic-link',{email:vars.OWNER_EMAIL})).status,202);const owner=await confirmLatest()
 assert.equal((await request('/setup',owner,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:'confirm=yes'})).status,303)
 const invite=async(name)=>{const response=await post('/auth/invite',{email:`${name}@example.test`,displayName:name,role:'member'},owner);assert.equal(response.status,202);const cookie=await confirmLatest(),session=await(await request('/auth/session',cookie)).json();return {cookie,id:session.operator.id}}
 const cmd=async(action,input={},cookie=owner,expected=200)=>{const response=await post('/api/gauge/command',{key:randomUUID(),action,...input},cookie),body=await response.json();assert.equal(response.status,expected,`${action}: ${JSON.stringify(body)}`);return body}
 const state=async(cookie=owner)=>{const r=await request('/api/gauge/state?from=2026-10-01&to=2026-10-31',cookie);assert.equal(r.status,200);return r.json()}
 return {directory,origin,owner,vars,request,post,cmd,state,invite,close,dispose:async()=>{await close();await rm(directory,{recursive:true,force:true})}}
 }catch(error){await close();await rm(directory,{recursive:true,force:true});throw error}
}
