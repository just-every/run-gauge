import { type Row, type Value } from './model'

export interface LineageSource { kind: string; id: string; revision: string; value: Value }
export interface LineageFigure {
 id: string
 label: string
 value: number | null
 knownValue?: number
 unit: 'minor' | 'seconds' | 'count' | 'percent'
 currency: string | null
 formula: string
 complete: boolean
 sources: LineageSource[]
 unknownSources: string[]
 asOf: number | string
}

/** Only the caller's already-authorized report snapshot is accepted. */
export interface ReportLineageInput {
 asOf: number | string
 from: string
 to: string
 data: Record<string, Row[]>
 economics: Value[]
 capacity: Value[]
 pipeline: Value[]
 exceptions: Value[]
 correctionReviews?: Value[]
 utilization?: {byPerson: Value[]; byService: Value[]; byProject: Value[]; details: Value[]}
}

export interface Evidence { sources: LineageSource[]; unknown: string[] }
export class Lineage {
 readonly figures: LineageFigure[] = []
 constructor(readonly report: ReportLineageInput) {}
 rows(kind: string) { return this.report.data[kind] ?? [] }
 evidence(): Evidence { return { sources: [], unknown: [] } }
 row(e: Evidence, kind: string, id: string | null | undefined) {
  if (!id) return undefined
  const row = this.rows(kind).find(r => r.id === id)
  if (row) {
   if (!e.sources.some(s => s.kind === kind && s.id === id && s.revision === row.revision)) e.sources.push({ kind, ...row })
  } else e.unknown.push(`${kind}:${id}: source row unavailable in this report`)
  return row
 }
 add(id: string, label: string, value: number | null, unit: LineageFigure['unit'], formula: string, e: Evidence, currency: string | null = null, knownValue?: number) {
  const unknownSources = [...new Set(e.unknown)], complete = value !== null && unknownSources.length === 0
  this.figures.push({ id, label: !complete && knownValue !== undefined ? `${label} (incomplete)` : label,
   value: complete ? value : null, ...(knownValue !== undefined && !complete ? { knownValue } : {}), unit, currency, formula,
   complete, sources: e.sources.filter((s, i, all) => all.findIndex(other => other.kind === s.kind && other.id === s.id && other.revision === s.revision) === i), unknownSources, asOf: this.report.asOf })
 }
 timeEvidence(e: Evidence, row: Row) {
  this.row(e, 'time', row.id)
  // Frozen economics and approval live on the approved time revision. Include
  // the immutable referenced rate and terms when they are already visible.
  const frozen = row.value.economics
  if (frozen) {
   this.row(e, 'rates', frozen.rateId)
   this.row(e, 'budgets', frozen.budgetId)
  }
 }
}
