import { type Row, type Value, need } from './model'
import { sha256 } from '../modules/import-kit/src/d1/index'

export const graphId = (value: unknown, label: string): string => {
 need(typeof value === 'string' && /^[A-Za-z0-9_=+@.~-]{1,512}$/.test(value), `Use an opaque Microsoft ${label}`)
 return value
}
const label = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : ''
const instant = (v: Value) => {
 need(v && typeof v.dateTime === 'string' && v.timeZone === 'UTC', 'Microsoft must return UTC event times', 409)
 const at = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(v.dateTime) ? v.dateTime : v.dateTime + 'Z')
 need(Number.isFinite(at), 'Microsoft returned an invalid event time', 409); return new Date(at).toISOString()
}
export function calendarContext(selection: Row, item: Value): {id: string; value: Value} {
 const sourceId = graphId(item.id, 'event id'), privateEvent = item.sensitivity !== 'normal'
 const start = instant(item.start), end = instant(item.end)
 need(start < end, 'Microsoft returned an invalid event interval', 409)
 // Unknown sensitivity is private too. No subject, attendees, organizer, location or description survives.
 return {id: sha256(`graph:${selection.id}:calendar:${sourceId}`), value: {
  selectionId: selection.id, personId: selection.value.personId, sourceId, scope: 'calendar',
  subject: privateEvent ? 'Private event' : label(item.subject, 200), private: privateEvent,
  start, end, cancelled: item.isCancelled === true,
  showAs: ['free','tentative','busy','oof','workingElsewhere','unknown'].includes(item.showAs) ? item.showAs : 'unknown',
  billable: false,
 }}
}
export function replyContext(selection: Row, thread: Row, item: Value): {id: string; value: Value} | null {
 const v = thread.value, sender = item.from?.emailAddress?.address?.toLowerCase(), recipients = item.toRecipients
 const inReplyTo = item.internetMessageHeaders?.find((h: Value) => String(h.name).toLowerCase() === 'in-reply-to')?.value
 if (item.isDraft !== false || item.conversationId !== v.conversationId || sender !== v.contact || !Array.isArray(recipients) || !recipients.some((r: Value) => r.emailAddress?.address?.toLowerCase() === selection.value.mailbox) || inReplyTo !== v.internetMessageId) return null
 const sourceId = graphId(item.id, 'message id'), at = Date.parse(item.receivedDateTime)
 need(Number.isFinite(at), 'Microsoft returned an invalid reply time', 409)
 return {id: sha256(`graph:${selection.id}:mail:${sourceId}`), value: {
  selectionId: selection.id, scope: 'mail', sourceId, threadId: thread.id, invoiceId: v.invoiceId,
  invoiceRevision: v.invoiceRevision, subject: label(item.subject, 200), receivedAt: new Date(at).toISOString(),
  meaning: 'Reply context only; no acceptance, dispute, payment or outbound message is authorized', billable: false,
 }}
}
