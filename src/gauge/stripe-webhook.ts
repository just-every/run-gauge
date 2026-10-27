import type { Bindings } from '../auth.server'
import { decode, Fault, need, uuid, type Row, type Value } from './model'
import { dispatchCredential } from './provider-custody'
import { objectId, parseStripeCredential, stripeId, stripeRequest } from './stripe-api'
import { canonicalPayment } from './stripe-reconcile'

const encoder=new TextEncoder()
async function signed(raw:string,header:string,secret:string){
 const entries=header.split(',').map(s=>s.trim().split('=')),timestamps=entries.filter(([k])=>k==='t').map(([,v])=>v),signatures=entries.filter(([k,v])=>k==='v1'&&/^[a-f0-9]{64}$/.test(v)).map(([,v])=>v)
 need(timestamps.length===1&&/^\d{1,12}$/.test(timestamps[0])&&signatures.length>0&&signatures.length<=10,'Invalid Stripe signature',400)
 const timestamp=Number(timestamps[0]);need(Math.abs(Date.now()/1000-timestamp)<=300,'Stripe signature timestamp expired',400)
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 const body=encoder.encode(timestamps[0]+'.'+raw)
 let valid=false
 for(const signature of signatures){const bytes=Uint8Array.from(signature.match(/../g)!,h=>parseInt(h,16));valid=(await crypto.subtle.verify('HMAC',key,bytes,body))||valid}
 need(valid,'Invalid Stripe signature',400)
}
async function requestBody(request:Request){
 const reader=request.body?.getReader();need(reader,'Stripe webhook body is required',400)
 const parts:Uint8Array[]=[];let size=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;need(size<=262144,'Stripe webhook body too large',413);parts.push(value)}}finally{void reader.cancel().catch(()=>{})}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new Fault('Stripe webhook body must be UTF-8',400)}
}
/** Signed callbacks are read-only signals. Only a native owner reconciliation or polling can change invoice allocations. */
export async function stripeWebhook(request:Request,env:Bindings):Promise<Response>{
 try{
  need(request.method==='POST','Use POST for Stripe events',405)
  const url=new URL(request.url);need(url.origin===new URL(env.AUTH_ORIGIN).origin,'Stripe webhook origin mismatch',403)
  const connectionId=url.searchParams.get('connectionId')??url.pathname.split('/').filter(Boolean).at(-1)
  need(connectionId&&/^[A-Za-z0-9_-]{1,200}$/.test(connectionId),'Stripe connection id is required',400)
  const rawConnection=await env.DB.prepare('SELECT id,revision,data FROM g_providerConnections WHERE id=?').bind(connectionId).first<{id:string;revision:string;data:string}>()
  need(rawConnection,'Stripe connection not found',404)
  const connection=decode(rawConnection)
  need(connection.value.provider==='stripe'&&!connection.value.revokedAt,'Stripe connection unavailable',409)
  const credential=parseStripeCredential(await dispatchCredential(env,connection.id,connection.value.version,'stripe-webhook','payment:webhook'))
  const raw=await requestBody(request);await signed(raw,request.headers.get('stripe-signature')??'',credential.webhookSecret)
  let event:Value
  try{event=JSON.parse(raw)}catch{throw new Fault('Stripe webhook JSON is invalid',400)}
  const eventId=stripeId(event.id,'evt')
  need(typeof event.type==='string'&&/^[a-z_.]{1,120}$/.test(event.type),'Stripe event type is invalid',400)
  if(await env.DB.prepare("SELECT 1 FROM g_processorEvents WHERE json_extract(data,'$.connectionId')=? AND json_extract(data,'$.eventId')=?").bind(connection.id,eventId).first())return Response.json({received:true,duplicate:true})
  // Retrieve the event by authenticated API; the signed payload supplies identity only.
  const readCredential=parseStripeCredential(await dispatchCredential(env,connection.id,connection.value.version,eventId,'payment:read'))
  const canonicalEvent=await stripeRequest(readCredential.secretKey,'GET','/v1/events/'+eventId)
  need(canonicalEvent.id===eventId&&canonicalEvent.type===event.type,'Stripe canonical event differs from signed delivery',409)
  const object=canonicalEvent.data?.object,reference=objectId(object)
  need(reference,'Stripe event has no canonical object reference',409)
  let link:Row|undefined
  const direct=await env.DB.prepare("SELECT id,revision,data FROM g_paymentLinks WHERE json_extract(data,'$.connectionId')=? AND (json_extract(data,'$.sessionId')=? OR json_extract(data,'$.paymentIntentId')=?)").bind(connection.id,reference,reference).first<{id:string;revision:string;data:string}>()
  if(direct)link=decode(direct)
  if(!link){
   const intent=objectId(object?.payment_intent)
   if(intent){const found=await env.DB.prepare("SELECT l.id,l.revision,l.data FROM g_paymentLinks l WHERE json_extract(l.data,'$.connectionId')=? AND (json_extract(l.data,'$.paymentIntentId')=? OR json_extract(l.data,'$.sessionId') IN (SELECT json_extract(p.data,'$.sessionId') FROM g_processorPayments p WHERE json_extract(p.data,'$.paymentIntentId')=?))").bind(connection.id,intent,intent).first<{id:string;revision:string;data:string}>();if(found)link=decode(found)}
  }
  // The callback cannot discover or authorize payments outside exact locally released invoices.
  if(!link){return Response.json({received:true,ignored:true})}
  need(link.value.credentialVersion===connection.value.version,'Stripe instruction credential rotated; native owner review required',409)
  const authority=await env.DB.prepare('SELECT owner_id FROM g_stripe_authority WHERE link_id=? AND connection_id=? AND credential_version=?').bind(link.id,connection.id,connection.value.version).first<{owner_id:string}>()
  need(authority,'Restored Stripe evidence has no webhook authority',409)
  const evidence=await canonicalPayment(readCredential.secretKey,link)
  await dispatchCredential(env,connection.id,connection.value.version,eventId,'payment:read')
  const at=Date.now(),id=uuid(),revision=uuid(),useId=uuid(),useRevision=uuid()
  const safe={type:'webhook',connectionId:connection.id,credentialVersion:connection.value.version,eventId,eventType:event.type,linkId:link.id,invoiceId:link.value.invoiceId,paymentIntentId:evidence.paymentIntentId,status:'needs-owner-reconcile',canonicalStatus:evidence.status,evidenceFingerprint:evidence.evidenceFingerprint,pendingMinor:evidence.pendingMinor,settledMinor:evidence.settledMinor,refundedMinor:evidence.refundedMinor,disputedMinor:evidence.disputedMinor,returnedMinor:evidence.returnedMinor,currency:link.value.currency,receivedAt:at,createdAt:at,meaning:'Signature verified and latest canonical state read. Native owner reconciliation is required before changing invoice allocations.'}
  const use={at,connectionId:connection.id,credentialVersion:connection.value.version,jobId:eventId,operation:'payment:webhook',outcome:'accepted'}
  const guard="EXISTS(SELECT 1 FROM g_stripe_authority a JOIN oa_operators o ON o.id=a.owner_id JOIN g_providerConnections c ON c.id=a.connection_id JOIN g_provider_credentials k ON k.connection_id=c.id AND k.version=a.credential_version JOIN g_paymentLinks l ON l.id=a.link_id WHERE a.link_id=? AND a.owner_id=? AND a.connection_id=? AND a.credential_version=? AND o.role='owner' AND o.status='active' AND c.revision=? AND json_extract(c.data,'$.revokedAt') IS NULL AND json_extract(c.data,'$.version')=a.credential_version AND l.revision=?)"
  const check=()=>env.DB.prepare(`INSERT INTO g_assert(ok) VALUES(CASE WHEN (${guard}) THEN 1 ELSE 0 END)`).bind(link!.id,authority.owner_id,connection.id,connection.value.version,connection.revision,link!.revision)
  const audit=(kind:string,recordId:string,recordRevision:string,data:Value)=>env.DB.prepare('INSERT INTO g_audit(at,actor,role,person_id,request_key,action,kind,record_id,previous_revision,revision,data) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(at,authority.owner_id,'owner',null,'stripe-event:'+eventId,'stripe:webhook',kind,recordId,null,recordRevision,JSON.stringify(data))
  try{await env.DB.batch([check(),env.DB.prepare('INSERT INTO g_processorEvents(id,revision,data) VALUES(?,?,?)').bind(id,revision,JSON.stringify(safe)),audit('processorEvents',id,revision,safe),env.DB.prepare('INSERT INTO g_providerUses(id,revision,data) VALUES(?,?,?)').bind(useId,useRevision,JSON.stringify(use)),audit('providerUses',useId,useRevision,use),check(),env.DB.prepare('DELETE FROM g_assert')])}
  catch(error){if(!await env.DB.prepare("SELECT 1 FROM g_processorEvents WHERE json_extract(data,'$.connectionId')=? AND json_extract(data,'$.eventId')=?").bind(connection.id,eventId).first())throw error}
  return Response.json({received:true,reconcileRequired:true})
 }catch(error){return Response.json({error:error instanceof Fault?error.message:'Stripe event could not be confirmed'}, {status:error instanceof Fault?error.status:503})}
}
