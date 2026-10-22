import { providerHealthSection } from './ui-provider-health'
import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import { providerRegister } from './provider-custody'
import { escape as e, input, form, choices, decision, table } from './ui-forms'
import { chip } from './ui-format'

const when = (ms: number | null) => ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'
const credentialField = '<label class="g-field g-field--wide"><span>Provider credential</span><input name="credential" type="password" autocomplete="new-password" spellcheck="false" minlength="8" maxlength="4096" required></label>'

/** The existing owner Access page: blank password inputs and connection/use metadata only. */
export async function providerCustodySection(env: Bindings, a: Actor): Promise<string> {
 if (a.session.kind !== 'native') return '<section class="g-card"><h2>Provider connections</h2><p>Sign in through your native email link to manage provider connections.</p></section>'
 const register = await providerRegister(env, a)
 let body = '<div class="g-titlebar" id="provider-connections"><h2>Provider connections</h2></div><p class="g-lede">Connect a scoped Resend credential for proposal email or a Crank credential for budget exception triggers. For Zapier or a signed webhook, enter compact JSON with endpoint and signingKey (16–256 characters); both stay sealed. Only the owner can manage connections and inspect their use. Rotating a credential pauses queued work for a person to re-queue. Revocation permanently stops queued work for that connection.</p>'
 if (!register.initialized) body += form('provider:initialize', 'Initialize provider custody', '<p class="g-note">Create this installation’s private encryption key before entering credentials. Restored connections require fresh credentials.</p>', undefined, 'Initialize provider custody', 'g-card--form')
 else body += form('provider:connect', 'Connect provider', choices('provider', 'Provider', ['resend', 'crank', 'inkwell','zapier','webhook']) + input('accountLabel', 'Account label') + input('origin', 'Inkwell HTTPS origin (Inkwell only)', '', 'url', false) + credentialField, undefined, 'Connect provider', 'g-card--form')
 body += table('Connections', register.connections, [
  {label: 'Account', wrap: true, line: 1, cell: r => `${e(r.value.accountLabel)}<span class="g-sub">${e(r.value.provider)}</span>`},
  {label: 'Scope', wrap: true, line: 3, cell: r => e(r.value.scopes.join(', '))},
  {label: 'Credential', wrap: true, line: 2, cell: r => `Version ${e(r.value.version)} · ending ${e(r.value.lastFour)}`},
  {label: 'Status', size: 'status', line: 2, cell: r => chip(r.value.status)},
  {label: 'Dates', wrap: true, line: 3, cell: r => `Created ${e(when(r.value.createdAt))}<span class="g-sub">Rotated ${e(when(r.value.rotatedAt))}</span>${r.value.revokedAt ? `<span class="g-sub">Revoked ${e(when(r.value.revokedAt))}</span>` : ''}`},
 ], r => r.value.revokedAt ? '' : `${register.initialized ? `<a class="g-btn g-btn--secondary" href="#provider-rotate-${e(r.id)}">${r.value.status === 'disconnected' ? 'Reconnect' : 'Rotate credential'}</a>` : ''}${decision('provider:revoke', 'Revoke connection', r, false, 'quiet')}`, 'No provider connections yet.')
 if (register.initialized) for (const row of register.connections.filter(r => !r.value.revokedAt)) body += `<div id="provider-rotate-${e(row.id)}">${form('provider:rotate', `${row.value.status === 'disconnected' ? 'Reconnect' : 'Rotate credential for'} ${row.value.accountLabel}`, credentialField, row, row.value.status === 'disconnected' ? 'Reconnect provider' : 'Rotate credential', 'g-card--form')}</div>`
 const names = new Map(register.connections.map(r => [r.id, r.value.accountLabel]))
 body += table('Provider use', register.uses, [
  {label: 'When', size: 'date', line: 2, cell: r => e(when(r.value.at))},
  {label: 'Connection', wrap: true, line: 1, cell: r => e(names.get(r.value.connectionId) ?? r.value.connectionId)},
  {label: 'Version', line: 2, cell: r => e(r.value.credentialVersion)},
  {label: 'Job or request', wrap: true, line: 3, cell: r => e(r.value.jobId)},
  {label: 'Operation', wrap: true, line: 3, cell: r => e(r.value.operation)},
  {label: 'Outcome', size: 'status', line: 2, cell: r => e(r.value.outcome)},
 ], undefined, 'No provider use yet.')
 return body+await providerHealthSection(env,a)
}
