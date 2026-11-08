import { frozenLateFeeTerms } from './late-fees'
import { presentationDocument, invoiceDetailCsv } from './invoice-presentation'
import { invoicePdf } from './invoice-pdf'
import type { Bindings } from '../auth.server'
import { type Row, type Value, decode, need, text, date, integer, sum, uuid } from './model'
import { type Actor, type Transaction, authority, finance, fence, get } from './store'
import { activeClient } from './clients'
import { assertIndependentReview, needsIndependentReview, observedApprovalPolicy } from './approval-policy'
import { plusDays, reserveNumber } from './invoices'

// INVOICE-004. Finance corrects an issued invoice only by appending linked, immutable documents:
// - a credit note (credit, approved discount or write-off) credits named invoice lines, each up to its billed amount,
//   and never more in total than the invoice still owes after receipts and earlier credits;
// - a void cancels an invoice with no receipts or credits; its reissue is a new, newly numbered invoice on the same
//   packet carrying each line at no more than its original amount. Any amount not reissued stays written down.
// Neither path rewrites the original or releases its sources: they stay reserved by the original packet, so the
// work cannot be billed again. A correction whose reduction is strictly above the owner's GOVERN-001 review limit
// waits as pending until another owner or finance person issues it. Documents are pre-tax: no tax is reversed.
export const correctionLabels: Record<string, string> = { credit: 'Credit note', discount: 'Approved discount', 'write-off': 'Write-off', void: 'Void' }
export const correctionTaxEffect = 'None: pre-tax document; tax reversal arrives with INVOICE-005'
const creditTypes = ['credit', 'discount', 'write-off']

async function correctionsOf(env: Bindings, invoiceId: string) {
 return (await env.DB.prepare('SELECT id,revision,data FROM g_invoiceCorrections WHERE invoice_id=? ORDER BY rowid').bind(invoiceId).all<{id:string;revision:string;data:string}>()).results.map(decode)
}
async function standing(env: Bindings, invoiceId: string) {
 const row = await env.DB.prepare("SELECT COALESCE((SELECT SUM(amount_minor) FROM g_payments WHERE invoice_id=?1),0) AS paid, (SELECT COUNT(*) FROM g_payments WHERE invoice_id=?1) AS receipts").bind(invoiceId).first<{paid: number, receipts: number}>()
 return { paidMinor: row?.paid ?? 0, receipts: row?.receipts ?? 0 }
}
/** Line amounts posted as [{line, amountMinor}] or, from the Billing form, as `<prefix><index>Minor` fields. */
function lineAmounts(input: Value, field: string, prefix: string) {
 if (Array.isArray(input[field])) return (input[field] as Value[]).map(l => ({ index: integer(l.line ?? l.index, 'Invoice line', 0, 999), amountMinor: integer(l.amountMinor, 'Line amount in cents', 0, Number.MAX_SAFE_INTEGER) }))
 if (field === 'lines' && input.line !== undefined) return [{ index: integer(input.line, 'Invoice line', 0, 999), amountMinor: integer(input.amountMinor, 'Credit amount in cents', 0, Number.MAX_SAFE_INTEGER) }]
 return Object.keys(input).flatMap(key => { const m = key.match(new RegExp(`^${prefix}(\\d+)Minor$`)); return m ? [{ index: Number(m[1]), amountMinor: integer(input[key], 'Line amount in cents', 0, Number.MAX_SAFE_INTEGER) }] : [] })
}
const describe = (line: Value, index: number, amountMinor: number) => ({ index, kind: line.kind, sourceId: line.sourceId, sourceRevision: line.sourceRevision, description: line.description ?? null, originalAmountMinor: line.amountMinor, amountMinor })

