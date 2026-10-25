import { webhookCredential } from './provider-job-webhook'
import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { Fault, type Row, type Value, integer, need, text, uuid } from './model'
import { type Actor, type Transaction, all, fence, get } from './store'

export type Provider = 'sendgrid' | 'resend' | 'crank' | 'inkwell' | 'zapier' | 'webhook' | 'receipt'
export type ProviderOperation = 'email:send' | 'email:read' | 'trigger:submit' | 'signature:read' | 'followup:verify'
export type ProviderOutcome = 'accepted' | 'rejected' | 'uncertain' | 'credential-rotated' | 'credential-revoked' | 'credential-disconnected' | 'rate-limited'
export interface ProviderUse { connectionId: string; credentialVersion: number; jobId: string; operation: ProviderOperation; outcome: ProviderOutcome }
export interface ProviderAcknowledgement { id: string | null; revision: string | null; saved: true }
const scopes: Record<Provider, ProviderOperation[]> = { sendgrid: ['email:send','email:read'], resend: ['email:send','email:read'], crank: ['trigger:submit'], inkwell: ['signature:read'], zapier:['trigger:submit'], webhook:['trigger:submit'], receipt:['followup:verify'] }
const encode = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
const context = (connectionId: string, version: number) => encode.encode(canonicalJson({ domain: 'gauge-provider-credential-v1', connectionId, version }))

/** All callers must have obtained this actor from the native cookie session, never an app key. */
async function owner(env: Bindings, a: Actor, tx?: Transaction) {
 need(a.role === 'owner' && a.session.operator.role === 'owner' && a.session.kind === 'native' && !a.scheduled && !a.clientProposal, 'Only the owner in a native browser session manages provider connections', 403)
 await fence(env, a)
 if (tx) {
  need(tx.actor === a && tx.env === env, 'Provider command authority mismatch', 403)
  tx.guard("EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND s.kind='native' AND o.id=? AND o.role='owner' AND o.status='active' AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER))", a.session.id, a.session.operator.id)
 }
}

/** Setup calls with its native-owner transaction. Existing installs call only explicit owner initialization. */
export async function initializeProviderKey(env: Bindings, tx?: Transaction): Promise<void> {
 if (tx) await owner(env, tx.actor, tx)
 const key = crypto.getRandomValues(new Uint8Array(32))
 try {
  const sql = 'INSERT INTO g_provider_installation_key(id,key) VALUES(1,?) ON CONFLICT(id) DO NOTHING'
  if (tx) tx.sql(sql, base64(key))
  else await env.DB.prepare(sql).bind(base64(key)).run()
 } finally { key.fill(0) }
}

async function installationKey(env: Bindings): Promise<Uint8Array<ArrayBuffer>> {
 const row = await env.DB.prepare('SELECT key FROM g_provider_installation_key WHERE id=1').first<{key: string}>()
 need(row, 'The owner must initialize provider custody before connecting', 409)
 try { const key = bytes(row.key); need(key.length === 32, 'Provider custody is unavailable', 409); return key }
 catch { throw new Fault('Provider custody is unavailable', 409) }
}

async function derivedKey(env: Bindings, info: Uint8Array<ArrayBuffer>, use: 'cipher' | 'receipt'): Promise<CryptoKey> {
 const raw = await installationKey(env)
 try {
  const root = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey'])
  const algorithm = use === 'cipher' ? {name: 'AES-GCM', length: 256} : {name: 'HMAC', hash: 'SHA-256', length: 256}
  return await crypto.subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt: encode.encode('gauge-provider-installation-v1'), info}, root, algorithm, false, use === 'cipher' ? ['encrypt', 'decrypt'] : ['sign'])
 } finally { raw.fill(0) }
}

/**
 * Special provider routing must run BEFORE the generic command digest. Keep these digests and
 * acknowledgements only in g_provider_receipts, excluded from archives along with the raw vault.
 * HMAC distinguishes changed credentials on replay without an offline-checkable credential hash.
 */
export async function providerInputDigest(env: Bindings, input: Value): Promise<string> {
 if (input.action === 'provider:initialize') return sha256(canonicalJson({action: input.action, key: text(input.key, 'Unique request key', 200)}))
 const requestKey = text(input.key, 'Unique request key', 200)
 const key = await derivedKey(env, encode.encode(canonicalJson({domain: 'gauge-provider-receipt-v1', requestKey})), 'receipt')
 const plaintext = encode.encode(canonicalJson(input))
 try { return base64(new Uint8Array(await crypto.subtle.sign('HMAC', key, plaintext))) }
 finally { plaintext.fill(0) }
}

