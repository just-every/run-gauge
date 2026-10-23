import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, date, sum } from './model'
import { type Actor, Transaction, all, finance } from './store'
import { currencies } from './agency'

// SETUP-001 / SETUP-003: Gauge never converts silently. Money in a currency other than the agency's reporting currency
// is consolidated only at an owner-approved, effective-dated rate; with no approved rate an amount stays in its own
// currency and the consolidated total is withheld, never shown with the amount as zero. A new or corrected rate
// applies forward only: it cannot be effective before the latest rate already approved for that currency.
const rateMicro = (raw: unknown) => {
 const s = String(raw ?? '').trim()
 need(/^\d{1,6}(\.\d{1,6})?$/.test(s), 'Use an exchange rate such as 0.6500 (up to six decimals)')
 const [whole, fraction = ''] = s.split('.'), micro = Number(whole) * 1e6 + Number(fraction.padEnd(6, '0'))
 need(micro > 0, 'The exchange rate must be above zero')
 return { rate: s, micro }
}
const half = (amount: number, micro: number) => Number((BigInt(amount) * BigInt(micro) + 500000n) / 1000000n)

export async function fxCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (action !== 'fx:approve') return null
 need(a.role === 'owner', 'Only the owner approves exchange rates', 403)
 const currency = text(input.currency, 'Source currency', 3).toUpperCase()
 need(currencies.includes(currency as typeof currencies[number]) && currency !== a.currency, `Choose a supported currency other than the agency's ${a.currency}`)
 const { rate, micro } = rateMicro(input.rate), effective = date(input.effective), rows = (await all(env, 'fxRates')).filter(r => r.value.currency === currency)
 const latest = rows.map(r => r.value.effective as string).sort().at(-1)
 need(!latest || effective >= latest, `A new rate applies forward only: ${currency} already has a rate effective ${latest}`, 409)
 const closed = await all(env, 'periodCloses')
 need(!closed.some(r => r.value.to >= effective), 'A closed period protects its dated exchange rates; approve a rate after that period', 409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_periodCloses WHERE json_extract(data,'$.to')>=?)", effective)
 tx.guard("(SELECT COUNT(*) FROM g_fxRates WHERE json_extract(data,'$.currency')=?)=?", currency, rows.length)
 return tx.record('fxRates', { currency, to: a.currency, rate, rateMicro: micro, effective, source: text(input.source, 'Rate source (the accounting provider or a named published rate)', 300), reason: text(input.reason, 'Reason for the rate'), approvedBy: a.session.operator.id, approvedAt: Date.now() }, undefined, undefined, action)
}

/** The rate in force on a day: the latest effective on or before it, a later approval winning a same-day correction. */
export function rateOn(rates: Row[], currency: string, day: string) {
 return rates.filter(r => r.value.currency === currency && r.value.effective <= day).sort((x, y) => x.value.effective.localeCompare(y.value.effective) || x.value.approvedAt - y.value.approvedAt).at(-1)
}

interface Item { currency: string; day: string; time: number; expense: number }
/** The consolidation read: approved billable time value and approved expenses by currency, converted entry by entry. */
export async function consolidate(env: Bindings, a: Actor, input: Value) {
 need(finance(a), 'Finance access required', 403)
 const from = input.from ? date(input.from) : '0000-01-01', to = input.to ? date(input.to) : '9999-12-31'
 const rates = await all(env, 'fxRates'), items: Item[] = []
 need(!input.basis || input.basis === 'issued-invoices', 'Choose issued-invoices or omit the basis for approved activity')
 if (input.basis === 'issued-invoices') {
  for (const r of await all(env, 'invoices')) if (r.value.issueDate >= from && r.value.issueDate <= to) items.push({currency:r.value.currency, day:r.value.issueDate, time:r.value.totalMinor, expense:0})
 } else {
 for (const r of await all(env, 'time')) if (r.value.status === 'approved' && r.value.billable && r.value.economics?.billMinor != null && r.value.workDate >= from && r.value.workDate <= to) items.push({ currency: r.value.economics.currency, day: r.value.workDate, time: r.value.economics.billMinor, expense: 0 })
 for (const r of await all(env, 'expenses')) if (r.value.status === 'approved' && r.value.date >= from && r.value.date <= to) items.push({ currency: r.value.currency, day: r.value.date, time: 0, expense: r.value.amountMinor })
 }
 const buckets = [...new Set(items.map(i => i.currency))].sort().map(currency => {
  const mine = items.filter(i => i.currency === currency), amountMinor = sum(mine.map(i => i.time + i.expense))
  if (currency === a.currency) return { currency, amountMinor, timeMinor: sum(mine.map(i => i.time)), expenseMinor: sum(mine.map(i => i.expense)), convertedMinor: amountMinor, unconvertedMinor: 0, conversions: [] as Value[], status: 'reporting currency' }
  const used = new Map<string, { row: Row; sourceMinor: number; convertedMinor: number }>(); let unconverted = 0, converted = 0
  for (const item of mine) {
   const amount = item.time + item.expense, row = rateOn(rates, currency, item.day)
   if (!row) { unconverted += amount; continue }
   const value = half(amount, row.value.rateMicro), entry = used.get(row.id) ?? { row, sourceMinor: 0, convertedMinor: 0 }
   entry.sourceMinor += amount; entry.convertedMinor += value; used.set(row.id, entry); converted += value
  }
  return { currency, amountMinor, timeMinor: sum(mine.map(i => i.time)), expenseMinor: sum(mine.map(i => i.expense)), convertedMinor: used.size ? converted : null, unconvertedMinor: unconverted,
   conversions: [...used.values()].map(u => ({ rateId: u.row.id, rate: u.row.value.rate, effective: u.row.value.effective, source: u.row.value.source, sourceMinor: u.sourceMinor, convertedMinor: u.convertedMinor })),
   status: unconverted ? (used.size ? 'partly unconverted' : 'no approved rate') : 'converted' }
 })
 const complete = buckets.every(b => b.unconvertedMinor === 0)
 const knownMinor = sum(buckets.map(b => b.convertedMinor ?? 0))
 return { reportingCurrency: a.currency, from: input.from ?? null, to: input.to ?? null, basis: input.basis === 'issued-invoices' ? 'Issued invoice face values before credits and receipts, each converted at the rate effective on its issue date' : 'Approved billable time value and approved expenses, each converted at the rate effective on its work date', buckets, complete, consolidatedMinor: complete ? knownMinor : null, knownMinor, missingRates: buckets.filter(b => b.unconvertedMinor > 0).map(b => b.currency) }
}
