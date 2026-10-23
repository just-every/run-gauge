import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, integer, money, uuid } from './model'
import { type Actor, Transaction, all, get, access, finance } from './store'
import { latestBudget } from './budget-caps'
import { reportedAcceptance } from './estimate-attestation'
import { catalog } from './catalog'

// SALES-005 (conservative default, ct approval pending): a lead or finance proposes extra work as an immutable version
// carrying its baseline difference, schedule days and (finance-only) margin impact; someone other than its preparer
// reviews it internally; finance or the owner records the client's reported decision with the SALES-002 structured
// attestation (client identity unverified). Only an accepted, reviewed version prepares a draft budget change order
// (BUDGET-001) that still needs the ordinary exact approval: a pending or declined change never touches approved terms,
// forecasts or billing.
const decided = (events: Row[], id: string) => events.filter(e => e.value.changeId === id)
export async function scopeCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (!action.startsWith('scope:')) return null
 const events = await all(env, 'scopeEvents')
 if (action === 'scope:propose') {
  const e = await access(env, a, text(input.engagementId, 'Engagement'), true); tx.observe('engagements', e)
  need(e.value.type !== 'internal', 'Internal work has no client scope changes')
  const baseline = latestBudget(await all(env, 'budgets'), e.id); need(baseline, 'Approve the engagement terms before proposing a change', 409); tx.observe('budgets', baseline)
  const rows = (await all(env, 'scopeChanges')).filter(r => r.value.engagementId === e.id)
  let previous: Row | undefined, rootId = uuid()
  if (input.previousId) {
   previous = rows.find(r => r.id === input.previousId); need(previous, 'Earlier version unavailable', 404)
   const root = rows.filter(r => r.value.rootId === previous!.value.rootId)
   need(root.at(-1)!.id === previous.id, 'Revise the latest version', 409)
   need(!root.some(r => decided(events, r.id).some(x => x.value.type === 'client-accepted')), 'An accepted change is final; propose a new change', 409)
   need(decided(events, previous.id).some(x => ['client-declined', 'review-rejected'].includes(x.value.type)), 'Revise a version after it is declined or rejected', 409)
   rootId = previous.value.rootId; tx.observe('scopeChanges', previous)
  } else need(!rows.some(r => r.value.title === text(input.title, 'Title', 200) && !decided(events, r.id).length), 'An open change with this title exists', 409)
  tx.guard("(SELECT COUNT(*) FROM g_scopeChanges WHERE json_extract(data,'$.engagementId')=?)=?", e.id, rows.length)
  const feeMinor = money(input.addedFeeMinor ?? 0), effortSeconds = integer(input.addedEffortSeconds ?? 0, 'Added effort seconds', 0, 86400 * 3650), expenseMinor = money(input.addedExpenseMinor ?? 0), scheduleDays = integer(input.scheduleDays ?? 0, 'Schedule days', 0, 3650)
  need(feeMinor + effortSeconds + expenseMinor + scheduleDays > 0, 'A change adds fee, effort, expense or schedule time')
  const phases = baseline.value.phases ?? [], phaseKey = input.phaseKey ? text(input.phaseKey, 'Phase', 100) : null
  need(phases.length ? phases.some((p: Value) => p.key === phaseKey) : !phaseKey, phases.length ? 'Choose the phase this change belongs to' : 'This engagement has no phases')
  need(input.addedCostMinor === undefined || input.addedCostMinor === '' || finance(a), 'Only finance supplies the change cost', 403)
  const costMinor = input.addedCostMinor === undefined || input.addedCostMinor === '' ? null : money(input.addedCostMinor)
  const number = (previous ? rows.filter(r => r.value.rootId === rootId).length : 0) + 1
  return tx.record('scopeChanges', {
   engagementId: e.id, rootId, previousId: previous?.id ?? null, number, title: text(input.title, 'Title', 200), description: text(input.description, 'What the client asked for'), phaseKey,
   baseline: { budgetId: baseline.id, budgetRevision: baseline.revision, mode: baseline.value.mode, amountMinor: baseline.value.amountMinor, effortSeconds: baseline.value.effortSeconds, expenseBudgetMinor: baseline.value.expenseBudgetMinor ?? null, currency: baseline.value.currency },
   delta: { feeMinor, effortSeconds, expenseMinor }, impact: { scheduleDays, costMinor, marginMinor: costMinor === null ? null : feeMinor - costMinor },
   currency: e.value.currency, reason: text(input.reason, 'Reason for the change'), preparedBy: a.session.operator.id, preparedAt: Date.now(),
  }, undefined, undefined, action)
 }
 const change = await get(env, 'scopeChanges', text(input.id, 'Scope change')); need(change.revision === input.revision, 'Scope change changed; reload', 409)
 const e = await access(env, a, change.value.engagementId, true)
 tx.observe('engagements', e); tx.observe('scopeChanges', change)
 const root = (await all(env, 'scopeChanges')).filter(r => r.value.rootId === change.value.rootId)
 need(root.at(-1)!.id === change.id, 'A newer version needs fresh review', 409)
 tx.guard("(SELECT COUNT(*) FROM g_scopeChanges WHERE json_extract(data,'$.rootId')=?)=?", change.value.rootId, root.length)
 const mine = decided(events, change.id)
 tx.guard("(SELECT COUNT(*) FROM g_scopeEvents WHERE json_extract(data,'$.changeId')=?)=?", change.id, mine.length)
 const event = (type: string, extra: Value) => tx.record('scopeEvents', { changeId: change.id, changeRevision: change.revision, rootId: change.value.rootId, engagementId: e.id, type, reason: text(input.reason, 'Reason'), by: a.session.operator.id, at: Date.now(), ...extra }, undefined, undefined, action)
 if (['scope:review', 'scope:approve', 'scope:reject'].includes(action)) {
  const outcome = action === 'scope:approve' ? 'approved' : action === 'scope:reject' ? 'rejected' : input.outcome
  need(['approved', 'rejected'].includes(outcome), 'Choose approved or rejected')
  need(!mine.length, 'This version already has an internal review', 409)
  need(change.value.preparedBy !== a.session.operator.id, 'Another lead, finance or owner reviews this change', 403)
  return event(`review-${outcome}`, {})
 }
 if (action !== 'scope:decide') return null
 need(finance(a), 'Finance or the owner records the client decision', 403)
 need(['accepted', 'declined'].includes(input.outcome), 'Choose accepted or declined')
 need(!mine.some(x => ['client-accepted', 'client-declined'].includes(x.value.type)), 'This version already has a client decision', 409)
 if (input.outcome === 'declined') return event('client-declined', {})
 need(mine.some(x => x.value.type === 'review-approved'), 'Review this exact version internally before recording acceptance', 409)
 const attestation = reportedAcceptance(input), baseline = latestBudget(await all(env, 'budgets'), e.id)
 need(baseline && baseline.id === change.value.baseline.budgetId && baseline.revision === change.value.baseline.budgetRevision, 'The approved terms changed since this proposal; propose it again', 409)
 tx.observe('budgets', baseline)
 const d = change.value.delta, b = baseline.value
 const phases = b.phases?.length ? b.phases.map((p: Value) => p.key === change.value.phaseKey ? { ...p, feeBudgetMinor: p.feeBudgetMinor + d.feeMinor, hourBudgetSeconds: p.hourBudgetSeconds + d.effortSeconds, expenseBudgetMinor: (p.expenseBudgetMinor ?? 0) + d.expenseMinor } : p) : undefined
 const draft = await catalog(env, a, tx, 'save:budgets', {
  engagementId: e.id, mode: b.mode, amountMinor: b.amountMinor + d.feeMinor, effortSeconds: b.effortSeconds + d.effortSeconds, roundingSeconds: b.roundingSeconds, notToExceed: b.notToExceed,
  ...(b.expenseBudgetMinor != null || d.expenseMinor ? { expenseBudgetMinor: (b.expenseBudgetMinor ?? 0) + d.expenseMinor, ...(b.expenseDate ? { expenseDate: b.expenseDate } : {}) } : {}),
  ...(phases ? { phases } : {}), reason: `Scope change "${change.value.title}" version ${change.value.number}, ${attestation.notice}; separately approve these terms`,
 }) as Row
 return event('client-accepted', { ...attestation, priorBudgetId: baseline.id, priorBudgetRevision: baseline.revision, changeOrderBudgetId: draft.id })
}
