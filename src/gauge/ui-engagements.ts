// Engagements and agreed work: the list of engagements with approved hours on
// their estimate, clients and people, and one engagement's detail (?edit=<id>):
// its facts, scope, terms, tasks, milestones and economics, with the forms that
// change them. Forms keep their actions and field names.
import { currencies } from './agency'
import { estimateSection } from './ui-estimates'
import { acceptanceSummary } from './ui-estimate-attestation'
import { fieldInputs } from './ui-custom-fields'
import { type Actor, finance } from './store'
import type { Kind, Row, Value } from './model'
import { escape as e, input as i, amount, duration, area, select as s, choices as c, check, checks, form, decision, table, open } from './ui-forms'
import { hours, money, day, chip, nameOf, yesNo } from './ui-format'
import { meter } from './ui-meter'
import type { Report } from './ui-describe'
import { economicsCard, estimateOf } from './ui-review'
import { pipelineSection } from './ui-pipeline'
import { phaseFields,phasePicker,phaseBudgetSection } from './ui-budget-phases'
import { latestBudget } from './budget-caps'
import { retainerSection } from './ui-retainers'
import { deliveryScheduleSection } from './ui-delivery-schedule'
import { templateApplySection, templatesSection } from './ui-delivery-templates'
import { taskEditor, tasksSection } from './ui-tasks'
import { resourceProfileFields } from './ui-resource-profiles'
import { milestoneDeliverySection } from './ui-milestone-delivery'
import { activeClients, clientForm, clientMergeForm, clientSearchSection, clientsTable } from './ui-clients'

const termsLine = (b: Row) => `${b.value.mode === 'fixed' ? 'Fixed fee' : 'Hourly'} · ${hours(b.value.effortSeconds)}${b.value.amountMinor === undefined ? '' : ` · ${money(b.value.amountMinor, b.value.currency)}`}`

