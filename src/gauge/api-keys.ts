import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, Transaction, all, fence } from './store'
import { date, need, sum, text, uuid } from './model'
import { capacity } from './reports'
import { utilization } from './utilization'

// CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032 slice (ct 19 Oct 12:43Z): the owner creates read-only keys that answer one aggregate
// utilization figure set from GET /api/gauge/state. A key is shown once and kept only as SHA-256;
// it names no person and carries no rate, cost or pay.
export const keyScope = 'utilization:read'
const prefix = 'gauge_util_'
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')

export async function apiKeyCommand(env: Bindings, a: Actor, action: string, input: Record<string, any>) {
 await fence(env, a)
 need(a.role === 'owner', 'Only the owner manages API keys', 403)
 need(['apikey:create','apikey:revoke'].includes(action), 'Unknown action')
 const key = text(input.key, 'Unique request key', 200), digest = sha256(canonicalJson({ action, label: input.label ?? null, id: input.id ?? null }))
 const previous = await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>()
 // A replayed create answers its first outcome without the key: it was shown once.
 if (previous) { need(previous.actor === a.session.operator.id && previous.digest === digest, 'Request key already used for different work', 409); return JSON.parse(previous.result) }
 const tx = new Transaction(env, a), actor = a.session.operator.id, at = Date.now()
 tx.key = key
 if (action === 'apikey:create') {
  const label = text(input.label, 'Key label', 80), id = uuid(), token = prefix + base64url(crypto.getRandomValues(new Uint8Array(32)))
  const acknowledgement = { id, label, scope: keyScope, saved: true }
  tx.sql('INSERT INTO g_api_keys(id,label,scope,hash,created_by,created_at) VALUES(?,?,?,?,?,?)', id, label, keyScope, sha256(token), actor, at)
  tx.sql('INSERT INTO g_api_key_audit(key_id,label,action,actor,detail,at) VALUES(?,?,?,?,?,?)', id, label, 'create', actor, JSON.stringify({ scope: keyScope }), at)
  tx.audit('apikey:create', 'apiKeys', id, { label, scope: keyScope })
  tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)', key, actor, digest, JSON.stringify(acknowledgement))
  await tx.commit()
  return { ...acknowledgement, token }
 }
 const id = text(input.id, 'Key'), row = await env.DB.prepare('SELECT id,label,revoked_at FROM g_api_keys WHERE id=?').bind(id).first<{id:string;label:string;revoked_at:number|null}>()
 need(row, 'API key not found', 404); need(row.revoked_at === null, 'API key already revoked', 409)
 const acknowledgement = { id, label: row.label, revoked: true, saved: true }
 tx.guard('EXISTS(SELECT 1 FROM g_api_keys WHERE id=? AND revoked_at IS NULL)', id)
 tx.sql('UPDATE g_api_keys SET revoked_by=?,revoked_at=? WHERE id=?', actor, at, id)
 tx.sql('INSERT INTO g_api_key_audit(key_id,label,action,actor,detail,at) VALUES(?,?,?,?,?,?)', id, row.label, 'revoke', actor, '{}', at)
 tx.audit('apikey:revoke', 'apiKeys', id, { label: row.label, scope: keyScope })
 tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)', key, actor, digest, JSON.stringify(acknowledgement))
 await tx.commit()
 return acknowledgement
}

/** The owner's Access page: every key (never its value) and the latest audited activity. */
export async function apiKeyRegister(env: Bindings) {
 const keys = (await env.DB.prepare('SELECT k.id,k.label,k.scope,k.created_at,k.revoked_at,k.last_used_at,o.display_name AS created_by FROM g_api_keys k LEFT JOIN oa_operators o ON o.id=k.created_by ORDER BY k.created_at DESC').all<any>()).results
 const activity = (await env.DB.prepare('SELECT a.id,a.key_id,a.label,a.action,a.detail,a.at,COALESCE(o.display_name,a.actor) AS actor FROM g_api_key_audit a LEFT JOIN oa_operators o ON o.id=a.actor ORDER BY a.id DESC LIMIT 20').all<any>()).results
 return { keys, activity }
}

