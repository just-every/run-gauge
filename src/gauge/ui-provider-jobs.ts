import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import { all } from './store'
import { providerRegister } from './provider-custody'
import { providerJobsRegister } from './provider-jobs'
import { escape as e, form, select, input, decision, table } from './ui-forms'
import { chip } from './ui-format'

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

export async function providerJobsSection(env: Bindings, a: Actor): Promise<string> {
 if (a.session.kind !== 'native') return '<section class="g-card"><h2>Provider jobs</h2><p>Sign in through your native email link to manage provider jobs.</p></section>'
 const jobs = await providerJobsRegister(env, a), register = await providerRegister(env, a)
 const projects=new Map((await all(env,'engagements')).map(r=>[r.id,r.value.name])),proposals=new Map((await all(env,'commercialProposals')).map(r=>[r.id,r.value.document.title])),accounts=new Map(register.connections.map(r=>[r.id,r.value.accountLabel])),alertProjects=new Map((await all(env,'budgetAlerts')).map(r=>[r.id,r.value.engagementId]))
 const connections = register.connections.filter(r => r.value.provider === 'crank' && r.value.status === 'connected').map(r => ({...r, value: {...r.value, name: r.value.accountLabel}}))
 const alerts = await all(env, 'budgetAlerts')
 // Each form binds both source identity and revision without accepting a caller-provided payload.
 let body = '<div class="g-titlebar" id="provider-jobs"><h2>Provider jobs</h2></div><p class="g-lede">Queue an exact budget exception for Crank, then explicitly dispatch it. Crank admission creates pending approval or a held event; it does not confirm any downstream action. Uncertain submissions require reconciliation in Crank and are never retried here.</p>'
 if (connections.length && alerts.length) for (const alert of alerts) body += form('providerJob:queue-crank', `Queue budget exception · ${projects.get(alert.value.engagementId)??'Archived engagement'}`, `<p class="g-note">${e(alert.value.metric)} · ${e(alert.value.threshold)}% threshold · alert ${e(alert.id)}</p><input type="hidden" name="alertId" value="${e(alert.id)}"><input type="hidden" name="alertRevision" value="${e(alert.revision)}">` + select('connectionId', 'Crank connection', connections) + input('endpoint', 'Crank HTTPS trigger endpoint', '', 'url'), undefined, 'Queue Crank event', 'g-card--form')
 else body += '<p class="g-empty">Connect Crank and record a budget threshold alert before queueing an event.</p>'
 body += table('Queued work and outcomes', jobs, [
  {label: 'Job', wrap: true, line: 1, cell: r => `${e(r.value.operation==='trigger:submit'?'Budget exception · '+(projects.get(alertProjects.get(r.value.source.id))??'Archived engagement'):proposals.get(r.value.source.id)??'Archived proposal')}<span class="g-sub">${e(r.value.operation)} · ${e(r.id)}</span>`},
  {label: 'Queued', size: 'date', line: 2, cell: r => e(when(r.value.createdAt))},
  {label: 'Credential', wrap: true, line: 2, cell: r => `${e(accounts.get(r.value.connectionId)??'Disconnected account')} · version ${e(r.value.credentialVersion)}`},
  {label: 'Outcome', wrap: true, line: 3, cell: r => `${chip(r.value.status)}${r.value.exceptionClass ? `<span class="g-sub">${e(r.value.exceptionClass)}</span>` : ''}${r.value.providerRunId ? `<span class="g-sub">Crank pending run ${e(r.value.providerRunId)}</span>` : ''}${r.value.providerHoldId ? `<span class="g-sub">Crank held event ${e(r.value.providerHoldId)}</span>` : ''}`},
 ], r => r.value.ownerId !== a.session.operator.id ? '' : r.value.status === 'queued' ? decision('providerJob:dispatch', r.value.operation === 'email:send' ? 'Dispatch proposal email' : 'Dispatch Crank event', r) : r.value.status === 'exception' && r.value.exceptionClass === 'credential-rotated' ? decision('providerJob:requeue', 'Re-queue with current credential', r) : '', 'No provider jobs yet.')
 return body
}
