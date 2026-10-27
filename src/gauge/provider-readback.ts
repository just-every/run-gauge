import { Fault, need } from './model'

/** Bound time, bytes and redirects before parsing any provider-controlled content. */
export async function providerBytes(url: string, credential: string, max = 65536): Promise<Uint8Array> {
 const response = await fetch(url, {redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {Authorization: `Bearer ${credential}`}})
 need(response.status === 200, response.status === 401 || response.status === 403 ? 'Provider authorization expired; rotate the connection and resume readback' : response.status === 429 ? 'Provider rate limit; resume readback later' : 'Provider readback unavailable; no external action was retried', 409)
 const reader = response.body?.getReader(); need(reader, 'Provider returned no evidence', 409)
 const parts: Uint8Array[] = []; let size = 0
 try {
  for (;;) {
   const {done, value} = await reader.read(); if (done) break
   size += value.length; need(size <= max, 'Provider evidence exceeds the supported size', 409); parts.push(value)
  }
 } finally { void reader.cancel().catch(() => {}) }
 const result = new Uint8Array(size); let offset = 0
 for (const part of parts) { result.set(part, offset); offset += part.length }
 need(!new TextDecoder().decode(result).includes(credential), 'Provider echoed a credential; evidence was not retained', 409)
 return result
}
export async function providerJson(url: string, credential: string): Promise<any> {
 try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await providerBytes(url, credential))) }
 catch (error) { if (error instanceof Fault) throw error; need(false, 'Provider returned unreadable evidence; resume readback later', 409) }
}