export function engagementsSection(a: Actor, report: Report, options: Value, today: string) {
 const d = report.data, edit = (kind: Kind) => d[kind].find(r => r.id === options.edit), v = (kind: Kind) => edit(kind)?.value ?? {}
 const manager = finance(a) || a.role === 'lead', managed = d.engagements.filter(r => finance(a) || r.value.leadId === a.personId)
 // The detail view: an engagement, or the engagement of the task or milestone being edited.
 const focus = edit('engagements') ?? d.engagements.find(r => r.id === (edit('tasks') ?? edit('milestones'))?.value.engagementId)
 const terms = (engagementId?: string) => form('save:budgets', 'New terms / change order', s('engagementId', 'Engagement', managed, engagementId) + c('mode', 'Billing mode', ['hourly', 'fixed']) + amount('amountDollars', `Budget or fixed fee (${d.engagements.find(r => r.id === engagementId)?.value.currency ?? a.currency})`, '') + duration('effortHours', 'Estimated effort (hours)', '') + duration('roundingMinutes', 'Round billable time up to (minutes)', 60, 60, '1') + check('notToExceed','Hourly not-to-exceed cap',!!(engagementId&&report.capBalances.some(b=>b.engagementId===engagementId))) + amount('expenseBudgetDollars','Billable expense budget',0,false) + phaseFields(engagementId?latestBudget(d.budgets,engagementId)?.value.phases??[]:[]) + area('reason', 'Terms or change-order reason'))
 const m = v('milestones')
 const taskForm = (engagementId?: string) => taskEditor(a,report,edit('tasks'),engagementId)
 const milestoneForm = (engagementId?: string) => form('save:milestones', 'Fixed-fee milestone', s('engagementId', 'Engagement', managed, m.engagementId ?? engagementId) + phasePicker(report,m.engagementId??engagementId,m.phaseKey,'fixed') + i('name', 'Milestone name', m.name) + i('due', 'Due date', m.due ?? today, 'date') + amount('amountDollars', `Milestone fee (${m.currency ?? d.engagements.find(r => r.id === engagementId)?.value.currency ?? a.currency})`, m.amountMinor ?? ''), edit('milestones'))
 const x = focus?.value ?? v('engagements')
 const engagementForm = () => form('save:engagements', 'Engagement', i('name', 'Engagement name', x.name) + c('type','Engagement type',['client','internal'],x.type??'client') + c('internalCategory','Internal category',['admin','sales','training','PTO','other'],x.internalCategory??'other') + s('clientId', 'Client', activeClients(d.clients), x.clientId, true) + s('currency', 'Engagement billing currency', currencies.map(id => ({id, revision:'', value:{name:id}})), x.currency, 'Use client default') + s('leadId', 'Responsible lead', d.people, x.leadId) + checks('members', 'Assigned people', d.people, x.members) + area('scope', 'Agreed scope', x.scope) + i('timezone', 'Work timezone', x.timezone ?? report.agency.timezone)+fieldInputs(report,'engagements',x), focus)
 const overspent = new Set(report.exceptions.filter(x => x.type === 'overspend').map(x => x.source.split(':')[1]))
 const reading = (r: Row) => {
  const econ = report.economics.find(x => x.engagementId === r.id), estimate = econ ? estimateOf(report, econ.budgetId) : null, approved = econ?.approvedSeconds ?? 0
  const label = estimate === null ? `${hours(approved)} approved` : `${hours(approved)} of ${hours(estimate)}`
  const flags = `${estimate !== null && approved > estimate ? chip('over estimate') : ''}${overspent.has(r.id) ? chip('overspend') : ''}`
  return `<div class="g-cell-reading"><span class="g-num">${e(label)}</span>${estimate === null ? '' : meter(approved, estimate, `${hours(approved)} approved of ${hours(estimate)}`)}${flags ? `<span class="g-flags">${flags}</span>` : ''}</div>`
 }
 if (focus) {
  const id = focus.id, own = <T extends Row>(rows: T[]) => rows.filter(r => r.value.engagementId === id)
  const facts = `<section class="g-card g-facts"><h2 class="g-hide">Facts</h2><dl><div><dt>Client</dt><dd>${e(x.type==='internal'?`Internal · ${x.internalCategory}`:nameOf(d.clients, x.clientId))}</dd></div><div><dt>Responsible lead</dt><dd>${e(nameOf(d.people, x.leadId))}</dd></div><div class="g-fact-people"><dt>Assigned people</dt><dd>${e((x.members ?? []).map((p: string) => nameOf(d.people, p)).join(', ') || '—')}</dd></div><div><dt>Billing currency</dt><dd>${e(x.currency)}</dd></div><div><dt>Work timezone</dt><dd>${e(x.timezone)}</dd></div></dl></section>`
  const scope = `<section class="g-card"><h2>Agreed scope</h2><p>${e(x.scope)}</p>${acceptanceSummary(x)}</section>`
  const budgets = own(d.budgets), milestones = own(d.milestones)
  const budgetCard = manager ? `<section class="g-card"><h2>Budget versions</h2>${budgets.length ? `<ul class="g-versions">${budgets.map(b => `<li id="${e(b.id)}"><p class="g-summary">${e(termsLine(b))} · ${chip(b.value.status)}</p><p class="g-note">${e(b.value.reason)}</p>${acceptanceSummary(b.value)}${b.value.status === 'draft' ? decision('budget:approve', 'Approve terms', b) : '<p class="g-note">Immutable approved version</p>'}</li>`).join('')}</ul>` : '<p class="g-empty">No records yet.</p>'}</section>` : ''
  const taskCard = tasksSection(a,report,options,id)
  const milestoneCard = manager ? `<section class="g-card"><h2>Milestones</h2>${milestones.length ? `<ul class="g-rows">${milestones.map(r => `<li id="${e(r.id)}">${open('engagements', r, r.value.name)}${acceptanceSummary(r.value)}<span class="g-num">due ${e(day(r.value.due))} · ${money(r.value.amountMinor, r.value.currency ?? focus?.value.currency ?? a.currency)} · ${chip(r.value.status)}</span>${r.value.status === 'draft' ? decision('milestone:approve', 'Approve milestone for billing', r) : ''}</li>`).join('')}</ul>` : '<p class="g-empty">No records yet.</p>'}</section>` : ''
  const econ = report.economics.find(r => r.engagementId === id)
  const economics = econ ? `<section class="g-card g-card--strong"><h2>Engagement economics</h2><div class="g-econ-detail">${economicsCard(report, a, econ, false)}<p class="g-big"><span>Remaining effort</span><strong class="g-num">${hours(econ.remainingSeconds)}</strong></p></div></section>` : ''
  const forms = (finance(a) ? engagementForm() : '') + (manager ? (x.type==='internal'?taskForm(id):terms(id) + taskForm(id) + milestoneForm(id)) : '')
  return `<nav class="g-crumbs" aria-label="Breadcrumb"><a href="/app/engagements">Engagements</a><span aria-hidden="true">/</span><span aria-current="page">${e(x.name)}</span></nav><div class="g-titlebar"><h1>${e(x.name)}</h1></div>`
   + `<div class="g-detail-top">${facts}${scope}</div>${budgetCard}${manager?phaseBudgetSection(a,report,id):''}${taskCard}${milestoneCard}${manager?milestoneDeliverySection(a,milestones,d.people,today):''}${templateApplySection(a,report,id,today)}${deliveryScheduleSection(a,report,id,{...options,today})}${retainerSection(a,report,id,{...options,today})}${economics}${forms ? `<h2 class="g-subhead">Change this engagement</h2><div class="g-forms">${forms}</div>` : ''}`
 }
 let body = '<div class="g-titlebar"><h1>Engagements and agreed work</h1></div>'
 body += table('Engagements', d.engagements, [
  { label: 'Engagement', line: 1, cell: r => open('engagements', r, r.value.name)+acceptanceSummary(r.value) },
  { label: 'Client', line: 1, cell: r => e(r.value.type==='internal'?`Internal · ${r.value.internalCategory}`:nameOf(d.clients, r.value.clientId)) },
  { label: 'Responsible lead', line: 2, cell: r => `<span class="g-brief">Lead&nbsp;</span>${e(nameOf(d.people, r.value.leadId))}` },
  { label: 'Approved of estimate', line: 3, cell: reading },
 ])
 if (finance(a)) {
  const p = v('people')
  body += `<div class="g-pair"><div>${clientsTable(d)}${clientSearchSection(d, options.clientSearch)}</div>${table('People', d.people, [{ label: 'Name', cell: r => open('engagements', r, r.value.name)+acceptanceSummary(r.value) }, { label: 'Work timezone', cell: r => e(r.value.timezone) }, { label: 'Contractor', cell: r => yesNo(r.value.contractor) }])}</div>`
  body += `<h2 class="g-subhead">Add or change</h2><div class="g-forms">${engagementForm()}${clientForm(edit('clients'),fieldInputs(report,'clients',v('clients')), a.currency)}${clientMergeForm(d, edit('clients'))}${form('save:people', 'Person', i('name', 'Name', p.name) + i('timezone', 'Work timezone', p.timezone ?? report.agency.timezone) + resourceProfileFields(p)+fieldInputs(report,'people',p), edit('people'))}${terms()}${taskForm()}${milestoneForm()}</div>`
 } else if (manager) body += `<h2 class="g-subhead">Add or change</h2><div class="g-forms">${terms()}${taskForm()}${milestoneForm()}</div>`
 return body+estimateSection(a,report,options) + tasksSection(a,report,options) + templatesSection(a,report) + pipelineSection(a, report, options.opportunity)
}
