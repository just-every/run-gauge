import type { Bindings } from '../auth.server'
import { type Actor, all } from './store'
import { microsoftOwner } from './microsoft'
import { escape as e, input, form, select, choices, check, decision, table } from './ui-forms'

/** Configuration stays on the existing owner Access page. Every action has a text label. */
export async function microsoftSection(env: Bindings, a: Actor) {
 await microsoftOwner(env,a)
 const connections=(await all(env,'providerConnections')).filter(c=>c.value.provider==='microsoft'&&!c.value.revokedAt)
 const tenants=await all(env,'graphTenants'), selections=await all(env,'graphSelections'), threads=await all(env,'graphThreads'), evidence=await all(env,'graphEvidence'), people=await all(env,'people'), releases=await all(env,'invoiceAccess'), invoices=await all(env,'invoices')
 const count=(n:number,noun:string)=>`${n} ${noun}${n===1?'':'s'}`
 const when=(value:string)=>new Date(value).toISOString().slice(0,16).replace('T',' ')+' UTC'
 const named=connections.map(c=>({...c,value:{name:c.value.accountLabel}}))
 let body='<div id="microsoft-context"><div class="g-titlebar"><h2>Microsoft work context</h2></div><p class="g-lede">Review tenant consent, then select each licensed staff mailbox and collection scope. Private event details stay private. Replies never approve an invoice or record payment. Shared mailboxes and outbound messages remain unavailable.</p>'
 if(connections.length)body+=form('graph:inspect','Inspect tenant consent',select('connectionId','Microsoft connection',named),undefined,'Inspect tenant','g-card--form')
 body+=table('Tenant approval',tenants,[
  {label:'Connection',wrap:true,line:1,cell:r=>e(connections.find(c=>c.id===r.value.connectionId)?.value.accountLabel??'Historical connection')},
  {label:'Consent',wrap:true,line:2,cell:r=>`${e(r.value.status)}${r.value.exceptionClass?' · '+e(r.value.exceptionClass):''}<span class="g-sub">${e(r.value.roles?.join(', '))}</span>`},
  {label:'Directory',wrap:true,line:3,cell:r=>r.value.status==='connected'?`${e(count(r.value.directoryUsers,'user'))} · ${e(r.value.licensedUsers)} licensed`:'Review Microsoft tenant approval'},
 ])
 if(connections.length)body+=form('graph:select','Select staff mailbox',select('connectionId','Microsoft connection',named)+select('personId','Gauge staff profile',people.filter(p=>!p.value.privacyErased))+input('mailboxId','Microsoft user GUID')+choices('scopes','Collection scopes',['calendar','mail','calendar mail'])+input('from','Calendar window start','','date')+input('to','Calendar window end','','date')+input('reason','Consent review reason')+'<input type="hidden" name="mailboxKind" value="staff">'+check('confirm','I reviewed tenant approval for this exact licensed staff mailbox; it is not shared.',false,'reviewed-exact-mailbox'),undefined,'Select mailbox','g-card--form')
 body+=table('Selected mailboxes',selections,[
  {label:'Staff mailbox',wrap:true,line:1,cell:r=>`${e(people.find(p=>p.id===r.value.personId)?.value.name)}<span class="g-sub">${e(r.value.mailbox)}</span>`},
  {label:'Scope',wrap:true,line:2,cell:r=>e(r.value.stoppedAt?'Stopped':Object.entries(r.value.scopes).map(([scope,status])=>`${scope}: ${status}`).join(' · '))},
  {label:'Latest collection',wrap:true,line:3,cell:r=>e(Object.entries(r.value.lastSync).map(([scope,last]:[string,any])=>`${scope}: ${last.status}${last.exceptionClass?' · '+last.exceptionClass:` · ${count(last.found,'item')}`}`).join(' · ')||'Not collected')},
 ],r=>r.value.stoppedAt?'':Object.keys(r.value.scopes).filter(scope=>r.value.scopes[scope]==='active').map(scope=>decision('graph:sync',`Read ${scope}`,r,false,'secondary',`<input type="hidden" name="scope" value="${e(scope)}">`)+decision('graph:revoke-scope',`Stop ${scope}`,r,false,'quiet',`<input type="hidden" name="scope" value="${e(scope)}"><input type="hidden" name="reason" value="Owner stopped this scope">`)).join('')+decision('graph:stop','Stop mailbox',r,true,'quiet'))
 const active=selections.filter(s=>!s.value.stoppedAt&&s.value.scopes.mail==='active')
 const released=releases.filter(r=>r.value.status==='released'&&r.value.expiresAt>Date.now())
 if(active.length&&released.length)body+=form('graph:bind-invoice','Bind invoice conversation',select('selection','Staff mailbox',active.map(r=>({...r,id:r.id+'@'+r.revision,value:{name:r.value.mailbox}})))+select('release','Exact invoice release',released.map(r=>({...r,id:r.id+'@'+r.revision,value:{name:(invoices.find(i=>i.id===r.value.invoiceId)?.value.number??'Invoice')+' · '+r.value.contact}})))+input('messageId','Reviewed outgoing Microsoft message id')+input('reason','Invoice thread review reason'),undefined,'Bind conversation','g-card--form')
 body+=table('Invoice conversations',threads,[{label:'Invoice',wrap:true,line:1,cell:r=>e(invoices.find(i=>i.id===r.value.invoiceId)?.value.number??'Historical invoice')},{label:'Recipient',wrap:true,line:2,cell:r=>e(r.value.contact)},{label:'Review',wrap:true,line:3,cell:r=>e(r.value.reason)}])
 body+=table('Microsoft context',evidence.filter(r=>!r.value.removed),[
  {label:'Context',wrap:true,line:1,cell:r=>e(r.value.subject)},
  {label:'Kind',wrap:true,line:2,cell:r=>r.value.scope==='calendar'?`${r.value.private?'Private · ':''}${r.value.cancelled?'Canceled':e(r.value.showAs)}`:'Invoice reply'},
  {label:'When',wrap:true,line:3,cell:r=>e(r.value.scope==='calendar'?`${when(r.value.start)} to ${when(r.value.end)}`:when(r.value.receivedAt))},
 ])
 return body+'</div>'
}
