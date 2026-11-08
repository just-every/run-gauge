import type { Bindings } from '../auth.server'
import { need, text, kinds, type Value } from './model'
import { type Actor, type Transaction, finance, all } from './store'
import { reports } from './reports'
import { cited, snapshot, type AnalystAnswer, type AnalystFigure } from './analyst-types'
import type { Report } from './ui-describe'

/** An explicit human capture retains figures and revision references, never source text or authority. */
export async function analystCapture(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (action !== 'analyst:capture') return null
 need(a.session.kind === 'native' && finance(a), 'Only native finance can capture a margin snapshot', 403)
 for (const kind of kinds) {
  const rows = await all(env, kind)
  tx.guard(`(SELECT COUNT(*) FROM g_${kind})=?`, rows.length)
  for (const row of rows) tx.observe(kind, row)
 }
 const r = await reports(env, a, input.from, input.to, undefined, input.asOf || input.to)
 need(input.fingerprint === r.fingerprint, 'Report inputs changed; refresh before capturing', 409)
 const project = r.data.engagements.find(p => p.id === input.engagementId)
 need(project, 'Project unavailable to this session', 403)
 const figures = r.lineage.filter(f => f.id.startsWith(`margin:${project.id}:`)).map(f => cited(f))
 need(figures.length > 0, 'Margin calculation unavailable', 409)
 return tx.record('analystSnapshots', { engagementId: project.id, currency: project.value.currency, label: text(input.label, 'Snapshot label', 120), capturedBy: a.session.operator.id, capturedAt: Date.now(), snapshot: snapshot(r), figures }, undefined, undefined, action)
}

export function compareMargin(answer: AnalystAnswer, r: Report, projectId: string, id?: string) {
 if (!id) {
  answer.unknowns.push('No historical margin snapshot selected; the current answer cannot establish when margin fell. Capture a finance snapshot now to compare with a later read. No provider settlement is inferred.')
  return
 }
 const saved = r.data.analystSnapshots.find(s => s.id === id && s.value.engagementId === projectId)
 need(saved, 'Margin snapshot unavailable for this project', 403)
 need(saved.value.currency === r.data.engagements.find(p => p.id === projectId)?.value.currency, 'Snapshot currency differs; no implicit FX', 409)
 const before = saved.value.figures as AnalystFigure[]
 answer.snapshots.push(saved.value.snapshot)
 for (const f of before.filter(f => answer.figures.some(now => now.id === f.id))) answer.figures.push({ ...f, period: 'comparison' })
 const value = (period: AnalystFigure['period'], field: string) => answer.figures.find(f => f.period === period && f.id.endsWith(':' + field))?.value ?? null
 const delta = (field: string) => { const now = value('current', field), old = value('comparison', field); return now === null || old === null ? null : now - old }
 const earned = delta('earnedValueMinor'), cost = delta('approvedCostMinor'), margin = delta('actualMarginMinor')
 answer.observations.push(`Historical comparison uses the explicitly captured snapshot “${saved.value.label}”, revision ${saved.revision}; its old figures are retained observations, not recalculations with today's sources.`)
 if (margin !== null && earned !== null && cost !== null) {
  answer.summary = `Actual margin ${margin < 0 ? 'fell' : margin > 0 ? 'rose' : 'was unchanged'} by ${margin} integer minor units: earned operational value changed by ${earned}, approved cost by ${cost}; margin change = earned change − cost change.`
  answer.observations.push('Revision differences explain changed arithmetic inputs. They do not prove a business cause or authorize a correction.')
 } else {
  answer.status = 'incomplete'; answer.unknowns.push('Historical margin change is unknown because one of the captured or current inputs is incomplete.')
 }
 answer.unknowns.push(...before.flatMap(f => f.unknownSources))
}
