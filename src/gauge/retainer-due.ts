import type { Bindings } from '../auth.server'
import { type Row, decode } from './model'
import { allWhere } from './store'
import { retainerPeriods } from './retainer-periods'

export const nextDay = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
export function retainerIssueDate(period: Row, basis: string) { return basis === 'arrears' ? nextDay(period.value.activeEnd) : period.value.activeStart }

const one = async (env: Bindings, sql: string, ...params: string[]) => { const r = await env.DB.prepare(sql).bind(...params).first<{ id: string; revision: string; data: string }>(); return r ? decode(r) : null }

/**
 * Whether the hourly job has a period to run: the first period of the retainer with no run whose issue date has come.
 * Periods are run in order, so the search resumes after the newest run and reads one retainer's terms, that run's
 * period and the periods after it, however long the retainer has been billing. The job is claimed and written only when this is true.
 */
export async function schedulePeriodDue(env: Bindings, schedule: Row, asOf: string): Promise<boolean> {
 const { rootId, basis, from } = schedule.value
 const versions = (await allWhere(env, 'retainers', "json_extract(data,'$.rootId')=?", rootId)).sort((a, b) => a.value.terms.start.localeCompare(b.value.terms.start))
 const last = await one(env, 'SELECT p.id,p.revision,p.data FROM g_retainerPeriods p WHERE p.root_id=? AND EXISTS(SELECT 1 FROM g_retainerRuns r WHERE r.period_id=p.id) ORDER BY p.period_start DESC LIMIT 1', rootId)
 const resume = last ? nextDay(last.value.periodEnd) : null
 for (const term of versions) {
  let cursor = term.value.terms.start < from ? from : term.value.terms.start
  if (resume && resume > cursor) cursor = resume
  const successor = versions.find(t => t.value.number === term.value.number + 1)
  for (let count = 0; cursor <= asOf && count < 120; count++) {
   const calculated = retainerPeriods(term.value.terms, cursor, cursor, term.value.calendar)[0]
   if (!calculated || successor && calculated.activeEnd >= successor.value.terms.start) break
   const existing = await one(env, 'SELECT id,revision,data FROM g_retainerPeriods WHERE root_id=? AND period_start=?', rootId, calculated.periodStart)
   const period = existing ?? { value: calculated } as unknown as Row
   const ran = existing ? await env.DB.prepare('SELECT 1 AS ran FROM g_retainerRuns WHERE period_id=?').bind(existing.id).first() : null
   if (!ran && retainerIssueDate(period, basis) <= asOf) return true
   cursor = nextDay(calculated.periodEnd)
  }
 }
 return false
}