/** The issued void, then its reissue on the same packet, in one batch. */
async function issueVoid(env: Bindings, a: Actor, tx: Transaction, invoice: Row, value: Value, previous?: Row) {
 const v = invoice.value, reissueId = value.reissueTotalMinor > 0 ? uuid() : null
 const issued = { ...value, status: 'issued', reissueInvoiceId: reissueId, approvedBy: a.session.operator.id, approvedAt: Date.now() }
 const row = await tx.record('invoiceCorrections', issued, previous, undefined, previous ? 'invoice:correction-approve' : 'invoice:void')
 if (!reissueId) return row
 const client = await activeClient(env, v.clientId); tx.observe('clients', client)
 const terms = client.value.paymentTermsDays == null ? 30 : integer(client.value.paymentTermsDays, 'Client payment terms days', 0, 365)
 const lines = (value.reissueLines as Value[]).filter(l => l.amountMinor > 0).map(l => ({ ...structuredClone(v.lines[l.index]), amountMinor: l.amountMinor, originalAmountMinor: v.lines[l.index].amountMinor }))
 const engagement=await get(env,'engagements',v.engagementId);tx.observe('engagements',engagement)
 const packet={...v.packetSnapshot,value:{...v.packetSnapshot.value,totalMinor:value.reissueTotalMinor}}
 const document=await presentationDocument(env,tx,packet,client,engagement,lines,v.document?.settings??{})
 const number=await reserveNumber(env,tx,'g_invoice_sequence','INV'),header={number,issueDate:value.date,dueDate:plusDays(value.date,terms),billTo:v.billTo,remitTo:v.remitTo,reference:v.reference}
 const pdf=await invoicePdf(document,header),detailPdf=document.settings.attachDetail?await invoicePdf(document,header,true):null
 await tx.record('invoices', {
  document,pdf,detailPdf,detailCsv:document.settings.attachDetail?invoiceDetailCsv(document):null,
  packetId: v.packetId, packetRevision: v.packetRevision, engagementId: v.engagementId,engagementIds:v.engagementIds, clientId: v.clientId,
  number, issueDate: value.date, dueDate: plusDays(value.date, terms),
  billTo: v.billTo, remitTo: v.remitTo, reference: v.reference, currency: v.currency, totalMinor: value.reissueTotalMinor, lines,
  issuedBy: a.session.operator.id, issuedAt: Date.now(), paymentTermsDays: terms, termsLabel: client.value.paymentTermsDays == null ? 'Net 30 assumed' : `Net ${terms}`,
  lateFeeTerms: frozenLateFeeTerms(client, v.currency, value.date),
  clientSnapshot: structuredClone(client), engagementSnapshot: v.engagementSnapshot, packetSnapshot: v.packetSnapshot,
  reissueOf: invoice.id, reissueOfNumber: v.number, voidId: row.id,
  taxBasis: 'pre-tax', issuance: 'native ledger only; no sending or accounting-provider submission',
 }, undefined, reissueId, previous ? 'invoice:correction-approve' : 'invoice:void')
 return row
}

