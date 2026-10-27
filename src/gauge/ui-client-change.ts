import type { Bindings } from '../auth.server'
import { Fault, need, uuid, type Value } from './model'
import { changeClientResponse } from './scope-review'
import { clientDeliveryPage } from './ui-client-delivery'
import { escape as e, input, area } from './ui-forms'
import { money, hours } from './ui-format'

/** Existing invited-project authority opens the exact separately released change. */
export async function clientChangePageResponse(request:Request,env:Bindings):Promise<Response>{
 const url=new URL(request.url),match=url.pathname.match(/^\/app\/client-changes\/([^/%]+)\/([^/%]+)$/)
 try{
  need(match,'Change not found',404)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  need(['GET','POST'].includes(request.method),'Use GET or POST',405)
  const proof=new Headers({'cookie':request.headers.get('cookie')??'','origin':env.AUTH_ORIGIN,'content-type':'application/json'})
  const api=new URL(`/api/gauge/client-changes/${match[1]}/${match[2]}`,url)
  if(request.method==='POST'){
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0
   if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();need(false,'Response too large',413)}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   const form=await new Request(request.url,{method:'POST',headers:request.headers,body:bytes}).formData()
   if(form.get('token'))proof.set('x-gauge-review-token',String(form.get('token')))
   if(form.get('outcome')){
    const saved=await changeClientResponse(new Request(api,{method:'POST',headers:proof,body:JSON.stringify({key:form.get('key'),revision:form.get('revision'),outcome:form.get('outcome'),reason:form.get('reason'),signatureName:form.get('signatureName'),consent:form.get('consent')==='yes'})}),env)
    if(!saved.ok){const error=await saved.json() as Value;return clientDeliveryPage(`<p role="alert">${e(error.error)}</p><p><a href="${e(url.pathname)}">Review current terms</a></p>`,saved.status,'Scope change')}
   }
  }
  const response=await changeClientResponse(new Request(api,{headers:proof}),env),doc=await response.json() as Value
  if(!response.ok)return clientDeliveryPage(`<p role="alert">${e(doc.error)}</p><form method="post" class="g-form"><p>Sign in with your invited email and open this change from your project, or enter the separately shared review key.</p>${input('token','Review key','','password')}<button class="g-btn">Open change</button></form>`,response.status,'Scope change')
  const terms=(t:Value|null)=>t?`<p>${e(t.mode)} · ${e(t.currency)} ${e(money(t.amountMinor,t.currency??doc.document.terms.before?.currency))} · effort ${e(hours(t.effortSeconds))} · rounding ${e(t.roundingSeconds)} seconds</p><p>Expense allowance ${e(money(t.expenseBudgetMinor??0,t.currency??doc.document.terms.before?.currency))}${t.expenseDate?` · ${e(t.expenseDate)}`:''}</p>`:'<p>No prior approved terms.</p>'
  const dates=(sets:Value[])=>sets.map(set=>`<p>Delivery finish ${e(set.finish??'Not scheduled')}</p>${set.tasks.map((t:Value)=>`<p>${e(t.name)} · ${e(t.from??'Not scheduled')} to ${e(t.to??'Not scheduled')}</p>`).join('')}${set.milestones.map((m:Value)=>`<p>${e(m.name)} · ${e(m.due)}</p>`).join('')}`).join('')
  return clientDeliveryPage(`<p><a href="/app/client-projects/${e(doc.document.engagementId??'')}">Project access</a></p><section class="g-card"><h2>Change version ${e(doc.version)}</h2><p>${e(doc.description)}</p><h3>Previous scope</h3><p>${e(doc.document.scope.before)}</p><h3>Proposed scope</h3><p>${e(doc.document.scope.after)}</p><h3>Previous terms</h3>${terms(doc.document.terms.before)}<h3>Proposed terms</h3>${terms(doc.document.terms.after)}<h3>Previous dates</h3>${dates(doc.document.dates.before)}<h3>Proposed dates</h3>${dates(doc.document.dates.after)}<p>Your acceptance signs this exact version and terms using your confirmed account. The agency must adopt it separately. Acceptance alone never issues an invoice.</p>${doc.decision?`<div role="status"><h3>Response saved: ${e(doc.decision.outcome)}</h3><p>${e(doc.decision.reason)}</p><p>${e(doc.decision.notice)}</p>${doc.decision.signature?`<p>Signed by ${e(doc.decision.signature.name)} · ${e(doc.decision.signature.contact)}</p>`:''}</div>`:`<form method="post" class="g-form"><input type="hidden" name="key" value="${uuid()}"><input type="hidden" name="revision" value="${e(doc.revision)}">${proof.has('x-gauge-review-token')?`<input type="hidden" name="token" value="${e(proof.get('x-gauge-review-token'))}">`:''}<label class="g-field"><span>Your decision</span><select name="outcome" required><option value="">Choose a decision</option><option value="rejected">Reject change</option><option value="accepted">Accept exact terms</option></select></label>${area('reason','Decision reason')}${input('signatureName','Your full name for acceptance','','text',false)}<label class="g-check"><input type="checkbox" name="consent" value="yes"><span>I consent to sign this exact change and its terms when accepting.</span></label><button class="g-btn g-btn--primary">Save decision</button></form>`}</section>`,200,'Scope change')
 }catch(error){return clientDeliveryPage(`<p role="alert">${e(error instanceof Fault?error.message:'Change unavailable')}</p>`,error instanceof Fault?error.status:409,'Scope change')}
}
