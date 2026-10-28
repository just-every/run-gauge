import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, date, integer } from './model'
import { type Actor, type Transaction, authority, finance, fence, get } from './store'
import { activeClient } from './clients'
import { owed, settledMinor } from './invoices'

// INVOICE-006 / INVOICE-015 / INVOICE-016 / INVOICE-017. Finance records money received from a client once, under one unique external reference, and
// allocates it to one or more of that client's invoices (same currency, each allocation an exact g_payments
// row naming the receipt). What is not allocated stays the receipt's unapplied balance. Finance also records a
// dispute against an invoice's open amount. Nothing here is bank or processor verified, and a dispute changes
// no amount, aging bucket or expected-cash month (INVOICE-007 / INVOICE-018 and FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022 inherit dispute holds by name).
export const receiptVerification = 'finance recorded; not bank or processor verified'
export const disputeOutcomes = ['rejected', 'withdrawn', 'credited']

export async function allocatedMinor(env: Bindings, receiptId: string) {
 return (await env.DB.prepare("SELECT COALESCE(SUM(amount_minor),0) AS total FROM g_payments WHERE json_extract(data,'$.receiptId')=?").bind(receiptId).first<{total: number}>())?.total ?? 0
}

export async function receiptCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (!['receipt:record', 'receipt:allocate', 'invoice:dispute', 'invoice:dispute-resolve'].includes(action)) return null
 need(finance(a), 'Finance access required', 403)
 await fence(env, a)
 const privileged = authority(a, true)
 tx.guard(privileged.sql, ...privileged.params)
 if (action === 'receipt:record') {
  const client = await activeClient(env, text(input.clientId, 'Client'))
  tx.observe('clients', client)
  const currency = text(input.currency, 'Currency', 3)
  need(/^[A-Z]{3}$/.test(currency), 'Use a three-letter ISO 4217 currency code')
  const reference = text(input.reference, 'Unique bank receipt reference', 200)
  need(!await env.DB.prepare('SELECT 1 FROM g_clientReceipts WHERE reference=?').bind(reference).first() && !await env.DB.prepare("SELECT 1 FROM g_payments WHERE reference=? AND json_extract(data,'$.receiptId') IS NULL").bind(reference).first(), 'This external reference is already recorded; a reference identifies one receipt', 409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_clientReceipts WHERE reference=?) AND NOT EXISTS(SELECT 1 FROM g_payments WHERE reference=? AND json_extract(data,'$.receiptId') IS NULL)", reference, reference)
  return tx.record('clientReceipts', {
   clientId: client.id, clientName: client.value.legalName || client.value.name, currency, amountMinor: integer(input.amountMinor, 'Receipt amount', 1, Number.MAX_SAFE_INTEGER),
   date: date(input.date), reference, recordedBy: a.session.operator.id, recordedAt: Date.now(), source: 'manual-bank-receipt', verification: receiptVerification,
  }, undefined, undefined, action)
 }
 if (action === 'receipt:allocate') {
  const receipt = await get(env, 'clientReceipts', text(input.id, 'Receipt'))
  need(receipt.revision === input.revision, 'Receipt revision changed; reload before allocating', 409)
  const invoice = await get(env, 'invoices', text(input.invoiceId, 'Invoice'))
  tx.observe('clientReceipts', receipt); tx.observe('invoices', invoice)
  need(invoice.value.clientId === receipt.value.clientId, 'A receipt allocates only to its own client\'s invoices')
  need(invoice.value.currency === receipt.value.currency, 'Receipt and invoice currencies differ; no implicit FX')
  const on = date(input.date), amountMinor = integer(input.amountMinor, 'Allocated amount', 1, Number.MAX_SAFE_INTEGER)
  need(on >= receipt.value.date && on >= invoice.value.issueDate, 'Allocation date precedes the receipt or the invoice issue date')
  need(amountMinor <= receipt.value.amountMinor - await allocatedMinor(env, receipt.id), 'Allocation exceeds the receipt\'s unapplied balance', 409)
  need(amountMinor <= invoice.value.totalMinor - await settledMinor(env, invoice.id), 'Allocation exceeds the invoice outstanding amount', 409)
  need(!await env.DB.prepare('SELECT 1 FROM g_payments WHERE invoice_id=? AND reference=?').bind(invoice.id, receipt.value.reference).first(), 'This receipt is already allocated to the invoice', 409)
  tx.guard("COALESCE((SELECT SUM(amount_minor) FROM g_payments WHERE json_extract(data,'$.receiptId')=?),0)+?<=(SELECT amount_minor FROM g_clientReceipts WHERE id=?)", receipt.id, amountMinor, receipt.id)
  tx.guard(owed, invoice.id, invoice.id, amountMinor, invoice.id, invoice.id)
  tx.guard('NOT EXISTS(SELECT 1 FROM g_payments WHERE invoice_id=? AND reference=?)', invoice.id, receipt.value.reference)
  return tx.record('payments', {
   invoiceId: invoice.id, engagementId: invoice.value.engagementId, currency: invoice.value.currency, amountMinor, date: on, reference: receipt.value.reference,
   receiptId: receipt.id, recordedBy: a.session.operator.id, recordedAt: Date.now(), source: 'manual-bank-receipt', verification: receiptVerification,
  }, undefined, undefined, action)
 }
 if (action === 'invoice:dispute') {
  const invoice = await get(env, 'invoices', text(input.id, 'Invoice'))
  need(invoice.revision === input.revision, 'Invoice revision changed; reload before recording a dispute', 409)
  tx.observe('invoices', invoice)
  const on = date(input.date), amountMinor = integer(input.amountMinor, 'Disputed amount', 1, Number.MAX_SAFE_INTEGER)
  need(on >= invoice.value.issueDate, 'Dispute date precedes invoice issue date')
  need(amountMinor <= invoice.value.totalMinor - await settledMinor(env, invoice.id), 'Disputed amount exceeds the invoice outstanding amount', 409)
  need(!await env.DB.prepare("SELECT 1 FROM g_invoiceDisputes WHERE invoice_id=? AND status='open'").bind(invoice.id).first(), 'This invoice already has an open dispute; resolve it first', 409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_invoiceDisputes WHERE invoice_id=? AND status='open')", invoice.id)
  tx.guard(owed, invoice.id, invoice.id, 0, invoice.id, invoice.id)
  return tx.record('invoiceDisputes', {
   invoiceId: invoice.id, invoiceNumber: invoice.value.number, engagementId: invoice.value.engagementId, clientId: invoice.value.clientId, currency: invoice.value.currency,
   amountMinor, openedDate: on, reason: text(input.reason, 'Dispute reason'), status: 'open', recordedBy: a.session.operator.id, recordedAt: Date.now(),
  }, undefined, undefined, action)
 }
 const dispute = await get(env, 'invoiceDisputes', text(input.id, 'Dispute'))
 need(dispute.revision === input.revision && dispute.value.status === 'open', 'Dispute is no longer open; reload', 409)
 tx.observe('invoiceDisputes', dispute)
 const outcome = text(input.outcome, 'Outcome'), on = date(input.date)
 need(disputeOutcomes.includes(outcome), 'Outcome must be rejected, withdrawn or credited')
 need(on >= dispute.value.openedDate, 'Resolution date precedes the dispute date')
 let creditId: string | null = null
 if (outcome === 'credited') {
  creditId = text(input.creditId, 'Credit note')
  need(await env.DB.prepare("SELECT 1 FROM g_invoiceCorrections WHERE id=? AND invoice_id=? AND kind<>'void' AND status='issued'").bind(creditId, dispute.value.invoiceId).first(), 'Choose an issued credit note of this invoice', 409)
 }
 return tx.record('invoiceDisputes', { ...dispute.value, status: 'resolved', outcome, resolvedDate: on, resolution: text(input.resolution, 'Resolution note'), creditId, resolvedBy: a.session.operator.id, resolvedAt: Date.now() }, dispute, undefined, action)
}
