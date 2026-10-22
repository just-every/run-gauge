import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
/// <reference types="vite/client" />
import fontUrl from './assets/proposal-font.ttf?inline'
import { sha256 } from '../modules/import-kit/src/d1/index'
import type { CommercialProposalDocument } from './commercial-proposal-document'
import { need } from './model'

/** Customer-only deterministic original. These exact bytes, not a user-attested
 * rendering, must be the original retained by the signature provider. */
export async function nativeProposalPdf(d:CommercialProposalDocument,number:number,fingerprint:string){
 const encoded=fontUrl.split(',')[1];need(encoded,'The bundled proposal font is unavailable',409)
 const fontBytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));need(fontBytes.length===569208,'The bundled proposal font is incomplete',409)
 const pdf=await PDFDocument.create({updateMetadata:false});pdf.registerFontkit(fontkit)
 pdf.setTitle(d.title);pdf.setAuthor(d.agencyName);pdf.setSubject('Exact proposal '+fingerprint);pdf.setCreator('Gauge proposal PDF v1');pdf.setProducer('Gauge proposal PDF v1');pdf.setCreationDate(new Date(0));pdf.setModificationDate(new Date(0))
 const font=await pdf.embedFont(fontBytes,{subset:true}),supported=new Set(font.getCharacterSet())
 let page=pdf.addPage([612,792]),y=744
 const line=(text:string,size=10)=>{
  if(y<60){need(pdf.getPageCount()<200,'Proposal exceeds the supported 200-page PDF limit');page=pdf.addPage([612,792]);y=744}
  page.drawText(text,{x:48,y,size,font,color:rgb(.07,.13,.2)});y-=size+5
 }
 const paragraph=(value:string,size=10)=>{
  const text=value.replace(/\r\n?/g,'\n').replace(/\t/g,'    ')
  need([...text].every(c=>c==='\n'||supported.has(c.codePointAt(0)!)),'The proposal font cannot render a character in this document; use a supported spelling before requesting a signature')
  for(const source of text.split('\n')){
   let current=''
   for(const character of source){const candidate=current+character;if(current&&font.widthOfTextAtSize(candidate,size)>516){line(current,size);current=character}else current=candidate}
   line(current,size)
  }
  y-=5
 }
 const money=(minor:number)=>d.currency+' '+(minor/100).toFixed(2),hours=(seconds:number)=>(seconds/3600).toFixed(4)+' hours'
 paragraph(d.agencyName,18);paragraph(d.title,16);paragraph('Proposal version '+number+' | '+d.notice)
 paragraph('Prepared for '+d.recipient.name+' | '+d.recipient.contact)
 paragraph(d.estimate.name+' | estimate version '+d.estimate.number)
 paragraph('Dates '+d.from+' to '+d.to+' | Expires '+d.expiry)
 paragraph('Scope',13);paragraph(d.scope)
 paragraph('Deliverables',13);for(const item of d.deliverables)paragraph('- '+item)
 paragraph('Exclusions',13);for(const item of d.exclusions)paragraph('- '+item)
 paragraph('Phases and dates',13)
 for(const phase of d.phases){paragraph(phase.name+' | '+phase.service+' | '+phase.mode);paragraph(phase.from+' to '+phase.to+' | '+hours(phase.effortSeconds)+' | Fees '+money(phase.feeMinor)+' | Expenses '+money(phase.expenseMinor))}
 paragraph('Customer prices',13)
 for(const item of d.lines){paragraph(item.name+' | '+item.service+' | '+item.kind);paragraph((item.kind==='expense'?item.quantity+' units at '+money(item.baseMinor/item.quantity):hours(item.effortSeconds)+' at '+money(item.billRateMinor!)+' per hour')+' | Customer amount '+money(item.amountMinor))}
 paragraph('Price summary',13);paragraph('Subtotal '+money(d.pricing.baseMinor));paragraph('Contingency '+(d.pricing.contingencyBasisPoints/100).toFixed(2)+'% | '+money(d.pricing.contingencyMinor));paragraph('Discount '+(d.pricing.discountBasisPoints/100).toFixed(2)+'% | '+money(d.pricing.discountMinor));paragraph('Fees '+money(d.feeMinor)+' | Expense allowance '+money(d.expenseMinor));paragraph('Total '+money(d.totalMinor)+' | '+hours(d.effortSeconds),13)
 paragraph('Payment schedule',13);for(const payment of d.paymentSchedule)paragraph(payment.name+' | Due '+payment.due+' | '+money(payment.amountMinor))
 paragraph('Review and acceptance',13);paragraph(d.signatureRequired?'Provider signature evidence and a deliberate exact-version client response are required.':'Client acceptance is recorded separately.')
 paragraph('Complete proposal fingerprint: '+fingerprint,8)
 pdf.getPages().forEach((p,i)=>p.drawText('Gauge | Proposal '+number+' | Page '+(i+1)+' of '+pdf.getPageCount(),{x:48,y:30,size:8,font}))
 const bytes=await pdf.save({useObjectStreams:false});need(bytes.length<=262144,'Proposal PDF exceeds the supported 256 KiB evidence size')
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte)
 return {format:'gauge-proposal-pdf-v1',mediaType:'application/pdf',sha256:sha256(bytes),base64:btoa(binary)}
}
