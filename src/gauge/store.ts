import type { Bindings } from '../auth.server'
import { type AgentScope, liveAgentSql } from './agent-grants'
import { normalizeCustom,definitionStamp } from './custom-values'
import { assertPeriodWritable } from './period-locks'
import { agency } from './agency'
import type { Session } from '../modules/operator-auth/index.mjs'
import { decode, type Kind, type Row, type Value, need, uuid } from './model'
export interface Actor { session: Session; role: string; personId: string | null; grantVersion: number | null; currency: string; timezone: string; customDefinitions?:Row[];customHistory?:Row[];customStamp?:string;agentScope?: AgentScope; clientProposal?: {id:string;revision:string}; scheduled?: {id:string;revision:string} }
export async function actor(env: Bindings, session: Session): Promise<Actor> {
 const grant = await env.DB.prepare('SELECT * FROM g_grants WHERE operator_id=? AND enabled=1').bind(session.operator.id).first<{ role: string; person_id: string; version: number; purpose: string; engagement_ids: string; granted_by: string }>()
 const customDefinitions=await all(env,'customFields'),customHistory=(await env.DB.prepare("SELECT record_id AS id,revision,data FROM g_history WHERE kind='customFields'").all<any>()).results.map(decode)
 return {customDefinitions,customHistory,customStamp:definitionStamp(customDefinitions), ...await agency(env), session, role: session.operator.role === 'owner' ? 'owner' : grant?.role ?? 'none', personId: grant?.person_id ?? null, grantVersion: grant?.version ?? null, ...(grant?.role==='agent'?{agentScope:{purpose:grant.purpose,engagementIds:JSON.parse(grant.engagement_ids),grantedBy:grant.granted_by}}:{}) }
}
export function authority(a: Actor, privileged = false) {
 if(a.clientProposal)return {sql:`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN g_commercial_proposal_authority c ON c.recipient_id=o.id JOIN g_commercialProposals p ON p.id=c.proposal_id JOIN oa_operators owner ON owner.id=c.owner_id WHERE s.id=? AND o.id=? AND s.operator_version=o.version AND o.status='active' AND s.revoked_at IS NULL AND s.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER) AND p.id=? AND p.revision=? AND c.revision=p.revision AND json_extract(p.data,'$.status')='released' AND lower(o.email)=lower(json_extract(p.data,'$.document.recipient.contact')) AND owner.status='active' AND owner.role='owner' AND o.role='member' AND NOT EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=o.id AND g.enabled=1))`,params:[a.session.id,a.session.operator.id,a.clientProposal.id,a.clientProposal.revision]}
 if(a.scheduled)return {sql:`EXISTS(SELECT 1 FROM g_retainer_schedule_authority c JOIN g_retainerSchedules s ON s.id=c.schedule_id JOIN oa_operators o ON o.id=c.operator_id WHERE c.schedule_id=? AND c.revision=? AND s.revision=c.revision AND json_extract(s.data,'$.enabled')=1 AND o.id=? AND o.status='active' AND (o.role='owner' OR EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=o.id AND g.enabled=1 AND g.role='finance' AND g.version=?)))`,params:[a.scheduled.id,a.scheduled.revision,a.session.operator.id,a.grantVersion]}
 const owner = a.role === 'owner'
 return { sql: `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND s.operator_version=o.version AND o.status='active' AND s.revoked_at IS NULL AND s.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER) AND ${owner ? "o.role='owner'" : "EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=o.id AND g.enabled=1 AND g.version=? AND g.role=? AND g.person_id IS ?)"})${a.role==='agent'?` AND EXISTS(${liveAgentSql} AND g.version=?)`:''}${a.personId?" AND NOT EXISTS(SELECT 1 FROM g_people WHERE id=? AND json_extract(data,'$.privacyErased')=1)":''}${privileged && !['owner','finance'].includes(a.role) ? ' AND 0' : ''}`, params: [a.session.id, a.session.operator.id, ...(owner ? [] : [a.grantVersion, a.role, a.personId]), ...(a.role==='agent'?[a.session.operator.id,a.grantVersion]:[]),...(a.personId?[a.personId]:[])] }
}
export async function fence(env: Bindings, a: Actor) { if(a.personId)need(!(await env.DB.prepare("SELECT 1 FROM g_people WHERE id=? AND json_extract(data,'$.privacyErased')=1").bind(a.personId).first()),'This person was erased; ask the owner',403); if(a.customStamp!==undefined)need(a.customStamp===definitionStamp(await all(env,'customFields')),'Custom field policy changed; refresh before continuing',409); const p = authority(a); need((await env.DB.prepare(`SELECT (${p.sql}) AS ok`).bind(...p.params).first<{ok:number}>())?.ok === 1, 'Access changed; sign in again or ask the owner for a grant', 403) }
export const finance = (a: Actor) => ['owner','finance'].includes(a.role)
export async function get(env: Bindings, k: Kind, id: string): Promise<Row> { const r = await env.DB.prepare(`SELECT id,revision,data FROM g_${k} WHERE id=?`).bind(id).first<{id:string;revision:string;data:string}>(); need(r, 'Record not found', 404); const row=decode(r);if(k==='people')need(!row.value.privacyErased,'This worker was erased',410);return row }
export async function all(env: Bindings, k: Kind): Promise<Row[]> {
 // Portable restores need not retain SQLite rowids. Commercial latest-version and
 // provider history reads follow business ordering, with stable identity for ties.
 const field=['estimates','commercialProposals'].includes(k)?'number':['commercialEvents','providerUses'].includes(k)?'at':['providerConnections','providerJobs'].includes(k)?'createdAt':null
 const order=field?`json_extract(data,'$.${field}'),id`:'rowid'
 return (await env.DB.prepare(`SELECT id,revision,data FROM g_${k} ORDER BY ${order}`).all<{id:string;revision:string;data:string}>()).results.map(decode)
}
export async function access(env: Bindings, a: Actor, engagementId: string, manage = false): Promise<Row> {
 const e = await get(env, 'engagements', engagementId)
 need(finance(a) || (a.role === 'lead' && e.value.leadId === a.personId) || (!manage && (e.value.members ?? []).includes(a.personId)), 'This engagement is not assigned to you', 403)
 return e
}
export class Transaction {
 statements: D1PreparedStatement[] = []
 /** The command's request key and action, kept on each GOVERN-005 audit row. */
 key: string | null = null
 action: string | null = null
 customWrite?:{scope:string;id?:string;values:any};customObserved=false;customOverlay?:Row[];customImport?:Value
 reopeningCloseId?:string
 constructor(public env: Bindings, public actor: Actor) {}
 /** GOVERN-005: an append-only audit row in the committing batch; src/gauge/audit.ts seals it into the chain. */
 audit(action: string, k: string, recordId: string, data: Value, link: { previousRevision?: string | null, revision?: string | null } = {}) {
  this.sql('INSERT INTO g_audit(at,actor,role,person_id,request_key,action,kind,record_id,previous_revision,revision,data) VALUES(?,?,?,?,?,?,?,?,?,?,?)', Date.now(), this.actor.session.operator.id, this.actor.role, this.actor.personId, this.key, action, k, recordId, link.previousRevision ?? null, link.revision ?? null, JSON.stringify(data))
 }
 sql(sql: string, ...params: any[]) { this.statements.push(this.env.DB.prepare(sql).bind(...params)) }
 guard(sql: string, ...params: any[]) { this.sql(`INSERT INTO g_assert(ok) VALUES(CASE WHEN (${sql}) THEN 1 ELSE 0 END)`, ...params); this.sql('DELETE FROM g_assert') }
 observe(k: Kind, row: Row) { this.guard(`EXISTS(SELECT 1 FROM g_${k} WHERE id=? AND revision=? AND data=?)`, row.id, row.revision, JSON.stringify(row.value)) }
 async record(k: Kind, value: Value, previous?: Row, id: string = uuid(), action = 'create', inherited?:Value): Promise<Row> {
  value=await normalizeCustom(this.env,this,k,value,previous,inherited)
  await assertPeriodWritable(this.env,this,k,value,previous?.value)
  if (previous) { this.observe(k, previous); this.sql('INSERT INTO g_history(kind,record_id,revision,data,actor,action,at) VALUES(?,?,?,?,?,?,?)', k, previous.id, previous.revision, JSON.stringify(previous.value), this.actor.session.operator.id, action, Date.now()) }
  const row = { id: previous?.id ?? id, revision: uuid(), value }
  if (previous) this.sql(`UPDATE g_${k} SET revision=?,data=? WHERE id=?`, row.revision, JSON.stringify(value), row.id)
  else this.sql(`INSERT INTO g_${k}(id,revision,data) VALUES(?,?,?)`, row.id, row.revision, JSON.stringify(value))
  this.audit(action !== 'create' ? action : this.action ?? (previous ? 'update' : 'create'), k, row.id, value, { previousRevision: previous?.revision ?? null, revision: row.revision })
  return row
 }
 async commit() { const p = authority(this.actor); const check = () => this.env.DB.prepare(`INSERT INTO g_assert(ok) VALUES(CASE WHEN (${p.sql}) THEN 1 ELSE 0 END)`).bind(...p.params); await this.env.DB.batch([check(), ...this.statements, check(), this.env.DB.prepare('DELETE FROM g_assert')]) }
}
