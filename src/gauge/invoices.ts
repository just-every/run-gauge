import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, date, integer, sum } from './model'
import { type Actor, type Transaction, authority, finance, fence, access, get } from './store'
import { activeClient } from './clients'
import { authorizedDelivery } from './milestone-delivery'
import { assertAdHocTime } from './retainer-eligibility'

const snapshot = (row: Row) => structuredClone(row)
const plusDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

/** Only ordinary, already approved packet sources enter this pre-tax ledger.
 * Keep both the approved packet line and the exact native source as evidence. */
async function invoiceLines(env: Bindings, tx: Transaction, packet: Row, engagement: Row, issueDate: string) {
 need(Array.isArray(packet.value.lines) && packet.value.lines.length > 0, 'Approved packet has no source lines', 409)
 const seen = new Set<string>(), lines: Value[] = []
 for (const line of packet.value.lines as Value[]) {
  const kind = line.kind
  need(kind === 'time' || kind === 'expenses' || kind === 'milestones', 'Invoice issuance supports ordinary hourly time, reimbursable expenses and fixed milestones; retainer issuance is not available', 409)
  const sourceId = text(line.sourceId, 'Source ID'), identity = `${kind}:${sourceId}`
  need(!seen.has(identity), 'Packet repeats a source line', 409); seen.add(identity)
  const source = await get(env, kind, sourceId), v = source.value
  need(source.revision === line.sourceRevision && v.status === 'approved' && v.engagementId === engagement.id, 'Approved packet source changed; issuance requires its exact approved revision', 409)
  tx.observe(kind, source)
  tx.guard('EXISTS(SELECT 1 FROM g_billing_sources WHERE kind=? AND source_id=? AND source_revision=? AND packet_id=?)', kind, source.id, source.revision, packet.id)
  need(await env.DB.prepare('SELECT 1 FROM g_billing_sources WHERE kind=? AND source_id=? AND source_revision=? AND packet_id=?').bind(kind, source.id, source.revision, packet.id).first(), 'Packet no longer reserves this exact source', 409)
  const currency = kind === 'time' ? v.economics?.currency : kind === 'milestones' ? v.currency ?? engagement.value.currency : v.currency
  need(currency === packet.value.currency && line.currency === currency, 'Invoice source currencies differ; no implicit FX')
  let sourceDate: string, amountMinor: number
  if (kind === 'time') {
   await assertAdHocTime(env, tx, v)
   need(v.billable && !v.source?.billed && v.economics?.mode === 'hourly', 'Invoice requires approved, unbilled ordinary hourly time', 409)
   amountMinor = integer(v.economics.billMinor, 'Approved time amount', 0, Number.MAX_SAFE_INTEGER)
   sourceDate = date(v.workDate)
   need(issueDate >= sourceDate, 'Invoice issue date precedes its time source date')
  } else if (kind === 'expenses') {
   need(v.reimbursable, 'Invoice expense must be reimbursable', 409)
   amountMinor = integer(v.amountMinor, 'Approved expense amount', 0, Number.MAX_SAFE_INTEGER)
   sourceDate = date(v.date)
   need(issueDate >= sourceDate, 'Invoice issue date precedes its expense source date')
  } else {
   need(authorizedDelivery(v), 'Invoice milestone requires current recorded acceptance and finance authorization', 409)
   const budget = await get(env, 'budgets', text(v.budgetId, 'Approved fixed budget'))
   need(budget.value.status === 'approved' && budget.value.mode === 'fixed' && budget.value.engagementId === engagement.id && budget.value.currency === currency, 'Invoice milestone requires its approved fixed-fee budget', 409)
   tx.observe('budgets', budget)
   amountMinor = integer(v.amountMinor, 'Approved milestone amount', 0, Number.MAX_SAFE_INTEGER)
   sourceDate = date(v.due)
   const delivery = v.delivery.deliveries.at(-1), decision = v.delivery.decisions.at(-1)
   need(issueDate >= date(delivery.date) && issueDate >= date(decision.date), 'Invoice issue date precedes recorded milestone delivery or acceptance')
  }
  need(Number.isSafeInteger(line.amountMinor) && line.amountMinor === amountMinor, 'Packet amount differs from its approved source', 409)
  lines.push({ ...structuredClone(line), sourceDate, sourceSnapshot: snapshot(source) })
 }
 need(sum(lines.map(line => line.amountMinor)) === packet.value.totalMinor, 'Packet total differs from its approved source lines', 409)
 return lines
}

