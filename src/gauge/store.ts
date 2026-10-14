import type { Bindings } from '../auth.server'
import type { Session } from '../modules/operator-auth/index.mjs'
import { decode, type Kind, type Row, type Value, need, uuid } from './model'
export interface Actor { session: Session; role: string; personId: string | null; grantVersion: number | null }
export async function actor(env: Bindings, session: Session): Promise<Actor> {
 const grant = await env.DB.prepare('SELECT * FROM g_grants WHERE operator_id=? AND enabled=1').bind(session.operator.id).first<{ role: string; person_id: string; version: number }>()
 return { session, role: session.operator.role === 'owner' ? 'owner' : grant?.role ?? 'none', personId: grant?.person_id ?? null, grantVersion: grant?.version ?? null }
}
export function authority(a: Actor, privileged = false) {
 const owner = a.role === 'owner'
 return { sql: `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND s.operator_version=o.version AND o.status='active' AND s.revoked_at IS NULL AND s.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER) AND ${owner ? "o.role='owner'" : "EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=o.id AND g.enabled=1 AND g.version=? AND g.role=? AND g.person_id IS ?)"})${privileged && !['owner','finance'].includes(a.role) ? ' AND 0' : ''}`, params: [a.session.id, a.session.operator.id, ...(owner ? [] : [a.grantVersion, a.role, a.personId])] }
}
export async function fence(env: Bindings, a: Actor) { const p = authority(a); need((await env.DB.prepare(`SELECT (${p.sql}) AS ok`).bind(...p.params).first<{ok:number}>())?.ok === 1, 'Access changed; sign in again or ask the owner for a grant', 403) }
export const finance = (a: Actor) => ['owner','finance'].includes(a.role)
export async function get(env: Bindings, k: Kind, id: string): Promise<Row> { const r = await env.DB.prepare(`SELECT id,revision,data FROM g_${k} WHERE id=?`).bind(id).first<{id:string;revision:string;data:string}>(); need(r, 'Record not found', 404); return decode(r) }
export async function all(env: Bindings, k: Kind): Promise<Row[]> { return (await env.DB.prepare(`SELECT id,revision,data FROM g_${k} ORDER BY rowid`).all<{id:string;revision:string;data:string}>()).results.map(decode) }
export async function access(env: Bindings, a: Actor, engagementId: string, manage = false): Promise<Row> {
 const e = await get(env, 'engagements', engagementId)
 need(finance(a) || (a.role === 'lead' && e.value.leadId === a.personId) || (!manage && (e.value.members ?? []).includes(a.personId)), 'This engagement is not assigned to you', 403)
 return e
}
export class Transaction {
 statements: D1PreparedStatement[] = []
 constructor(public env: Bindings, public actor: Actor) {}
 sql(sql: string, ...params: any[]) { this.statements.push(this.env.DB.prepare(sql).bind(...params)) }
 guard(sql: string, ...params: any[]) { this.sql(`INSERT INTO g_assert(ok) VALUES(CASE WHEN (${sql}) THEN 1 ELSE 0 END)`, ...params); this.sql('DELETE FROM g_assert') }
 observe(k: Kind, row: Row) { this.guard(`EXISTS(SELECT 1 FROM g_${k} WHERE id=? AND revision=? AND data=?)`, row.id, row.revision, JSON.stringify(row.value)) }
 async record(k: Kind, value: Value, previous?: Row, id = uuid(), action = 'create'): Promise<Row> {
  if (previous) { this.observe(k, previous); this.sql('INSERT INTO g_history(kind,record_id,revision,data,actor,action,at) VALUES(?,?,?,?,?,?,?)', k, previous.id, previous.revision, JSON.stringify(previous.value), this.actor.session.operator.id, action, Date.now()) }
  const row = { id: previous?.id ?? id, revision: uuid(), value }
  if (previous) this.sql(`UPDATE g_${k} SET revision=?,data=? WHERE id=?`, row.revision, JSON.stringify(value), row.id)
  else this.sql(`INSERT INTO g_${k}(id,revision,data) VALUES(?,?,?)`, row.id, row.revision, JSON.stringify(value))
  return row
 }
 async commit() { const p = authority(this.actor); const check = () => this.env.DB.prepare(`INSERT INTO g_assert(ok) VALUES(CASE WHEN (${p.sql}) THEN 1 ELSE 0 END)`).bind(...p.params); await this.env.DB.batch([check(), ...this.statements, check(), this.env.DB.prepare('DELETE FROM g_assert')]) }
}
