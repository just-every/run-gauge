import type { Bindings } from '../auth.server'
import { type Transaction, get } from './store'
import { type Row, need } from './model'

/** Both queue and dispatch bind the live recipient authority to the retained original. */
export async function assertInvoiceMailSource(env:Bindings,tx:Transaction,release:Row){
 const v=release.value,invoice=await get(env,'invoices',v.invoiceId)
 need(v.status==='released'&&v.ownerId===tx.actor.session.operator.id&&v.expiresAt>Date.now(),'Invoice access expired, changed or belongs to another owner',409)
 need(invoice.revision===v.invoiceRevision&&invoice.value.pdf?.sha256===v.pdfSha256,'Invoice original changed; authorize the exact current document',409)
 const sql="EXISTS(SELECT 1 FROM g_invoice_access_authority c JOIN oa_operators o ON o.id=c.recipient_id JOIN oa_operators owner ON owner.id=c.owner_id WHERE c.access_id=? AND c.revision=? AND c.recipient_id=? AND c.owner_id=? AND o.status='active' AND o.role='member' AND lower(o.email)=? AND owner.status='active' AND owner.role='owner' AND NOT EXISTS(SELECT 1 FROM g_grants g WHERE g.operator_id=o.id AND g.enabled=1))"
 const params=[release.id,release.revision,v.recipientId,v.ownerId,v.contact]
 need((await env.DB.prepare(`SELECT (${sql}) AS ok`).bind(...params).first<{ok:number}>())?.ok===1,'Recipient authorization changed; release fresh access before sending',409)
 tx.guard(sql,...params);tx.guard("EXISTS(SELECT 1 FROM g_invoiceAccess WHERE id=? AND revision=? AND json_extract(data,'$.expiresAt')>CAST(unixepoch('subsec')*1000 AS INTEGER))",release.id,release.revision)
 tx.observe('invoiceAccess',release);tx.observe('invoices',invoice)
 return invoice
}
