import { Fault, need } from './model'

/** GitHub App authentication and the bounded REST edge. Tokens live only in memory and are never returned or stored. */
const api = 'https://api.github.com'
const maxBytes = 1048576
const encode = new TextEncoder()
export interface GithubCredential { appId: string; installationId: string; privateKey: string }
export type GithubExceptionClass = 'authorization-expired' | 'rate-limited' | 'repository-not-granted' | 'permission-missing' | 'unavailable'
export class GithubRefusal extends Fault {
 readonly name = 'GithubRefusal'
 constructor(public readonly exceptionClass: GithubExceptionClass, message: string) { super(message, 409) }
}

/** The sealed credential is appId, installation number and the base64 PEM private key joined by colons. */
export function parseGithubCredential(value: string): GithubCredential {
 const [appId, installationId, encoded, ...extra] = value.split(':')
 need(!extra.length && /^\d{1,20}$/.test(appId ?? '') && /^\d{1,20}$/.test(installationId ?? '') && /^[A-Za-z0-9+/]{200,}={0,2}$/.test(encoded ?? ''), 'Write the GitHub credential as app number, installation number and base64 private key joined by colons')
 let privateKey = ''
 try { privateKey = atob(encoded) } catch { need(false, 'The GitHub private key is not valid base64') }
 need(/^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----\s*$/.test(privateKey), 'The GitHub private key must be a PEM RSA key')
 return { appId, installationId, privateKey }
}

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length } return out }
const length = (n: number) => n < 128 ? Uint8Array.of(n) : n < 256 ? Uint8Array.of(0x81, n) : Uint8Array.of(0x82, n >> 8, n & 255)
const der = (tag: number, ...parts: Uint8Array[]) => { const body = concat(parts); return concat([Uint8Array.of(tag), length(body.length), body]) }
const rsaAlgorithm = Uint8Array.of(0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00)
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** GitHub issues PKCS#1 keys; WebCrypto signs only with PKCS#8, so wrap the same RSA key. */
function pkcs8(pem: string): Uint8Array<ArrayBuffer> {
 const body = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0))
 return pem.includes('BEGIN RSA PRIVATE KEY') ? der(0x30, der(0x02, Uint8Array.of(0)), rsaAlgorithm, der(0x04, body)) : body
}

async function appJwt(credential: GithubCredential): Promise<string> {
 const now = Math.floor(Date.now() / 1000)
 const head = base64url(encode.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))), claims = base64url(encode.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: credential.appId })))
 const raw = pkcs8(credential.privateKey)
 try {
  const key = await crypto.subtle.importKey('pkcs8', raw, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  return `${head}.${claims}.${base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encode.encode(`${head}.${claims}`))))}`
 } catch { throw new GithubRefusal('authorization-expired', 'The GitHub App private key could not sign; rotate the connection') }
 finally { raw.fill(0) }
}

function refusal(response: Response): GithubRefusal {
 if (response.status === 401) return new GithubRefusal('authorization-expired', 'GitHub authorization expired; rotate the connection and resume')
 if (response.status === 429 || response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') return new GithubRefusal('rate-limited', 'GitHub rate limit; resume later')
 if (response.status === 403) return new GithubRefusal('permission-missing', 'The GitHub App lacks the permission this read or write needs')
 if (response.status === 404 || response.status === 422) return new GithubRefusal('repository-not-granted', 'GitHub does not grant this repository to the installation')
 return new GithubRefusal('unavailable', 'GitHub is unavailable; nothing was retried')
}

/** Bound time, bytes and redirects before parsing any provider-controlled content. */
export async function githubRequest(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any }> {
 need(path.startsWith('/') && !path.includes('..') && !path.includes('//'), 'Use a GitHub API path')
 let response: Response
 try {
  response = await fetch(api + path, {
   method, redirect: 'manual', signal: AbortSignal.timeout(15000), body: body === undefined ? undefined : JSON.stringify(body),
   headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'gauge-github-evidence', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  })
 } catch (error) { if (error instanceof Fault) throw error; throw new GithubRefusal('unavailable', 'GitHub did not answer; nothing was retried') }
 if (response.status < 200 || response.status > 299) { void response.body?.cancel().catch(() => {}); throw refusal(response) }
 const reader = response.body?.getReader()
 need(reader, 'GitHub returned no data', 409)
 const parts: Uint8Array[] = []; let size = 0
 try {
  for (;;) {
   const { done, value } = await reader.read(); if (done) break
   size += value.length; if (size > maxBytes) throw new GithubRefusal('unavailable', 'GitHub data exceeds the supported size'); parts.push(value)
  }
 } finally { void reader.cancel().catch(() => {}) }
 const text = new TextDecoder('utf-8', { fatal: true }).decode(concat(parts))
 if (text.includes(token)) throw new GithubRefusal('unavailable', 'GitHub echoed a credential; evidence was not retained')
 try { return { status: response.status, json: JSON.parse(text) } } catch { throw new GithubRefusal('unavailable', 'GitHub returned unreadable data; nothing was retried') }
}

/** One installation token limited to the named repositories and the least permissions the operation needs. */
export async function installationToken(sealed: string, permissions: Record<string, 'read' | 'write'>, repositories?: string[]): Promise<string> {
 const credential = parseGithubCredential(sealed)
 const result = await githubRequest(await appJwt(credential), 'POST', `/app/installations/${credential.installationId}/access_tokens`, { permissions, ...(repositories ? { repositories } : {}) })
 const granted = result.json?.permissions ?? {}
 need(typeof result.json?.token === 'string' && result.json.token.length > 8 && result.status === 201, 'GitHub did not issue an installation token', 409)
 // A token wider than requested is refused rather than used.
 for (const [name, level] of Object.entries(granted)) if (level === 'write' && permissions[name] !== 'write' || !permissions[name]) throw new GithubRefusal('permission-missing', 'GitHub issued a token wider than the request; nothing was read')
 if (repositories) need(Array.isArray(result.json.repositories) && result.json.repositories.length === repositories.length, 'GitHub issued a token for a different repository set', 409)
 return result.json.token
}
