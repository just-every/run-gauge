import type { Bindings } from '../auth.server'
import { type Kind, type Row, type Value, date, integer, money, need, sum, text } from './model'
import { type Actor, Transaction, access, all, authority, finance, get } from './store'

const charges = 'fixedCharges' as Kind
const approvedTotal = `(SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) FROM (
 SELECT data FROM g_fixedCharges WHERE engagement_id=? AND status='approved'
 UNION ALL SELECT data FROM g_milestones WHERE engagement_id=? AND status='approved'))`

/** Whole-budget cumulative target, rounded half up without floating-point multiplication. */
export function fixedChargeTarget(amountMinor: number, cumulativeBasisPoints: number): number {
 const amount = money(amountMinor), bps = integer(cumulativeBasisPoints, 'Cumulative basis points', 1, 10000)
 return Number((BigInt(amount) * BigInt(bps) + 5000n) / 10000n)
}

async function fixedBudget(env: Bindings, tx: Transaction, engagement: Row, budgetId: string, revision: string) {
 const budgets = (await all(env, 'budgets')).filter(b => b.value.engagementId === engagement.id && b.value.status === 'approved')
 // all() retains row order; a tied approval timestamp uses the newer commercial version.
 const latest = budgets.slice().reverse().sort((a,b) => b.value.approvedAt-a.value.approvedAt)[0]
 need(latest?.id === budgetId && latest.revision === revision, 'Choose the exact latest approved budget', 409)
 need(latest.value.mode === 'fixed', 'Approve fixed-fee terms first')
 need(latest.value.currency === engagement.value.currency, 'Budget currency differs from engagement; no implicit FX')
 tx.observe('budgets', latest)
 tx.guard("(SELECT COUNT(*) FROM g_budgets WHERE engagement_id=? AND status='approved')=?", engagement.id, budgets.length)
 return latest
}

async function priorCharges(env: Bindings, tx: Transaction, engagement: Row) {
 const groups = await Promise.all([all(env, charges), all(env, 'milestones')])
 const approved = groups.flatMap((rows, index) => rows.filter(r => r.value.engagementId === engagement.id && r.value.status === 'approved').map(row => ({ row, kind: index ? 'milestones' as Kind : charges })))
 for (const {row,kind} of approved) {
  need((row.value.currency ?? engagement.value.currency) === engagement.value.currency, 'Fixed source currency differs from engagement; no implicit FX')
  tx.observe(kind, row)
 }
 const total = sum(approved.map(({row}) => money(row.value.amountMinor)))
 tx.guard(`${approvedTotal}=?`, engagement.id, engagement.id, total)
 return { total, count: approved.length }
}

function firstDeposit(tx: Transaction, engagementId: string, count: number) {
 need(count === 0, 'A deposit must be the first fixed charge', 409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_fixedCharges WHERE engagement_id=? AND status='approved') AND NOT EXISTS(SELECT 1 FROM g_milestones WHERE engagement_id=? AND status='approved')", engagementId, engagementId)
}

export async function fixedChargeCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action !== 'fixed:prepare' && action !== 'fixed:approve' && action !== 'fixed:withdraw') return null
 need(finance(a), 'Finance access required', 403)
 const permission = authority(a, true); tx.guard(permission.sql, ...permission.params)
 if (action === 'fixed:prepare') {
  const engagement = await access(env, a, text(input.engagementId, 'Engagement'), true); tx.observe('engagements', engagement)
  need(engagement.value.type !== 'internal', 'Internal work has no commercial charges')
  const budget = await fixedBudget(env, tx, engagement, text(input.budgetId, 'Budget'), text(input.budgetRevision, 'Budget revision'))
  need(input.currency === undefined || input.currency === engagement.value.currency, 'Currency differs from engagement; no implicit FX')
  need(['deposit','progress'].includes(input.chargeType), 'Choose deposit or progress')
  const cumulativeBasisPoints = integer(input.cumulativeBasisPoints, 'Cumulative basis points', 1, 10000)
  const prior = await priorCharges(env, tx, engagement)
  if (input.chargeType === 'deposit') firstDeposit(tx, engagement.id, prior.count)
  const grossMinor = fixedChargeTarget(budget.value.amountMinor, cumulativeBasisPoints), amountMinor = sum([grossMinor, -prior.total])
  need(amountMinor > 0, 'The cumulative target must exceed all approved fixed charges and milestones')
  return tx.record(charges, {
   engagementId: engagement.id, budgetId: budget.id, budgetRevision: budget.revision,
   chargeType: input.chargeType, cumulativeBasisPoints, grossMinor, priorMinor: prior.total, amountMinor,
   currency: engagement.value.currency, name: text(input.name, 'Source name', 200), date: date(input.date),
   reason: text(input.reason, 'Charge reason'), status: 'draft', createdBy: a.session.operator.id, createdAt: Date.now()
  }, undefined, undefined, action)
 }
 const row = await get(env, charges, text(input.id, 'Fixed charge'))
 need(row.revision === input.revision, 'Charge changed; approve the version you reviewed', 409)
 need(row.value.status === 'draft', 'Charge already approved', 409)
 const engagement = await access(env, a, row.value.engagementId, true); tx.observe('engagements', engagement)
 need(engagement.value.type !== 'internal', 'Internal work has no commercial charges')
 if(action==='fixed:withdraw') return tx.record(charges,{...row.value,status:'withdrawn',withdrawnBy:a.session.operator.id,withdrawnAt:Date.now(),withdrawalReason:text(input.reason,'Withdrawal reason')},row,undefined,action)
 const v = row.value, budget = await fixedBudget(env, tx, engagement, v.budgetId, v.budgetRevision)
 need(v.currency === engagement.value.currency && (input.currency === undefined || input.currency === v.currency), 'Charge currency differs from engagement; no implicit FX')
 const prior = await priorCharges(env, tx, engagement)
 need(prior.total === v.priorMinor, 'Approved charges changed; prepare a new cumulative charge', 409)
 need(['deposit','progress'].includes(v.chargeType), 'Choose deposit or progress')
 if (v.chargeType === 'deposit') firstDeposit(tx, engagement.id, prior.count)
 const grossMinor = fixedChargeTarget(budget.value.amountMinor, v.cumulativeBasisPoints)
 need(grossMinor === v.grossMinor && sum([grossMinor,-prior.total]) === v.amountMinor && v.amountMinor > 0, 'Charge amount changed; prepare the exact cumulative amount again', 409)
 need(sum([prior.total,v.amountMinor]) <= budget.value.amountMinor, 'Charges exceed the agreed fixed fee')
 return tx.record(charges, {...v, status: 'approved', approvedBy: a.session.operator.id, approvedAt: Date.now()}, row, undefined, action)
}
