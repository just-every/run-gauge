import { Buffer } from 'node:buffer'
import { Unzip, UnzipInflate } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { Fault, need, text, type Value } from './model'

const expandedLimit = 8 * 1024 * 1024
const list = (value: any): any[] => value === undefined ? [] : Array.isArray(value) ? value : [value]

/** Read a bounded workbook in memory; nothing is executed or written to disk. */
function workbookFiles(bytes: Uint8Array) {
 const files = new Map<string, Uint8Array>()
 let expanded = 0, count = 0, pending = 0
 const zip = new Unzip(file => {
  need(++count <= 128, 'Workbook has too many ZIP members')
  need(!files.has(file.name), 'Duplicate workbook ZIP member')
  need(file.originalSize === undefined || file.originalSize <= expandedLimit, 'Expanded workbook exceeds 8 MiB')
  files.set(file.name, new Uint8Array()); pending++
  const chunks: Uint8Array[] = []; let size = 0
  file.ondata = (error, data, final) => {
   need(!error, 'Invalid workbook ZIP data')
   expanded += data.length; size += data.length
   need(expanded <= expandedLimit, 'Expanded workbook exceeds 8 MiB')
   chunks.push(data)
   if (final) {
    const content = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length }
    files.set(file.name, content); pending--
   }
  }
  file.start()
 })
 zip.register(UnzipInflate)
 // Bound each inflation step as well as the complete expanded archive.
 for (let i = 0; i < bytes.length; i += 512) zip.push(bytes.subarray(i, i + 512), i + 512 >= bytes.length)
 need(pending === 0, 'Truncated workbook ZIP')
 return files
}

export function harvestWorkbook(base64: unknown, worksheet: unknown) {
 try {
  need(typeof base64 === 'string' && base64.length <= 2800000, 'Workbook must be base64, limited to 2 MiB')
  const bytes = Buffer.from(base64, 'base64')
  need(bytes.length > 0 && bytes.length <= 2 * 1024 * 1024 && bytes.toString('base64') === base64, 'Invalid or oversized workbook base64')
  const name = text(worksheet, 'Declare timeWorksheet as the exact worksheet name', 200), files = workbookFiles(bytes)
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false, removeNSPrefix: true })
  const xml = (path: string): Value => {
   const content = files.get(path); need(content, `Workbook is missing ${path}`)
   const source = new TextDecoder('utf-8', { fatal: true }).decode(content)
   need(!/<!DOCTYPE|<!ENTITY/i.test(source), 'Workbook XML declarations are unsupported')
   need(XMLValidator.validate(source) === true, 'Invalid workbook XML')
   return parser.parse(source)
  }
  const sheets = list(xml('xl/workbook.xml').workbook?.sheets?.sheet)
  const matches = sheets.filter(sheet => sheet['@_name'] === name)
  need(matches.length === 1, 'Select one existing worksheet by its exact name')
  const rels = list(xml('xl/_rels/workbook.xml.rels').Relationships?.Relationship)
  const links = rels.filter(rel => rel['@_Id'] === matches[0]['@_id'])
  need(links.length === 1 && !links[0]['@_TargetMode'], 'Worksheet relationship must be internal')
  const target = String(links[0]['@_Target'] ?? '')
  const path = target.startsWith('/xl/') ? target.slice(1) : `xl/${target}`
  need(/^xl\/worksheets\/[^/]+\.xml$/.test(path), 'Unsupported worksheet path')
  const plain = (value: any): string => typeof value === 'string' ? value : typeof value?.['#text'] === 'string' ? value['#text'] : ''
  const string = (value: any): string => value?.r === undefined ? plain(value?.t) : list(value.r).map(run => plain(run.t)).join('')
  const shared = files.has('xl/sharedStrings.xml') ? list(xml('xl/sharedStrings.xml').sst?.si).map(string) : []
  const rows = list(xml(path).worksheet?.sheetData?.row)
  need(rows.length > 0 && rows.length <= 1001, 'Workbook needs a header and at most 1000 time rows')
  let header: string[] | undefined, previous = 0
  const records: { value: Record<string, string>; row: number }[] = []
  for (const row of rows) {
   const number = Number(row['@_r']); need(Number.isSafeInteger(number) && number > previous, 'Workbook rows need ordered explicit row numbers'); previous = number
   const values: string[] = []; const used = new Set<number>()
   for (const cell of list(row.c)) {
    need(!Object.hasOwn(cell, 'f'), 'Workbook formulas are unsupported; supply exported values')
    const ref = String(cell['@_r'] ?? '').match(/^([A-Z]{1,3})([1-9]\d*)$/)
    need(ref && Number(ref[2]) === number, 'Invalid workbook cell location')
    let column = 0; for (const char of ref[1]) column = column * 26 + char.charCodeAt(0) - 64
    need(column <= 256 && !used.has(column), 'Invalid or duplicate workbook column'); used.add(column)
    const type = cell['@_t'] ?? 'n'; let value: string
    if (type === 's') { const index = Number(cell.v); need(/^\d+$/.test(cell.v) && index < shared.length, 'Invalid shared string'); value = shared[index] }
    else if (type === 'inlineStr') value = string(cell.is)
    else { need(['n', 'str', 'd'].includes(type), 'Unsupported workbook cell type'); value = cell.v === undefined ? '' : plain(cell.v) }
    values[column - 1] = value
   }
   if (!values.some(value => value !== '')) continue
   if (!header) {
    need(number === 1, 'Workbook headers must be on row 1')
    header = Array.from({ length: values.length }, (_, i) => values[i] ?? '')
    need(header.every(Boolean) && new Set(header).size === header.length, 'Workbook needs unique nonempty headers')
   } else {
    need(values.length <= header.length, 'Workbook row extends beyond its headers')
    records.push({ value: Object.fromEntries(header.map((key, i) => [key, values[i] ?? ''])), row: number })
   }
  }
  need(header, 'Workbook needs headers')
  return { bytes, records, worksheet: name }
 } catch (error) {
  if (error instanceof Fault) throw error
  need(false, 'Invalid XLSX workbook; supply a supported exported worksheet')
 }
}
