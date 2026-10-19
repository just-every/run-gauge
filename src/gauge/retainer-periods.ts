import { integer, need, text } from './model'
import { currencies } from './agency'

export interface RetainerTerms {
  name: string
  frequency: 'monthly' | 'quarterly' | 'annual'
  unit: 'value' | 'hours'
  /** Integer currency cents, or whole seconds divisible by sixty. */
  allowance: number
  services: string[]
  consumes: 'all' | 'billable' | 'nonbillable'
  proration: 'calendar' | 'working'
  start: string
  end: string | null
  renewal: 'automatic' | 'manual'
  noticeDays: number
  currency: string
}

export interface RetainerPeriod {
  periodStart: string
  periodEnd: string
  activeStart: string
  activeEnd: string
  numeratorDays: number
  denominatorDays: number
  allowance: number
  renewalDate: string | null
  noticeDate: string | null
}

export interface RetainerCalendar { weekdays: number[]; holidays: string[] }

const DAY = 86_400_000
const dayNumber = (value: string) => Date.parse(`${value}T00:00:00Z`) / DAY
const dayText = (value: number) => new Date(value * DAY).toISOString().slice(0, 10)
const firstDay = dayNumber('0001-01-01'), lastDay = dayNumber('9999-12-31')

function exactDate(value: unknown): string {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use a valid YYYY-MM-DD date')
  const day = dayNumber(value)
  need(Number.isFinite(day) && day >= firstDay && day <= lastDay && dayText(day) === value, 'Use a valid YYYY-MM-DD date')
  return value
}

export function normalizeRetainer(input: unknown, currency: string): RetainerTerms {
  need(input !== null && typeof input === 'object' && !Array.isArray(input), 'Retainer terms must be an object')
  const value = input as Record<string, unknown>
  need(currencies.includes(currency as typeof currencies[number]), 'Choose a supported agency currency')
  need(value.currency === undefined || value.currency === currency, 'Retainer currency must match the engagement billing currency; no implicit FX')
  need(value.frequency === 'monthly' || value.frequency === 'quarterly' || value.frequency === 'annual', 'Choose monthly, quarterly or annual frequency')
  need(value.unit === 'value' || value.unit === 'hours', 'Choose included value or hours')
  const allowance = integer(value.allowance, 'Included allowance', 0)
  need(value.unit !== 'hours' || allowance % 60 === 0, 'Included hours must be an exact number of whole minutes in seconds')
  need(Array.isArray(value.services) && value.services.length >= 1 && value.services.length <= 30, 'Choose one to thirty eligible services')
  const services = Array.from(value.services, service => text(service, 'Eligible service', 200))
  need(new Set(services.map(service => service.toLowerCase())).size === services.length, 'Eligible services must be unique, ignoring case')
  need(value.consumes === 'all' || value.consumes === 'billable' || value.consumes === 'nonbillable', 'Choose all, billable or nonbillable approved work')
  const proration = value.proration ?? 'calendar'
  need(proration === 'calendar' || proration === 'working', 'Choose calendar-day or working-day proration')
  const start = exactDate(value.start), end = value.end === null || value.end === undefined ? null : exactDate(value.end)
  need(end === null || end >= start, 'Retainer end must be on or after its start')
  need(value.renewal === 'automatic' || value.renewal === 'manual', 'Choose automatic or manual renewal')
  return {
    name: text(value.name, 'Retainer name', 200), frequency: value.frequency, unit: value.unit, allowance,
    services, consumes: value.consumes, proration, start, end, renewal: value.renewal,
    noticeDays: integer(value.noticeDays ?? 0, 'Renewal notice days', 0, 365), currency,
  }
}

