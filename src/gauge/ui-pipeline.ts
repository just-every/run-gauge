import type { Actor } from './store'
import { finance } from './store'
import type { Report } from './ui-describe'
import { escape as e, input, area, amount, duration, select, choices, form, table, decision } from './ui-forms'
import { hours, money, nameOf, day } from './ui-format'
import { activeClients } from './ui-clients'

export function pipelineSection(a: Actor, report: Report, opportunityId?: string) {
 if (!finance(a) && a.role !== 'lead') return ''
 const d = report.data, row = d.opportunities.find(r => r.id === opportunityId), v = row?.value ?? {}
 const summaries = report.pipeline.map(p => `<section class="g-card"><h3>${e(p.currency)}</h3><dl><dt>Open weighted pipeline</dt><dd>${money(p.weightedMinor, p.currency)}</dd><dt>Open tentative staffing demand</dt><dd>${hours(p.tentativeDemandSeconds)}</dd><dt>Booked value · before billing</dt><dd>${money(p.bookedMinor, p.currency)}</dd>${p.billedMinor === null ? '' : `<dt>Billed · issued invoices, pre-tax</dt><dd>${p.billedInvoices.length ? money(p.billedMinor, p.currency) : 'None issued'}</dd><dt>Booked backlog</dt><dd>${money(p.backlogMinor, p.currency)}</dd>`}</dl></section>`).join('')
 const owners = d.people.filter(p => finance(a) || p.id === a.personId)
 const engagements = d.engagements.filter(r => finance(a) || r.value.leadId === a.personId)
 const fields = input('name', 'Opportunity name', v.name) + select('clientId', 'Client', activeClients(d.clients), v.clientId)
  + select('ownerId', 'Opportunity owner', owners, v.ownerId) + choices('stage', 'Stage', ['discovery', 'qualified', 'proposal', 'won', 'lost'], v.stage)
  + input('probability', 'Probability (%) · won 100, lost 0', v.probability ?? 50, 'number')
  + input('from', 'Proposed start', v.from, 'date') + input('to', 'Proposed end', v.to, 'date')
  + area('services', 'Proposed services', v.services) + amount('amountDollars', `Expected value (${v.currency ?? a.currency})`, v.amountMinor ?? '')
  + duration('demandHours', 'Tentative staffing demand (hours)', v.demandSeconds ?? '')
  + select('engagementId', 'Signed engagement (won work only)', engagements, v.engagementId, true)
 return `<section aria-labelledby="pipeline-title"><h2 id="pipeline-title" class="g-subhead">Opportunity pipeline</h2><p class="g-lede">Open values are probability-weighted, rounded per opportunity to the nearest cent. Open staffing demand is tentative and separate from signed staffing. Booked value counts won value or linked approved engagement terms once, before billing; lost work contributes neither. ${finance(a) ? 'Booked backlog is booked value minus the pre-tax total of issued invoices on those engagements; it equals booked value until an invoice is issued.' : 'Billed value and backlog are finance’s.'}</p><div class="g-forms">${summaries}</div>`
  + table('Opportunities', d.opportunities, [
   { label: 'Opportunity', line: 1, cell: r => `<a class="g-record" href="/app/engagements?opportunity=${e(r.id)}#pipeline-title">${e(r.value.name)}</a>` },
   { label: 'Stage', line: 1, cell: r => e(`${r.value.stage} · ${r.value.probability}%`) },
   { label: 'Owner', line: 2, cell: r => e(nameOf(d.people, r.value.ownerId)) },
   { label: 'Expected value', line: 2, cell: r => money(r.value.amountMinor, r.value.currency) },
   { label: 'Services and demand', line: 3, cell: r => `${e(r.value.services)} · ${hours(r.value.demandSeconds)} · ${e(day(r.value.from))}–${e(day(r.value.to))}` },
  ], r => (finance(a) && r.value.stage === 'won' && !r.value.engagementId ? decision('opportunity:convert', 'Convert to engagement', r) : r.value.conversion ? `<a class="g-link" href="/app/engagements?edit=${e(r.value.engagementId)}">Open converted engagement</a>${r.value.conversion.unplacedSeconds ? `<span class="g-sub">${e(r.value.conversion.unplacedSeconds)} seconds of demand unplaced</span>` : ''}` : '') + `<a class="g-link" href="/api/gauge/history/opportunities/${e(r.id)}">Revision history</a>`)
  + form('save:opportunities', row ? 'Update opportunity' : 'New opportunity', fields, row) + (row ? '<p><a class="g-link" href="/app/engagements#pipeline-title">New opportunity</a></p>' : '') + '</section>'
}
