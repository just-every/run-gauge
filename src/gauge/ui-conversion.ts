import type { Value } from './model'
import { escape as e } from './ui-forms'
import { day, money } from './ui-format'

/** One line per currency: its amount, its value in the reporting currency or "Unconverted", and each rate with its date and source. */
export const conversionLines = (buckets: Value[], reporting: string, unknownNote = 'an earned amount is unknown') => `<ul>${buckets.map(b => {
 const rates = b.conversions.map((c: Value) => e(`${c.rate} from ${day(c.effective)} (${c.source})`)).join('; ')
 const label = rates || (b.currency === reporting ? 'reporting currency' : b.amountMinor ? 'no approved rate' : 'nothing to convert')
 const rest = b.conversions.length && b.unconvertedMinor ? ` · ${e(money(b.unconvertedMinor, b.currency))} unconverted: no approved rate for its dates` : ''
 return `<li>${e(money(b.amountMinor, b.currency))} → ${b.convertedMinor == null ? 'Unconverted' : e(money(b.convertedMinor, reporting))} · ${label}${rest}${b.unknown ? ` · ${e(unknownNote)}` : ''}</li>`
}).join('')}</ul>`