export async function invoiceCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (!['invoice:issue','invoice:promise','payment:record'].includes(action)) return null
 need(finance(a), 'Finance access required', 403)
 await fence(env, a)
 const privileged = authority(a, true)
 tx.guard(privileged.sql, ...privileged.params)
 if (action === 'invoice:issue') {
  const packet = await get(env, 'packets', text(input.id, 'Approved packet'))
  need(packet.revision === input.revision && packet.value.status === 'approved', 'Choose the exact approved packet revision', 409)
  need(!packet.value.correctsPacketId, 'Correction packets cannot be issued; invoice credit and adjustment handling is not available', 409)
  const totalMinor = integer(packet.value.totalMinor, 'Invoice total', 1, Number.MAX_SAFE_INTEGER)
  const engagement = await access(env, a, text(packet.value.engagementId, 'Engagement'))
  need(engagement.value.type !== 'internal', 'Internal work cannot be invoiced')
  const client = await activeClient(env, engagement.value.clientId)
  tx.observe('packets', packet); tx.observe('engagements', engagement); tx.observe('clients', client)
  need(packet.value.currency === engagement.value.currency && (input.currency === undefined || input.currency === packet.value.currency), 'Invoice currency differs from engagement or packet; no implicit FX')
  need(!await env.DB.prepare("SELECT 1 FROM g_packets WHERE json_extract(data,'$.correctsPacketId')=? AND status<>'cancelled'").bind(packet.id).first(), 'Packet has a correction; invoice adjustment handling is not available', 409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_packets WHERE json_extract(data,'$.correctsPacketId')=? AND status<>'cancelled')", packet.id)
  need(!await env.DB.prepare('SELECT 1 FROM g_invoices WHERE packet_id=?').bind(packet.id).first(), 'Packet already has an issued invoice', 409)
  tx.guard('NOT EXISTS(SELECT 1 FROM g_invoices WHERE packet_id=?)', packet.id)
  const issueDate = date(input.issueDate), dueDate = date(input.dueDate)
  const paymentTermsDays = client.value.paymentTermsDays == null ? 30 : integer(client.value.paymentTermsDays, 'Client payment terms days', 0, 365)
  need(dueDate === plusDays(issueDate, paymentTermsDays), 'Due date must follow the saved client payment terms (Net 30 assumed only when unset)')
  const billTo = text(input.billTo, 'Bill-to'), remitTo = text(input.remitTo, 'Remit-to'), reference = text(input.reference, 'Invoice reference')
  need(!client.value.poRequired || (client.value.poNumbers ?? []).some((po: string) => po.toLowerCase() === reference.toLowerCase()), 'This client requires an invoice reference matching a saved PO number')
  const lines = await invoiceLines(env, tx, packet, engagement, issueDate)
  const sequence = await env.DB.prepare('SELECT value FROM g_invoice_sequence WHERE id=1').first<{value: number}>() ?? {value:0}
  need(sequence && Number.isSafeInteger(sequence.value) && sequence.value >= 0 && sequence.value < Number.MAX_SAFE_INTEGER, 'Invoice sequence unavailable', 409)
  // Sequence reservation and insertion commit together. A competing reservation
  // fails atomically and can be retried with the same uncommitted request key.
  tx.guard('COALESCE((SELECT value FROM g_invoice_sequence WHERE id=1),0)=?', sequence.value)
  tx.sql('INSERT INTO g_invoice_sequence(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',sequence.value+1)
  return tx.record('invoices', {
   packetId: packet.id, packetRevision: packet.revision, engagementId: engagement.id, clientId: client.id,
   number: `INV-${String(sequence.value + 1).padStart(6, '0')}`, issueDate, dueDate, billTo, remitTo, reference,
   currency: packet.value.currency, totalMinor, lines, issuedBy: a.session.operator.id, issuedAt: Date.now(),
   paymentTermsDays, termsLabel: client.value.paymentTermsDays == null ? 'Net 30 assumed' : `Net ${paymentTermsDays}`,
   clientSnapshot: snapshot(client), engagementSnapshot: snapshot(engagement), packetSnapshot: snapshot(packet),
   taxBasis: 'pre-tax', issuance: 'native ledger only; no sending or accounting-provider submission',
  }, undefined, undefined, action)
 }
 const invoice = await get(env, 'invoices', text(input.id, 'Invoice'))
 need(invoice.revision === input.revision, 'Invoice revision changed; reload before recording payment', 409)
 tx.observe('invoices', invoice)
 if(action==='invoice:promise') {
  const on=date(input.date), amountMinor=integer(input.amountMinor,'Promised amount',1,Number.MAX_SAFE_INTEGER)
  need(on>=invoice.value.issueDate,'Promise date precedes invoice issue date')
  tx.guard('COALESCE((SELECT SUM(amount_minor) FROM g_payments WHERE invoice_id=?),0)+? <= (SELECT total_minor FROM g_invoices WHERE id=?)',invoice.id,amountMinor,invoice.id)
  const previous=await env.DB.prepare("SELECT COUNT(*) AS count FROM g_paymentPromises WHERE json_extract(data,'$.invoiceId')=?").bind(invoice.id).first<{count:number}>()
  tx.guard("(SELECT COUNT(*) FROM g_paymentPromises WHERE json_extract(data,'$.invoiceId')=?)=?",invoice.id,previous?.count??0)
  return tx.record('paymentPromises',{invoiceId:invoice.id,engagementId:invoice.value.engagementId,currency:invoice.value.currency,date:on,amountMinor,reference:text(input.reference,'Promise reference'),recordedBy:a.session.operator.id,recordedAt:Date.now()},undefined,undefined,action)
 }
 const on = date(input.date), amountMinor = integer(input.amountMinor, 'Payment amount', 1, Number.MAX_SAFE_INTEGER), reference = text(input.reference, 'Bank receipt reference')
 need(on >= invoice.value.issueDate, 'Payment date precedes invoice issue date')
 need(input.currency === undefined || input.currency === invoice.value.currency, 'Payment currency differs from invoice; no implicit FX')
 const paid = await env.DB.prepare('SELECT COALESCE(SUM(amount_minor),0) AS total FROM g_payments WHERE invoice_id=?').bind(invoice.id).first<{total: number}>()
 need(amountMinor <= invoice.value.totalMinor - (paid?.total ?? 0), 'Payment exceeds the invoice outstanding amount', 409)
 need(!await env.DB.prepare('SELECT 1 FROM g_payments WHERE invoice_id=? AND reference=?').bind(invoice.id, reference).first(), 'This receipt reference is already recorded for the invoice', 409)
 // Observing an immutable invoice cannot serialize concurrent receipts. Check
 // the live allocation sum inside the same batch that inserts the new receipt.
 tx.guard('COALESCE((SELECT SUM(amount_minor) FROM g_payments WHERE invoice_id=?),0)+? <= (SELECT total_minor FROM g_invoices WHERE id=?)', invoice.id, amountMinor, invoice.id)
 tx.guard('NOT EXISTS(SELECT 1 FROM g_payments WHERE invoice_id=? AND reference=?)', invoice.id, reference)
 return tx.record('payments', {
  invoiceId: invoice.id, engagementId: invoice.value.engagementId, currency: invoice.value.currency,
  amountMinor, date: on, reference, recordedBy: a.session.operator.id, recordedAt: Date.now(),
  source: 'manual-bank-receipt', verification: 'finance recorded; not bank or processor verified',
 }, undefined, undefined, action)
}
