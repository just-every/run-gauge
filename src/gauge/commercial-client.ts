import { operatorAuth, type Bindings } from '../auth.server'
import { actor, fence, get, all, Transaction } from './store'
import { command, publicResult } from './commands'
import { Fault, need, uuid, type Value } from './model'
import { latestCommercial } from './commercial-proposals'
import { commercialProposalHtml } from './ui-commercial-proposal-document'
import { escape as e, area, check } from './ui-forms'
const headers={'cache-control':'no-store','referrer-policy':'same-origin','x-content-type-options':'nosniff','x-robots-tag':'noindex,nofollow','content-security-policy':"default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}
export async function commercialClientResponse(request:Request,env:Bindings):Promise<Response|null>{
 const url=new URL(request.url),match=url.pathname.match(/^\/app\/client-proposals\/([^/%]+)(?:\/evidence\/(signed|certificate))?$/)
 if(!match)return null
 try{
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  need(['GET','POST'].includes(request.method),'Use GET or POST',405)
  const session=await operatorAuth(env).getSession(request)
  if(!session)return new Response(null,{status:303,headers:{...headers,location:'/signin?returnTo='+encodeURIComponent(url.pathname)}})
  need(session.kind==='native','Confirm your invited email through the native sign-in link',403)
  const row=await get(env,'commercialProposals',match[1]),a={...await actor(env,session),role:'client',clientProposal:{id:row.id,revision:row.revision}}
  await fence(env,a)
  if(match[2]){
   need(request.method==='GET','Use GET',405)
   const tx=new Transaction(env,a);await latestCommercial(env,tx,row)
   const events=(await all(env,'commercialEvents')).filter(r=>r.value.proposalId===row.id),binding=events.filter(r=>r.value.type==='signature-binding').at(-1)
   const evidence=events.find(r=>r.value.type==='signature-evidence'&&r.value.status==='verified'&&r.value.bindingId===binding?.id&&r.value.fingerprint===row.value.fingerprint&&r.value.proposalRevision===row.revision)
   const artifact=evidence?.value.artifacts?.[match[2]];need(artifact,'Verified signed evidence is unavailable',404)
   await fence(env,a)
   return new Response(Uint8Array.from(atob(artifact.base64),c=>c.charCodeAt(0)),{headers:{...headers,'content-type':'application/pdf','content-disposition':`attachment; filename="proposal-${match[2]}.pdf"`}})
  }
  if(request.method==='POST'){
   need(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403)
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0
   if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();need(false,'Response is too large',413)}chunks.push(value)}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
   const parsed=new Request(request.url,{method:'POST',headers:request.headers,body:bytes}),json=request.headers.get('content-type')?.includes('application/json')
   const input=json?await parsed.json():Object.fromEntries(await parsed.formData())
   need(input&&typeof input==='object'&&!Array.isArray(input),'Use a response object');const result=await command(env,a,'commercial:respond',input as Value)
   return json?Response.json(publicResult(result),{headers}):new Response(null,{status:303,headers:{...headers,location:url.pathname}})
  }
  const tx=new Transaction(env,a);tx.action='commercial:view';await latestCommercial(env,tx,row)
  const events=(await all(env,'commercialEvents')).filter(r=>r.value.proposalId===row.id)
  if(!events.some(r=>r.value.type==='viewed'&&r.value.operatorId===session.operator.id)){
   await tx.record('commercialEvents',{proposalId:row.id,estimateId:row.value.estimateId,opportunityId:row.value.opportunityId,type:'viewed',operatorId:session.operator.id,contact:session.operator.email,fingerprint:row.value.fingerprint,at:Date.now()});await tx.commit()
  }
  const binding=events.filter(r=>r.value.type==='signature-binding').at(-1),signed=events.some(r=>r.value.type==='signature-evidence'&&r.value.status==='verified'&&r.value.bindingId===binding?.id&&r.value.fingerprint===row.value.fingerprint&&r.value.proposalRevision===row.revision),signaturePending=row.value.document.signatureRequired&&!signed
  const decided=events.find(r=>['accepted','rejected'].includes(r.value.type))
  const response=decided?`<p>${e(decided.value.type)} by ${e(decided.value.name)} · ${e(decided.value.reason)}</p>`:`<form method="post" class="g-form"><input type="hidden" name="key" value="${uuid()}"><input type="hidden" name="revision" value="${e(row.revision)}"><input type="hidden" name="fingerprint" value="${e(row.value.fingerprint)}"><label class="g-field"><span>Your response</span><select name="outcome"><option value="question">Ask a question</option><option value="rejected">Reject proposal</option>${signaturePending?'':'<option value="accepted">Accept exact proposal</option>'}</select></label>${area('reason','Question or decision reason')}${signaturePending?'':`<div class="g-field--wide">${check('confirm','I accept the exact proposal shown above (required only for acceptance).',false,'accept-exact-proposal')}</div>`}<div class="g-actions"><button class="g-btn g-btn--primary" type="submit">Submit response</button></div></form>`
  const panel=`<section id="client-response" class="g-block"><h2>Your review · proposal version ${row.value.number}</h2><p>${signed?'Inkwell signature and artifacts verified. The agency owner confirmed that the original PDF matches this proposal. ':signaturePending?'Signature evidence is pending; acceptance is unavailable. ':''}Signed in as ${e(session.operator.email)}. Your response binds this complete proposal, including its price and payment schedule.</p>${signed?`<p><a href="${url.pathname}/evidence/signed">Download signed proposal</a> · <a href="${url.pathname}/evidence/certificate">Download signing certificate</a></p>`:''}${response}<ul>${events.filter(r=>r.value.type==='question').map(r=>`<li>${e(r.value.reason)}</li>`).join('')}</ul></section>`
  await fence(env,a)
  return new Response(commercialProposalHtml(row.value.document).replace('</main>',panel+'</main>'),{headers:{...headers,'content-type':'text/html; charset=utf-8'}})
 }catch(error){return Response.json({error:error instanceof Fault?error.message:'Proposal response unavailable; reload before trying again'},{status:error instanceof Fault?error.status:409,headers})}
}
