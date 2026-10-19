import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, money } from './model'
import { type Actor, Transaction, all } from './store'

// GOVERN-001 (ct, 19 Oct 18:06Z): the owner alone sets one "two-person review above" limit in agency-currency
// cents. A monetary correction whose absolute total is strictly above it needs an approver other than its preparer.
export async function approvalCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (action !== 'approval:limit') return null
 need(a.role === 'owner', 'Only the owner sets the two-person review limit', 403)
 const [current] = await all(env, 'approvalPolicies')
 if (current) need(input.id === current.id && input.revision === current.revision, 'The review limit changed; reload before saving', 409)
 const raw = input.reviewAboveMinor
 const value = { reviewAboveMinor: raw === '' || raw === null || raw === undefined ? null : money(raw), currency: a.currency, reason: text(input.reason, 'Reason for the review limit'), setBy: a.session.operator.id, setAt: Date.now() }
 return tx.record('approvalPolicies', value, current, undefined, action)
}

/** Whether an adjustment packet needs an independent approver: strictly above the limit, or in another currency than the limit. */
export function needsIndependentApprover(policy: Row | undefined, packet: Value) {
 const limit = policy?.value.reviewAboveMinor
 return !!packet.correctsPacketId && limit != null && (packet.currency !== policy!.value.currency || Math.abs(packet.totalMinor) > limit)
}

export async function assertIndependentApproval(env: Bindings, a: Actor, tx: Transaction, packet: Row) {
 const [policy] = await all(env, 'approvalPolicies')
 if (policy) tx.observe('approvalPolicies', policy)
 else tx.guard('NOT EXISTS(SELECT 1 FROM g_approvalPolicies)')
 if (needsIndependentApprover(policy, packet.value)) need(packet.value.createdBy !== a.session.operator.id, 'This adjustment is above the two-person review limit: another owner or finance person must approve it', 403)
}
