import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import type { Row, Value } from './model'
import { escape as e, input as i, amount, select as s, form, table } from './ui-forms'
import { money, day, nameOf } from './ui-format'
import type { Report } from './ui-describe'
import { billLevels, costLevels, levelOf, costCurrencyOf, explainRate } from './rate-cards'
import { activeClients } from './ui-clients'

const levelName: Record<string, string> = { entry: 'Entry override',estimate:'Accepted estimate', project: 'Project', 'client-role': 'Client role', client: 'Client', role: 'Role', person: 'Person', service: 'Service' }
const scopeOf = (d: Report['data'], r: Row) => { const v = r.value, level = levelOf(v); return `${levelName[level]}: ${level === 'project' ? nameOf(d.engagements, v.engagementId) : level === 'client' ? nameOf(d.clients, v.clientId) : level === 'client-role' ? `${nameOf(d.clients, v.clientId)} · ${v.role}` : level === 'role' ? v.role : level === 'person' ? nameOf(d.people, v.personId) : 'Everyone'}` }
const policy = (v: Value) => [v.overtimeAfterSeconds !== undefined ? `${v.overtimeBps / 100}% after ${v.overtimeAfterSeconds / 3600} h/day` : '', v.writeDownBps ? `${v.writeDownBps / 100}% write-down` : ''].filter(Boolean).join(' · ') || '—'

