import assert from 'node:assert/strict'
import {harness} from '../gauge-harness.mjs'

// Held credentials enter only through the named-key injector, never through arguments or files.
for(const name of ['ENTRA_TENANT_ID','ENTRA_CLIENT_ID','ENTRA_CLIENT_SECRET'])assert(process.env[name],`Missing ${name}`)
const tenant=process.env.ENTRA_TENANT_ID,client=process.env.ENTRA_CLIENT_ID,secret=process.env.ENTRA_CLIENT_SECRET
const h=await harness({currency:'USD',timezone:'UTC'}), touched=[],directory=[]
h.providerEdge.handler=async(req,body)=>{
 const url=new URL(req.url)
 if(!['https://login.microsoftonline.com','https://graph.microsoft.com'].includes(url.origin))return null
 assert(req.method==='GET'||url.pathname===`/${tenant}/oauth2/v2.0/token`,'Live proof performs only token acquisition and Graph reads')
 const headers=new Headers(req.headers);headers.delete('host');headers.delete('content-length')
 const payload=body?new URLSearchParams(body).toString():undefined
 const response=await fetch(req.url,{method:req.method,headers,body:payload,redirect:'manual',signal:AbortSignal.timeout(20000)})
 const result=await response.json()
 if(url.origin==='https://graph.microsoft.com'&&url.pathname==='/v1.0/users'&&response.ok)directory.push(...result.value)
 touched.push({resource:url.origin==='https://login.microsoftonline.com'?'token':url.pathname==='/v1.0/users'?'directory':'selected-user',status:response.status})
 return Response.json(result,{status:response.status})
}
try{
 const connection=await h.cmd('provider:connect',{provider:'microsoft',accountLabel:'Microsoft live test tenant',credential:`${tenant}:${client}:${secret}`})
 const inspected=await h.cmd('graph:inspect',{connectionId:connection.id});assert.equal(inspected.status,'connected','Tenant consent and directory reads are live')
 const observation=(await h.state()).data.graphTenants[0]
 assert.equal(observation.value.directoryUsers,directory.length)
 const person=await h.cmd('save:people',{name:'Microsoft sandbox staff',timezone:'UTC'})
 const candidate=directory.find(u=>!u.assignedLicenses?.length)
 let unlicensedRefused=false,scopeUnavailable=false
 if(candidate){
  const refused=await h.cmd('graph:select',{connectionId:connection.id,personId:person.id,mailboxId:candidate.id,mailboxKind:'staff',confirm:'reviewed-exact-mailbox',scopes:'calendar',from:'2026-10-01',to:'2026-10-31',reason:'Check live unlicensed mailbox refusal'},h.owner,observation.value.roles.some(r=>r.startsWith('Calendars.'))?409:403)
  assert.equal((await h.state()).data.graphSelections.length,0);unlicensedRefused=/licensed, enabled staff mailbox/.test(refused.error);scopeUnavailable=/missing a selected scope/.test(refused.error);assert(unlicensedRefused||scopeUnavailable)
 }
 const beforeShared=touched.length
 await h.cmd('graph:select',{connectionId:connection.id,mailboxKind:'shared'},h.owner,403);assert.equal(touched.length,beforeShared)
 const current=(await h.state()).data.providerConnections.find(r=>r.id===connection.id);await h.cmd('provider:revoke',current)
 const beforeRevoked=touched.length;await h.cmd('graph:inspect',{connectionId:connection.id},h.owner,409);assert.equal(touched.length,beforeRevoked,'Revoked custody makes no live token or directory call')
 const serialized=JSON.stringify((await h.db.prepare('SELECT data FROM g_audit').all()).results)+JSON.stringify((await h.db.prepare('SELECT result FROM g_receipts').all()).results)+JSON.stringify(h.logs)
 assert(!serialized.includes(secret),'Live credential never enters logs, audit or command receipts')
 console.log(JSON.stringify({proof:'CONNECT-004 live app-only tenant through production commands',head:process.env.GAUGE_PROOF_HEAD??null,tokenAcquired:touched.some(r=>r.resource==='token'&&r.status===200),directoryUsers:observation.value.directoryUsers,licensedUsers:observation.value.licensedUsers,roles:observation.value.roles,unlicensedRefused,scopeUnavailable,sharedMailboxRefusedBeforeNetwork:true,revocationStopsNetwork:true,requests:touched,remaining:'A licensed mailbox is required for a live changed calendar event and exact invoice reply; shared mailbox and outbound message interoperability remain unimplemented'}))
}finally{await h.dispose()}
