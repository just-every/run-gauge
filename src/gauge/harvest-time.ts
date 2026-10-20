import { charge, integer, need, text, type Value } from './model'

/** Harvest quantities stay separate: exported rounding is evidence, never native actual time. */
export function harvestSeconds(raw: string) {
 need(/^\d+(\.\d{1,6})?$/.test(raw), 'Hours must be decimal text, up to six places')
 const [whole, fraction = ''] = raw.split('.'), denominator = 10n ** BigInt(fraction.length)
 const numerator = (BigInt(whole) * denominator + BigInt(fraction || 0)) * 3600n
 need(numerator % denominator === 0n, 'Hours do not represent exact whole seconds')
 return integer(Number(numerator / denominator), 'Duration seconds', 0, 86400)
}

export function harvestTimeEvidence(row: Record<string, string>, columns: Value, durationSeconds: number) {
 const optional = (key: string, header: string) => {
  const name = columns[key] ?? header
  if (columns[key]) need(Object.hasOwn(row, name), `Missing mapped Harvest column: ${name}`)
  return row[name]?.trim() || null
 }
 const yesNo = (key: string, header: string) => {
  const raw = optional(key, header)
  need(raw === null || ['Yes', 'No'].includes(raw), `Resolve source ${key} as Yes or No`)
  return raw === null ? null : raw === 'Yes'
 }
 const rounded = optional('roundedHours', 'Rounded Hours'), invoice = optional('invoiceId', 'Invoice ID')
 return { rawSeconds: durationSeconds, billingSeconds: rounded === null ? null : harvestSeconds(rounded),
  invoiceId: invoice === null ? null : text(invoice, 'Source invoice reference', 200),
  approved: yesNo('approved', 'Approved?'), locked: yesNo('locked', 'Locked?') }
}

export type HarvestTimeControl = { count: number; rawSeconds: number; billingSeconds: number | null; billedSeconds: number; unbilledSeconds: number; costMinor: number | null; billMinor: number }
export function addHarvestTimeControl(controls: Record<string, HarvestTimeControl>, key: string, source: Value, billable: boolean) {
 const total = controls[key] ??= { count: 0, rawSeconds: 0, billingSeconds: 0, billedSeconds: 0, unbilledSeconds: 0, costMinor: 0, billMinor: 0 }
 total.count++; total.rawSeconds += source.rawSeconds
 total.billingSeconds = total.billingSeconds === null || source.billingSeconds === null ? null : total.billingSeconds + source.billingSeconds
 total[source.billed ? 'billedSeconds' : 'unbilledSeconds'] += source.rawSeconds
 total.costMinor = total.costMinor === null || source.costMinor === null ? null : total.costMinor + source.costMinor
 total.billMinor += billable ? source.billMinor : 0
 need(Object.values(total).every(value => value === null || Number.isSafeInteger(value)), 'Harvest control total exceeds exact integer range')
}
