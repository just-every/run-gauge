import { PDFDocument, PDFName, PDFArray, PDFDict, decodePDFRawStream } from 'pdf-lib'
import { unzipSync, strFromU8 } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { execFileSync } from 'node:child_process'

export function csvRows(bytes) {
 return JSON.parse(execFileSync('python3',['-c','import csv,json,sys;print(json.dumps(list(csv.reader(sys.stdin))))'],{input:bytes,encoding:'utf8'}))
}
export function workbookRows(bytes) {
 const files=unzipSync(new Uint8Array(bytes)),parser=new XMLParser({ignoreAttributes:false,parseTagValue:false}),list=v=>v==null?[]:Array.isArray(v)?v:[v]
 const strings=files['xl/sharedStrings.xml']?list(parser.parse(strFromU8(files['xl/sharedStrings.xml'])).sst.si).map(s=>String(s.t??'')):[]
 const sheet=parser.parse(strFromU8(files['xl/worksheets/sheet1.xml'])).worksheet
 return list(sheet.sheetData.row).map(r=>list(r.c).map(c=>c['@_t']==='s'?strings[Number(c.v)]:c['@_t']==='inlineStr'?String(c.is.t??''):String(c.v??'')))
}
export async function pdfLines(bytes) {
 const pdf=await PDFDocument.load(bytes),texts=[]
 for(const page of pdf.getPages()) {
  const fonts=page.node.Resources().lookup(PDFName.of('Font'),PDFDict),map=new Map()
  for(const [,ref] of fonts.entries()) {
   const font=pdf.context.lookup(ref,PDFDict),unicode=font.lookup(PDFName.of('ToUnicode'))
   if(!unicode)continue
   const cmap=Buffer.from(decodePDFRawStream(unicode).decode()).toString()
   for(const match of cmap.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g))map.set(match[1].toUpperCase(),String.fromCharCode(...match[2].match(/.{4}/g).map(s=>parseInt(s,16))))
  }
  const content=page.node.Contents(),streams=content instanceof PDFArray?content.asArray():[content]
  for(const ref of streams)for(const m of Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString().matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))texts.push(m[1].match(/.{4}/g).map(s=>map.get(s.toUpperCase())??'').join(''))
 }
 return texts
}
