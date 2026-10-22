import { type Row, need } from './model'
import type { ProviderJobResult } from './provider-jobs'

/** Both the hook URL and signing key stay inside the sealed credential bundle. */
export function webhookCredential(value: string, provider: string): {endpoint:string; signingKey:string} {
 let input: any
 try { input = JSON.parse(value) } catch { need(false, 'Enter a compact JSON credential containing endpoint and signingKey') }
 need(input && typeof input.endpoint === 'string' && typeof input.signingKey === 'string' && input.signingKey.length >= 16 && input.signingKey.length <= 256 && !/\s/.test(input.signingKey), 'Provide the hook endpoint and a signing key of 16 to 256 characters')
 let url: URL
 try { url = new URL(input.endpoint) } catch { need(false, 'Use a complete HTTPS hook URL') }
 need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && !url.href.includes(input.signingKey), 'Use an HTTPS hook without query, fragment or URL credentials')
 if (provider === 'zapier') need(url.origin === 'https://hooks.zapier.com' && /^\/hooks\/catch\/[^/]{1,128}\/[^/]{1,128}\/$/.test(url.pathname), 'Use the Zapier Catch Hook URL')
 return {endpoint: url.href, signingKey: input.signingKey}
}

/** Closed scopes: imported notes, provider input and private costs never become event fields. */
export function webhookEvent(source: {kind:string}, row: Row,eventType?:string): Record<string,unknown> {
 const v=row.value
 const fields:Record<string,string[]>={
  budgetAlerts:['engagementId','phaseKey','metric','threshold','actual','budget','raisedAt'],
  engagements:['name','clientId','leadId','type','currency','timezone'],
  time:['personId','engagementId','taskId','status','start','end','durationSeconds','billable','workDate'],
  invoices:['engagementId','clientId','number','issueDate','dueDate','currency','totalMinor','issuance'],
  payments:['engagementId','invoiceId','amountMinor','currency','date','source','verification'],
 }
 const types:Record<string,string>={budgetAlerts:'budget-exception',engagements:'project.changed',time:'time.approved',invoices:'invoice.issued',payments:'payment.recorded'}
 need(fields[source.kind], 'Unsupported signed event source')
 const type=source.kind==='engagements'&&['gauge.project.created','gauge.project.changed'].includes(eventType??'')?eventType:'gauge.'+types[source.kind]
 return {type,sourceKind:source.kind,sourceId:row.id,sourceRevision:row.revision,data:Object.fromEntries(fields[source.kind].filter(k=>v[k]!==undefined).map(k=>[k,v[k]]))}
}
export async function signedWebhookHeaders(signingKey:string,eventId:string,body:string){
 const timestamp=String(Math.floor(Date.now()/1000)),encode=new TextEncoder()
 const key=await crypto.subtle.importKey('raw',encode.encode(signingKey),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encode.encode(timestamp+'.'+body))),b=>b.toString(16).padStart(2,'0')).join('')
 return {'Content-Type':'application/json','Idempotency-Key':eventId,'X-Gauge-Event-ID':eventId,'X-Gauge-Signature':`t=${timestamp},v1=${signature}`}
}
export async function webhookResult(response:Response,provider:string,eventId:string):Promise<ProviderJobResult>{
 if(response.status===429){void response.body?.cancel().catch(()=>{});return {status:'retry-wait',exceptionClass:'provider-rate-limit'}}
 if(response.status!==200&&response.status!==202){void response.body?.cancel().catch(()=>{});return {status:'exception',exceptionClass:response.status>=400&&response.status<500&&response.status!==408?'provider-rejected':'uncertain'}}
 const reader=response.body?.getReader();if(!reader)return {status:'exception',exceptionClass:'uncertain'}
 let body='';const decoder=new TextDecoder();let bytes=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384)return {status:'exception',exceptionClass:'uncertain'};body+=decoder.decode(value,{stream:true})}
  const result=JSON.parse(body+decoder.decode())
  if(provider==='zapier'&&response.status===200&&result?.status==='success'||provider==='webhook'&&result?.accepted===true&&result?.event_id===eventId)return {status:'submitted'}
 }catch{/* Only a recognized admission acknowledgement is retained. */}finally{void reader.cancel().catch(()=>{})}
 return {status:'exception',exceptionClass:'uncertain'}
}
