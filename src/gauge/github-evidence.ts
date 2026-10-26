import { type Value, Fault } from './model'

/**
 * Closed projections of GitHub answers. Titles, numbers, states, labels and review counts only:
 * never code, diffs, commit messages, file names, bodies, comments or person names or logins.
 */
export const repositoryName = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/
const milestoneLine = /gauge milestone:[ \t]*([^\r\n]{1,200})/i
const stamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const label = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''

/** The milestone name a pull request names for itself, read from its title or body and never stored. */
export const milestoneHint = (item: Value): string | null => {
 for (const source of [item.title, item.body]) { const found = typeof source === 'string' ? milestoneLine.exec(source) : null; if (found) return found[1].trim() }
 return null
}

function common(repoId: string, engagementId: string, repoName: string, item: Value, kind: 'pull' | 'issue'): Value {
 const url = String(item.html_url ?? '')
 // Provider-controlled links are kept only when they point into the selected repository.
 if (!url.startsWith(`https://github.com/${repoName}/`)) throw new Fault('GitHub returned a link outside the selected repository; evidence was not retained', 409)
 if (!Number.isSafeInteger(item.number) || item.number < 1) throw new Fault('GitHub returned an invalid item number', 409)
 return {
  repoId, engagementId, kind, number: item.number, title: label(item.title, 300) || `Untitled ${kind}`, url,
  state: item.state === 'open' ? 'open' : 'closed',
  labels: (Array.isArray(item.labels) ? item.labels : []).slice(0, 20).map((l: Value) => label(typeof l === 'string' ? l : l?.name, 80)).filter(Boolean),
  createdAt: stamp(item.created_at), updatedAt: stamp(item.updated_at), closedAt: stamp(item.closed_at),
  // A commit, push or merge is activity; billable time and amounts come only from approved Gauge records.
  billable: false,
 }
}

export function pullEvidence(repoId: string, engagementId: string, repoName: string, item: Value, reviews: Value[]): Value {
 // Only each reviewer's latest decision counts; reviewer identities are discarded.
 const latest = new Map<string, string>()
 for (const review of [...reviews].sort((a, b) => (stamp(a.submitted_at) ?? 0) - (stamp(b.submitted_at) ?? 0))) if (review.user?.id !== undefined && review.state !== 'PENDING') latest.set(String(review.user.id), String(review.state))
 const count = (state: string) => [...latest.values()].filter(v => v === state).length
 return {
  ...common(repoId, engagementId, repoName, item, 'pull'),
  merged: !!item.merged_at, mergedAt: stamp(item.merged_at), draft: item.draft === true,
  reviews: { approved: count('APPROVED'), changesRequested: count('CHANGES_REQUESTED'), commented: count('COMMENTED') },
  milestoneHint: milestoneHint(item),
 }
}

export const issueEvidence = (repoId: string, engagementId: string, repoName: string, item: Value): Value => ({ ...common(repoId, engagementId, repoName, item, 'issue'), comments: Number.isSafeInteger(item.comments) ? item.comments : 0 })

/** Re-reading unchanged evidence must not rewrite it: only the content decides a new revision. */
export const sameEvidence = (a: Value, b: Value) => JSON.stringify({ ...a, fetchedAt: 0 }) === JSON.stringify({ ...b, fetchedAt: 0 })
