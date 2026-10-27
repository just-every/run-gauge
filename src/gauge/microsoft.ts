import type { Bindings } from '../auth.server'
import { type Actor, Transaction, all, get, fence } from './store'
import { type Row, type Value, Fault, need, text, date } from './model'
import { sha256 } from '../modules/import-kit/src/d1/index'
import { startReadback, finishReadback } from './commercial-readback'
import { dispatchCredential, recordProviderUse, type ProviderOperation } from './provider-custody'
import { microsoftToken, microsoftGet, microsoftPages, MicrosoftRefusal } from './microsoft-api'
import { calendarContext, graphId } from './microsoft-context'
import { bindMicrosoftThread, collectMicrosoftReplies } from './microsoft-replies'

export const graphRoles: Record<string, string[]> = {
 directory: ['User.Read.All','Directory.Read.All','User.ReadWrite.All','Directory.ReadWrite.All'],
 calendar: ['Calendars.ReadBasic','Calendars.Read','Calendars.ReadWrite'],
 mail: ['Mail.Read','Mail.ReadWrite'],
}
export async function microsoftOwner(env: Bindings, a: Actor) {
 need(a.role === 'owner' && a.session.operator.role === 'owner' && a.session.kind === 'native' && !a.appKey && !a.scheduled && !a.clientProposal, 'Only the native owner manages Microsoft work context', 403)
 await fence(env, a)
}
export async function graphConnection(env: Bindings, tx: Transaction, id: unknown) {
 const c = await get(env, 'providerConnections', text(id, 'Microsoft connection'))
 need(c.value.provider === 'microsoft' && !c.value.revokedAt, 'Choose an active Microsoft connection', 409)
 tx.observe('providerConnections', c); return c
}
export async function graphToken(env: Bindings, c: Row, job: string, scope: string) {
 const raw = await dispatchCredential(env, c.id, c.value.version, job, `graph:${scope}` as ProviderOperation)
 const result = await microsoftToken(raw)
 if (!graphRoles[scope].some(r => result.roles.includes(r))) throw new MicrosoftRefusal('permission-revoked')
 return result
}
export async function graphSelection(env: Bindings, a: Actor, tx: Transaction, input: Value, scope?: string) {
 const s = await get(env, 'graphSelections', text(input.id, 'Microsoft mailbox selection'))
 need(s.revision === input.revision, 'Microsoft mailbox selection changed; refresh', 409)
 need(!s.value.stoppedAt && (!scope || s.value.scopes[scope] === 'active'), 'This Microsoft collection scope is stopped; select it again after reviewing consent', 409)
 const c = await graphConnection(env, tx, s.value.connectionId)
 need(c.value.version === s.value.credentialVersion, 'Credential changed; stop and select the mailbox again', 409)
 const authority = 'EXISTS(SELECT 1 FROM g_graph_authority WHERE selection_id=? AND owner_id=? AND credential_version=?)'
 const params = [s.id, a.session.operator.id, c.value.version]
 need((await env.DB.prepare(`SELECT (${authority}) AS ok`).bind(...params).first<{ok:number}>())?.ok, 'Restored or foreign selection has no collection authority; select the mailbox again', 409)
 tx.guard(authority, ...params); tx.observe('graphSelections', s)
 const person = await get(env, 'people', s.value.personId)
 need(!person.value.privacyErased, 'This staff profile was erased; collection is stopped', 409); tx.observe('people', person)
 return {s,c}
}
export async function microsoftCommand(env: Bindings, a: Actor, action: string, input: Value): Promise<Value> {
 await microsoftOwner(env, a)
 need(['graph:inspect','graph:select','graph:sync','graph:revoke-scope','graph:stop','graph:bind-invoice'].includes(action), 'Unknown Microsoft action')
 const work = await startReadback(env,a,input,action); if (work.previous) return work.previous
 const {tx,digest} = work as {tx:Transaction;digest:string}
 if (action === 'graph:inspect') {
  const c = await graphConnection(env,tx,input.connectionId), id = sha256('graph:tenant:'+c.id)
  const prior = (await all(env,'graphTenants')).find(r=>r.id===id)
  let result: Value
  try {
   const token = await graphToken(env,c,id,'directory'), users = await microsoftPages(token.token,'/users?$select=id,mail,assignedLicenses&$top=100')
   await dispatchCredential(env,c.id,c.value.version,id,'graph:directory')
   result = {tenantId:token.tenantId, roles:token.roles.filter(r=>Object.values(graphRoles).flat().includes(r)), directoryUsers:users.length, licensedUsers:users.filter(u=>u.assignedLicenses?.length).length, status:'connected', exceptionClass:null}
  } catch (error) { if (!(error instanceof MicrosoftRefusal)) throw error; result = {status:'exception',exceptionClass:error.exceptionClass} }
  const row = await tx.record('graphTenants',{...result,connectionId:c.id,credentialVersion:c.value.version,inspectedBy:a.session.operator.id,at:Date.now()},prior,id,action)
  await recordProviderUse(tx,{connectionId:c.id,credentialVersion:c.value.version,jobId:id,operation:'graph:directory',outcome:result.status==='connected'?'accepted':'rejected'})
  return finishReadback(tx,digest,row,{status:result.status,exceptionClass:result.exceptionClass})
 }
 if (action === 'graph:select') {
  need(input.mailboxKind==='staff','Shared mailboxes require separate consent and are not collected',403)
  need(input.confirm==='reviewed-exact-mailbox','Explicitly confirm the exact staff mailbox and tenant consent',400)
  const c = await graphConnection(env,tx,input.connectionId), person = await get(env,'people',text(input.personId,'Staff profile'))
  need(!person.value.privacyErased,'Choose an active staff profile',409); tx.observe('people',person)
  const mailboxId = text(input.mailboxId,'Microsoft user GUID',36).toLowerCase()
  need(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(mailboxId),'Choose an exact Microsoft user GUID')
  const scopes = [...new Set(String(input.scopes).split(/[ ,]+/).filter(Boolean))]
  need(scopes.length>0&&scopes.every(s=>s==='calendar'||s==='mail'),'Select calendar, mail or both')
  const from = date(input.from), to = date(input.to)
  need(from<=to&&Date.parse(to)-Date.parse(from)<=90*86400000,'Choose a calendar window no longer than 90 days')
  const tenant = (await all(env,'graphTenants')).find(t=>t.value.connectionId===c.id&&t.value.status==='connected'&&t.value.credentialVersion===c.value.version)
  need(tenant,'Inspect tenant consent before selecting mailboxes',409); tx.observe('graphTenants',tenant)
  const token = await graphToken(env,c,c.id,'directory')
  need(scopes.every(s=>graphRoles[s].some(r=>token.roles.includes(r))),'Microsoft tenant approval is missing a selected scope',403)
  const user = await microsoftGet(token.token,`/users/${mailboxId}?$select=id,mail,userType,accountEnabled,assignedLicenses`)
  need(user.id===mailboxId&&user.userType==='Member'&&user.accountEnabled===true&&Array.isArray(user.assignedLicenses)&&user.assignedLicenses.length>0&&typeof user.mail==='string'&&/^[^\s@]+@[^\s@]+$/.test(user.mail),'A licensed, enabled staff mailbox is required; shared and unlicensed accounts are refused',409)
  const active = (await all(env,'graphSelections')).filter(s=>s.value.connectionId===c.id&&s.value.mailboxId===mailboxId&&!s.value.stoppedAt)
  need(active.length===0,'This mailbox is already selected; stop its selection before changing consent',409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_graphSelections WHERE json_extract(data,'$.connectionId')=? AND json_extract(data,'$.mailboxId')=? AND json_extract(data,'$.stoppedAt') IS NULL)",c.id,mailboxId)
  await dispatchCredential(env,c.id,c.value.version,c.id,'graph:directory')
  const row = await tx.record('graphSelections',{connectionId:c.id,credentialVersion:c.value.version,tenantId:token.tenantId,mailboxId,mailbox:user.mail.toLowerCase(),personId:person.id,from,to,scopes:Object.fromEntries(scopes.map(s=>[s,'active'])),reason:text(input.reason,'Consent review reason'),selectedBy:a.session.operator.id,selectedAt:Date.now(),stoppedAt:null,lastSync:{}},undefined,undefined,action)
  tx.sql('INSERT INTO g_graph_authority(selection_id,owner_id,credential_version) VALUES(?,?,?)',row.id,a.session.operator.id,c.value.version)
  await recordProviderUse(tx,{connectionId:c.id,credentialVersion:c.value.version,jobId:row.id,operation:'graph:directory',outcome:'accepted'})
  return finishReadback(tx,digest,row)
 }
 const scope = input.scope
 if (action==='graph:sync'||action==='graph:revoke-scope') need(scope==='calendar'||scope==='mail','Choose calendar or mail')
 if (action==='graph:stop'||action==='graph:revoke-scope') {
  const s = await get(env,'graphSelections',text(input.id,'Microsoft mailbox selection'))
  need(s.revision===input.revision,'Microsoft mailbox selection changed; refresh',409)
  const reason = text(input.reason,'Revocation reason')
  if(action==='graph:stop')tx.sql('DELETE FROM g_graph_authority WHERE selection_id=?',s.id)
  const row = await tx.record('graphSelections',{...s.value,...(action==='graph:stop'?{stoppedAt:Date.now(),stopReason:reason}:{scopes:{...s.value.scopes,[scope]:'revoked'},revocationReason:reason})},s,undefined,action)
  return finishReadback(tx,digest,row)
 }
 const {s,c} = await graphSelection(env,a,tx,input,action==='graph:sync'?scope:undefined)
 if(action==='graph:bind-invoice')return bindMicrosoftThread(env,a,tx,digest,s,c,input)
 let found = 0, changed = 0, status = 'read', exceptionClass: string|null = null
 let items: {id:string;value:Value}[] = []
 try {
  const token = await graphToken(env,c,s.id,scope)
  if(scope==='calendar') {
   const query = new URLSearchParams({startDateTime:s.value.from+'T00:00:00Z',endDateTime:s.value.to+'T23:59:59Z',$top:'100',$select:'id,subject,sensitivity,start,end,isCancelled,showAs'})
   const source = await microsoftPages(token.token,`/users/${s.value.mailboxId}/calendar/calendarView?${query}`)
   items = source.map(item=>calendarContext(s,item))
  } else items = await collectMicrosoftReplies(env,tx,s,token.token)
  await dispatchCredential(env,c.id,c.value.version,s.id,`graph:${scope}` as ProviderOperation)
 } catch(error) {
  if(!(error instanceof MicrosoftRefusal))throw error
  status='exception'; exceptionClass=error.exceptionClass
 }
 if(status==='read') {
  const known = (await all(env,'graphEvidence')).filter(r=>r.value.selectionId===s.id&&r.value.scope===scope), seen = new Set(items.map(i=>i.id))
  for(const item of items) {
   const prior = known.find(r=>r.id===item.id)
   if(prior&&JSON.stringify(prior.value)===JSON.stringify(item.value))continue
   await tx.record('graphEvidence',item.value,prior,item.id,prior?'graph:context-update':'graph:context'); changed++
  }
  // A complete calendar snapshot removes vanished busy evidence, including an event becoming private or canceled.
  if(scope==='calendar') for(const prior of known) if(!seen.has(prior.id)&&!prior.value.removed) {await tx.record('graphEvidence',{...prior.value,removed:true,cancelled:true},prior,undefined,'graph:context-removed');changed++}
  found=items.length
 }
 const row = await tx.record('graphSelections',{...s.value,scopes:exceptionClass==='permission-revoked'?{...s.value.scopes,[scope]:'permission-revoked'}:s.value.scopes,lastSync:{...s.value.lastSync,[scope]:{at:Date.now(),status,exceptionClass,found,changed}}},s,undefined,action)
 await recordProviderUse(tx,{connectionId:c.id,credentialVersion:c.value.version,jobId:s.id,operation:`graph:${scope}` as ProviderOperation,outcome:status==='read'?'accepted':exceptionClass==='rate-limited'?'rate-limited':'rejected'})
 return finishReadback(tx,digest,row,{status,exceptionClass,found,changed})
}
