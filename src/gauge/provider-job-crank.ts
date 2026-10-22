import { need, text } from './model'

/** Owner-declared HTTPS endpoint. Never forward a credential through a redirect or URL query. */
export function crankEndpoint(value: unknown): string {
 const endpoint = text(value, 'Crank trigger endpoint', 2000)
 let url: URL
 try { url = new URL(endpoint) } catch { need(false, 'Enter a complete HTTPS Crank trigger endpoint') }
 need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && /^\/api\/crank\/flows\/[A-Za-z0-9_-]{1,128}\/trigger$/.test(url.pathname), 'Use HTTPS /api/crank/flows/{flow}/trigger without URL credentials, query or fragment')
 return url.href
}

export interface CrankResult { status: 'submitted' | 'held' | 'exception'; exceptionClass?: 'provider-rejected' | 'uncertain'; providerRunId?: string; providerHoldId?: string }
const reference = (value: unknown, credential: string) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !value.includes(credential) ? value : null

/** Only contract fields survive; arbitrary responses and transport errors are never retained. */
export async function crankResult(response: Response, credential: string): Promise<CrankResult> {
 if (response.status !== 201 && response.status !== 202) {
  await response.body?.cancel()
  // Only explicit client refusals are certain. A server/proxy failure may follow admission.
  return {status: 'exception', exceptionClass: response.status >= 400 && response.status < 500 && response.status !== 408 ? 'provider-rejected' : 'uncertain'}
 }
 const reader = response.body?.getReader()
 if (!reader) return {status: 'exception', exceptionClass: 'uncertain'}
 const parts: Uint8Array[] = []; let size = 0
 try {
  for (;;) {
   const {value, done} = await reader.read()
   if (done) break
   size += value.length
   if (size > 16384) { await reader.cancel(); return {status: 'exception', exceptionClass: 'uncertain'} }
   parts.push(value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  const result = JSON.parse(new TextDecoder().decode(bytes))
  const run = reference(result?.id, credential), hold = reference(result?.holdId, credential)
  if (response.status === 201 && run && result.state === 'pending') return {status: 'submitted', providerRunId: run}
  if (response.status === 202 && result?.held === true && hold) return {status: 'held', providerHoldId: hold}
 } catch { /* A response that cannot prove the published admission outcome is uncertain. */ }
 return {status: 'exception', exceptionClass: 'uncertain'}
}
