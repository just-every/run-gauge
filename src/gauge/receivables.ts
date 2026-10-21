import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { csv, date, decode, need, sum, workDate, type RecordRow } from './model'
import { finance, fence, type Actor } from './store'

const bucketNames = ['current', '1–30', '31–60', '61–90', '91+'] as const
const overdueBucket = (days: number) => bucketNames[days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4]

/** INVOICE-006: one database snapshot of issued documents and their dated
 * allocations. A statement is internal preparation, never proof of sending. */
export async function receivablesRead(env: Bindings, a: Actor, asOfInput: string | null, clientId: string | null) {
 need(finance(a), 'Finance access required', 403)
 const asOf = date(asOfInput ?? workDate(Date.now(), a.timezone))
 // D1 batch reads share a transaction: a receipt cannot appear in only one
 // part of this report. Recheck current authority after reading it as well.
 const result = await env.DB.batch<RecordRow>([
  env.DB.prepare("SELECT id,revision,data FROM g_invoices WHERE json_extract(data,'$.issueDate')<=? AND (? IS NULL OR client_id=?) ORDER BY json_extract(data,'$.issueDate'),number,id").bind(asOf, clientId, clientId),
  env.DB.prepare("SELECT p.id,p.revision,p.data FROM g_payments p JOIN g_invoices i ON i.id=p.invoice_id WHERE json_extract(i.data,'$.issueDate')<=? AND json_extract(p.data,'$.date')<=? AND (? IS NULL OR i.client_id=?) ORDER BY json_extract(p.data,'$.date'),p.id").bind(asOf, asOf, clientId, clientId),
 ])
 const receipts = result[1].results.map(decode)
 const byInvoice = new Map<string, typeof receipts>()
 for (const r of receipts) { const group = byInvoice.get(r.value.invoiceId) ?? []; group.push(r); byInvoice.set(r.value.invoiceId, group) }
 const invoices = result[0].results.map(decode).map(r => {
  const v = r.value, payments = (byInvoice.get(r.id) ?? []).map(p => ({ id: p.id, revision: p.revision, date: p.value.date as string, reference: p.value.reference as string, amountMinor: p.value.amountMinor as number }))
  const paidMinor = sum(payments.map(p => p.amountMinor)), openMinor = sum([v.totalMinor, -paidMinor])
  const daysOverdue = Math.max(0, Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${v.dueDate}T00:00:00Z`)) / 86400000))
  return { id: r.id, revision: r.revision, clientId: v.clientId as string, client: (v.clientSnapshot.value.legalName || v.clientSnapshot.value.name) as string, engagementId: v.engagementId as string, number: v.number as string, issueDate: v.issueDate as string, dueDate: v.dueDate as string, currency: v.currency as string, invoicedMinor: v.totalMinor as number, paidMinor, openMinor, daysOverdue, agingBucket: overdueBucket(daysOverdue), payments }
 })
 const aggregate = (rows: typeof invoices) => [...new Set(rows.map(r => r.currency))].sort().map(currency => {
  const group = rows.filter(r => r.currency === currency)
  return { currency, invoicedMinor: sum(group.map(r => r.invoicedMinor)), paidMinor: sum(group.map(r => r.paidMinor)), openMinor: sum(group.map(r => r.openMinor)), aging: bucketNames.map(bucket => ({ bucket, amountMinor: sum(group.filter(r => r.agingBucket === bucket).map(r => r.openMinor)) })) }
 })
 const report = {
  asOf, clientId, invoices, totals: aggregate(invoices),
  clients: [...new Set(invoices.map(r => r.clientId))].sort().map(id => ({ clientId: id, totals: aggregate(invoices.filter(r => r.clientId === id)) })),
  basis: 'Native pre-tax invoices and manual receipt allocations through the inclusive as-of date; due today is current; aging uses whole calendar days after the frozen due date; currencies remain separate and unconverted.',
  verification: 'Finance recorded; not bank or processor verified. Internal statement preparation; no delivery implied.',
  unavailable: ['Disputes', 'Credit notes', 'Unapplied payments', 'Multi-invoice receipt allocation', 'Accounting/provider reconciliation'],
 }
 await fence(env, a)
 return { ...report, fingerprint: sha256(canonicalJson(report)) }
}

export function receivablesCsv(report: Awaited<ReturnType<typeof receivablesRead>>) {
 const rows: unknown[][] = [['row', 'as of', 'client id', 'client', 'currency', 'invoice number', 'invoice id', 'invoice revision', 'date', 'due date', 'receipt id', 'reference', 'invoiced minor', 'paid minor', 'open minor', 'days overdue', 'aging bucket', 'verification']]
 for (const i of report.invoices) {
  rows.push(['invoice', report.asOf, i.clientId, i.client, i.currency, i.number, i.id, i.revision, i.issueDate, i.dueDate, '', '', i.invoicedMinor, i.paidMinor, i.openMinor, i.daysOverdue, i.agingBucket, report.verification])
  for (const p of i.payments) rows.push(['receipt', report.asOf, i.clientId, i.client, i.currency, i.number, i.id, i.revision, p.date, '', p.id, p.reference, '', p.amountMinor, '', '', '', report.verification])
 }
 for (const c of report.clients) for (const t of c.totals) {
  rows.push(['client total', report.asOf, c.clientId, '', t.currency, '', '', '', '', '', '', '', t.invoicedMinor, t.paidMinor, t.openMinor, '', '', report.verification])
  for (const b of t.aging) rows.push(['aging', report.asOf, c.clientId, '', t.currency, '', '', '', '', '', '', '', '', '', b.amountMinor, '', b.bucket, report.verification])
 }
 return csv(rows)
}
