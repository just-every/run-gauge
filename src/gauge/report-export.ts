import { csv } from './model'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import type { LineageFigure } from './report-lineage'

// Capture the visible inputs and computed figures, excluding the read timestamp.
// An export refuses a changed snapshot instead of silently exporting new totals.
export function reportFingerprint(report: Record<string, unknown>) {
 const {data,capacity,resourceDemand,utilization,economics,pipeline,exceptions,correctionReviews,from,to}=report
 return sha256(canonicalJson({data,capacity,resourceDemand,utilization,economics,pipeline,exceptions,correctionReviews,from,to}))
}
export function reportCsv(report: {lineage: LineageFigure[]; asOf: string; from: string; to: string}) {
 const rows: unknown[][] = [['row', 'figure', 'label', 'value', 'known subtotal', 'complete', 'unit', 'currency', 'formula', 'as of', 'source kind', 'source id', 'source revision', 'source values', 'unknown sources']]
 for (const f of report.lineage) {
  rows.push(['figure', f.id, f.label, f.value, f.knownValue ?? '', f.complete, f.unit, f.currency, f.formula, report.asOf, '', '', '', '', f.unknownSources.join('; ')])
  for (const s of f.sources) rows.push(['source', f.id, '', '', '', '', '', '', '', report.asOf, s.kind, s.id, s.revision, JSON.stringify(s.value), ''])
 }
 return csv(rows.map((row,index)=>[...row,index?report.from:'report from',index?report.to:'report through']))
}
