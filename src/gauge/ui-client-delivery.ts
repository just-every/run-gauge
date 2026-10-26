import { operatorAuth, type Bindings } from '../auth.server'
import { Fault, need, uuid } from './model'
import { escape as e, input, area } from './ui-forms'
import { milestoneClientResponse } from './milestone-review'

const headers={'cache-control':'no-store','referrer-policy':'same-origin','x-content-type-options':'nosniff','x-robots-tag':'noindex,nofollow','content-security-policy':"default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}
export function clientDeliveryPage(body:string,status=200,title='Client delivery review') {
 return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · Gauge</title><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/gauge.css"><link rel="stylesheet" href="/gauge-shell.css"></head><body class="g-app"><aside class="g-rail" aria-label="Gauge"><span class="g-brand">Gauge</span></aside><div class="g-work"><main class="g-main"><h1>${e(title)}</h1>${body}</main></div></body></html>`,{status,headers:{...headers,'content-type':'text/html; charset=utf-8'}})
}
/** The secret is entered in a POST body, never in a link, referrer or cookie. */
export async function clientDeliveryResponse(request:Request,env:Bindings):Promise<Response> {
 const url=new URL(request.url),match=url.pathname.match(/^\/app\/client-milestones\/([^/%]+)\/([^/%]+)$/)
 let delegated=false,status=200
 try {
  need(match,'Review not found',404)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  need(['GET','POST'].includes(request.method),'Use GET or POST',405)
  if(request.method==='GET')return clientDeliveryPage(`<section class="g-card"><h2>Open your delivery</h2><p>Sign in with the email invited by the agency, then enter the review key shared with you. <a href="/signin?returnTo=${encodeURIComponent(url.pathname)}">Sign in</a></p><form method="post" class="g-form">${input('token','Review key','','password')}<button class="g-btn g-btn--primary">Open delivery</button></form></section>`)
  need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();need(false,'Response is too large',413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
  const parsed=new Request(request.url,{method:'POST',headers:request.headers,body:bytes}),form=await parsed.formData(),token=String(form.get('token')??'')
  const api=new URL(`/api/gauge/client-milestones/${match[1]}/${match[2]}`,url),proof=new Headers({'cookie':request.headers.get('cookie')??'','x-gauge-review-token':token,'origin':env.AUTH_ORIGIN,'content-type':'application/json'})
  delegated=true
  if(form.get('outcome')){
   const result=await milestoneClientResponse(new Request(api,{method:'POST',headers:proof,body:JSON.stringify({key:form.get('key'),revision:form.get('revision'),outcome:form.get('outcome'),reason:form.get('reason')})}),env)
   if(!result.ok){const error=await result.json() as {error:string};return clientDeliveryPage(`<section class="g-card" role="alert"><h2>Response not saved</h2><p>${e(error.error)}</p><p><a href="${e(url.pathname)}">Reopen the current delivery</a></p></section>`,result.status)}
  }
  const result=await milestoneClientResponse(new Request(api,{headers:proof}),env),document=await result.json() as any
  if(!result.ok)return clientDeliveryPage(`<section class="g-card" role="alert"><h2>Delivery unavailable</h2><p>${e(document.error)}</p><p><a href="${e(url.pathname)}">Try your review key again</a></p></section>`,result.status)
  return clientDeliveryPage(`<section class="g-card"><h2>${e(document.name)}</h2><p>Delivered ${e(document.date)}</p><p>${e(document.description)}</p><p>Your decision applies to this exact delivered work. Billing requires separate agency finance authorization.</p>${document.decision?`<div role="status"><h3>Response saved: ${e(document.decision.outcome)}</h3><p>${e(document.decision.reason)}</p><p>${e(document.decision.notice)}</p></div>`:`<form method="post" class="g-form"><input type="hidden" name="token" value="${e(token)}"><input type="hidden" name="key" value="${uuid()}"><input type="hidden" name="revision" value="${e(document.revision)}"><label class="g-field"><span>Your decision</span><select name="outcome" required><option value="">Choose a decision</option><option value="accepted">Accept delivered work</option><option value="rejected">Reject delivered work</option></select></label>${area('reason','Decision reason')}<button class="g-btn g-btn--primary">Submit decision</button></form>`}</section>`)
 }catch(error){status=error instanceof Fault?error.status:409;return clientDeliveryPage(`<section class="g-card" role="alert"><h2>Review unavailable</h2><p>${e(error instanceof Fault?error.message:'Reopen your review and try again')}</p></section>`,error instanceof Fault?error.status:409)}
 finally{if(match&&!delegated){const session=await operatorAuth(env).getSession(request);await env.DB.prepare("INSERT INTO g_audit(at,actor,action,kind,record_id,data) SELECT ?,?,'milestone:review-access','milestones',m.id,? FROM g_milestones m WHERE m.id=? AND EXISTS(SELECT 1 FROM json_each(json_extract(m.data,'$.delivery.clientReviews')) r WHERE json_extract(r.value,'$.id')=?)").bind(Date.now(),session?.operator.id??'anonymous',JSON.stringify({reviewId:match[2],method:request.method,status,notice:'Recipient review form access'}),match[1],match[2]).run()}}
}