function workingCalendar(input: RetainerCalendar): { weekdays: Set<number>; holidays: Set<string> } {
  need(input !== null && typeof input === 'object', 'Working-day proration requires an agency calendar')
  need(Array.isArray(input.weekdays) && input.weekdays.length >= 1 && input.weekdays.length <= 7, 'Choose one to seven working weekdays')
  const weekdays = Array.from(input.weekdays, weekday => {
    need(typeof weekday === 'number', 'Weekdays must be numbers from 0 (Sunday) to 6 (Saturday)')
    return integer(weekday, 'Working weekday', 0, 6)
  })
  need(new Set(weekdays).size === weekdays.length, 'Working weekdays must be unique')
  need(Array.isArray(input.holidays), 'Agency holidays must be a list of dates')
  const holidays = Array.from(input.holidays, exactDate)
  need(new Set(holidays).size === holidays.length, 'Holiday dates must be unique')
  return { weekdays: new Set(weekdays), holidays: new Set(holidays) }
}

function anchor(day: number, months: number): number {
  const value = new Date(day * DAY)
  value.setUTCDate(1)
  value.setUTCMonth(Math.floor(value.getUTCMonth() / months) * months)
  return value.getTime() / DAY
}

function nextPeriod(day: number, months: number): number {
  const value = new Date(day * DAY)
  value.setUTCMonth(value.getUTCMonth() + months)
  return value.getTime() / DAY
}

/** Exact half-up rounding, once to cents or whole minutes; hours return seconds. */
function prorate(allowance: number, numerator: number, denominator: number, unit: RetainerTerms['unit']): number {
  const quantum = unit === 'hours' ? 60 : 1
  const total = BigInt(allowance / quantum) * BigInt(numerator)
  return Number((2n * total + BigInt(denominator)) / (2n * BigInt(denominator))) * quantum
}

/**
 * The inclusive query window selects overlapping commercial periods, not partial
 * entitlement slices. Only the term start/end prorate a period's allowance.
 * Manual renewal authorizes the initial period only; its next boundary is still
 * previewed as the renewal decision date. A new commercial version renews it.
 */
export function retainerPeriods(terms: RetainerTerms, from: string, to: string, calendar: RetainerCalendar): RetainerPeriod[] {
  const normalized = normalizeRetainer(terms, terms.currency)
  const fromDay = dayNumber(exactDate(from)), toDay = dayNumber(exactDate(to))
  need(toDay >= fromDay && toDay - fromDay < 366, 'Choose an inclusive retainer preview window of one to 366 days')
  const start = dayNumber(normalized.start), end = normalized.end === null ? lastDay : dayNumber(normalized.end)
  const months = normalized.frequency === 'monthly' ? 1 : normalized.frequency === 'quarterly' ? 3 : 12
  const initialPeriod = anchor(start, months)
  const working = normalized.proration === 'working' ? workingCalendar(calendar) : null
  const count = (first: number, last: number): number => {
    if (!working) return last - first + 1
    let days = 0
    for (let day = first; day <= last; day++) {
      if (working.weekdays.has(new Date(day * DAY).getUTCDay()) && !working.holidays.has(dayText(day))) days++
    }
    return days
  }
  const periods: RetainerPeriod[] = []
  for (let periodStart = anchor(Math.max(fromDay, start), months); periodStart <= toDay && periodStart <= end;) {
    if (normalized.renewal === 'manual' && periodStart !== initialPeriod) break
    const next = nextPeriod(periodStart, months), periodEnd = next - 1
    const activeStart = Math.max(periodStart, start), activeEnd = Math.min(periodEnd, end)
    if (activeStart <= activeEnd && activeStart <= toDay && activeEnd >= fromDay) {
      const denominatorDays = count(periodStart, periodEnd), numeratorDays = count(activeStart, activeEnd)
      need(denominatorDays > 0, 'Retainer period has no working days; revise the agency calendar or proration terms')
      const renewal = next <= end && next <= lastDay ? next : null
      const notice = renewal === null ? null : renewal - normalized.noticeDays
      need(notice === null || notice >= firstDay, 'Renewal notice date falls outside the supported date range')
      periods.push({
        periodStart: dayText(periodStart), periodEnd: dayText(periodEnd), activeStart: dayText(activeStart), activeEnd: dayText(activeEnd),
        numeratorDays, denominatorDays, allowance: prorate(normalized.allowance, numeratorDays, denominatorDays, normalized.unit),
        renewalDate: renewal === null ? null : dayText(renewal), noticeDate: notice === null ? null : dayText(notice),
      })
    }
    periodStart = next
  }
  return periods
}
