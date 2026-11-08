import type { Value } from './model'
import { csv, need } from './model'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import * as XLSX from '@e965/xlsx'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontUrl from './assets/proposal-font.ttf?inline'

// These are existing report calculations, never an expression evaluator.
export const savedColumns = {
 profitability: {
  budgetMinor: 'Approved budget (minor units)', costMinor: 'Approved cost (minor units)',
  earnedMinor: 'Earned value (minor units)', marginMinor: 'Margin (minor units)',
  eacFeesMinor: 'Forecast fees (minor units)', eacCostMinor: 'Forecast cost (minor units)',
  forecastMarginMinor: 'Forecast margin (minor units)',
 },
 utilization: {
  approvedSeconds: 'Approved time (seconds)', billableSeconds: 'Billable time (seconds)',
  availableSeconds: 'Available time (seconds)', utilizationPercent: 'Utilization (%)',
 },
}
export const savedFormulas: Record<string,string> = {
 budgetMinor: 'Sum of approved project budgets', costMinor: 'Sum of approved frozen time costs and approved expenses',
 earnedMinor: 'Earned operational value; not recognized revenue', marginMinor: 'Earned value minus approved cost',
 eacFeesMinor: 'Sum of project forecast fees', eacCostMinor: 'Sum of project forecast costs',
 forecastMarginMinor: 'Forecast fees minus forecast costs', approvedSeconds: 'Approved time in the selected window',
 billableSeconds: 'Approved billable time in the selected window', availableSeconds: 'Distinct people capacity in the selected window',
 utilizationPercent: 'Billable seconds divided by available seconds times 100; unknown when capacity is missing or zero',
}
export function permittedColumns(dataset: string, input: unknown) {
 const choices = savedColumns[dataset as keyof typeof savedColumns]
 need(choices, 'Choose profitability or utilization')
 const keys = input ?? Object.keys(choices)
 need(Array.isArray(keys) && keys.length > 0 && keys.length <= Object.keys(choices).length, 'Choose at least one permitted calculated measure')
 need(new Set(keys).size === keys.length && keys.every(k => Object.hasOwn(choices, k)), 'Calculated measure unavailable', 403)
 return keys as string[]
}
export function savedTable(definition: Value, result: Value, fields: Value[]) {
 const names = savedColumns[definition.dataset as keyof typeof savedColumns] as Record<string,string>
 const columns = permittedColumns(definition.dataset, definition.columns)
 const headers = ['Cohort', 'Currency', ...columns.map(k => names[k])]
 const formulas = ['', '', ...columns.map(k => savedFormulas[k])]
 for (const id of definition.measures ?? []) {
  const f = fields.find(f => f.id === id)
  need(f, 'Custom measure unavailable', 403)
  headers.push(f.value.name + (f.value.currency ? ` (${f.value.currency} minor units)` : ' (number)'))
  formulas.push('Sum of distinct source records; unknown if any value is missing')
 }
 const rows = (result?.rows ?? []).map((row: Value) => {
  const measures = row.customMeasures ?? row.measures ?? []
  return [row.label ?? row.name, row.currency ?? '', ...columns.map(k => row[k] ?? null), ...(definition.measures ?? []).map((id:string) => measures.find((m:Value) => m.fieldId === id)?.value ?? null)]
 })
 need(rows.length <= 1000, 'Saved report exceeds 1000 rows; narrow its filters')
 return { headers, formulas, rows, warning: 'Shared and multi-select cohorts overlap and must not be summed. Unknown values are never zero. Money stays in its source currency.' }
}
export function savedFingerprint(definition: Value, result: Value, sources: Value) {
 return sha256(canonicalJson({ definition, result, sources }))
}
export function savedGrid(snapshot: Value): (string|number)[][] {
 const { definition, table, fingerprint } = snapshot
 const safe = (v: unknown):string|number => v == null ? 'Unknown' : typeof v === 'number' ? v : String(v).replace(/^[\s]*[=+@\-\t\r]/, "'$&")
 return [
  ['Saved report', safe(definition.value.name)], ['Definition revision', definition.revision],
  ['Snapshot fingerprint', fingerprint], ['From', definition.value.from], ['Through', definition.value.to],
  ['Warning', table.warning], ['Formulas', ...table.formulas.map(safe)], table.headers.map(safe),
  ...table.rows.map((r:unknown[]) => r.map(safe)),
 ]
}
export async function savedArtifact(snapshot: Value, format: string) {
 const grid = savedGrid(snapshot)
 if (format === 'csv') return { bytes: csv(grid), type: 'text/csv; charset=utf-8' }
 if (format === 'xlsx') {
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(grid)
  XLSX.utils.book_append_sheet(book, sheet, 'Saved report')
  return { bytes: XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
 }
 need(format === 'pdf', 'Choose CSV, XLSX or PDF')
 const pdf = await PDFDocument.create({ updateMetadata: false }); pdf.registerFontkit(fontkit)
 pdf.setTitle(snapshot.definition.value.name); pdf.setCreator('Gauge saved reports')
 pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0))
 const font = await pdf.embedFont(Uint8Array.from(atob(fontUrl.split(',')[1]), c => c.charCodeAt(0)), { subset: true })
 const supported = new Set(font.getCharacterSet())
 let page = pdf.addPage([842,595]), y = 557
 const line = (s:string) => {
  if (y < 38) { need(pdf.getPageCount() < 200, 'Report PDF exceeds 200 pages'); page = pdf.addPage([842,595]); y = 557 }
  page.drawText(s, { x: 36, y, size: 13, font }); y -= 19
 }
 // Keep each row together and wrap long rows at a readable size.
 for (const row of grid) {
  const value = row.map(String).join(' | ').replace(/\r\n?|\t/g,' ')
  need([...value].every(c => c==='\n' || supported.has(c.codePointAt(0)!)), 'Report font cannot render a character; use a supported spelling')
  for (const part of value.split('\n')) {
   let current = ''
   for (const c of part) { if (current && font.widthOfTextAtSize(current+c,13)>770) { line(current); current=c } else current+=c }
   line(current)
  }
  y -= 6
 }
 return { bytes: await pdf.save({ useObjectStreams: false }), type: 'application/pdf' }
}
