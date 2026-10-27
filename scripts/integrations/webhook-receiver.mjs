import {createHmac,createHash,timingSafeEqual} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'

// Reference receiver: authenticated events enter a durable review inbox only.
// Receiving a signature never approves or executes a Gauge business command.
export function openWebhookReceiver({database,signingKey}) {
 if(typeof signingKey!=='string'||signingKey.length<16)throw Error('Configure a private signing key of at least 16 characters')
 const db=new DatabaseSync(database)
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS received_events(event_id TEXT PRIMARY KEY, digest TEXT NOT NULL, body TEXT NOT NULL, received_at INTEGER NOT NULL)')
 const types={engagements:['gauge.project.created','gauge.project.changed'],time:['gauge.time.approved'],budgetAlerts:['gauge.budget-exception'],invoices:['gauge.invoice.issued'],payments:['gauge.payment.recorded']}
 const fields={engagements:['name','clientId','leadId','type','currency','timezone'],time:['personId','engagementId','taskId','status','start','end','durationSeconds','billable','workDate'],budgetAlerts:['engagementId','phaseKey','metric','threshold','actual','budget','raisedAt'],invoices:['engagementId','clientId','number','issueDate','dueDate','currency','totalMinor','issuance'],payments:['engagementId','invoiceId','amountMinor','currency','date','source','verification']}
 const reject=status=>new Response(null,{status})
 return {
  close:()=>db.close(),
  async receive(request){
   if(request.method!=='POST')return reject(405)
   const match=/^t=(\d{1,12}),v1=([a-f0-9]{64})$/.exec(request.headers.get('x-gauge-signature')??'')
   if(!match||Math.abs(Date.now()/1000-Number(match[1]))>300)return reject(401)
   const chunks=[];let length=0
   for await(const chunk of request.body??[]){length+=chunk.byteLength;if(length>65536)return reject(413);chunks.push(Buffer.from(chunk))}
   const bytes=Buffer.concat(chunks),signature=createHmac('sha256',signingKey).update(match[1]+'.').update(bytes).digest()
   if(!timingSafeEqual(signature,Buffer.from(match[2],'hex')))return reject(401)
   let event
   try{event=JSON.parse(bytes.toString('utf8'))}catch{return reject(400)}
   if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).sort().join(',')!=='data,event_id,sourceId,sourceKind,sourceRevision,type'||!types[event.sourceKind]?.includes(event.type)||!event.data||typeof event.data!=='object'||Array.isArray(event.data)||Object.keys(event.data).some(k=>!fields[event.sourceKind].includes(k))||Object.values(event.data).some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))return reject(400)
   if(![event.event_id,event.sourceId,event.sourceRevision].every(v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v))||request.headers.get('x-gauge-event-id')!==event.event_id||request.headers.get('idempotency-key')!==event.event_id)return reject(400)
   const digest=createHash('sha256').update(bytes).digest('hex')
   db.exec('BEGIN IMMEDIATE')
   try{
    const prior=db.prepare('SELECT digest FROM received_events WHERE event_id=?').get(event.event_id)
    if(prior){db.exec('ROLLBACK');return prior.digest===digest?Response.json({accepted:true,event_id:event.event_id,duplicate:true},{status:202}):reject(409)}
    db.prepare('INSERT INTO received_events VALUES(?,?,?,?)').run(event.event_id,digest,bytes.toString('utf8'),Date.now())
    db.exec('COMMIT')
    return Response.json({accepted:true,event_id:event.event_id,duplicate:false},{status:202})
   }catch(error){db.exec('ROLLBACK');throw error}
  },
 }
}

// Optional loopback HTTP adapter. Put an owner-managed HTTPS endpoint in front of it.
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
 const {createServer}=await import('node:http'),{Readable}=await import('node:stream')
 const {values}= (await import('node:util')).parseArgs({options:{database:{type:'string'},port:{type:'string',default:'8788'}}})
 if(!values.database)throw Error('Pass --database with a durable private database path')
 const receiver=openWebhookReceiver({database:values.database,signingKey:process.env.GAUGE_WEBHOOK_SIGNING_KEY})
 const server=createServer(async(req,res)=>{try{const result=await receiver.receive(new Request('http://127.0.0.1/events',{method:req.method,headers:req.headers,...(req.method==='GET'||req.method==='HEAD'?{}:{body:Readable.toWeb(req),duplex:'half'})}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()))}catch{res.writeHead(500);res.end()}})
 server.listen(Number(values.port),'127.0.0.1',()=>process.stdout.write(`Receiver listening on ${server.address().port}\n`))
 process.once('SIGTERM',()=>server.close(()=>{receiver.close()}))
 process.once('SIGINT',()=>server.close(()=>{receiver.close()}))
}
