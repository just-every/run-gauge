import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'

// Extends the existing scenario journey through the built HTTP doors.
export async function scopeReviewJourney(h,{change,reviewer,person,read,input,preview}) {
 const {cmd,request,owner}=h
 const external=await h.invite('synthetic-gauge-8101'),other=await h.invite('synthetic-gauge-8102')
 const roles=[]
 for(const role of ['finance','lead','staff','agent']) {
  const member=await h.invite(`synthetic-gauge-81-${role}`)
  await cmd('grant',{operatorId:member.id,personId:person.id,role,enabled:true,...(role==='agent'?{purpose:'staffing',engagementIds:[input.changes[0].id]}:{})})
  roles.push(member)
 }
 const current=async()=> (await read()).data.projectScenarios.find(r=>r.id===change.id)
 const releaseInput=async(extra={})=>({...await current(),contact:'synthetic-gauge-8101@example.test',days:7,description:'Review the proposed extra prototype. Commercial agreement and signature remain separate.',reason:'Request unsigned feedback',...extra})
 for(const member of [...roles,external]) {
  await cmd('change:release-review',await releaseInput(),member.cookie,403)
  await cmd('change:revoke-review',{...await current(),reviewId:'unavailable',reason:'No authority'},member.cookie,403)
 }
 await cmd('change:release-review',await releaseInput({contact:'synthetic-gauge-81-staff@example.test'}),owner,409)
 const app=await cmd('appkey:create',{label:'Scope release refusal',operatorId:roles[2].id,scope:'projects:read'})
 assert.equal((await request('/api/gauge/v1/change:release-review','',{method:'POST',headers:{authorization:'Bearer '+app.token,'content-type':'application/json'},body:JSON.stringify(await releaseInput())})).status,403)
 assert.equal((await request('/api/gauge/command','',{method:'POST',headers:{authorization:'Bearer '+app.token,origin:h.origin,'content-type':'application/json'},body:JSON.stringify({action:'change:release-review',key:randomUUID(),...await releaseInput()})})).status,401)
 assert.equal((await h.post('/auth/invite',{email:'synthetic-gauge-8103@example.test',displayName:'Unconfirmed',role:'member'},owner)).status,202)
 await cmd('change:release-review',await releaseInput({contact:'synthetic-gauge-8103@example.test'}),owner,409)
 for(const days of [0,31])await cmd('change:release-review',await releaseInput({days}),owner,400)
 const sent=h.providerRequests.length
 const issued=await cmd('change:release-review',{...await releaseInput({days:1}),key:randomUUID()})
 let row=await current(),review=row.value.clientReviews.at(-1)
 assert(review.expiresAt-review.releasedAt>=86400000-10&&review.expiresAt-review.releasedAt<=86400000+10)
 assert.equal((await h.db.prepare('SELECT token_hash FROM g_scope_review_authority WHERE review_id=?').bind(review.id).first()).token_hash,createHash('sha256').update(issued.token).digest('hex'))
 const call=async(cookie=external.cookie,token=issued.token,body,reviewId=review.id)=>request(`/api/gauge/client-changes/${change.id}/${reviewId}`,cookie,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'x-gauge-review-token':token,origin:h.origin,'content-type':'application/json'}})
 assert.equal((await call('')).status,401)
 assert.equal((await call(other.cookie)).status,403)
 assert.equal((await call(external.cookie,'wrong')).status,403)
 let response=await call();assert.equal(response.status,200);let projection=await response.json()
 assert.deepEqual(Object.keys(projection).sort(),['id','revision','name','fingerprint','description','expiresAt','notice','response'].sort())
 assert.equal(projection.fingerprint,preview.fingerprint);assert.equal(projection.description,review.description);assert.equal(projection.response,null)
 assert.match(projection.notice,/unsigned response/);assert.match(projection.notice,/no signature evidence or budget, staffing, date, forecast, billing or adoption authority/)
 const before=(await read()).data,body={key:randomUUID(),revision:row.revision,outcome:'rejected',reason:'Please reduce the extra prototype'}
 assert.equal((await call(external.cookie,issued.token,{...body,reason:''})).status,400)
 assert.equal((await call(external.cookie,issued.token,{...body,revision:'old'})).status,409)
 const wrongOrigin=await request(`/api/gauge/client-changes/${change.id}/${review.id}`,external.cookie,{method:'POST',body:JSON.stringify(body),headers:{origin:'https://other.example.test','content-type':'application/json','x-gauge-review-token':issued.token}});assert.equal(wrongOrigin.status,403)
 const first=await call(external.cookie,issued.token,body);assert.equal(first.status,200);const receipt=await first.json()
 assert.deepEqual(await(await call(external.cookie,issued.token,body)).json(),receipt)
 assert.equal((await call(external.cookie,issued.token,{...body,reason:'Changed content'})).status,409)
 projection=await(await call()).json();assert.deepEqual(projection.response,{outcome:'rejected',reason:body.reason,notice:projection.notice})
 row=await current();const saved=row.value.clientResponses.at(-1)
 assert.equal(saved.recipientId,external.id);assert.equal(saved.fingerprint,preview.fingerprint);assert.equal(saved.key,body.key)
 assert.equal(h.providerRequests.length,sent,'Release and response send nothing')
 assert(!JSON.stringify((await read()).data).includes(issued.token))
 for(const kind of ['engagements','budgets','tasks','staffing','rates','time','invoices'])assert.deepEqual((await read()).data[kind],before[kind],`Unsigned rejection changes no ${kind}`)
 await cmd('projectScenario:adopt',{...row,asOf:input.asOf,selectedIds:[input.changes[0].id],fingerprint:preview.fingerprint,reason:'Unsigned response is not adoption'},owner,409)
 const audit=(await(await request(`/api/gauge/audit?recordId=${change.id}`,owner)).json()).entries
 const decisionAudit=audit.find(e=>e.action==='change:respond')
 assert.equal(decisionAudit.actor.id,external.id);assert.equal(decisionAudit.requestKey,body.key);assert.equal(decisionAudit.previousRevision,body.revision);assert.equal(decisionAudit.revision,receipt.revision)
 const accesses=audit.filter(e=>e.action==='change:review-access')
 assert(accesses.some(e=>e.result.status===200&&e.actor.id===external.id));assert(accesses.some(e=>e.result.status===403&&e.actor.id===other.id))
 await cmd('change:revoke-review',{...row,reviewId:review.id,reason:'End exact review'})
 assert.equal((await call()).status,403);assert.equal((await call(external.cookie,issued.token,body)).status,403)
 // Every new release replaces the preceding key, including replay requests.
 let replacement=await cmd('change:release-review',await releaseInput({days:30})),replacementRow=await current(),replacementReview=replacementRow.value.clientReviews.at(-1)
 assert.equal(replacementReview.expiresAt-replacementReview.releasedAt,30*86400000)
 const requestInput={...await releaseInput(),key:randomUUID()}
 const renewed=await cmd('change:release-review',requestInput)
 assert.equal((await cmd('change:release-review',requestInput)).token,undefined,'Replay never reissues the secret')
 assert.equal((await call(external.cookie,replacement.token,undefined,replacementReview.id)).status,403)
 row=await current();review=row.value.clientReviews.at(-1)
 const active=async(body)=>call(external.cookie,renewed.token,body)
 assert.equal((await active()).status,200)
 await h.db.prepare('UPDATE g_scope_review_authority SET expires_at=0 WHERE review_id=?').bind(review.id).run()
 assert.equal((await active()).status,403);assert.equal((await active({key:randomUUID(),revision:row.revision,outcome:'accepted',reason:'Expired'})).status,403)
 await h.db.prepare('UPDATE g_scope_review_authority SET expires_at=? WHERE review_id=?').bind(Date.now()+86400000,review.id).run()
 const ownerId=(await(await request('/auth/session',owner)).json()).operator.id
 await h.db.prepare("UPDATE oa_operators SET status='inactive' WHERE id=?").bind(ownerId).run()
 assert.equal((await active()).status,403);assert.equal((await active({key:randomUUID(),revision:row.revision,outcome:'accepted',reason:'Stopped owner'})).status,403)
 await h.db.prepare("UPDATE oa_operators SET status='active' WHERE id=?").bind(ownerId).run()
 await cmd('grant',{operatorId:external.id,personId:person.id,role:'staff',enabled:true})
 assert.equal((await active()).status,403);assert.equal((await active({key:randomUUID(),revision:row.revision,outcome:'accepted',reason:'Now internal'})).status,403)
 await cmd('grant',{operatorId:external.id,personId:person.id,role:'staff',enabled:false})
 const engagement=(await read()).data.engagements.find(r=>r.id===input.changes[0].id)
 const changed=await cmd('save:engagements',{...engagement.value,...engagement,scope:'Changed live baseline'})
 assert.equal((await active()).status,409);assert.equal((await active({key:randomUUID(),revision:row.revision,outcome:'accepted',reason:'Stale basis'})).status,409)
 // Restore exact fixture bytes for the remaining scenario journey. This models a
 // source read race; ordinary writes still remain revision-bound in production.
 await h.db.prepare('UPDATE g_engagements SET revision=?,data=? WHERE id=?').bind(engagement.revision,JSON.stringify(engagement.value),engagement.id).run()
 assert.equal((await active()).status,200)
 const successor=await cmd('change:prepare',{...input,previousId:change.id,fingerprint:preview.fingerprint,name:'Superseding exact review',reason:'Request a revision'})
 assert.equal((await active()).status,403);assert.equal((await active({key:randomUUID(),revision:row.revision,outcome:'accepted',reason:'Superseded'})).status,403)
 let approved=await cmd('change:review',{...successor,outcome:'approved',reason:'Independent exact review'},reviewer.cookie)
 let next=await cmd('change:release-review',{...approved,contact:'synthetic-gauge-8102@example.test',description:'Unsigned revised feedback',reason:'Review latest'})
 const latest=(await read()).data.projectScenarios.find(r=>r.id===next.id),nextReview=latest.value.clientReviews.at(-1)
 const path=`/api/gauge/client-changes/${next.id}/${nextReview.id}`,options={headers:{origin:h.origin,'content-type':'application/json','x-gauge-review-token':next.token}}
 const accepted=await request(path,other.cookie,{...options,method:'POST',body:JSON.stringify({key:randomUUID(),revision:next.revision,outcome:'accepted',reason:'This smaller alternative is suitable'})});assert.equal(accepted.status,200)
 const acceptedProjection=await(await request(path,other.cookie,options)).json();assert.equal(acceptedProjection.response.outcome,'accepted');assert.equal(acceptedProjection.response.reason,'This smaller alternative is suitable');assert.equal(acceptedProjection.response.notice,acceptedProjection.notice)
 approved=(await read()).data.projectScenarios.find(r=>r.id===next.id)
 await cmd('projectScenario:adopt',{...approved,asOf:input.asOf,selectedIds:[input.changes[0].id],fingerprint:preview.fingerprint,reason:'Unsigned acceptance is not adoption'},owner,409)
 await cmd('change:withdraw',{...approved,reason:'No signature or adoption authority'})
 assert.equal((await request(path,other.cookie,options)).status,403)
 assert.equal((await request(path,other.cookie,{...options,method:'POST',body:JSON.stringify({key:randomUUID(),revision:approved.revision,outcome:'accepted',reason:'Withdrawn'})})).status,403)
 for(const kind of ['engagements','budgets','tasks','staffing','rates','time','invoices'])assert.deepEqual((await read()).data[kind],before[kind],`Unsigned acceptance changes no ${kind}`)
 return successor
}
