import type { Bindings } from '../auth.server'
import { type Actor, all, fence } from './store'
import { type Row, need } from './model'
import { escape as e, input, area, select, form, decision, table } from './ui-forms'
import { chip } from './ui-format'

const when = (at: number | null | undefined) => at ? new Date(at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'Never'
const named = (rows: Row[], key: string) => rows.map(r => ({ ...r, value: { name: r.value[key] } }))

/** Owner-only GitHub evidence on the existing Access page: titles, states and review counts, never code. */
export async function githubSection(env: Bindings, a: Actor): Promise<string> {
 need(a.role === 'owner' && a.session.kind === 'native', 'Only the native owner inspects GitHub evidence', 403); await fence(env, a)
 const connections = (await all(env, 'providerConnections')).filter(c => c.value.provider === 'github' && !c.value.revokedAt)
 const repos = await all(env, 'githubRepos'), evidence = await all(env, 'githubEvidence'), effects = await all(env, 'githubEffects'), followups = await all(env, 'githubFollowups'), engagements = await all(env, 'engagements'), milestones = await all(env, 'milestones')
 const active = repos.filter(r => r.value.status === 'active'), project = (id: string) => engagements.find(x => x.id === id)?.value.name ?? 'Unknown project'
 let body = '<div class="g-titlebar" id="github-evidence"><h2>GitHub evidence</h2></div><p class="g-lede">Gauge reads pull requests, reviews, merges and issues only from repositories you select here, each bound to one project, through a read-only GitHub App token limited to that repository. It never reads code, diffs, commit messages or discussion text, and commits alone are never billable. A merged pull request that names a milestone only proposes a delivery for you to approve. Nothing on this page reaches clients, agents or other staff. Connect the GitHub App credential under Provider connections first.</p>'
 if (connections.length) body += form('github:select-repo', 'Select a repository', select('connectionId', 'GitHub connection', named(connections, 'accountLabel')) + input('fullName', 'Repository (owner and name)') + select('engagementId', 'Project', named(engagements, 'name')) + input('reason', 'Why this repository'), undefined, 'Select repository', 'g-card--form')
 body += table('Selected repositories', repos, [
  { label: 'Repository', wrap: true, line: 1, cell: r => `${e(r.value.fullName)}<span class="g-sub">${r.value.private ? 'Private' : 'Public'}</span>` },
  { label: 'Project', wrap: true, line: 2, cell: r => e(project(r.value.engagementId)) },
  { label: 'Last read', wrap: true, line: 3, cell: r => r.value.lastSync ? `${e(when(r.value.lastSync.at))}<span class="g-sub">${e(r.value.lastSync.status)}${r.value.lastSync.exceptionClass ? ' · ' + e(r.value.lastSync.exceptionClass) : ` · ${e(r.value.lastSync.found)} items${r.value.lastSync.truncated ? ' · latest 30 of each kind' : ''}`}</span>` : 'Not read yet' },
  { label: 'Status', size: 'status', line: 2, cell: r => chip(r.value.status) },
 ], r => r.value.status === 'active' ? decision('github:sync', 'Read now', r) + decision('github:remove-repo', 'Stop reading', r, true, 'quiet') : '', 'No repositories selected yet.')
 const effectFor = (r: Row) => effects.filter(x => x.value.evidenceId === r.id).map(x => `${x.value.status}`).join(', ')
 body += table('Pull requests and issues', [...evidence].sort((x, y) => (y.value.updatedAt ?? 0) - (x.value.updatedAt ?? 0)).slice(0, 60), [
  { label: 'Item', wrap: true, line: 1, cell: r => `<a href="${e(r.value.url)}" rel="noreferrer noopener">${e(r.value.kind === 'pull' ? 'PR' : 'Issue')} ${e(r.value.number)}</a> ${e(r.value.title)}<span class="g-sub">${e(repos.find(x => x.id === r.value.repoId)?.value.fullName ?? '')}</span>` },
  { label: 'State', size: 'status', line: 2, cell: r => chip(r.value.merged ? 'merged' : r.value.state) },
  { label: 'Reviews', wrap: true, line: 3, cell: r => r.value.kind === 'pull' ? `${e(r.value.reviews.approved)} approved · ${e(r.value.reviews.changesRequested)} changes requested` : `${e(r.value.comments)} comments` },
  { label: 'Milestone effect', wrap: true, line: 3, cell: r => e(effectFor(r) || (r.value.milestoneHint ? 'Named milestone not matched' : 'None')) },
  { label: 'Billable', size: 'status', cell: () => 'Not billable' },
 ], undefined, 'No evidence read yet.')
 body += table('Proposed milestone effects', effects, [
  { label: 'Milestone', wrap: true, line: 1, cell: r => e(milestones.find(m => m.id === r.value.milestoneId)?.value.name ?? 'Unknown milestone') },
  { label: 'Effect', wrap: true, line: 2, cell: r => `Record delivery on ${e(r.value.deliveredOn)}<span class="g-sub">${e(r.value.meaning)}</span>` },
  { label: 'Status', size: 'status', line: 2, cell: r => chip(r.value.status) },
 ], r => r.value.status === 'proposed' ? decision('github:effect-approve', 'Record delivery', r, true) + decision('github:effect-decline', 'Decline', r, true, 'quiet') : '', 'No milestone effects proposed.')
 if (active.length) body += form('github:followup-draft', 'Draft an issue follow-up', select('repoId', 'Repository', named(active, 'fullName')) + input('title', 'Issue title') + area('body', 'Issue text') + input('reason', 'Why this follow-up'), undefined, 'Save draft', 'g-card--form')
 body += table('Issue follow-ups', followups, [
  { label: 'Issue', wrap: true, line: 1, cell: r => `${e(r.value.title)}<span class="g-sub">${e(repos.find(x => x.id === r.value.repoId)?.value.fullName ?? '')}</span>` },
  { label: 'Exact text', wrap: true, line: 3, cell: r => e(r.value.body) },
  { label: 'Outcome', wrap: true, line: 2, cell: r => `${chip(r.value.status)}${r.value.issueUrl ? `<span class="g-sub"><a href="${e(r.value.issueUrl)}" rel="noreferrer noopener">Issue ${e(r.value.issueNumber)}</a></span>` : ''}${r.value.status === 'sending' || r.value.status === 'uncertain' ? '<span class="g-sub">Unconfirmed: check GitHub before drafting again. Nothing is retried.</span>' : ''}` },
 ], r => r.value.status === 'drafted' ? decision('github:followup-send', 'Approve and create issue', r) + decision('github:followup-cancel', 'Cancel draft', r, true, 'quiet') : '', 'No follow-ups drafted.')
 await fence(env, a); return body
}
