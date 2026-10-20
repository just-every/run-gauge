import { Buffer } from 'node:buffer'
import { zipSync, strToU8 } from 'fflate'

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
const xml = body => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelationships = 'http://schemas.openxmlformats.org/package/2006/relationships'
const columnName = index => {
 let result = ''
 for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result
 return result
}

/**
 * rows: arrays of cells, including the header row. null/undefined/holes omit cells.
 * Cells are strings/numbers or { value, type?, formula? }; type uses OOXML names
 * (n, s, inlineStr, str, d, b), with "text" and "number" aliases. Strings use
 * shared strings by default. Formula values are cached results, never evaluated.
 * formula: { A2: 'SUM(B2:C2)' } adds formulas to the primary sheet's cells.
 * extraSheets: [{ name, rows, formula? }]. extraFiles: { 'zip/path': string|Uint8Array }
 * adds or replaces ZIP members so rejection cases can alter the package explicitly.
 */
export function workbook(rows, { worksheet = 'Detailed time', formula = {}, extraSheets = [], extraFiles = {} } = {}) {
 const strings = [], stringIndexes = new Map()
 let stringCount = 0
 const sharedString = value => {
  const text = String(value)
  if (!stringIndexes.has(text)) { stringIndexes.set(text, strings.length); strings.push(text) }
  stringCount++
  return stringIndexes.get(text)
 }
 const sheets = [{ name: worksheet, rows, formula }, ...extraSheets]
 const files = {}
 sheets.forEach((sheet, sheetIndex) => {
  const data = sheet.rows.map((row, rowIndex) => {
   const cells = row.map((input, columnIndex) => {
    if (input === null || input === undefined) return ''
    const ref = `${columnName(columnIndex)}${rowIndex + 1}`
    const cell = typeof input === 'object' ? input : { value: input }
    const value = cell.value ?? ''
    const requestedType = cell.type ?? (typeof value === 'number' ? 'n' : 's')
    const type = ({ text: 's', number: 'n' })[requestedType] ?? requestedType
    const expression = cell.formula ?? sheet.formula?.[ref]
    const f = expression === undefined ? '' : `<f>${escape(expression)}</f>`
    const content = type === 'inlineStr' ? `<is><t xml:space="preserve">${escape(value)}</t></is>`
     : `<v>${type === 's' ? sharedString(value) : escape(value)}</v>`
    return `<c r="${ref}" t="${escape(type)}">${f}${content}</c>`
   }).join('')
   return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  files[`xl/worksheets/sheet${sheetIndex + 1}.xml`] = xml(`<worksheet xmlns="${main}"><sheetData>${data}</sheetData></worksheet>`)
 })
 files['xl/workbook.xml'] = xml(`<workbook xmlns="${main}" xmlns:r="${relationships}"><sheets>${sheets.map((sheet, index) => `<sheet name="${escape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`)
 files['xl/_rels/workbook.xml.rels'] = xml(`<Relationships xmlns="${packageRelationships}">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${relationships}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rIdStrings" Type="${relationships}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`)
 files['xl/sharedStrings.xml'] = xml(`<sst xmlns="${main}" count="${stringCount}" uniqueCount="${strings.length}">${strings.map(value => `<si><t xml:space="preserve">${escape(value)}</t></si>`).join('')}</sst>`)
 files['_rels/.rels'] = xml(`<Relationships xmlns="${packageRelationships}"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
 files['[Content_Types].xml'] = xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
 return Buffer.from(zipSync(Object.fromEntries(Object.entries({ ...files, ...extraFiles }).map(([path, content]) => [path, typeof content === 'string' ? strToU8(content) : content]))))
}
