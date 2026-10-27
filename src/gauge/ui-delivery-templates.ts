import { fieldInputs } from './ui-custom-fields'
// Delivery templates: versioned agency plans (phases, dependent tasks with owners and
// effort, priced milestones) that start a new engagement's baseline on a chosen date.
import { phaseFields } from './ui-budget-phases'
import { type Actor, finance } from './store'
import type { Row, Value } from './model'
import { escape as e, input as i, form, table, check,amount,choices,area } from './ui-forms'
import { hours, money, day, nameOf } from './ui-format'
import type { Report } from './ui-describe'

const label = (t: Row) => `${t.value.name} · version ${t.value.number}`
const latestOf = (rows: Row[]) => rows.filter(t => !rows.some(n => n.value.previousId === t.id))

function itemLines(report: Report, t?: Value) {
 return (t?.items ?? []).map((x: Value) => [x.key, x.kind, x.name, x.offsetDays, x.durationDays, x.predecessors.join(', '), x.owner === 'lead' ? 'lead' : x.owner ? nameOf(report.data.people, x.owner) : '', x.kind === 'task' ? x.effortSeconds / 3600 : '', x.kind === 'milestone' ? (x.amountMinor / 100).toFixed(2) : '',x.phaseKey??''].join(' | ')).join('\n')
}

function editor(report: Report, previous?: Row) {
 const t = previous?.value
 const fields = (previous ? `<input type="hidden" name="previousId" value="${e(previous.id)}">` : '') + i('name', 'Template name', t?.name ?? '')
  + `<label class="g-field"><span>Template purpose</span><select name="purpose" required>${['project', 'client-onboarding'].map(p => `<option value="${p}" ${t?.purpose === p ? 'selected' : ''}>${p === 'project' ? 'Project' : 'Client onboarding'}</option>`).join('')}</select></label>`
  + `<label class="g-field g-field--wide"><span>Template items</span><textarea name="itemLines" rows="6" required>${e(itemLines(report, t))}</textarea></label><p class="g-note">One item per line: key | phase, task or milestone | name | business-day offset | business-day duration | after keys | owner (lead or a person) | effort hours | fee | budget phase key.</p>`
  + check('templateBudget','Include phase budgets',!!t?.budget)+choices('templateMode','Budget billing mode',['hourly','fixed'],t?.budget?.mode)+amount('templateAmountDollars','Template total fee',t?.budget?.amountMinor??'',false)+i('templateEffortHours','Template total effort hours',t?.budget?.effortSeconds==null?'':t.budget.effortSeconds/3600,'number',false)+amount('templateExpenseBudgetDollars','Template expense budget',t?.budget?.expenseBudgetMinor??0,false)+i('templateRoundingMinutes','Template rounding minutes',t?.budget?.roundingSeconds==null?1:t.budget.roundingSeconds/60,'number',false)+phaseFields(t?.budget?.phases??[])
  + `<details><summary>Client intake form</summary>${i('intakeTitle','Intake title',t?.intakeForms?.[0]?.title??'','text',false)}${area('intakeQuestions','Required questions, one per line',t?.intakeForms?.[0]?.questions?.join('\n')??'',false)}${i('intakeFileLabel','Requested file',t?.intakeForms?.[0]?.fileLabel??'','text',false)}${i('intakeOffsetDays','Intake due after business days',t?.intakeForms?.[0]?.offsetDays??0,'number')}${i('intakeEveryDays','Reminder interval in days',t?.intakeForms?.[0]?.everyDays??1,'number')}</details>`
  + i('reason', 'Version reason', '')
 return form('template:save', previous ? `Revise ${label(previous)}` : 'New delivery template', fields+check('applyTemplateDefaults','Set these custom defaults on every task item')+fieldInputs(report,'tasks',{},false), undefined, previous ? 'Save new version' : 'Save template')
}

export function templatesSection(a: Actor, report: Report) {
 const rows = report.data.deliveryTemplates
 if (!finance(a) && a.role !== 'lead') return ''
 const list = table('Delivery template versions', [...rows].sort((x, y) => x.value.name.localeCompare(y.value.name) || x.value.number - y.value.number), [
  { label: 'Template', line: 1, cell: t => e(label(t)) },
  { label: 'Purpose', line: 2, cell: t => e(t.value.purpose === 'project' ? 'Project' : 'Client onboarding') },
  { label: 'Items', line: 2, cell: t => e(`${t.value.items.length} items · ${hours(t.value.items.reduce((s: number, x: Value) => s + (x.effortSeconds ?? 0), 0))} · ${money(t.value.items.reduce((s: number, x: Value) => s + (x.amountMinor ?? 0), 0), t.value.currency)} fees`) },
  { label: 'Saved', line: 3, cell: t => e(`${day(new Date(t.value.savedAt).toISOString().slice(0, 10))} · ${t.value.reason}`) },
 ], undefined, 'No delivery templates yet.')
 const forms = finance(a) ? `<div class="g-forms">${editor(report)}${latestOf(rows).map(t => `<details><summary>Revise ${e(label(t))}</summary>${editor(report, t)}</details>`).join('')}</div>` : ''
 return `<section id="delivery-templates" class="g-card"><h2>Delivery templates</h2><p>Each saved version is immutable. Applying a version creates a new engagement's tasks, draft milestones and first baseline; later versions never change projects already started.</p>${list}${forms}</section>`
}

export function templateApplySection(a: Actor, report: Report, engagementId: string, today: string) {
 const plan = report.data.deliveryPlans.find(p => p.value.engagementId === engagementId && p.value.template)
 if (plan) { const t = plan.value.template; return `<p class="g-note" id="template-origin">Planned from ${e(t.name)} · version ${e(t.number)} starting ${e(day(t.start))}.</p>` }
 const manager = finance(a) || a.role === 'lead'
 if (!manager || !report.data.deliveryTemplates.length || report.data.deliveryPlans.some(p => p.value.engagementId === engagementId)) return ''
 const options = [...report.data.deliveryTemplates].sort((x, y) => x.value.name.localeCompare(y.value.name) || y.value.number - x.value.number).map(t => `<option value="${e(t.id)}">${e(label(t))}</option>`).join('')
 return form('template:apply', 'Start from a delivery template', `<input type="hidden" name="engagementId" value="${e(engagementId)}"><label class="g-field"><span>Template version</span><select name="templateId" required>${options}</select></label>${i('start', 'Project start', today, 'date')}${i('reason', 'Application reason', '')}<p class="g-note">Offsets count business days on the agency workweek and holidays from the start date.</p>`, undefined, 'Apply template')
}
