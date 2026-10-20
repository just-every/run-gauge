import { date, money, need } from './model'

export interface HarvestRate {
 effective: string
 costMinor: number | null
 billMinor: number
}

export function normalizeHarvestRates(raw: unknown): HarvestRate[] {
 const entries = Array.isArray(raw) ? raw : [raw]
 need(entries.length >= 1 && entries.length <= 100, 'Supply between 1 and 100 historical rates per person')
 const dates = new Set<string>()
 const rates = entries.map(entry => {
  need(entry !== null && typeof entry === 'object' && !Array.isArray(entry), 'Each historical rate must be an object')
  const value = entry as Record<string, unknown>
  const effective = date(value.effective)
  need(!dates.has(effective), `Duplicate rate effective date ${effective}`)
  dates.add(effective)
  return {
   effective,
   costMinor: value.costMinor === null ? null : money(value.costMinor),
   billMinor: money(value.billMinor),
  }
 })
 return rates.sort((a, b) => a.effective.localeCompare(b.effective))
}

export function harvestRateAt(rates: readonly HarvestRate[], day: string, personOrSourceId: string): HarvestRate {
 const workDate = date(day)
 let selected: HarvestRate | undefined
 for (const rate of rates) {
  if (rate.effective <= workDate && (!selected || rate.effective > selected.effective)) selected = rate
 }
 need(selected, `No rate effective on or before ${workDate} for ${personOrSourceId}`)
 return selected
}
