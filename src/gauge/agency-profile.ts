import { type Value, need, text, integer } from './model'
import { type Actor, Transaction, all } from './store'
import type { Bindings } from '../auth.server'

// SETUP-001 / SETUP-006 (conservative default, ct approval pending): the owner alone sets the agency legal business, US billing
// address, EIN and fiscal-year start. The EIN stays owner-only (finance, leads and staff never receive it, and no
// invoice, export or audit view shows it); finance sees the legal business, address and fiscal year.
const states = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' ')
const optional = (value: unknown, name: string, max: number) => value === undefined || value === null || String(value).trim() === '' ? null : text(String(value), name, max)

/** The stored profile from flat form or API fields; null when the owner left every profile field blank at first run. */
export function profileValue(input: Value, a: Pick<Actor, 'session'>, reason: string, blankAllowed = false): Value | null {
 const names = ['legalBusiness', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'einReference']
 if (blankAllowed && names.every(n => !String(input[n] ?? '').trim())) return null
 const state = text(input.state, 'US state', 2).toUpperCase(), postalCode = text(input.postalCode, 'ZIP code', 10)
 need(states.includes(state), 'Use a US state, district or territory code such as NY')
 need(/^\d{5}(-\d{4})?$/.test(postalCode), 'Use a US ZIP code such as 10001 or 10001-0001')
 const raw = String(input.einReference ?? '').trim(), digits = raw.replace('-', '')
 need(raw === '' || /^\d{2}-?\d{7}$/.test(raw), 'Use an EIN such as 12-3456789, or leave it empty')
 const month = input.fiscalYearStartMonth === undefined || input.fiscalYearStartMonth === '' ? 1 : integer(input.fiscalYearStartMonth, 'Fiscal year start month', 1, 12)
 return {
  legalBusiness: text(input.legalBusiness, 'Legal business name', 200),
  billingAddress: { line1: text(input.addressLine1, 'Billing address', 200), line2: optional(input.addressLine2, 'Address line 2', 200), city: text(input.city, 'City', 100), state, postalCode, country: 'US' },
  einReference: raw === '' ? null : `${digits.slice(0, 2)}-${digits.slice(2)}`,
  fiscalYearStartMonth: month,
  reason, setBy: a.session.operator.id, setAt: Date.now(),
 }
}

export async function agencyProfileCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (action !== 'agency:profile') return null
 need(a.role === 'owner', 'Only the owner sets the agency profile', 403)
 const [current] = await all(env, 'agencyProfiles')
 if (current) { need(input.id === current.id && input.revision === current.revision, 'The agency profile changed; reload before saving', 409) }
 else tx.guard('NOT EXISTS(SELECT 1 FROM g_agencyProfiles)')
 return tx.record('agencyProfiles', profileValue(input, a, text(input.reason, 'Reason for the profile change'))!, current, undefined, action)
}

const names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (month: number) => names[month] ?? ''
/** The fiscal year containing a YYYY-MM-DD day, named by the calendar year it ends in (a January start is that calendar year). */
export function fiscalYear(day: string, startMonth: number) {
 const year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7)), endYear = startMonth === 1 ? year : month >= startMonth ? year + 1 : year
 const startYear = startMonth === 1 ? year : endYear - 1, last = startMonth === 1 ? 12 : startMonth - 1
 const end = new Date(Date.UTC(startMonth === 1 ? year : endYear, last, 0)).toISOString().slice(0, 10)
 return { label: `FY${endYear}`, start: `${startYear}-${String(startMonth).padStart(2, '0')}-01`, end }
}
