import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import type { Row } from './model'
import { escape as e, input as i, amount, form, decision, table } from './ui-forms'
import { money, when, nameOf } from './ui-format'
import { needsIndependentApprover } from './approval-policy'

/** GOVERN-001 on Access: the owner's two-person review limit and the audited grant history. */
export async function approvalPolicySection(env: Bindings, a: Actor, people: Row[], policies: Row[]) {
 const policy = policies[0], limit = policy?.value.reviewAboveMinor
 let html = form('approval:limit', 'Two-person review limit', `<p class="g-note">${limit == null ? 'No limit is set: the preparer may approve any adjustment.' : `Adjustments above ${e(money(limit, policy!.value.currency))} need an owner or finance person other than their preparer.`}</p>`
  + amount('reviewAboveDollars', `Review adjustments above (${a.currency}; empty for no limit)`, limit ?? '', false) + i('reason', 'Reason for the review limit'), policy)
 const audit = (await env.DB.prepare('SELECT g.id,g.operator_id,g.person_id,g.role,g.enabled,g.actor,g.at,o.display_name FROM g_grant_audit g LEFT JOIN oa_operators o ON o.id=g.operator_id ORDER BY g.id DESC LIMIT 200').all<any>()).results
 const names = new Map((await env.DB.prepare('SELECT id,display_name FROM oa_operators').all<any>()).results.map(o => [o.id, o.display_name]))
 html += table('Grant history', audit.map(g => ({ id: `grant-${g.id}`, revision: '', value: g })), [
  { label: 'When', cell: r => e(when(r.value.at, a.timezone)) },
  { label: 'Operator', wrap: true, cell: r => e(r.value.display_name ?? r.value.operator_id) },
  { label: 'Grant', wrap: true, cell: r => `${e(r.value.role)}${r.value.person_id ? ` · ${e(nameOf(people, r.value.person_id))}` : ''} · ${r.value.enabled ? 'enabled' : 'revoked'}` },
  { label: 'By', cell: r => e(names.get(r.value.actor) ?? r.value.actor) },
 ], undefined, 'No grant changes yet.')
 return html
}

/** A draft packet's decision buttons; an above-limit adjustment never offers approval to its preparer. */
export function packetDecision(a: Actor, policies: Row[], r: Row) {
 const cancel = decision('packet:cancel', 'Cancel draft', r, false, 'secondary')
 if (!needsIndependentApprover(policies[0], r.value)) return decision('packet:approve', 'Approve exact packet', r) + cancel
 if (r.value.createdBy === a.session.operator.id) return `<p class="g-note">Needs an independent approver: above the two-person review limit.</p>${cancel}`
 return `<p class="g-note">Two-person review: prepared by someone else.</p>${decision('packet:approve', 'Approve exact packet', r)}${cancel}`
}
