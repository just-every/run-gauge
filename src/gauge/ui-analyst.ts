import type { Bindings } from '../auth.server'
import { analystAnswer, type AnalystAnswer, type AnalystFigure } from './analyst'
import { Fault, type Value } from './model'
import { finance, type Actor } from './store'
import type { Report } from './ui-describe'
import { escape as e, input, select, area } from './ui-forms'
import { money } from './ui-format'

const display = (f: AnalystFigure) => f.value === null ? 'Unknown' : f.unit === 'minor' ? money(f.value, f.currency!) : f.unit === 'percent' ? `${f.value.toFixed(2)}%` : `${f.value} ${f.unit}`
function answerBody(answer: AnalystAnswer) {
 const figures = answer.figures.map(f => `<article><h4>${e(f.period)} · ${e(f.label)}: ${e(display(f))}</h4><p>${e(f.formula)}</p>${f.knownValue === undefined ? '' : `<p>Known subtotal only: ${e(display({ ...f, value: f.knownValue }))}. Total remains unknown.</p>`}<details><summary>Source revisions</summary><ul>${f.sources.map(s => `<li><a href="/api/gauge/history/${e(s.kind)}/${e(s.id)}">${e(s.kind)} · ${e(s.id)}</a><p>Revision ${e(s.revision)}</p></li>`).join('')}</ul></details></article>`).join('')
 return `<div id="analyst-answer" role="region" aria-label="Analyst answer"><h3>${e(answer.summary)}</h3><p>${e(answer.scope)}</p>${answer.snapshots.map(s => `<p>Period ${e(s.from)} through ${e(s.to)}. Read at ${e(s.asOf)}${s.forecastAsOf ? `; forecast date ${e(s.forecastAsOf)}` : ''}. Recalculated from current retained records; external source freshness is unknown.</p>`).join('')}<ul>${answer.observations.map(s => `<li>${e(s)}</li>`).join('')}</ul>${figures}${answer.unknowns.length ? `<h4>Unknowns and limits</h4><ul>${answer.unknowns.map(s => `<li>${e(s)}</li>`).join('')}</ul>` : ''}${answer.suggestion ? `<p><a href="${e(answer.suggestion.href)}">${e(answer.suggestion.label)}</a></p><p>${e(answer.suggestion.requires)}</p>` : ''}</div>`
}

/** Reporting tool within Review; no new configuration, execution controls or agent grants. */
export async function analystPanel(env: Bindings, a: Actor, report: Report, options: Value) {
 if (a.session.kind !== 'native' || (!finance(a) && a.role !== 'lead')) return ''
 const q = options.analyst ?? {}, shift = (s: string, n: number) => new Date(Date.parse(s) + n * 86400000).toISOString().slice(0, 10)
 const length = (Date.parse(report.to) - Date.parse(report.from)) / 86400000 + 1
 let result = ''
 if (q.question) {
  try { result = answerBody(await analystAnswer(env, a, q, report)) }
  catch (error) { if (!(error instanceof Fault)) throw error; result = `<p role="alert">${e(error.message)}</p>` }
 }
 return `<section id="operational-analyst" class="g-card"><h2>Ask about this project</h2><p>Compare recorded billable utilization or reconcile current project margin. For example: “Why did utilization fall?” or “Why did this project lose margin?” Answers use your permitted records and never change them.</p><form class="g-form" method="get" action="/app/review#operational-analyst"><input type="hidden" name="asOf" value="${e(report.forecast?.asOf ?? report.to)}"><input type="hidden" name="analystFingerprint" value="${e(report.fingerprint)}">${select('analystProject', 'Project to analyze', report.data.engagements, q.engagementId)}${input('from', 'Current period from', report.from, 'date').replace('<input ', '<input readonly ')}${input('to', 'Current period through', report.to, 'date').replace('<input ', '<input readonly ')}${input('compareFrom', 'Comparison period from', q.compareFrom ?? shift(report.from, -length), 'date')}${input('compareTo', 'Comparison period through', q.compareTo ?? shift(report.from, -1), 'date')}${area('question', 'Your question', q.question ?? '').replace('<textarea ', '<textarea maxlength="500" ')}<div class="g-actions"><button class="g-btn g-btn--secondary">Ask analyst</button></div></form>${result}</section>`
}
