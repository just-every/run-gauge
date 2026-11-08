import { type Row, type Value, uuid } from './model'
import type { Actor } from './store'
import type { Report } from './ui-describe'
import { escape as e, input, area, check } from './ui-forms'
import { hours, day, when, nameOf } from './ui-format'

const hidden = (name: string, value: unknown) => `<input type="hidden" name="${e(name)}" value="${e(value)}">`
const formStart = (action: string) => `<form class="g-form" method="post" action="/app/action" enctype="multipart/form-data">${hidden('action', action)}${hidden('key', uuid())}${hidden('page', 'review')}`
const metric = (value: number | null | undefined, unit: string) => value == null ? 'Unknown' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit}`
const facts = (items: [string, string][]) => `<dl class="g-facts">${items.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`
const historyLink = (kind: string, id: string, label: string) => `<a href="/api/gauge/history/${e(encodeURIComponent(kind))}/${e(encodeURIComponent(id))}">${e(label)}</a>`
const projectName = (report: Report, id: string) => nameOf(report.data.engagements, id, 'Unavailable project')

function scoreCard(title: string, score: Value) {
 return `<section class="g-card"><h4>${e(title)}</h4>${facts([
  ['Effort error (MAPE)', metric(score.effortMape, '%')],
  ['Margin error', metric(score.marginError, ' percentage points')],
  ['Payment-timing error', metric(score.paymentTimingError, ' days')],
 ])}</section>`
}

function sampleDetails(sample: Value, report: Report) {
 const roles = sample.roles.map((role: Value) => `<section class="g-card"><h4>${e(role.role)}</h4>${facts([
  ['Baseline effort', hours(role.estimatedSeconds)], ['Candidate effort', hours(role.candidateSeconds)],
  ['Approved actual effort', hours(role.actualSeconds)], ['Baseline absolute percentage error', metric(role.baselineApe, '%')],
  ['Candidate absolute percentage error', metric(role.candidateApe, '%')],
 ])}</section>`).join('')
 return `<details class="g-card"><summary>${e(projectName(report, sample.engagementId))} · ${e(sample.currency)}</summary>
 <p>${historyLink('estimates', sample.estimateId, 'Estimate revision history')} · revision ${e(sample.estimateRevision)}</p>
 ${roles}${facts([
  ['Baseline margin', metric(sample.baselineMarginPercent, '%')], ['Candidate margin', metric(sample.candidateMarginPercent, '%')],
  ['Final margin', metric(sample.finalMarginPercent, '%')], ['Baseline margin error', metric(sample.baselineMarginError, ' percentage points')],
  ['Candidate margin error', metric(sample.candidateMarginError, ' percentage points')],
 ])}
 ${sample.unknowns.length ? `<h4>Unknown evidence</h4><ul>${sample.unknowns.map((unknown: string) => `<li>${e(unknown)}</li>`).join('')}</ul>` : ''}
 <details><summary>Sample lineage · ${e(sample.sources.length)} source revisions</summary><ul>${sample.sources.map((source: Value) => `<li>${historyLink(source.kind, source.id, `${source.kind} · ${source.id}`)}<p>Revision ${e(source.revision)}</p></li>`).join('')}</ul></details></details>`
}

function comparison(preview: Value, report: Report) {
 const exclusions = preview.exclusions.map((excluded: Value) => `<li>${e(projectName(report, excluded.engagementId))}: ${e(excluded.reason)}</li>`).join('')
 const clients = preview.excludedClients.map((client: Value) => `<li>${e(nameOf(report.data.clients, client.id, 'Unavailable client'))}: ${e(client.reason)}<p>Client revision ${e(client.revision)}</p></li>`).join('')
 return `<p><strong>${e(preview.status)}</strong> · ${e(preview.eligibleProjects)} eligible completed projects · completed through ${e(day(preview.completedThrough))}</p>
 <p>${e(preview.reason)}</p><p>Candidate: ${e(preview.candidate.role)} effort at ${e(metric(preview.candidate.basisPoints / 100, '%'))} of the recorded estimate.</p>
 ${scoreCard('Current assumption', preview.baseline)}${scoreCard('Candidate assumption', preview.candidateScore)}${scoreCard('Difference · candidate minus current', preview.difference)}
 <p>Lower error is better; a negative difference means less error. Unknown evidence stays unknown.</p>
 <p>Settlement evidence: payment-timing error is unknown. ${e(preview.adoption.reason)}</p>
 <details><summary>Scoring formulas</summary><dl class="g-facts"><div><dt>Effort error</dt><dd>${e(preview.formulas.effort)}</dd></div><div><dt>Margin error</dt><dd>${e(preview.formulas.margin)}</dd></div><div><dt>Payment-timing error</dt><dd>${e(preview.formulas.payment)}</dd></div></dl></details>
 ${clients ? `<h4>Excluded clients</h4><ul>${clients}</ul>` : ''}${exclusions ? `<h4>Excluded projects</h4><ul>${exclusions}</ul>` : ''}
 <details><summary>Selected project revisions · ${e(preview.selections.length)}</summary><ul>${preview.selections.map((selection: Value) => `<li>${e(projectName(report, selection.engagementId))}<p>Project revision ${e(selection.engagementRevision)} · ${historyLink('estimates', selection.estimateId, 'Estimate history')} · estimate revision ${e(selection.estimateRevision)}</p></li>`).join('')}</ul></details>
 <h4>Held-out project evidence</h4>${preview.samples.map((sample: Value) => sampleDetails(sample, report)).join('') || '<p class="g-empty">No projects could be scored.</p>'}
 <details><summary>Comparison fingerprint</summary><p style="overflow-wrap:anywhere">${e(preview.sourceDigest)}</p></details>`
}

/** Owner-selected, immutable comparisons within Review. Evidence never offers an adoption action. */
export function learningPanel(a: Actor, report: Report, options: Value): string {
 if (a.session.kind !== 'native' || a.role !== 'owner') return ''
 const preview: Value | undefined = options.learningPreview, selected: Value[] = preview?.selections ?? []
 const excluded: Value[] = preview?.excludedClients ?? [], projects = report.data.engagements.filter(project => project.value.estimateId)
 const projectChecks = projects.map(project => {
  const estimate = report.data.estimates.find(row => row.id === project.value.estimateId)
  const reference = { engagementId: project.id, engagementRevision: project.revision, estimateId: project.value.estimateId, estimateRevision: project.value.estimateRevision ?? estimate?.revision }
  return check('selectedSamples', project.value.name, selected.some(sample => sample.engagementId === project.id), JSON.stringify(reference))
 }).join('')
 const clientChecks = report.data.clients.filter(client => !client.value.merge).map(client => check('excludedClients', client.value.name, excluded.some(item => item.id === client.id), JSON.stringify({id:client.id,revision:client.revision}))).join('')
 const fields = input('name', 'Comparison name', preview?.name ?? '') + area('reason', 'Why compare these projects?', preview?.reason ?? '')
  + input('completedThrough', 'Completed through', preview?.completedThrough ?? report.to, 'date')
  + input('candidateRole', 'Role to compare', preview?.candidate.role ?? '')
  + input('candidatePercent', 'Candidate effort (% of estimate)', (preview?.candidate.basisPoints ?? 12000) / 100, 'number').replace('<input ', '<input min="1" step="1" ')
  + '<p class="g-field--wide g-note">100% keeps estimated effort unchanged; 120% uses one fifth more effort for the selected role.</p>'
  + `<fieldset class="g-checklist g-checks"><legend>Held-out projects</legend>${projectChecks || '<p class="g-empty">No projects linked to an estimate yet.</p>'}</fieldset>`
  + `<fieldset class="g-checklist g-checks"><legend>Exclude atypical clients</legend>${clientChecks || '<p class="g-empty">No clients yet.</p>'}</fieldset>`
  + area('exclusionReason', 'Reason for client exclusions (required when excluding a client)', excluded[0]?.reason ?? '', false)
 const retained: Row[] = (report.data as Value).learningCohorts ?? []
 const history = retained.map(row => `<details class="g-card"><summary>${e(row.value.name)} · ${e(when(row.value.savedAt, a.timezone))} · ${e(row.value.status)}</summary><p>Kept by ${e(row.value.savedBy)}. Retained scores use the source revisions captured at save time; project and client labels show current names.</p>${comparison(row.value, report)}</details>`).join('')
 let result = ''
 if (preview) {
  const payload = { name: preview.name, reason: preview.reason, completedThrough: preview.completedThrough, candidate: preview.candidate, selections: preview.selections, excludedClients: preview.excludedClients, sourceDigest: preview.sourceDigest }
  result = `<section class="g-card" aria-label="Forecast comparison preview"><h3>${e(preview.name)}</h3>${comparison(preview, report)}${formStart('learning:save')}${hidden('payload', JSON.stringify(payload))}<div class="g-actions"><button class="g-btn g-btn--primary">Keep comparison</button></div></form></section>`
 }
 return `<details id="forecast-learning" class="g-card"${preview ? ' open' : ''}><summary>Forecast backtesting</summary><p>Compare one role-effort assumption with recorded estimates on the same owner-selected completed projects. At least five eligible projects are needed. Missing settlement evidence keeps payment timing unknown and prevents adoption.</p>${formStart('learning:preview')}${fields}<div class="g-actions"><button class="g-btn g-btn--secondary">Preview comparison</button></div></form>${result}<h3>Retained comparisons</h3>${history || '<p class="g-empty">No comparisons kept yet.</p>'}</details>`
}
