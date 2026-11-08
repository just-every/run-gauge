import type { LineageFigure } from './report-lineage'
import type { Report } from './ui-describe'

export type AnalystSubject = 'utilization' | 'margin' | 'time-policy' | 'billing'
export type AnalystFigure = Omit<LineageFigure, 'sources'> & { period: 'current' | 'comparison'; sources: { kind: string; id: string; revision: string }[] }
export interface AnalystAnswer {
 status: 'answered' | 'restricted' | 'unsupported' | 'incomplete'
 subject: AnalystSubject | null
 summary: string
 scope: string
 snapshots: { from: string; to: string; asOf: string; forecastAsOf: string | null; fingerprint: string }[]
 figures: AnalystFigure[]
 unknowns: string[]
 observations: string[]
 suggestion: { label: string; href: string; requires: string } | null
 actions: { label: string; href: string; requires: string; sources: AnalystFigure['sources'] }[]
}
export const snapshot = (r: Report) => ({ from: r.from, to: r.to, asOf: r.asOf, forecastAsOf: r.forecast?.asOf ?? null, fingerprint: r.fingerprint })
export const cited = (f: LineageFigure, period: AnalystFigure['period'] = 'current'): AnalystFigure => ({ ...f, period, sources: f.sources.map(({ kind, id, revision }) => ({ kind, id, revision })) })
export const cite = (r: Report, id: string, period: AnalystFigure['period'] = 'current') => {
 const f = r.lineage.find(f => f.id === id)
 return f ? cited(f, period) : undefined
}

/** Intent chooses a calculation, never an executable instruction or a claim about a provider. */
export function analystIntent(question: string): AnalystSubject | null {
 if (/\b(send|email|delete|approve|execute|pay|refund|tax|payroll)\b/i.test(question)) return null
 const topics: [AnalystSubject, RegExp][] = [
  ['utilization', /\b(utili[sz]ation|billable capacity|billable (?:hours|time|share)|less billable|capacity usage)\b/i],
  ['margin', /\b(margin|profit|profitability|los(?:e|ing|t) money|costs? exceed)\b/i],
  ['time-policy', /\b(time[ -]?policy|timesheet|time (?:review|approval|rules|polic(?:y|ies))|work notes|entry limit)\b/i],
  ['billing', /\b(bill(?:ing|ed)?|invoices?|unbilled|charges?|receipts?|revenue)\b/i],
 ]
 const matched = topics.filter(([, pattern]) => pattern.test(question))
 return matched.length === 1 ? matched[0][0] : null
}
