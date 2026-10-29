import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import { kinds, type Value } from './model'
import { escape as e, input as i, table } from './ui-forms'
import { when } from './ui-format'
import { shell, periods } from './ui'
import { auditSearch, auditVerify, type AuditQuery } from './audit'

const kindsAudited = [...kinds.filter(k => k !== 'timeFavorites'), 'grants', 'apiKeys', 'agency']
const option = (value: string, label: string, selected?: string | null) => `<option value="${e(value)}"${selected === value ? ' selected' : ''}>${e(label)}</option>`
const short = (hash: string | null) => hash ? `${hash.slice(0, 12)}…` : 'Pending'
// A full hash breaks every 16 characters so it never widens a phone screen.
const whole = (hash: string) => (hash.match(/.{1,16}/g) ?? []).map(part => e(part)).join('<wbr>')
const listing = (value: Value) => Object.entries(value).map(([k, v]) => `${e(k)}: ${e(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('<br>')

/** GOVERN-005: finance and the owner search the business audit, check its chain and export it. */
export async function auditPage(env: Bindings, a: Actor, q: AuditQuery & { checkSeq?: string | null; checkHash?: string | null }) {
 const { today } = periods(a.timezone), found = await auditSearch(env, a, q)
 const checked = q.checkSeq || q.checkHash ? await auditVerify(env, a, q.checkSeq ?? null, q.checkHash ?? null) : null
 const operators = (await env.DB.prepare('SELECT id,display_name FROM oa_operators ORDER BY display_name').all<{ id: string; display_name: string }>()).results
 const filters = `<section class="g-card"><h2>Search the audit</h2><form class="g-form" method="get" action="/app/audit">`
  + `<label class="g-field"><span>Record type</span><select name="kind"><option value="">Any</option>${kindsAudited.map(k => option(k, k, q.kind)).join('')}</select></label>`
  + `<label class="g-field"><span>Person</span><select name="actor"><option value="">Anyone</option>${operators.map(o => option(o.id, o.display_name, q.actor)).join('')}</select></label>`
  + i('recordId', 'Record id', q.recordId ?? '', 'text', false) + i('action', 'Action (prefix)', q.action ?? '', 'text', false) + i('text', 'Contains', q.text ?? '', 'text', false)
  + i('from', 'From', q.from ?? '', 'date', false) + i('to', 'To', q.to ?? '', 'date', false)
  + `<div class="g-actions"><button class="g-btn g-btn--primary">Search</button></div></form></section>`
 const integrity = `<section class="g-card"><h2>Integrity</h2><p class="g-note">${found.intact ? 'Chain intact: every sealed entry recomputes to its hash.' : 'Integrity problem: an entry was edited, removed or left unsealed. Export the audit and compare it with an earlier export.'}</p>`
  + `<p class="g-note">Head: entry ${found.head.seq} · <code>${whole(found.head.hash)}</code></p>`
  + (checked ? `<p class="g-note" role="status">${checked.checkpoint?.matches ? `Checkpoint ${checked.checkpoint.seq} matches: nothing up to it has changed since that export.` : `Checkpoint ${e(checked.checkpoint?.seq)} does not match: the audit up to it differs from that export.`}</p>` : '')
  + `<form class="g-form" method="get" action="/app/audit">${i('checkSeq', 'Checkpoint entry (from an earlier export)', q.checkSeq ?? '', 'text', false)}${i('checkHash', 'Checkpoint hash', q.checkHash ?? '', 'text', false)}<div class="g-actions"><button class="g-btn g-btn--secondary">Verify checkpoint</button><a class="g-btn g-btn--quiet" href="/api/gauge/audit/export">Export the complete audit (JSON)</a></div></form></section>`
 const rows = found.entries.map(x => ({ id: `audit-${x.seq}`, revision: '', value: x as Value }))
 const results = table(`Entries (${found.entries.length}${found.entries.length === 500 ? ', newest 500' : ''})`, rows, [
  { label: 'Entry', size: 'num', cell: r => `${r.value.seq}<br><code>${e(short(r.value.hash))}</code>` },
  { label: 'When', size: 'date', cell: r => e(when(r.value.atMs, a.timezone)) },
  { label: 'Who', wrap: true, cell: r => `${e(r.value.actor.name ?? r.value.actor.id)}${r.value.actor.role ? ` · ${e(r.value.actor.role)}` : ''}${r.value.automated ? ' · automated' : ''}` },
  { label: 'Action', wrap: true, cell: r => `${e(r.value.action)}${r.value.decision ? ' · decision' : ''}` },
  { label: 'Record', wrap: true, cell: r => `${e(r.value.kind)}<br>${r.value.history ? `<a href="${e(r.value.history)}">${e(r.value.recordId)}</a>` : e(r.value.recordId)}` },
  { label: 'Changed', wrap: true, cell: r => r.value.previous ? e(r.value.changes.join(', ')) : 'Created' },
  { label: 'Approval and policy', wrap: true, cell: r => [r.value.approval ? `${e(r.value.approval.label??'Approved')} by ${e(r.value.approval.byName ?? r.value.approval.by)}` : '', listing(r.value.policy)].filter(Boolean).join('<br>') || '—' },
  { label: 'Source and references', wrap: true, cell: r => [r.value.requestKey ? `Request ${whole(r.value.requestKey)}` : '', listing(r.value.references)].filter(Boolean).join('<br>') || '—' },
 ], undefined, 'No audit entries match.')
 const body = `<nav class="g-crumbs" aria-label="Breadcrumb"><a href="/app/billing">Billing</a><span aria-hidden="true">/</span><span aria-current="page">Business audit</span></nav><div class="g-titlebar"><h1>Business audit</h1></div>`
  + `<p class="g-lede">Every saved change, decision, grant, key event, packet export and import effect, with who made it, when, the previous and resulting values, approvals, policies and source references. Entries are sealed in one SHA-256 chain; an export carries its head as a checkpoint. Private favorites are withheld; no key, token or password is recorded.</p>`
  + integrity + filters + results
 return shell(a, 'billing', 'Business audit', body, { today, zone: a.timezone })
}