async function sealCredential(env: Bindings, connectionId: string, version: number, credential: string) {
 const key = await derivedKey(env, context(connectionId, version), 'cipher')
 const iv = crypto.getRandomValues(new Uint8Array(12)), plaintext = encode.encode(credential)
 try {
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: context(connectionId, version), tagLength: 128}, key, plaintext)
  return {ciphertext: base64(new Uint8Array(ciphertext)), iv: base64(iv)}
 } catch { throw new Fault('Provider credential could not be sealed', 409) }
 finally { plaintext.fill(0) }
}

/** No secret enters tx.record, history, audit, a receipt result or the acknowledgement. */
export async function providerCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<ProviderAcknowledgement | null> {
 if (!action.startsWith('provider:')) return null
 await owner(env, a, tx)
 need(['provider:initialize', 'provider:connect', 'provider:rotate', 'provider:revoke'].includes(action), 'Unknown provider action')
 if (action === 'provider:initialize') {
  await initializeProviderKey(env, tx)
  tx.audit(action, 'providerInstallation', 'installation', {initialized: true})
  return {id: null, revision: null, saved: true}
 }
 const at = Date.now()
 let row: Row | undefined
 if (action !== 'provider:connect') {
  row = await get(env, 'providerConnections', text(input.id, 'Provider connection'))
  need(row.revision === input.revision, 'Provider connection changed; refresh before continuing', 409)
  need(!row.value.revokedAt, 'Provider connection is permanently revoked; create a new connection', 409)
 }
 if (action === 'provider:revoke') {
  const saved = await tx.record('providerConnections', {...row!.value, revokedAt: at}, row, undefined, action)
  tx.sql('DELETE FROM g_provider_credentials WHERE connection_id=?', saved.id)
  return {id: saved.id, revision: saved.revision, saved: true}
 }
 const provider = row?.value.provider ?? input.provider
 need(provider === 'sendgrid' || provider === 'resend' || provider === 'crank' || provider === 'inkwell' || provider === 'zapier' || provider === 'webhook' || provider === 'receipt', 'Choose SendGrid, Resend, Crank, Inkwell, Zapier or a signed webhook')
 const accountLabel = row ? row.value.accountLabel : text(input.accountLabel, 'Provider account label', 120)
 const credential = input.credential
 need(typeof credential === 'string' && credential.length >= 8 && credential.length <= 4096 && !/\s/.test(credential), 'Enter a provider credential of 8 to 4096 characters without whitespace')
 if(provider==='receipt')need(credential.length>=16,'Use a workflow receipt verification key of at least 16 characters')
 need(!String(accountLabel).includes(credential), 'Use an account label without the credential')
 let origin: string | null = row?.value.origin ?? null
 if (provider === 'inkwell' && !row) {
  let url: URL
  try{url=new URL(text(input.origin, 'Inkwell origin', 2000))}catch{need(false,'Use a complete HTTPS Inkwell origin')}
  need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && !url.hostname.includes(credential), 'Use a complete HTTPS Inkwell origin without path or credentials')
  origin = url.origin
 }
 let lastFour=credential.slice(-4)
 if(['zapier','webhook'].includes(provider)){const hook=webhookCredential(credential,provider);need(!accountLabel.includes(hook.endpoint)&&!accountLabel.includes(hook.signingKey),'Use an account label without the hook URL or signing key');lastFour=hook.signingKey.slice(-4)}
 const id = row?.id ?? uuid(), version = row ? integer(row.value.version, 'Credential version', 1) + 1 : 1
 const sealed = await sealCredential(env, id, version, credential)
 const saved = await tx.record('providerConnections', {
  provider, accountLabel, origin, scopes: scopes[provider as Provider], version, lastFour,
  createdAt: row?.value.createdAt ?? at, rotatedAt: row ? at : null, revokedAt: null,
 }, row, id, action)
 // Superseded ciphertext is unnecessary: queued work is refused rather than using an old key.
 tx.sql('DELETE FROM g_provider_credentials WHERE connection_id=?', id)
 tx.sql('INSERT INTO g_provider_credentials(connection_id,version,ciphertext,iv) VALUES(?,?,?,?)', id, version, sealed.ciphertext, sealed.iv)
 return {id: saved.id, revision: saved.revision, saved: true}
}

export class ProviderDispatchError extends Fault {
 readonly name = 'ProviderDispatchError'
 constructor(public readonly outcome: Extract<ProviderOutcome, `credential-${string}`>) {
  super(outcome === 'credential-rotated' ? 'Credential rotated; an authorized person must re-queue this job' : outcome === 'credential-revoked' ? 'Provider credential revoked; this job cannot be sent' : 'Provider disconnected; the owner must reconnect it', 409)
 }
}

