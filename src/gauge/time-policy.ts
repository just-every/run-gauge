import { holdClosedTimePeriods } from './period-locks'
import type { Bindings } from '../auth.server'
import { type Row, type Value, date, need, text, integer, flag } from './model'
import { type Actor, Transaction, all, finance } from './store'

export { reviewSettings } from './time-review'
import { reviewSettings } from './time-review'

const policyId = 'agency'

/** Import adapters include this statement in the same batch as the time insert. */
export function timeLockGuard(workDate: string): {sql: string; params: string[]} {
 return {
  sql: "INSERT INTO g_assert(ok) VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM g_timePolicies WHERE json_extract(data,'$.lockThrough')>=?) THEN 1 ELSE 0 END)",
  params: [date(workDate)],
 }
}

export async function observedPolicy(env: Bindings, tx: Transaction): Promise<Row | undefined> {
 const rows = await all(env, 'timePolicies')
 need(rows.length <= 1 && rows.every(row => row.id === policyId), 'Timesheet policy is invalid', 409)
 tx.guard('(SELECT COUNT(*) FROM g_timePolicies)=?', rows.length)
 for (const row of rows) tx.observe('timePolicies', row)
 return rows[0]
}

/** An empty installation is unlocked; reading it never creates policy records. */
export async function assertTimeUnlocked(env: Bindings, tx: Transaction, dates: string[]): Promise<void> {
 const workDates = [...new Set(dates.map(date))]
 const policy = await observedPolicy(env, tx)
 const lockThrough = policy?.value.lockThrough
 need(!lockThrough || workDates.every(day => day > lockThrough), `Timesheets through ${lockThrough} are locked; finance must reopen the period with a reason`, 409)
}

export async function timePolicyCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action !== 'time:policy') return null
 need(finance(a), 'Finance access required', 403)
 const current = await observedPolicy(env, tx)
 if (current) need(input.id === current.id && input.revision === current.revision, 'Timesheet policy changed; reload before saving', 409)
 else need((input.id === undefined || input.id === policyId) && !input.revision, 'Timesheet policy changed; reload before saving', 409)
 const requestedLock = input.lockThrough === undefined ? current?.value.lockThrough ?? null : input.lockThrough
 const lockThrough = requestedLock === null || requestedLock === '' ? null : date(requestedLock)
 await holdClosedTimePeriods(env,tx,lockThrough)
 const reason = text(input.reason, 'Policy change or reopening reason')
 if (lockThrough) {
  const timer = await env.DB.prepare("SELECT id FROM g_time WHERE start_ms IS NOT NULL AND end_ms IS NULL AND json_extract(data,'$.workDate')<=? LIMIT 1").bind(lockThrough).first()
  need(!timer, 'Stop running timers in the affected period before locking timesheets', 409)
  tx.guard("NOT EXISTS(SELECT 1 FROM g_time WHERE start_ms IS NOT NULL AND end_ms IS NULL AND json_extract(data,'$.workDate')<=?)", lockThrough)
 }
 const review = reviewSettings(current)
 if (input.review !== undefined) {
  const v=input.review;need(v&&typeof v==='object'&&!Array.isArray(v),'Review policy must be an object')
  review.dueWeekday=integer(v.dueWeekday,'Due weekday',0,6);review.dueTime=text(v.dueTime,'Due time');need(/^([01]\d|2[0-3]):[0-5]\d$/.test(review.dueTime),'Use HH:MM due time')
  review.minimumNotes=integer(v.minimumNotes,'Minimum note characters',0,4000);review.maxEntrySeconds=integer(v.maxEntrySeconds,'Maximum entry seconds',1,86400);review.maxDaySeconds=integer(v.maxDaySeconds,'Maximum day seconds',1,86400)
  review.reviewLevels=integer(v.reviewLevels,'Review levels',1,2);review.separation=flag(v.separation)
  need(v.serviceBillability&&typeof v.serviceBillability==='object'&&!Array.isArray(v.serviceBillability),'Set service billability defaults')
  review.serviceBillability=Object.fromEntries(Object.entries(v.serviceBillability).map(([service,billable])=>{need(typeof billable==='boolean','Billability defaults must be true or false');return [text(service,'Service',200),billable]}))
 }
 return tx.record('timePolicies', {lockThrough, review, reason, changedBy:a.session.operator.id, changedAt:Date.now()}, current, policyId, action)
}
