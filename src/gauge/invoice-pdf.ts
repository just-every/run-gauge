import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontUrl from './assets/proposal-font.ttf?inline'
import { type Value, need } from './model'
import { sha256 } from '../modules/import-kit/src/d1/index'

/** Deterministic finance document: local assets only, no network rendering. */
export async function invoicePdf(document: Value, invoice: Value, detail = false) {
 const pdf = await PDFDocument.create({ updateMetadata: false }); pdf.registerFontkit(fontkit)
 pdf.setTitle(detail ? 'Invoice source detail' : 'Invoice'); pdf.setAuthor(document.agencyName); pdf.setCreator('Gauge invoice PDF v1'); pdf.setProducer('Gauge invoice PDF v1'); pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0))
 const font = await pdf.embedFont(Uint8Array.from(atob(fontUrl.split(',')[1]), c => c.charCodeAt(0)), { subset: true }), supported = new Set(font.getCharacterSet())
 let page = pdf.addPage([612, 792]), y = 744
 const line = (value: string, size = 10) => {
  if (y < 60) { need(pdf.getPageCount() < 100, 'Invoice PDF exceeds 100 pages'); page = pdf.addPage([612, 792]); y = 744 }
  page.drawText(value, { x: 48, y, size, font, color: rgb(.07, .13, .2) }); y -= size + 5
 }
 const paragraph = (value: string, size = 10) => {
  const text = String(value).replace(/\r\n?/g, '\n').replaceAll('\t', '    ')
  need([...text].every(c => c === '\n' || supported.has(c.codePointAt(0)!)), 'The invoice font cannot render a character; use a supported spelling')
  for (const source of text.split('\n')) { let current = ''; for (const c of source) { if (current && font.widthOfTextAtSize(current + c, size) > 516) { line(current, size); current = c } else current += c } line(current, size) } y -= 5
 }
 const money = (n: number) => document.currency + ' ' + (n / 100).toFixed(2)
 if (document.settings.logo) {
  const logo = document.settings.logo, bytes = Uint8Array.from(atob(logo.base64), c => c.charCodeAt(0))
  let image; try { image = logo.mediaType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes) } catch { need(false, 'The logo is not a valid PNG or JPEG') }
  const scale = Math.min(160 / image.width, 60 / image.height); page.drawImage(image, { x: 48, y: y - image.height * scale, width: image.width * scale, height: image.height * scale }); y -= image.height * scale + 16
 }
 paragraph(document.agencyName, 18)
 if (document.address) paragraph(Object.values(document.address).filter(Boolean).join(', '))
 paragraph((detail ? 'Source detail for ' : '') + (invoice.number ?? 'Draft invoice — number assigned on issue'), 15)
 paragraph('Bill to: ' + (invoice.billTo ?? document.clientName)); paragraph('Project: ' + document.project)
 if (invoice.issueDate) paragraph('Issued ' + invoice.issueDate + ' · Due ' + invoice.dueDate)
 if (invoice.reference) paragraph('Reference: ' + invoice.reference)
 if (detail) for (const r of document.detail) {
  paragraph(`${r.project}${r.phase?' · '+r.phase:''} · ${r.date} · ${r.kind} · ${r.person} · ${r.task} · ${r.notes}`)
  paragraph(`Source ${r.sourceId} · revision ${r.sourceRevision}`)
  if(r.originalSourceId!==r.sourceId)paragraph(`Original time ${r.originalSourceId} · revision ${r.originalSourceRevision} · offset seconds ${r.offsetSeconds}`)
  paragraph(`Actual seconds ${r.actualSeconds ?? 'not applicable'} · Billed seconds ${r.billedSeconds ?? 'not applicable'} · Rate ${r.rateMinor == null ? 'not applicable' : money(r.rateMinor) + ' per hour'} · Amount ${money(r.amountMinor)}`)
  if(r.remainingMinor!=null)paragraph('Remaining to bill: '+money(r.remainingMinor))
  if (r.kind === 'expenses') paragraph(`Category ${r.category} · Vendor ${r.vendor} · Receipts ${r.receipts.join(', ') || 'none'}`)
 } else for (const r of document.lines) { paragraph(r.label); paragraph((r.billedSeconds ? `${Number((r.billedSeconds / 3600).toFixed(4))} billed hours · ${r.rateMinor == null ? 'multiple rates' : money(r.rateMinor) + ' per hour'} · ` : '') + money(r.amountMinor));if(r.remainingMinor!=null)paragraph('Remaining to bill: '+money(r.remainingMinor)) }
 paragraph('Total (pre-tax): ' + money(document.totalMinor), 13)
 // Preserve paragraph boundaries and visible emphasis without accepting arbitrary HTML.
 const details = document.settings.additionalDetails.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/?p\s*>/gi, '\n').split(/(<\/?(?:b|strong|i|em)\s*>)/i)
 let emphasized = false
 for (const part of details) { if (/^<\//.test(part)) emphasized = false; else if (/^</.test(part)) emphasized = true; else if (part.trim()) paragraph(part, emphasized ? 12 : 10) }
 paragraph(document.settings.footer)
 if (invoice.remitTo) paragraph('Remit to: ' + invoice.remitTo)
 paragraph('Native pre-tax document. No provider delivery or settlement is verified.', 8)
 pdf.getPages().forEach((p, i) => p.drawText(`${invoice.number ?? 'Draft'} · Page ${i + 1} of ${pdf.getPageCount()}`, { x: 48, y: 30, size: 8, font }))
 const bytes = await pdf.save({ useObjectStreams: false }); need(bytes.length <= 1048576, 'Invoice PDF exceeds 1 MiB')
 let binary = ''; for (const b of bytes) binary += String.fromCharCode(b)
 return { mediaType: 'application/pdf', base64: btoa(binary), sha256: sha256(bytes) }
}
