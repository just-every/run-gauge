import type { Bindings } from '../auth.server'
import type { Row } from './model'
import { escape as e, input as i, form, decision, table } from './ui-forms'
import { chip } from './ui-format'
import { apiKeyRegister } from './api-keys'

const when = (ms: number | null) => ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'
const period = (detail: string) => { const d = JSON.parse(detail); return d.from ? `${d.from} to ${d.to}` : d.scope ?? '' }

/** CONNECT-020 utilization keys on the owner's Access page: create, show once, revoke, audit. */
export async function apiKeysSection(env: Bindings, created?: { id: string; label: string; token: string }) {
 const { keys, activity } = await apiKeyRegister(env)
 let body = '<div class="g-titlebar" id="api-keys"><h2>Utilization API keys</h2></div><p class="g-lede">A key reads one thing: <code>GET /api/gauge/state?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</code> with <code>Authorization: Bearer</code>, answering the agency\'s participant count, available seconds and approved billable seconds for those dates. It cannot write, names no person and carries no rates, costs or pay. Gauge keeps only its SHA-256 fingerprint, records every use, and an export never carries it.</p>'
 if (created?.token) body += `<section class="g-card" role="status" aria-live="polite"><h2>Copy key “${e(created.label)}” now</h2><p class="g-note">This is the only time Gauge shows it. Store it in the tool that will read utilization.</p><label class="g-field g-field--wide"><span>New utilization key</span><input name="createdKey" type="text" readonly value="${e(created.token)}"></label></section>`
 body += form('apikey:create', 'Create read-only utilization key', i('label', 'Key label (where it is used)'), undefined, 'Create key', 'g-card--form')
 const rows: Row[] = keys.map((k: any) => ({ id: k.id, revision: '', value: k }))
 body += table('Utilization keys', rows, [
  { label: 'Label', wrap: true, line: 1, cell: r => `${e(r.value.label)}<span class="g-sub">${e(r.value.scope)}</span>` },
  { label: 'Created', wrap: true, line: 3, cell: r => `<span class="g-brief">Created&nbsp;</span>${e(when(r.value.created_at))}<span class="g-sub">by ${e(r.value.created_by ?? 'the owner')}</span>` },
  { label: 'Last used', wrap: true, line: 3, cell: r => `<span class="g-brief">Last used&nbsp;</span>${r.value.last_used_at ? e(when(r.value.last_used_at)) : 'never'}` },
  { label: 'Status', size: 'status', line: 2, cell: r => chip(r.value.revoked_at ? 'revoked' : 'active') },
 ], r => r.value.revoked_at ? '' : decision('apikey:revoke', 'Revoke key', r, false, 'secondary'), 'No utilization keys yet.')
 const events: Row[] = activity.map((x: any) => ({ id: `key-event-${x.id}`, revision: '', value: x }))
 body += table('Key activity', events, [
  { label: 'When', size: 'date', line: 2, cell: r => e(when(r.value.at)) },
  { label: 'Key', wrap: true, line: 1, cell: r => e(r.value.label) },
  { label: 'Action', size: 'status', line: 1, cell: r => e(r.value.action === 'read' ? 'Read utilization' : r.value.action === 'create' ? 'Created' : 'Revoked') },
  { label: 'By', wrap: true, line: 2, cell: r => e(r.value.actor) },
  { label: 'Detail', wrap: true, line: 3, cell: r => e(period(r.value.detail)) },
 ], undefined, 'No key activity yet.')
 return body
}
