import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The pinned rer package's launcher, run against the journey's checkout.
const rer = fileURLToPath(import.meta.resolve('@runeditrun/rer/internal/global/rer.mjs'))

export async function freePort() {
 const socket=createServer()
 await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)})
 const port=socket.address().port
 await new Promise(resolve=>socket.close(resolve))
 return port
}

export function journeyCli(onStage) {
 let server,origin
 const env={...process.env,CI:'true',RER_SERVER_JOURNEY:'1',WRANGLER_SEND_METRICS:'false'}
 function run(cwd,args) {
  onStage(`rer ${args[0]}`)
  let output
  try{output=execFileSync(process.execPath,[rer,...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],env})}catch{throw new Error(`rer ${args[0]} failed; child output and credential URLs are withheld`)}
  console.log(`PASS rer ${args[0]}${args.includes('--dry-run')?' --dry-run':''}${args.includes('--stop')?' --stop':''}`)
  return output
 }
 async function start(cwd,verb,port) {
  assert(!server,'stop the previous runtime before starting another')
  onStage(`rer ${verb} readiness`);origin=`http://127.0.0.1:${port}`
  server=spawn(process.execPath,[rer,verb,'--host','127.0.0.1','--port',String(port),'--foreground','--json'],{cwd,stdio:['ignore','pipe','pipe'],env})
  let output='';for(const stream of[server.stdout,server.stderr])stream.on('data',chunk=>output+=chunk)
  const events=()=>output.split('\n').flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}})
  const ready=()=>events().find(event=>event.event==='ready')
  for(let n=0;n<600&&!ready();n++){
   if(server.exitCode!==null||server.signalCode!==null){
    const failed=events().findLast(event=>event.event==='error')
    const code=/^[a-z_]{1,60}$/.test(failed?.code??'')?failed.code:'unclassified'
    const step=/^[a-z_:.-]{1,60}$/.test(failed?.step??'')?failed.step:'startup'
    onStage(`rer ${verb} readiness: ${code}, ${step}, exit ${server.exitCode}, signal ${server.signalCode}`)
    assert.fail('runtime exited before readiness; credential-bearing output withheld')
   }
   await new Promise(resolve=>setTimeout(resolve,500))
  }
  const event=ready(),entry=verb==='dev'?event?.openUrl:event?.url
  assert(entry,'native readiness received without logging credential URLs')
  const health=await fetch(origin+'/health',{signal:AbortSignal.timeout(10000)})
  assert.equal(health.status,200);assert.equal((await health.json()).status,'ok')
  console.log(`PASS rer ${verb} readiness and native health`)
  return entry
 }
 async function stop() {
  if(!server)return
  const child=server
  // This exact foreground launcher owns its descendants and handles shutdown; never use the shared stop verb.
  child.kill('SIGTERM')
  await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve))
  server=undefined
  let listening=true
  for(let n=0;n<20&&listening;n++){
   try{await fetch(origin+'/health',{signal:AbortSignal.timeout(500)})}catch{listening=false}
   if(listening)await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert(!listening,'stopped runtime released its public listener')
 }
 async function reset(cwd) {
  const events=run(cwd,['reset','--yes','--json']).trim().split('\n').map(line=>JSON.parse(line))
  const result=events.find(event=>event.event==='result')
  assert(result?.ok&&result.paths.length,'reset removed an occupied declared inventory')
  for(const path of result.paths)await assert.rejects(()=>access(join(cwd,path)),{code:'ENOENT'})
 }
 return {run,start,stop,reset}
}
