import type { Bindings } from '../auth.server'
import { invoiceDeliveryControls } from './ui-invoice-delivery'
import { type Actor, Transaction, get, access, all, fence, finance } from './store'
import { type Value, need, text } from './model'
import { invoiceLines } from './invoices'
import { assertDocumentReader, presentationDocument, invoiceDetailCsv, timeModes, expenseModes } from './invoice-presentation'
import { invoicePdf } from './invoice-pdf'
import { escape as e, choices, form, input, decision } from './ui-forms'
import { shell } from './ui'
import { Buffer } from 'node:buffer'

const documentHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" }
/** Internal finance previews and exact issued originals. Client access is a separate delivery capability. */
export async function invoiceDocumentResponse(env: Bindings, a: Actor, url: URL, id: string, issued: boolean) {
 const headers = {...documentHeaders, 'referrer-policy':a.clientInvoice?'no-referrer':'same-origin'}
 if(a.clientInvoice){need(issued,'Client access requires an issued document',403);await fence(env,a)}else await assertDocumentReader(env, a)
 const tx = new Transaction(env, a)
 let document: Value, header: Value, record
 if (issued) {
  record = await get(env, 'invoices', id); need(record.value.document && record.value.pdf, 'This historical invoice has no retained presentation document', 409)
  document = record.value.document; header = record.value; tx.observe('invoices', record)
 } else {
  record = await get(env, 'packets', id); need(record.value.status === 'approved' && record.revision === url.searchParams.get('revision'), 'Choose the exact approved packet revision', 409)
  need(!record.value.correctsPacketId && record.value.totalMinor > 0, 'Choose a positive original billing packet', 409)
  tx.observe('packets', record)
  const engagement = await access(env, a, record.value.engagementId), client = await get(env, 'clients', engagement.value.clientId)
  tx.observe('engagements', engagement); tx.observe('clients', client)
  // A preview reads all approved sources without reserving a number or creating an invoice.
  const lines = await invoiceLines(env, tx, record, engagement, '9999-12-31')
  document = await presentationDocument(env, tx, record, client, engagement, lines, Object.fromEntries(url.searchParams))
  header = { billTo: client.value.legalName ?? client.value.name }
 }
 const format = url.searchParams.get('format') ?? 'html'
 need(['html', 'json', 'pdf', 'detail-pdf', 'csv'].includes(format), 'Unknown invoice document format')
 need(!issued || !['detail-pdf', 'csv'].includes(format) || document.settings.attachDetail, 'This invoice was issued without a detail attachment', 409)
 if(a.clientInvoice){
  const release=await get(env,'invoiceAccess',a.clientInvoice.id);tx.observe('invoiceAccess',release)
  need(release.value.invoiceId===record.id&&release.value.invoiceRevision===record.revision&&release.value.pdfSha256===record.value.pdf.sha256,'Invoice access does not match this exact original',403)
  need(format!=='json','Client access is limited to the issued documents',403)
  await tx.record('invoiceViews',{accessId:release.id,invoiceId:record.id,invoiceRevision:record.revision,pdfSha256:record.value.pdf.sha256,operatorId:a.session.operator.id,format,at:Date.now()},undefined,undefined,'invoice:client-view')
 }
 tx.audit(issued ? 'invoice:download' : 'invoice:preview', issued ? 'invoices' : 'packets', record.id, { revision: record.revision, format, timeMode: document.settings.timeMode, expenseMode: document.settings.expenseMode })
 await tx.commit()
 if (format === 'json') return Response.json({ document, number: header.number ?? null, pdfSha256: issued ? record.value.pdf.sha256 : null }, { headers })
 if (format === 'pdf' || format === 'detail-pdf') {
  const artifact = issued ? format === 'pdf' ? record.value.pdf : record.value.detailPdf : await invoicePdf(document, header, format === 'detail-pdf')
  return new Response(Buffer.from(artifact.base64, 'base64'), { headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${header.number ?? 'draft-invoice'}${format === 'detail-pdf' ? '-detail' : ''}.pdf"` } })
 }
 if (format === 'csv') return new Response(issued ? record.value.detailCsv : invoiceDetailCsv(document), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${header.number ?? 'draft-invoice'}-detail.csv"` } })
 const endpoint = url.pathname, base = new URLSearchParams(url.searchParams); base.delete('format')
 const link = (format: string, label: string) => `<a class="g-link" href="${e(endpoint)}?${e(new URLSearchParams({ ...Object.fromEntries(base), format }))}">${e(label)}</a>`
 const money = (n: number) => `${document.currency} ${(n / 100).toFixed(2)}`
 const previewForm = issued ? '' : `<form class="g-form" method="get"><input type="hidden" name="revision" value="${e(record.revision)}">${choices('timeMode', 'Time presentation', [...timeModes], document.settings.timeMode)}${choices('expenseMode', 'Expense presentation', [...expenseModes], document.settings.expenseMode)}<button class="g-btn g-btn--primary">Preview presentation</button></form>`
 const logo = document.settings.logo ? `<img alt="Agency logo" width="160" height="60" src="data:${e(document.settings.logo.mediaType)};base64,${e(document.settings.logo.base64)}">` : ''
 const rich = document.settings.additionalDetails.split(/(<\/?(?:b|strong|i|em|p|br)\s*\/?\s*>)/i).map((part: string) => /^<\/?(?:b|strong|i|em|p|br)\s*\/?\s*>$/i.test(part) ? part : e(part)).join('')
 let accessPanel=''
 if(issued&&finance(a)){
  const releases=(await all(env,'invoiceAccess')).filter(r=>r.value.invoiceId===record.id),views=await all(env,'invoiceViews')
  const cards=[]
  for(const r of releases)cards.push(`<section class="g-card"><p>${e(r.value.contact)} · ${e(r.value.status)} · expires ${e(new Date(r.value.expiresAt).toISOString())} · ${views.filter(v=>v.value.accessId===r.id).length} document views</p><p><a class="g-link" href="/app/client-invoices/${e(r.id)}">Recipient invoice page</a></p>${a.role==='owner'&&r.value.status==='released'?decision('invoice:revoke-access','Revoke client access',r,true):''}${await invoiceDeliveryControls(env,a,r)}</section>`)
  accessPanel='<section id="invoice-client-access">'+(a.role==='owner'?form('invoice:release','Client document access',input('contact','Invited recipient email','','email')+input('days','Access days (1 to 30)',7,'number')+input('reason','Authorization reason'),record,'Authorize exact invoice'):'')+'<p>Only this email-confirmed recipient can open this invoice. Authorization sends no message.</p>'+cards.join('')+'</section>'
 }
 const body = `${a.clientInvoice?'':'<a class="g-link" href="/app/billing">Back to Billing</a>'}<section class="g-card" id="invoice-document"><h1>${e(header.number ?? 'Draft invoice')}</h1><p>${issued ? 'Retained issued original' : 'Preview only; no number assigned'}</p>${previewForm}${logo}<h2>${e(document.agencyName)}</h2>${document.address ? `<p>${e(Object.values(document.address).filter(Boolean).join(', '))}</p>` : ''}<p>Bill to: ${e(header.billTo)}</p><p>${e(document.project)}</p><ul>${document.lines.map((l: Value) => `<li>${e(l.label)} · ${e(money(l.amountMinor))}${l.remainingMinor!=null?' · Remaining to bill '+e(money(l.remainingMinor)):''}${l.billedSeconds ? ` · ${e(Number((l.billedSeconds / 3600).toFixed(4)))} billed hours · ${l.rateMinor == null ? 'multiple rates' : e(money(l.rateMinor)) + ' per hour'}` : ''}</li>`).join('')}</ul><p><strong>Total (pre-tax): ${e(money(document.totalMinor))}</strong></p><div>${rich}</div><p>${e(document.settings.footer)}</p><p>${e(header.remitTo ?? '')}</p><p>${link('pdf', 'Download invoice PDF')}${document.settings.attachDetail || !issued ? ' · ' + link('detail-pdf', 'Download source detail PDF') + ' · ' + link('csv', 'Download source detail CSV') : ''}</p><p>Native pre-tax document. Delivery evidence is recorded separately; settlement is not verified.</p></section>${accessPanel}`
 return new Response(shell(a, 'billing', header.number ?? 'Invoice preview', body, { today: new Date().toISOString().slice(0, 10), zone: a.timezone }), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } })
}
