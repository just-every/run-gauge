import { createMailSender, MailValidationError } from '../modules/mail/index.mjs'
import { parseAddress } from '../modules/mail/src/core/validation.mjs'

const providers = new Set(['resend', 'sendgrid'])
const maxBytes = 262144
const deadlineMs = 15000
const validCredential = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/\s|[\x00-\x1f\x7f]/.test(value)
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && value !== '.' && value !== '..' && !/[\s\x00-\x1f\x7f]/.test(value)
const safeText = value => typeof value === 'string' && value.length <= 998 && !/[\x00-\x1f\x7f]/.test(value)

/** The caller releases this explicit credential from custody for one operation. */
export function invoiceMail(credential, provider) {
 if (!providers.has(provider)) throw new MailValidationError('invalid_provider')
 return createMailSender({provider, mode: 'production', apiKey: credential})
}

// Paths are assembled only by the fixed provider operations below, never by callers.
async function readJson(credential, provider, path) {
 const controller = new AbortController()
 let timer, reader
 const operation = async () => {
  const origin = provider === 'sendgrid' ? 'https://api.sendgrid.com' : 'https://api.resend.com'
  const response = await fetch(origin + path, {method: 'GET', redirect: 'manual', signal: controller.signal, headers: {Authorization: `Bearer ${credential}`, Accept: 'application/json'}})
  if (response.status !== 200) {
   void response.body?.cancel().catch(() => {})
   return {exception: response.status === 401 ? 'authorization-expired' : response.status === 403 ? 'scope-or-plan-missing' : response.status === 429 ? 'rate-limited' : response.status === 404 ? 'not-found' : 'readback-unavailable'}
  }
  reader = response.body?.getReader()
  if (!reader) return {exception: 'unreadable-evidence'}
  const chunks = []; let size = 0
  for (;;) {
   const {done, value} = await reader.read()
   if (done) break
   size += value.byteLength
   if (size > maxBytes) return {exception: 'evidence-too-large'}
   chunks.push(value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes)
  const data = JSON.parse(source)
  // Reject credential echoes, including JSON-escaped echoes, before retaining evidence.
  if (source.includes(credential) || JSON.stringify(data).includes(credential)) return {exception: 'unsafe-evidence'}
  return {data}
 }
 try {
  return await Promise.race([operation(), new Promise(resolve => {
   timer = setTimeout(() => { controller.abort(); resolve({exception: 'readback-timeout'}) }, deadlineMs)
  })])
 } catch { return {exception: 'unreadable-evidence'} }
 finally { clearTimeout(timer); controller.abort(); void reader?.cancel().catch(() => {}) }
}

/** Verification evidence is limited to the exact sender address or its exact domain. */
export async function verifyInvoiceSender(credential, provider, from) {
 const unverified = exception => ({provider: providers.has(provider) ? provider : null, verified: false, kind: 'unconfirmed', exception})
 if (!providers.has(provider) || !validCredential(credential)) return unverified('invalid-input')
 let address
 try { address = parseAddress(from).email.toLowerCase() } catch { return unverified('invalid-input') }
 const domain = address.split('@')[1]
 if (provider === 'resend') {
  const result = await readJson(credential, provider, '/domains?limit=100')
  if (result.exception) return unverified(result.exception)
  if (!Array.isArray(result.data?.data)) return unverified('unreadable-evidence')
  const matched = result.data.data.find(row => typeof row?.name === 'string' && row.name.toLowerCase() === domain && row.status === 'verified' && row.capabilities?.sending !== 'disabled')
  return matched ? {provider, verified: true, kind: 'domain', domain, sender: address} : unverified(result.data.has_more === true ? 'verification-page-limit' : 'sender-unconfirmed')
 }
 // These independent read APIs cover Single Sender Verification and Domain Authentication.
 const [senders, domains] = await Promise.all([
  readJson(credential, provider, '/v3/verified_senders?limit=100'),
  readJson(credential, provider, '/v3/whitelabel/domains?limit=100&exclude_subusers=true&domain=' + encodeURIComponent(domain)),
 ])
 if (Array.isArray(senders.data?.results) && senders.data.results.some(row => row?.verified === true && typeof row.from_email === 'string' && row.from_email.toLowerCase() === address)) return {provider, verified: true, kind: 'address', sender: address, domain}
 if (Array.isArray(domains.data) && domains.data.some(row => row?.valid === true && typeof row.domain === 'string' && row.domain.toLowerCase() === domain)) return {provider, verified: true, kind: 'domain', domain, sender: address}
 return unverified(senders.exception ?? domains.exception ?? (senders.data?.results?.length === 100 || domains.data?.length === 100 ? 'verification-page-limit' : 'sender-unconfirmed'))
}

function uniqueArgs(value) {
 if (typeof value === 'string') {
  try { value = JSON.parse(value) } catch { return null }
 }
 return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

const quoteQuery = value => value.replace(/[\\"]/g, '\\$&')
const quotePrefix = value => quoteQuery(value).replace(/[%_]/g, '\\$&')
const sameRecipient = (actual, expected) => typeof actual === 'string' && actual.toLowerCase() === expected
const sameSendGridId = (actual, submitted) => opaque(actual) && (actual === submitted || actual.startsWith(submitted + '.'))

function sendGridState(message) {
 // Delivery events are distinct from engagement events and suppression lists.
 const events = Array.isArray(message.events) ? message.events : []
 if (message.status === 'delivered') return 'delivered'
 if (events.some(event => event?.event_name === 'bounced')) return 'bounced'
 if (events.some(event => event?.event_name === 'dropped')) return 'failed'
 if (message.status === 'not_delivered') return 'failed'
 if (events.some(event => event?.event_name === 'delivered')) return 'delivered'
 if (['processed', 'processing'].includes(message.status) || events.some(event => ['processed', 'deferred'].includes(event?.event_name))) return 'accepted'
 return 'unknown'
}

function resendState(event) {
 if (['sent', 'delivery_delayed'].includes(event)) return 'accepted'
 if (event === 'delivered') return 'delivered'
 if (event === 'bounced') return 'bounced'
 if (['failed', 'complained'].includes(event)) return 'failed'
 return 'unknown'
}

/** No submission, retry or inference of mailbox delivery occurs during readback.
 * deliveryId must match the provider's persisted Base custom arg / text reference.
 * SendGrid's acceptance X-Message-ID and full activity msg_id remain separate.
 */
export async function readInvoiceMail(credential, provider, id, to, deliveryId, expectedSubject) {
 const unknown = exception => ({provider: providers.has(provider) ? provider : null, status: 'unknown', providerMessageId: null, correlated: false, exception})
 if (!providers.has(provider) || !validCredential(credential) || !opaque(id) || !opaque(deliveryId) || deliveryId.length > 512 || (expectedSubject !== undefined && !safeText(expectedSubject))) return unknown('invalid-input')
 let recipient
 try { recipient = parseAddress(to).email.toLowerCase() } catch { return unknown('invalid-input') }
 let message, providerMessageId, status
 if (provider === 'resend') {
  const result = await readJson(credential, provider, '/emails/' + encodeURIComponent(id))
  if (result.exception) return unknown(result.exception)
  message = result.data
  if (message?.id !== id || !Array.isArray(message.to) || message.to.length !== 1 || !sameRecipient(message.to[0], recipient) || (Array.isArray(message.cc) && message.cc.length) || (Array.isArray(message.bcc) && message.bcc.length)) return unknown('message-mismatch')
  if (typeof message.text !== 'string' || !message.text.split(/\r?\n/).includes(`Delivery reference: ${deliveryId}`)) return unknown('correlation-unavailable')
  providerMessageId = message.id
  status = resendState(message.last_event)
 } else {
  const query = `msg_id LIKE "${quotePrefix(id)}%" AND to_email="${quoteQuery(recipient)}"`
  const result = await readJson(credential, provider, '/v3/messages?limit=20&query=' + encodeURIComponent(query))
  if (result.exception) return unknown(result.exception)
  if (!Array.isArray(result.data?.messages)) return unknown('unreadable-evidence')
  const candidates = result.data.messages.filter(row => sameSendGridId(row?.msg_id, id) && sameRecipient(row.to_email, recipient))
  if (result.data.messages.length >= 20 || candidates.length !== 1) return unknown(candidates.length === 0 ? 'message-not-found' : 'message-ambiguous')
  const exactId = candidates[0].msg_id
  const detail = await readJson(credential, provider, '/v3/messages/' + encodeURIComponent(exactId))
  if (detail.exception) return unknown(detail.exception)
  message = detail.data
  if (message?.msg_id !== exactId || !sameRecipient(message.to_email, recipient)) return unknown('message-mismatch')
  if (uniqueArgs(message.unique_args)?.rer_delivery_id !== deliveryId) return unknown('correlation-unavailable')
  providerMessageId = message.msg_id
  status = sendGridState(message)
 }
 if (!safeText(message.subject) || (expectedSubject !== undefined && message.subject !== expectedSubject)) return unknown('message-mismatch')
 return {provider, status, providerMessageId, submittedMessageId: id, recipient, subject: message.subject, deliveryId, correlated: true, ...(status === 'unknown' ? {exception: 'unrecognized-provider-state'} : {})}
}