export async function invoiceCorrectionCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (!['invoice:credit', 'invoice:void', 'invoice:correction-approve', 'invoice:correction-withdraw'].includes(action)) return null
 need(finance(a), 'Finance access required', 403)
 await fence(env, a)
 const privileged = authority(a, true)
 tx.guard(privileged.sql, ...privileged.params)
 if (action === 'invoice:correction-approve' || action === 'invoice:correction-withdraw') {
  const correction = await get(env, 'invoiceCorrections', text(input.id, 'Correction'))
  need(correction.revision === input.revision && correction.value.status === 'pending', 'Choose the exact pending correction revision', 409)
  const invoice = await get(env, 'invoices', correction.value.invoiceId); tx.observe('invoices', invoice)
  if (action === 'invoice:correction-withdraw') return tx.record('invoiceCorrections', { ...correction.value, status: 'withdrawn', withdrawnBy: a.session.operator.id, withdrawnAt: Date.now(), withdrawReason: text(input.reason, 'Reason for withdrawing') }, correction, undefined, action)
  await assertIndependentReview(env, a, tx, { amountMinor: correction.value.reviewMinor, currency: correction.value.currency, createdBy: correction.value.preparedBy })
  const now = await standing(env, invoice.id), others = (await correctionsOf(env, invoice.id)).filter(c => c.id !== correction.id)
  need(!others.some(c => c.value.type === 'void' && c.value.status === 'issued'), 'This invoice is already void', 409)
  if (correction.value.type === 'void') {
   need(now.receipts === 0 && !others.some(c => c.value.status === 'issued'), 'Only an invoice with no receipts or credits can be voided; credit it instead', 409)
   return issueVoid(env, a, tx, invoice, correction.value, correction)
  }
  const credited = sum(others.filter(c => c.value.status === 'issued').map(c => c.value.amountMinor))
  need(correction.value.amountMinor <= invoice.value.totalMinor - now.paidMinor - credited, 'Credit exceeds what the invoice still owes', 409)
  return tx.record('invoiceCorrections', { ...correction.value, status: 'issued', number: await reserveNumber(env, tx, 'g_credit_sequence', 'CN'), approvedBy: a.session.operator.id, approvedAt: Date.now() }, correction, undefined, action)
 }
 const invoice = await get(env, 'invoices', text(input.id, 'Invoice'))
 need(invoice.revision === input.revision, 'Invoice revision changed; reload before correcting it', 409)
 tx.observe('invoices', invoice)
 const v = invoice.value, on = date(input.date), reason = text(input.reason, 'Reason')
 need(on >= v.issueDate, 'A correction cannot precede its invoice issue date')
 need(input.currency === undefined || input.currency === v.currency, 'Correction currency differs from the invoice; no implicit FX')
 const existing = (await correctionsOf(env, invoice.id)).filter(c => c.value.status !== 'withdrawn'), now = await standing(env, invoice.id)
 need(!existing.some(c => c.value.type === 'void'), 'This invoice is void or has a pending void', 409)
 // Corrections of one invoice serialize: a competing correction commits first and this one is retried.
 tx.guard("(SELECT COUNT(*) FROM g_invoiceCorrections WHERE invoice_id=? AND status<>'withdrawn')=?", invoice.id, existing.length)
 const policy = await observedApprovalPolicy(env, tx)
 const base = { invoiceId: invoice.id, invoiceRevision: invoice.revision, invoiceNumber: v.number, engagementId: v.engagementId,engagementIds:v.engagementIds, clientId: v.clientId, currency: v.currency, date: on, reason, preparedBy: a.session.operator.id, preparedAt: Date.now(), taxBasis: 'pre-tax', taxEffect: correctionTaxEffect }
 if (action === 'invoice:void') {
  need(now.receipts === 0 && existing.length === 0, 'Only an invoice with no receipts or credits can be voided; credit it instead', 409)
  const reissue = lineAmounts(input, 'reissue', 'reissueLine'), seen = new Set<number>()
  for (const l of reissue) { need(l.index < v.lines.length && !seen.has(l.index), 'Choose each invoice line once'); seen.add(l.index); need(l.amountMinor <= v.lines[l.index].amountMinor, 'A reissued line cannot exceed its original amount; issue new work through a new packet') }
  const reissueLines = v.lines.map((line: Value, index: number) => describe(line, index, reissue.find(l => l.index === index)?.amountMinor ?? 0))
  const reissueTotalMinor = sum(reissueLines.map((l: Value) => l.amountMinor)), reviewMinor = v.totalMinor - reissueTotalMinor
  const value = { ...base, type: 'void', amountMinor: v.totalMinor, reissueLines, reissueTotalMinor, writtenDownMinor: reviewMinor, reviewMinor }
  if (needsIndependentReview(policy, { amountMinor: reviewMinor, currency: v.currency })) return tx.record('invoiceCorrections', { ...value, status: 'pending' }, undefined, undefined, action)
  return issueVoid(env, a, tx, invoice, value)
 }
 const type = String(input.type ?? 'credit')
 need(creditTypes.includes(type), 'Choose a credit, discount or write-off')
 const requested = lineAmounts(input, 'lines', 'creditLine').filter(l => l.amountMinor > 0), seen = new Set<number>()
 need(requested.length > 0, 'Credit at least one invoice line')
 const lines = requested.map(l => {
  need(l.index < v.lines.length && !seen.has(l.index), 'Choose each invoice line once'); seen.add(l.index)
  const before = sum(existing.flatMap(c => (c.value.lines ?? []).filter((x: Value) => x.index === l.index).map((x: Value) => x.amountMinor)))
  need(before + l.amountMinor <= v.lines[l.index].amountMinor, 'Credits on a line cannot exceed its billed amount', 409)
  return describe(v.lines[l.index], l.index, l.amountMinor)
 })
 const amountMinor = sum(lines.map(l => l.amountMinor)), credited = sum(existing.filter(c => c.value.status === 'issued').map(c => c.value.amountMinor))
 need(amountMinor <= v.totalMinor - now.paidMinor - credited, 'Credit exceeds what the invoice still owes', 409)
 const value = { ...base, type, amountMinor, reviewMinor: amountMinor, lines }
 if (needsIndependentReview(policy, { amountMinor, currency: v.currency })) return tx.record('invoiceCorrections', { ...value, status: 'pending' }, undefined, undefined, action)
 return tx.record('invoiceCorrections', { ...value, status: 'issued', number: await reserveNumber(env, tx, 'g_credit_sequence', 'CN'), approvedBy: a.session.operator.id, approvedAt: Date.now() }, undefined, undefined, action)
}