/** RATE-002 / RATE-003: versioned client, project, role, person and service cards, their precedence and the explain view. */
export async function rateCardsSection(env: Bindings, a: Actor, report: Report, options: Value, today: string) {
 const d = report.data
 const services = [{ id: '*', revision: '', value: { name: 'All services' } }, ...[...new Set(['Delivery', ...d.time.map(r => r.value.service), ...d.rates.map(r => r.value.service)])].filter(x => x && x !== '*').sort().map(x => ({ id: x, revision: '', value: { name: x } }))]
 const projects = d.engagements.filter(r => r.value.type !== 'internal')
 let body = `<div class="g-titlebar"><h1>Rate cards</h1></div><p class="g-lede">Private to finance. Bill rates carry their client or project currency; unscoped cards use ${e(a.currency)} per hour; declared costs (W-2 loaded or 1099 contract) are USD per hour and are inputs, not payroll calculations. Bill precedence: ${['entry','project','estimate', ...billLevels.filter(l=>l!=='project')].map(l => levelName[l]).join(' → ')}; cost precedence: ${costLevels.map(l => levelName[l]).join(' → ')}. Within a level a named service beats All services, then the latest effective date wins. Approval freezes the chosen values; new versions never rewrite approved work.</p>`
 body += form('save:rates', 'Add rate version', s('engagementId', 'Project card', projects, undefined, true) + s('clientId', 'Client card', activeClients(d.clients), undefined, true) + i('role', 'Role (with or without a client)', '', 'text', false) + s('personId', 'Person card', d.people, undefined, true) + s('service', 'Service', services) + i('effective', 'Effective date', today, 'date') + amount('billDollars', `Bill per hour (${a.currency})`, '') + amount('costDollars', 'Declared cost per hour (USD, optional; person, role or service cards)', '', false) + i('overtimeAfterHours', 'Overtime after hours per day (optional)', '', 'number', false) + i('overtimeBps', 'Overtime multiplier in basis points (15000 = 1.5×)', '', 'number', false) + i('writeDownBps', 'Write-down in basis points (1000 = 10%, optional)', '', 'number', false), undefined, 'Save', 'g-card--form')
 body += table('Rate card versions', d.rates, [
  { label: 'Card', wrap: true, cell: r => e(scopeOf(d, r)) },
  { label: 'Service', cell: r => e(r.value.service === '*' ? 'All services' : r.value.service) },
  { label: 'Effective', cell: r => e(day(r.value.effective)) },
  { label: 'Bill per hour', num: true, cell: r => money(r.value.billMinor, r.value.currency) },
  { label: 'Declared cost per hour', num: true, cell: r => r.value.costMinor == null ? 'Unknown' : money(r.value.costMinor, costCurrencyOf(r)) },
  { label: 'Overtime and write-down', wrap: true, cell: r => e(policy(r.value)) },
 ])
 const open = d.time.filter(r => ['draft', 'returned', 'submitted'].includes(r.value.status) && projects.some(p => p.id === r.value.engagementId))
 body += table('Negotiated entry overrides', open, [
  { label: 'Entry', wrap: true, cell: r => e(`${nameOf(d.people, r.value.personId)} · ${nameOf(d.engagements, r.value.engagementId)} · ${r.value.service} · ${day(r.value.workDate)}`) },
  { label: 'Override', num: true, cell: r => r.value.rateOverride ? `${money(r.value.rateOverride.billRateMinor, a.currency)}${r.value.rateOverride.writeDownBps ? ` less ${r.value.rateOverride.writeDownBps / 100}%` : ''}` : 'Card rate' },
 ], r => `<details class="g-reveal"><summary class="g-btn g-btn--secondary">Override rate</summary>${form('rate:entry', 'Negotiated entry rate', amount('billRateDollars', `Bill per hour (${a.currency}; blank clears)`, r.value.rateOverride?.billRateMinor ?? '', false) + i('writeDownBps', 'Write-down in basis points (optional)', r.value.rateOverride?.writeDownBps ?? '', 'number', false) + i('reason', 'Override reason', r.value.rateOverride?.reason ?? '', 'text', false), r, 'Save override', 'g-bare')}</details>`, 'No unapproved client time.')
 body += `<section class="g-card g-card--form" id="rate-explain"><h2>Explain a rate</h2><form class="g-form" method="get" action="/app/rates#rate-explain">${s('explainPerson', 'Person', d.people, options.explainPerson)}${s('explainEngagement', 'Engagement', d.engagements, options.explainEngagement)}${s('explainService', 'Service', services.slice(1), options.explainService)}${s('explainTask','Quoted task (optional)',d.tasks,options.explainTask,true)}${i('explainDate', 'Work date', options.explainDate ?? today, 'date')}<div class="g-actions"><button class="g-btn g-btn--secondary" type="submit">Explain</button></div></form>`
 if (options.explainPerson && options.explainEngagement && options.explainService && options.explainDate) {
  const x = await explainRate(env, a, { personId: options.explainPerson, engagementId: options.explainEngagement, service: options.explainService, date: options.explainDate,taskId:options.explainTask })
  const rows = x.levels.map(l => ({ id: `level-${l.level}`, revision: '', value: l }))
  body += `<p class="g-reading-line">Bill rate: ${x.bill ? `${e(x.bill.level==='estimate'?(x.bill.rate!.commercialProposalId?'Client-accepted estimate':'Owner-attested estimate'):levelName[x.bill.level])} ${x.bill.level==='estimate'?'version':'card'}, ${money(x.bill.rate!.billMinor, x.bill.rate!.currency)} per hour${x.bill.rate!.writeDownBps?` less ${x.bill.rate!.writeDownBps/100}%`:''}` : 'none applies (unknown)'} · Declared cost: ${x.cost && x.cost.rate!.costMinor != null ? `${e(levelName[x.cost.level])} card, ${money(x.cost.rate!.costMinor, x.cost.rate!.costCurrency ?? x.cost.rate!.currency)} per hour` : 'unknown'}. An entry override, when finance sets one, beats other sources. ${x.quote?`<a href="/app/engagements?estimate=${e(x.quote.estimateId)}#estimates">Open the governing quote version</a>`:''}</p>` + table('Precedence for this work', rows, [
   { label: 'Level', cell: r => e(levelName[r.value.level]) },
   { label: 'Matching versions', wrap: true, cell: r => r.value.candidates.map((c: Value) => `${e(c.service === '*' ? 'All services' : c.service)} from ${e(day(c.effective))}`).join('; ') || 'None' },
   { label: 'Chosen', wrap: true, cell: r => r.value.chosen ? (r.value.level === x.bill?.level || r.value.level === x.cost?.level ? `Applies${r.value.level === x.bill?.level ? ' (bill)' : ''}${r.value.level === x.cost?.level ? ' (cost)' : ''}` : 'Outranked') : '—' },
  ])
 }
 return body + '</section>'
}
