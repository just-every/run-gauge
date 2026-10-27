import { recordMilestoneAcceptance } from './gauge-harness.mjs'
import assert from 'node:assert/strict'

// GOVERN-001 (ct 19 Oct 18:06Z): cost export and credits by role, the owner's two-person review limit,
// independent approval of an above-limit credit, audited grants and limit history. Called by gauge.mjs.
export async function governJourney(h, { eng, staff, leadUser, financeUser }) {
 const { cmd, request, owner, origin } = h, from = '2026-10-01', to = '2026-10-31'
 const ownerId = (await (await request('/auth/session', owner)).json()).operator.id
 const report = async cookie => { const r = await request('/api/gauge/state?' + new URLSearchParams({ from, to }), cookie); assert.equal(r.status, 200); return r.json() }
 const csv = async cookie => { const data = await report(cookie), r = await request('/api/gauge/report.csv?' + new URLSearchParams({ from, to, fingerprint: data.fingerprint }), cookie); assert.equal(r.status, 200); return { data, text: await r.text() } }
 const page = async (path, cookie) => { const r = await request(path, cookie); assert.equal(r.status, 200); return r.text() }
 const submit = (cookie, fields) => { const body = new FormData(); for (const [k, v] of Object.entries(fields)) body.set(k, v); body.set('key', crypto.randomUUID()); return request('/app/action', cookie, { method: 'POST', headers: { origin }, body }) }

 // Cost export: finance exports the private cost figure; staff and a lead get none.
 const finance = await csv(financeUser.cookie), cost = finance.data.lineage.find(f => f.id.endsWith(':costMinor') && f.id.includes(eng.id))
 assert(cost, 'Finance report carries the approved cost figure'); assert(finance.text.includes(cost.id), 'Finance cost export includes the cost figure')
 for (const user of [staff, leadUser]) { const scoped = await csv(user.cookie); assert(!/costMinor|Approved actual cost/.test(scoped.text), 'No cost figure leaves for a non-finance role') }

 // Credits: a fresh fixed milestone billed and approved by finance; staff and the lead cannot credit it.
 const base = (await report(owner)).data.engagements.find(e => e.id === eng.id).value
 const governed = await cmd('save:engagements', { name: 'Governed handover', clientId: base.clientId, leadId: base.leadId, members: base.members, scope: 'Fixed handover', timezone: base.timezone })
 const fee = await cmd('save:budgets', { engagementId: governed.id, mode: 'fixed', amountMinor: 50000, effortSeconds: 3600, roundingSeconds: 60, reason: 'Fixed handover fee' }); await cmd('budget:approve', fee)
 const milestone = await cmd('save:milestones', { engagementId: governed.id, name: 'Governed handover', due: '2026-10-30', amountMinor: 50000 }); await cmd('milestone:approve', milestone)
 await recordMilestoneAcceptance(h,milestone.id)
 const draft = await cmd('packet:create', { engagementId: governed.id, title: 'Governed handover', sources: [`milestones:${milestone.id}`] }, financeUser.cookie)
 await cmd('packet:approve', draft, financeUser.cookie)
 let packet = (await report(owner)).data.packets.find(p => p.id === draft.id)
 const credit = (cookie, correctedAmountMinor, base = packet, expected = 200) => cmd('packet:adjust', { id: base.id, revision: base.revision, sourceKind: 'milestones', sourceId: milestone.id, correctedAmountMinor, reason: 'Agreed handover credit' }, cookie, expected)
 for (const user of [staff, leadUser]) await credit(user.cookie, 30000, packet, 403)

 // Only the owner sets the limit, on Access; finance and leads are refused.
 for (const user of [financeUser, leadUser]) await cmd('approval:limit', { reviewAboveMinor: 1, reason: 'Not theirs' }, user.cookie, 403)
 assert.equal((await submit(owner, { action: 'approval:limit', reviewAboveDollars: '100', reason: 'Credits above $100 need a second person' })).status, 303)
 let [policy] = (await report(owner)).data.approvalPolicies
 assert.equal(policy.value.reviewAboveMinor, 10000); assert.equal(policy.value.setBy, ownerId)
 assert.equal((await report(financeUser.cookie)).data.approvalPolicies.length, 1)
 assert.equal((await report(leadUser.cookie)).data.approvalPolicies.length, 0)

 // An above-limit credit (−$200.00) waits for an independent approver: its preparer is refused on every door.
 const above = await credit(financeUser.cookie, 30000)
 await cmd('packet:approve', above, financeUser.cookie, 403)
 assert.equal((await submit(financeUser.cookie, { action: 'packet:approve', id: above.id, revision: above.revision })).status, 403)
 await cmd('packet:approve', above, leadUser.cookie, 403)
 const preparerPage = await page('/app/billing', financeUser.cookie), row = preparerPage.slice(preparerPage.indexOf('Adjustment: Governed handover'))
 assert(row.includes('Needs an independent approver'), 'The preparer sees the wait label')
 const forms = html => [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(m => m[1])
 assert(forms(preparerPage).some(f => f.includes('value="packet:cancel"') && f.includes(above.id)), 'The preparer may still cancel')
 assert(!forms(preparerPage).some(f => f.includes('value="packet:approve"') && f.includes(above.id)), 'No approve form is offered to the preparer')
 assert((await page('/app/billing', owner)).includes('Two-person review: prepared by someone else.'))
 await cmd('packet:approve', above, owner)
 packet = (await report(owner)).data.packets.find(p => p.id === above.id)
 assert.equal(packet.value.status, 'approved'); assert.equal(packet.value.approvedBy, ownerId); assert.notEqual(packet.value.createdBy, packet.value.approvedBy)

 // At the limit (−$100.00, not strictly above) the preparer may approve their own credit.
 const atLimit = await credit(financeUser.cookie, 20000, packet)
 await cmd('packet:approve', atLimit, financeUser.cookie)

 // The limit's changes keep their history; a stale revision is refused.
 await cmd('approval:limit', { id: policy.id, revision: policy.revision, reviewAboveMinor: 15000, reason: 'Raised after review' })
 await cmd('approval:limit', { id: policy.id, revision: policy.revision, reviewAboveMinor: 1, reason: 'Stale' }, owner, 409)
 const history = await (await request(`/api/gauge/history/approvalPolicies/${policy.id}`, owner)).json()
 assert.equal(JSON.stringify(history).includes('"reviewAboveMinor":10000'), true, 'The earlier limit stays in revision history')
 ;[policy] = (await report(owner)).data.approvalPolicies; assert.equal(policy.value.reviewAboveMinor, 15000)

 // Every grant change is audited with its actor and shown to the owner.
 const audit = (await h.db.prepare('SELECT operator_id,role,enabled,actor FROM g_grant_audit WHERE operator_id=? ORDER BY id').bind(financeUser.id).all()).results
 assert(audit.some(g => g.role === 'finance' && g.enabled === 1 && g.actor === ownerId), 'The finance grant is audited')
 const access = await page('/app/access', owner)
 assert(access.includes('Grant history') && access.includes('Two-person review limit'))
}
