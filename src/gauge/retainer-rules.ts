import { integer, need, type Value } from './model'

export interface RetainerRules {
 carryCap: number
 carryPeriods: number
 deficit: boolean
 overage: 'held' | 'bill'
 overageRate: number
}

/** Immutable versioned rules: quantities are seconds for hours, cents for value;
 * the value-overage rate is basis points, the hour rate is currency cents/hour. */
export function normalizeRetainerRules(input: unknown, unit: string): RetainerRules {
 const v = (input ?? {}) as Value
 need(typeof v === 'object' && !Array.isArray(v), 'Retainer rules must be an object')
 const carryCap = integer(v.carryCap ?? 0, 'Carry-over cap')
 need(unit !== 'hours' || carryCap % 60 === 0, 'Hour carry cap must be whole minutes')
 const carryPeriods = integer(v.carryPeriods ?? 0, 'Carry expiry in successor periods', 0, 36)
 need((carryCap === 0) === (carryPeriods === 0), 'Set both carry cap and expiry, or disable both')
 need(v.deficit === undefined || typeof v.deficit === 'boolean', 'Choose deficit carry-forward explicitly')
 const overage = v.overage ?? 'held'
 need(overage === 'held' || overage === 'bill', 'Choose held or billable overages')
 need(!(v.deficit && overage === 'bill'), 'A deficit may carry forward or be billed, never both')
 const overageRate = integer(v.overageRate ?? 0, unit === 'hours' ? 'Overage cents per hour' : 'Overage basis points', 0, 1e9)
 need(overage !== 'bill' || overageRate > 0, 'Billable overages require an agreed positive rate')
 return { carryCap, carryPeriods, deficit: v.deficit ?? false, overage, overageRate }
}

export const retainerMatches = (terms:Value,time:Value) => terms.services.some((s:string)=>s.toLowerCase()===time.service.toLowerCase()) && (terms.consumes==='all'||(terms.consumes==='billable'?time.billable:!time.billable))

export function overageCharge(quantity:number,unit:string,rate:number) {
 const denominator=unit==='hours'?3600n:10000n
 const result=(BigInt(quantity)*BigInt(rate)*2n+denominator)/(2n*denominator)
 need(result<=BigInt(Number.MAX_SAFE_INTEGER),'Overage amount exceeds exact integer range')
 return Number(result)
}
