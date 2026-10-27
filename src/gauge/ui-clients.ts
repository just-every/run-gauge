// SETUP-002 on the Engagements page, for finance: the active clients with their terms, a client search by name, PO
// or external ID, the client form with its contacts, addresses, tax, PO, tag and external-ID fields, and, on a
// client's edit view, the merge of that duplicate into a surviving client.
import type { Row, Value } from './model'
import { currencies } from './agency'
import { escape as e, input as i, area, check, choices, form, table, open } from './ui-forms'
import type { Report } from './ui-describe'
import { searchClients, termsLabel } from './clients'

/** Clients new work may name; merged duplicates leave every picker. */
export const activeClients = (rows: Row[]) => rows.filter(r => !r.value.merge)
const contactLines = (v: Value) => (v.contacts ?? []).map((c: Value) => [c.role, c.name, c.email ?? '', c.phone ?? ''].join('; ')).join('\n')
const addressLines = (v: Value) => (v.addresses ?? []).map((x: Value) => [x.purpose, x.line1, x.line2 ?? '', x.city, x.region ?? '', x.postalCode ?? '', x.country].join('; ')).join('\n')
const list = (values: string[] | undefined) => (values ?? []).join(', ')
const projects = (d: Report['data'], id: string) => d.engagements.filter(r => r.value.clientId === id).length

export function clientsTable(d: Report['data']) {
 const merged = d.clients.filter(r => r.value.merge)
 return table('Clients', activeClients(d.clients), [
  { label: 'Client', line: 1, cell: r => open('engagements', r, r.value.name) },
  { label: 'Billing currency', line: 2, cell: r => e(r.value.billingCurrency ?? 'Legacy agency currency') },
  { label: 'Payment terms', line: 2, cell: r => e(termsLabel(r.value)) },
  { label: 'Projects', num: true, line: 2, cell: r => String(projects(d, r.id)) },
 ]) + (merged.length ? `<p class="g-note">Merged: ${merged.map(r => `${e(r.value.name)} into ${e(d.clients.find(c => c.id === r.value.merge.into)?.value.name ?? 'another client')} (${e(r.value.merge.reason)})`).join('; ')}</p>` : '')
}

export function clientSearchSection(d: Report['data'], query: unknown) {
 const q = typeof query === 'string' ? query.trim() : '', results = q ? searchClients(d.clients, d.engagements, q) : []
 const label: Record<string, string> = { po: 'PO', externalId: 'external ID', tag: 'tag', name: 'name', contact: 'contact' }
 const found = !q ? '' : results.length ? `<ul class="g-rows">${results.map(r => `<li>${open('engagements', d.clients.find(c => c.id === r.id)!, r.name)}<span class="g-note">Matched by ${e(r.matches.map(m => label[m]).join(', '))} · ${r.engagementIds.length} ${r.engagementIds.length === 1 ? 'project' : 'projects'}</span></li>`).join('')}</ul>` : `<p class="g-empty">No client matches ${e(q)}.</p>`
 return `<section class="g-card" id="client-search"><h2>Find a client</h2><form class="g-form" method="get" action="/app/engagements#client-search">${i('clientSearch', 'Name, PO number or external ID', q)}<div class="g-actions"><button class="g-btn g-btn--secondary">Search</button></div></form>${found}</section>`
}

export function clientForm(row?: Row,custom='',defaultCurrency='USD') {
 const v = row?.value ?? {}
 return form('save:clients', 'Client', i('name', 'Client name', v.name) + i('legalName', 'Legal name', v.legalName ?? '', 'text', false)
  + choices('billingCurrency', 'Default billing currency', [...currencies], v.billingCurrency ?? defaultCurrency)
  + i('paymentTermsDays', 'Payment terms (Net days)', v.paymentTermsDays ?? '', 'number', false) + i('daysLate', 'Approved average days late', v.daysLate ?? '', 'number', false) + i('collectionPercent', 'Collection probability (%)', v.collectionPercent ?? 100, 'number', false)
  + area('contacts', 'Contacts, one per line: billing or project; name; email; phone', contactLines(v), false)
  + area('addresses', 'Addresses, one per line: billing, legal or project; line 1; line 2; city; state; postal code; country', addressLines(v), false)
  + i('taxId', 'Tax ID reference (EIN)', v.taxId ?? '', 'text', false) + i('exemptions', 'Exemption certificate references', list(v.exemptions), 'text', false)
  + check('poRequired', 'Invoices need a PO', Boolean(v.poRequired)) + i('poNumbers', 'PO numbers', list(v.poNumbers), 'text', false)
  + i('tags', 'Tags', list(v.tags), 'text', false) + i('externalIds', 'External IDs (system:id)', (v.externalIds ?? []).map((x: Value) => `${x.system}:${x.id}`).join(', '), 'text', false)+custom, row)
}

/** On a client's edit view: merge this duplicate into a surviving client, binding both exact revisions. */
export function clientMergeForm(d: Report['data'], duplicate?: Row) {
 if (!duplicate || duplicate.value.merge) return ''
 const others = activeClients(d.clients).filter(r => r.id !== duplicate.id)
 if (!others.length) return ''
 const options = others.map(r => `<option value="${e(`${r.id}@${r.revision}`)}">${e(r.value.name)} · ${e(termsLabel(r.value))}</option>`).join('')
 const fields = `<input type="hidden" name="duplicateId" value="${e(duplicate.id)}"><input type="hidden" name="duplicateRevision" value="${e(duplicate.revision)}">`
  + d.customFields.filter(f=>f.value.scope==='clients'&&duplicate.value.customFields?.[f.id]!==undefined).map(f=>`<label class="g-field"><span>${e(f.value.name)} when custom values conflict</span><select name="merge-field:${e(f.id)}"><option value="">No conflict</option><option value="survivor">Keep survivor</option><option value="duplicate">Keep duplicate</option></select></label>`).join('')
  + `<label class="g-field"><span>Surviving client</span><select name="survivor" required>${options}</select></label>`
  + `<label class="g-field"><span>Payment terms to keep when they differ (this client: ${e(termsLabel(duplicate.value))})</span><select name="terms"><option value="">They are the same</option><option value="survivor">The surviving client's terms</option><option value="duplicate">This client's terms</option></select></label>`
  + area('reason', 'Merge reason')
 return form('client:merge', `Merge ${duplicate.value.name} into another client`, fields, undefined, 'Merge clients')
}