/**
 * A keyed read: the whole agency's utilization for an inclusive from–to window, aggregate only.
 * participantCount counts every person record; availableSeconds is their net calendar seconds after
 * holidays and leave, or null when any participant lacks a calendar day in the window (the known
 * subtotal and missing-day count stay explicit). approvedBillableSeconds sums approved, billable
 * client time whose work date (in the entry's own time zone) falls inside the window.
 */
export async function utilizationKeyRead(env: Bindings, token: string, from: string | null, to: string | null) {
 const key = await env.DB.prepare('SELECT id,label FROM g_api_keys WHERE hash=? AND scope=? AND revoked_at IS NULL').bind(sha256(token), keyScope).first<{id:string;label:string}>()
 need(key, 'Invalid or revoked API key', 401)
 const start = date(from), end = date(to)
 const data: any = Object.fromEntries(await Promise.all((['people','calendars','leave','staffing','time','engagements'] as const).map(async k => [k, await all(env, k)])))
 const cap = capacity(data, start, end), detail = utilization(data, cap, start, end).details
 const knownAvailableSeconds = sum(cap.map(c => c.knownAvailableSeconds)), missingCalendarDays = sum(cap.map(c => c.missingCalendarDays))
 const result = { scope: keyScope, from: start, to: end, participantCount: cap.length, availableSeconds: missingCalendarDays ? null : knownAvailableSeconds, knownAvailableSeconds, missingCalendarDays, approvedBillableSeconds: sum(detail.map(d => d.approvedBillableSeconds)), asOf: new Date().toISOString() }
 // The read is audited in the same batch that proves the key is still live; a key revoked mid-read answers nothing.
 const at = Date.now()
 try {
  await env.DB.batch([
   env.DB.prepare('INSERT INTO g_assert(ok) VALUES(CASE WHEN EXISTS(SELECT 1 FROM g_api_keys WHERE id=? AND revoked_at IS NULL) THEN 1 ELSE 0 END)').bind(key.id),
   env.DB.prepare('UPDATE g_api_keys SET last_used_at=? WHERE id=?').bind(at, key.id),
   env.DB.prepare('INSERT INTO g_api_key_audit(key_id,label,action,actor,detail,at) VALUES(?,?,?,?,?,?)').bind(key.id, key.label, 'read', `key:${key.label}`, JSON.stringify({ from: start, to: end }), at),
   env.DB.prepare("INSERT INTO g_audit(at,actor,action,kind,record_id,data) VALUES(?,?,'apikey:read','apiKeys',?,?)").bind(at, `key:${key.label}`, key.id, JSON.stringify({ label: key.label, scope: keyScope, from: start, to: end })),
   env.DB.prepare('DELETE FROM g_assert'),
  ])
 } catch { need(false, 'Invalid or revoked API key', 401) }
 return result
}

/** CONNECT-020 / CONNECT-024 / CONNECT-025 / CONNECT-026 / CONNECT-027 / CONNECT-028 / CONNECT-029 / CONNECT-030 / CONNECT-031 / CONNECT-032: RFC 7009 style self-revocation, without disclosing whether the key existed. */
export async function revokePresentedKey(env: Bindings, token: string) {
 const hash = sha256(token), at = Date.now()
 // INSERT ... SELECT and UPDATE share one transaction: concurrent calls audit the first revoke only.
 await env.DB.batch([
  env.DB.prepare("INSERT INTO g_api_key_audit(key_id,label,action,actor,detail,at) SELECT id,label,'revoke','key:' || label,'{}',? FROM g_api_keys WHERE hash=? AND scope=? AND revoked_at IS NULL").bind(at, hash, keyScope),
  env.DB.prepare("INSERT INTO g_audit(at,actor,action,kind,record_id,data) SELECT ?,'key:' || label,'apikey:revoke','apiKeys',id,json_object('label',label,'scope',scope) FROM g_api_keys WHERE hash=? AND scope=? AND revoked_at IS NULL").bind(at, hash, keyScope),
  env.DB.prepare("UPDATE g_api_keys SET revoked_by='key:' || label,revoked_at=? WHERE hash=? AND scope=? AND revoked_at IS NULL").bind(at, hash, keyScope),
 ])
}
