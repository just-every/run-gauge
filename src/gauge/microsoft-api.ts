import { Fault } from './model'

const graphOrigin = 'https://graph.microsoft.com'
const graphRoot = graphOrigin + '/v1.0'
const maxBytes = 1048576
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type MicrosoftExceptionClass = 'permission-revoked' | 'mailbox-unavailable' | 'rate-limited' | 'provider-unavailable'

export class MicrosoftRefusal extends Fault {
 readonly name = 'MicrosoftRefusal'
 constructor(public readonly exceptionClass: MicrosoftExceptionClass) {
  super(exceptionClass === 'permission-revoked' ? 'Microsoft permission is unavailable; review tenant consent before continuing' : exceptionClass === 'mailbox-unavailable' ? 'Microsoft does not grant access to this mailbox' : exceptionClass === 'rate-limited' ? 'Microsoft rate limit reached; resume later' : 'Microsoft returned incomplete or unavailable data; nothing was retried', 409)
 }
}

/** The secret may contain colons; only the tenant and client separators are structural. */
export function parseMicrosoftCredential(raw: string): { tenantId: string; clientId: string; clientSecret: string } {
 if (typeof raw !== 'string') throw new Fault('Use a Microsoft tenant GUID, client GUID and client secret separated by colons', 400)
 const first = raw.indexOf(':'), second = first < 0 ? -1 : raw.indexOf(':', first + 1)
 const tenantId = raw.slice(0, first), clientId = raw.slice(first + 1, second), clientSecret = raw.slice(second + 1)
 if (first < 0 || second < 0 || !guid.test(tenantId) || !guid.test(clientId) || clientSecret.length < 8 || /\s/.test(clientSecret)) throw new Fault('Use a Microsoft tenant GUID, client GUID and client secret separated by colons', 400)
 return { tenantId: tenantId.toLowerCase(), clientId: clientId.toLowerCase(), clientSecret }
}

function refusal(status: number): MicrosoftRefusal {
 return new MicrosoftRefusal(status === 401 || status === 403 ? 'permission-revoked' : status === 404 ? 'mailbox-unavailable' : status === 429 ? 'rate-limited' : 'provider-unavailable')
}

/** Fixed destinations only; neither provider text nor an underlying network error reaches callers. */
async function requestJson(url: string, init: RequestInit, credential?: string): Promise<any> {
 let response: Response
 try { response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20000) }) }
 catch { throw new MicrosoftRefusal('provider-unavailable') }
 if (!response.ok) { void response.body?.cancel().catch(() => {}); throw refusal(response.status) }
 const reader = response.body?.getReader()
 if (!reader) throw new MicrosoftRefusal('provider-unavailable')
 const parts: Uint8Array[] = []; let size = 0
 try {
  for (;;) {
   const { done, value } = await reader.read(); if (done) break
   size += value.byteLength
   if (size > maxBytes) throw new MicrosoftRefusal('provider-unavailable')
   parts.push(value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (credential && text.includes(credential)) throw new MicrosoftRefusal('provider-unavailable')
  const json = JSON.parse(text)
  if (!json || typeof json !== 'object' || Array.isArray(json) || json.error) throw new MicrosoftRefusal('provider-unavailable')
  return json
 } catch (error) { if (error instanceof MicrosoftRefusal) throw error; throw new MicrosoftRefusal('provider-unavailable') }
 finally { void reader.cancel().catch(() => {}) }
}

/** App-only tokens remain in memory and are never recorded in the provider vault or business history. */
export async function microsoftToken(raw: string): Promise<{ token: string; roles: string[]; tenantId: string }> {
 const credential = parseMicrosoftCredential(raw)
 const result = await requestJson(`https://login.microsoftonline.com/${credential.tenantId}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: credential.clientId, client_secret: credential.clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString(),
 }, credential.clientSecret)
 try {
  const token = result.access_token
  if (typeof token !== 'string' || token.length > maxBytes || !/^Bearer$/i.test(result.token_type)) throw new Error()
  const segments = token.split('.')
  if (segments.length !== 3 || segments.some((part: string) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error()
  const payload = segments[1].replaceAll('-', '+').replaceAll('_', '/')
  const claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')), c => c.charCodeAt(0))))
  if (!['https://graph.microsoft.com', 'https://graph.microsoft.com/', '00000003-0000-0000-c000-000000000000'].includes(claims.aud)) throw new Error()
  if (typeof claims.tid !== 'string' || claims.tid.toLowerCase() !== credential.tenantId || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) throw new Error()
  const app = claims.appid ?? claims.azp
  if (typeof app !== 'string' || app.toLowerCase() !== credential.clientId) throw new Error()
  if (claims.roles !== undefined && (!Array.isArray(claims.roles) || !claims.roles.every((role: unknown) => typeof role === 'string' && role.length > 0))) throw new Error()
  return { token, roles: [...new Set<string>(claims.roles ?? [])], tenantId: credential.tenantId }
 } catch { throw new MicrosoftRefusal('permission-revoked') }
}

function graphUrl(path: string): URL {
 if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\#\r\n]/.test(path)) throw new Fault('Use a relative Microsoft Graph resource path', 400)
 let url: URL
 try { url = new URL(graphRoot + path) } catch { throw new Fault('Use a relative Microsoft Graph resource path', 400) }
 if (url.origin !== graphOrigin || !url.pathname.startsWith('/v1.0/') || url.username || url.password || url.hash) throw new Fault('Use a relative Microsoft Graph resource path', 400)
 return url
}

export async function microsoftGet(token: string, path: string): Promise<any> {
 const url = graphUrl(path)
 return requestJson(url.href, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } }, token)
}

/** Pagination is all-or-nothing, stays within the selected resource and preserves opaque skip tokens. */
export async function microsoftPages(token: string, path: string): Promise<any[]> {
 const initial = graphUrl(path), seen = new Set<string>(), items: any[] = []
 let next = initial
 for (let page = 0; page < 10; page++) {
  if (seen.has(next.href)) throw new MicrosoftRefusal('provider-unavailable')
  seen.add(next.href)
  const result = await microsoftGet(token, next.pathname.slice('/v1.0'.length) + next.search)
  if (!Array.isArray(result.value) || result.value.some((item: unknown) => !item || typeof item !== 'object' || Array.isArray(item)) || items.length + result.value.length > 1000) throw new MicrosoftRefusal('provider-unavailable')
  items.push(...result.value)
  const link = result['@odata.nextLink']
  if (link === undefined || link === null) return items
  if (typeof link !== 'string' || !link.startsWith(graphOrigin + '/v1.0/') || /[\\#\r\n]/.test(link)) throw new MicrosoftRefusal('provider-unavailable')
  try { next = new URL(link) } catch { throw new MicrosoftRefusal('provider-unavailable') }
  if (next.origin !== graphOrigin || next.pathname !== initial.pathname || next.username || next.password || next.hash) throw new MicrosoftRefusal('provider-unavailable')
 }
 throw new MicrosoftRefusal('provider-unavailable')
}
