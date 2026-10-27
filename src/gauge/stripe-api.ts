import { Fault, integer, need, text, type Value } from './model'

/** Version-pinned direct API calls only; provider-controlled redirects never receive a key. */
export const stripeApiVersion = '2024-06-20'
export interface StripeCredential { secretKey: string; webhookSecret: string }
export function parseStripeCredential(value: string): StripeCredential {
 let parsed: Value
 try { parsed = JSON.parse(value) } catch { throw new Fault('Enter Stripe credentials as a JSON object') }
 need(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).every(k => ['secretKey','webhookSecret'].includes(k)), 'Use only secretKey and webhookSecret for Stripe credentials')
 const secretKey = text(parsed.secretKey, 'Stripe secret key', 300), webhookSecret = text(parsed.webhookSecret, 'Stripe webhook signing secret', 300)
 need(secretKey.length >= 16 && webhookSecret.length >= 16 && !/\s/.test(secretKey + webhookSecret), 'Stripe credentials need at least 16 characters without whitespace')
 return {secretKey, webhookSecret}
}
export class StripeFailure extends Fault {
 constructor(public outcome: 'rejected' | 'uncertain' | 'rate-limited', public exceptionClass: string) { super('Stripe request could not be confirmed; inspect the recorded outcome and reconcile', 409) }
}
export function stripeId(value: unknown, _prefix: string): string {
 const id = text(value, 'Stripe object id', 200)
 need(/^[A-Za-z0-9_-]{1,200}$/.test(id), 'Stripe returned an invalid object reference', 409)
 return id
}
export const objectId = (value: any): string | null => typeof value === 'string' ? value : typeof value?.id === 'string' ? value.id : null
export async function stripeRequest(credential: string, method: 'GET' | 'POST', path: string, form?: URLSearchParams, idempotencyKey?: string): Promise<Value> {
 need(/^\/v1\/[A-Za-z0-9_/?=&%.[\]-]+$/.test(path) && !path.includes('..'), 'Unsupported Stripe API path')
 let response: Response
 try {
  response = await fetch('https://api.stripe.com' + path, {method, redirect:'manual', signal:AbortSignal.timeout(15000), headers:{Authorization:`Bearer ${credential}`, 'Stripe-Version':stripeApiVersion, ...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{}), ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})}, ...(method==='POST'?{body:form}: {})})
 } catch { throw new StripeFailure('uncertain','transport-unconfirmed') }
 if (!response.ok) {
  void response.body?.cancel().catch(()=>{})
  throw new StripeFailure(response.status===429?'rate-limited':response.status>=400&&response.status<500&&response.status!==408?'rejected':'uncertain', response.status===401||response.status===403?'authorization-expired':response.status===429?'rate-limited':response.status>=500?'provider-unavailable':'provider-refused')
 }
 const reader=response.body?.getReader(); need(reader,'Stripe returned no canonical evidence',409)
 const parts:Uint8Array[]=[]; let size=0
 try { for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length; need(size<=262144,'Stripe evidence exceeds the supported size',409); parts.push(value) } }
 finally {void reader.cancel().catch(()=>{})}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
 let result:Value
 try { const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);need(!raw.includes(credential),'Stripe echoed a credential; evidence was not retained',409); result=JSON.parse(raw) }
 catch(error){if(error instanceof Fault)throw error;throw new StripeFailure('uncertain','unreadable-evidence')}
 need(result&&typeof result==='object'&&!Array.isArray(result),'Stripe returned invalid canonical evidence',409)
 return result
}
export async function stripeList(key:string,path:string):Promise<Value[]> {
 const rows:Value[]=[];let cursor:string|null=null
 for(let page=0;page<10;page++){
  const list=await stripeRequest(key,'GET',path+(path.includes('?')?'&':'?')+'limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''))
  need(Array.isArray(list.data)&&typeof list.has_more==='boolean','Stripe returned an incomplete list',409)
  rows.push(...list.data);if(!list.has_more)return rows
  need(list.data.length>0,'Stripe pagination did not advance',409);cursor=text(list.data.at(-1)?.id,'Stripe page cursor',200)
 }
 throw new Fault('Stripe history exceeds the supported reconciliation window; inspect in Stripe',409)
}
export const minor=(value:unknown,name='Stripe amount')=>integer(value,name,0,Number.MAX_SAFE_INTEGER)
export function hostedUrl(value:unknown):string {
 const url=new URL(text(value,'Stripe hosted checkout URL',2000))
 need(url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.username&&!url.password,'Stripe returned an unexpected hosted checkout URL',409)
 return url.href
}