async function dispatchConnection(env: Bindings, connectionId: string, expectedVersion: number, operation: ProviderOperation) {
 const connection = await get(env, 'providerConnections', connectionId)
 if (connection.value.revokedAt) throw new ProviderDispatchError('credential-revoked')
 if (connection.value.version !== expectedVersion) throw new ProviderDispatchError('credential-rotated')
 need(connection.value.scopes?.includes(operation) && scopes[connection.value.provider as Provider]?.includes(operation), 'Provider credential does not permit this operation', 403)
 return connection
}

/** Server dispatch only. Call immediately before the network edge and never serialize its result. */
export async function dispatchCredential(env: Bindings, connectionId: string, expectedVersion: number, jobId: string, operation: ProviderOperation): Promise<string> {
 text(jobId, 'Job or request id', 200)
 integer(expectedVersion, 'Queued credential version', 1)
 await dispatchConnection(env, connectionId, expectedVersion, operation)
 const sealed = await env.DB.prepare('SELECT ciphertext,iv FROM g_provider_credentials WHERE connection_id=? AND version=?').bind(connectionId, expectedVersion).first<{ciphertext: string; iv: string}>()
 if (!sealed) {
  await dispatchConnection(env, connectionId, expectedVersion, operation)
  throw new ProviderDispatchError('credential-disconnected')
 }
 let plaintext: Uint8Array
 try {
  const key = await derivedKey(env, context(connectionId, expectedVersion), 'cipher')
  plaintext = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes(sealed.iv), additionalData: context(connectionId, expectedVersion), tagLength: 128}, key, bytes(sealed.ciphertext)))
 } catch {
  await dispatchConnection(env, connectionId, expectedVersion, operation)
  throw new ProviderDispatchError('credential-disconnected')
 }
 try {
  // Re-read after decryption, so a rotation/revocation during crypto still prevents the send.
  await dispatchConnection(env, connectionId, expectedVersion, operation)
  return new TextDecoder('utf-8', {fatal: true}).decode(plaintext)
 } finally { plaintext.fill(0) }
}

/** Dispatch commits the outcome with its durable job, including every refused dispatch. */
export async function recordProviderUse(tx: Transaction, use: ProviderUse): Promise<Row> {
 need(['email:send','email:read', 'trigger:submit', 'signature:read','followup:verify'].includes(use.operation), 'Unknown provider operation')
 need(['accepted', 'rejected', 'uncertain', 'credential-rotated', 'credential-revoked', 'credential-disconnected','rate-limited'].includes(use.outcome), 'Unknown provider outcome')
 return tx.record('providerUses', {
  at: Date.now(), connectionId: text(use.connectionId, 'Provider connection'), credentialVersion: integer(use.credentialVersion, 'Credential version', 1),
  jobId: text(use.jobId, 'Job or request id', 200), operation: use.operation, outcome: use.outcome,
 }, undefined, undefined, 'provider:use')
}

/** Owner-only inspection, with explicit metadata projections and no key/ciphertext queries. */
export async function providerRegister(env: Bindings, a: Actor): Promise<{initialized: boolean; connections: Row[]; uses: Row[]}> {
 await owner(env, a)
 const initialized = !!await env.DB.prepare('SELECT id FROM g_provider_installation_key WHERE id=1').first()
 const credentials = (await env.DB.prepare('SELECT connection_id,version FROM g_provider_credentials').all<{connection_id: string; version: number}>()).results
 const connections = (await all(env, 'providerConnections')).map(row => ({...row, value: {
  provider: row.value.provider, accountLabel: row.value.accountLabel, origin: row.value.origin ?? null, scopes: row.value.scopes, version: row.value.version, lastFour: row.value.lastFour,
  createdAt: row.value.createdAt, rotatedAt: row.value.rotatedAt, revokedAt: row.value.revokedAt,
  status: row.value.revokedAt ? 'revoked' : initialized && credentials.some(c => c.connection_id === row.id && c.version === row.value.version) ? 'connected' : 'disconnected',
 }}))
 const uses = (await all(env, 'providerUses')).slice(-100).reverse().map(row => ({...row, value: {
  at: row.value.at, connectionId: row.value.connectionId, credentialVersion: row.value.credentialVersion, jobId: row.value.jobId, operation: row.value.operation, outcome: row.value.outcome,
 }}))
 await owner(env, a)
 return {initialized, connections, uses}
}
