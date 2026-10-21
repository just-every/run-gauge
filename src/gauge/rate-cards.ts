import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, integer, money, date, charge } from './model'
import { type Actor, Transaction, finance, get, all } from './store'
import { activeClient } from './clients'

// RATE-002 rate cards. One effective-dated, immutable `rates` row is one card version.
// Bill precedence, most specific first: an entry override, then project, client-role, client,
// role, person and service cards. Cost precedence: person, role, service (costs describe the worker;
// client and project cards carry bill rates only). Within a level a card naming the entry's service
// beats an "All services" card, then the latest effective date on or before the work date wins.
export const billLevels = ['project','client-role','client','role','person','service'] as const
export const costLevels = ['person','role','service'] as const
export type Level = typeof billLevels[number]
// New declared costs are USD (ct 19 Oct 12:00Z); rows saved before RATE-002 keep their single currency.
export const costCurrencyOf = (r: Row) => r.value.costCurrency ?? r.value.currency
export const levelOf = (v: Value): Level => v.engagementId ? 'project' : v.clientId ? (v.role ? 'client-role' : 'client') : v.personId ? 'person' : v.role ? 'role' : 'service'
const half = (n: bigint, d: bigint) => (n + d / 2n) / d
const bps = (minor: number, basisPoints: number) => Number(half(BigInt(minor) * BigInt(basisPoints), 10000n))

/** Bill-only premium, then negotiated write-down; each amount rounds half up. */
export function billPricing(seconds: number, rate: number, overtimeSeconds = 0, overtimeBps?: number, writeDownBps = 0) {
 const overtimeRateMinor = overtimeBps === undefined ? null : bps(rate, overtimeBps)
 const standardBillMinor = charge(seconds - overtimeSeconds, rate) + (overtimeSeconds ? charge(overtimeSeconds, overtimeRateMinor!) : 0)
 const writeDownMinor = bps(standardBillMinor, writeDownBps)
 return { overtimeSeconds, overtimeRateMinor, standardBillMinor, writeDownBps, writeDownMinor, billMinor: standardBillMinor - writeDownMinor }
}

export async function rateCard(env: Bindings, a: Actor, tx: Transaction, input: Value, previous?: Row): Promise<Value> {
 need(!previous, 'Rates are immutable; add an effective-dated version')
 const v: Value = { personId: input.personId || null, role: input.role ? text(input.role, 'Role', 200) : null, clientId: input.clientId || null, engagementId: input.engagementId || null, service: text(input.service || '*', 'Service') }
 need([v.personId, v.clientId, v.engagementId].filter(Boolean).length <= 1 && !(v.role && (v.personId || v.engagementId)), 'A card belongs to one project, client (optionally one role), role, person or service')
 if (v.personId) tx.observe('people', await get(env, 'people', v.personId))
 if (v.clientId) tx.observe('clients', await activeClient(env, v.clientId))
 if (v.engagementId) { const e = await get(env, 'engagements', v.engagementId); tx.observe('engagements', e); need(e.value.type !== 'internal', 'Internal work has no bill rates') }
 v.scope = levelOf(v)
 need(v.scope !== 'service' || v.service !== '*', 'Choose a project, client, role, person or named service')
 v.effective = date(input.effective)
 v.billMinor = money(input.billMinor)
 // Until SETUP-003 gives a client its own billing currency, every card bills in the agency currency.
 v.currency = a.currency
 v.costMinor = input.costMinor === '' || input.costMinor === null || input.costMinor === undefined ? null : money(input.costMinor)
 need(v.costMinor === null || (costLevels as readonly string[]).includes(v.scope), 'Client and project cards carry bill rates; declare costs on person, role or service cards')
 // A cost is a declared input in USD (W-2 loaded or 1099 contract), never a payroll calculation.
 if (v.costMinor !== null) v.costCurrency = 'USD'
 need(input.costCurrency === undefined || input.costCurrency === '' || input.costCurrency === 'USD', 'Declare costs in USD; other currencies need SETUP-003 exchange rates')
 const after = input.overtimeAfterSeconds, multiplier = input.overtimeBps
 need((after === undefined || after === '') === (multiplier === undefined || multiplier === ''), 'Overtime needs both a daily threshold and a multiplier')
 if (after !== undefined && after !== '') { v.overtimeAfterSeconds = integer(after, 'Overtime after seconds per day', 0, 86400); v.overtimeBps = integer(multiplier, 'Overtime multiplier in basis points', 10000, 30000) }
 if (input.writeDownBps !== undefined && input.writeDownBps !== '') v.writeDownBps = integer(input.writeDownBps, 'Write-down in basis points', 0, 10000)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_rates WHERE COALESCE(json_extract(data,'$.personId'),'')=? AND COALESCE(json_extract(data,'$.role'),'')=? AND COALESCE(json_extract(data,'$.clientId'),'')=? AND COALESCE(json_extract(data,'$.engagementId'),'')=? AND json_extract(data,'$.service')=? AND json_extract(data,'$.effective')=? AND id NOT IN (SELECT json_extract(data,'$.rateId') FROM g_rateWithdrawals))", v.personId ?? '', v.role ?? '', v.clientId ?? '', v.engagementId ?? '', v.service, v.effective)
 return v
}

function matches(r: Row, level: Level, person: Row, engagement: Row, service: string, day: string) {
 const v = r.value, role = person.value.role || null
 if (v.effective > day || (v.service !== '*' && v.service !== service) || levelOf(v) !== level) return false
 if (level === 'project') return v.engagementId === engagement.id
 if (level === 'client-role') return !!role && v.clientId === engagement.value.clientId && v.role === role
 if (level === 'client') return v.clientId === engagement.value.clientId
 if (level === 'role') return !!role && v.role === role
 if (level === 'person') return v.personId === person.id
 return true
}
/** Cards still in precedence: a withdrawal (its own immutable record) removes a card for every later pricing. */
export const activeRates = (rates: Row[], withdrawals: Row[]) => { const gone = new Set(withdrawals.map(w => w.value.rateId)); return rates.filter(r => !gone.has(r.id)) }
const pick = (rows: Row[], service: string) => [...rows].sort((x, y) => Number(y.value.service === service) - Number(x.value.service === service) || y.value.effective.localeCompare(x.value.effective))[0]

/** Every card considered at each level and the one that won, for the explain view and the frozen trace. */
export function explain(rates: Row[], person: Row, engagement: Row, service: string, day: string) {
 const levels = billLevels.map(level => { const candidates = rates.filter(r => matches(r, level, person, engagement, service, day)); return { level, candidates, chosen: pick(candidates, service) } })
 const bill = engagement.value.type === 'internal' ? undefined : levels.find(l => l.chosen)
 const cost = costLevels.map(level => levels.find(l => l.level === level)!).find(l => l.chosen)
 return { levels, bill, cost }
}
export const traceOf = (x: ReturnType<typeof explain>) => x.levels.map(l => ({ level: l.level, candidates: l.candidates.map(r => ({ rateId: r.id, effective: r.value.effective, service: r.value.service })), chosen: l.chosen?.id ?? null }))

/** The frozen economics of one approval: the chosen card (or entry override), overtime, write-down and declared cost. */
export async function freeze(env: Bindings, tx: Transaction, row: Row, engagement: Row, terms: { mode: string, roundingSeconds: number, budgetId: string | null }) {
 const v = row.value, observedRates = await all(env, 'rates'), withdrawals = await all(env, 'rateWithdrawals'), person = await get(env, 'people', v.personId); tx.observe('people', person)
 // Fence all candidate cards: insertion during review cannot silently select a different version.
 for (const observed of observedRates) tx.observe('rates', observed)
 tx.guard('(SELECT COUNT(*) FROM g_rates)=?', observedRates.length); tx.guard('(SELECT COUNT(*) FROM g_rateWithdrawals)=?', withdrawals.length)
 const x = explain(activeRates(observedRates, withdrawals), person, engagement, v.service, v.workDate), card = x.bill?.chosen, costCard = x.cost?.chosen
 const seconds = v.durationSeconds ?? Math.round((v.end - v.start) / 1000)
 const costKind = person.value.employmentType === 'contractor' || person.value.contractor ? '1099-contract' : 'w2-loaded'
 const cost = { costRateId: costCard?.id ?? null, costLevel: x.cost?.level ?? null, costMinor: costCard?.value.costMinor == null ? null : charge(seconds, costCard.value.costMinor), costCurrency: costCard?.value.costMinor == null ? null : costCurrencyOf(costCard), costKind: costCard?.value.costMinor == null ? null : costKind }
 if (engagement.value.type === 'internal') return { rateId: costCard?.id ?? null, budgetId: null, mode: 'internal', roundingSeconds: 1, ...cost, billRateMinor: 0, roundedBillingSeconds: seconds, billMinor: 0, currency: engagement.value.currency, precedence: traceOf(x) }
 const override = v.rateOverride
 need(override || !card || card.value.currency === engagement.value.currency, 'Rate currency differs from engagement; no implicit FX')
 const rate: number | null = override ? override.billRateMinor : card?.value.billMinor ?? null, rounded = Math.ceil(seconds / terms.roundingSeconds) * terms.roundingSeconds
 const priced: Value = { rateId: override ? null : card?.id ?? null, rateLevel: override ? 'entry' : x.bill?.level ?? null, entryOverride: override ?? null, budgetId: terms.budgetId, mode: terms.mode, roundingSeconds: terms.roundingSeconds, ...cost, billRateMinor: rate, roundedBillingSeconds: rounded, overtimeSeconds: 0, overtimeRateMinor: null, standardBillMinor: null, writeDownBps: 0, writeDownMinor: 0, billMinor: null, currency: engagement.value.currency, precedence: traceOf(x) }
 if (rate === null) return priced
 // Overtime: billing seconds past the card's daily threshold, counting this person's time already approved for that work date.
 let overtime = 0
 if (!override && card?.value.overtimeAfterSeconds !== undefined) {
  const earlier = (await all(env, 'time')).filter(t => t.id !== row.id && t.value.status === 'approved' && t.value.personId === v.personId && t.value.workDate === v.workDate)
  tx.guard("(SELECT COUNT(*) FROM g_time WHERE id<>? AND json_extract(data,'$.status')='approved' AND json_extract(data,'$.personId')=? AND json_extract(data,'$.workDate')=?)=?", row.id, v.personId, v.workDate, earlier.length)
  const before = earlier.reduce((n, t) => n + t.value.durationSeconds, 0)
  overtime = Math.min(rounded, Math.max(0, before + seconds - card.value.overtimeAfterSeconds))
 }
 Object.assign(priced, billPricing(rounded, rate, overtime, !override && card?.value.overtimeAfterSeconds !== undefined ? card.value.overtimeBps : undefined, override ? override.writeDownBps : card?.value.writeDownBps ?? 0))
 return priced
}

/** Finance's negotiated per-entry override, frozen at approval; staff never see it. */
export async function rateCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 // A withdrawn card leaves precedence for every later pricing (explain, new approvals, FINANCE-006 forecasts);
 // approvals already frozen keep the card they used.
 if (action === 'rate:withdraw') {
  need(finance(a), 'Finance access required', 403)
  const card = await get(env, 'rates', text(input.id, 'Rate card')); need(card.revision === input.revision, 'Rate card changed; reload', 409)
  tx.observe('rates', card); tx.guard("NOT EXISTS(SELECT 1 FROM g_rateWithdrawals WHERE json_extract(data,'$.rateId')=?)", card.id)
  return tx.record('rateWithdrawals', { rateId: card.id, rateRevision: card.revision, reason: text(input.reason, 'Withdrawal reason'), withdrawnBy: a.session.operator.id, withdrawnAt: Date.now() }, undefined, undefined, action)
 }
 if (action !== 'rate:entry') return null
 need(finance(a), 'Finance access required', 403)
 const row = await get(env, 'time', text(input.id, 'Entry')); need(row.revision === input.revision, 'Entry changed; reload', 409)
 need(['draft', 'returned', 'submitted'].includes(row.value.status), 'Approved entries need an audited correction before their rate changes', 409)
 const e = await get(env, 'engagements', row.value.engagementId); tx.observe('engagements', e); need(e.value.type !== 'internal', 'Internal work has no bill rates')
 const override = input.billRateMinor === '' || input.billRateMinor === null || input.billRateMinor === undefined ? null
  : { billRateMinor: money(input.billRateMinor), writeDownBps: input.writeDownBps === undefined || input.writeDownBps === '' ? 0 : integer(input.writeDownBps, 'Write-down in basis points', 0, 10000), reason: text(input.reason, 'Override reason'), by: a.session.operator.id, at: Date.now() }
 const v = { ...row.value }; if (override) v.rateOverride = override; else delete v.rateOverride
 return tx.record('time', v, row, undefined, action)
}

/** The explain view: which card each level offers for a person, engagement, service and date, and which wins. */
export async function explainRate(env: Bindings, a: Actor, q: { personId: string, engagementId: string, service: string, date: string }) {
 need(finance(a), 'Finance access required', 403)
 const person = await get(env, 'people', text(q.personId, 'Person')), engagement = await get(env, 'engagements', text(q.engagementId, 'Engagement')), service = text(q.service, 'Service'), day = date(q.date)
 const x = explain(activeRates(await all(env, 'rates'), await all(env, 'rateWithdrawals')), person, engagement, service, day), view = (r?: Row): Value | null => r ? { id: r.id, ...r.value } : null
 return { personId: person.id, engagementId: engagement.id, service, date: day, precedence: ['entry', ...billLevels], costPrecedence: [...costLevels], levels: x.levels.map(l => ({ level: l.level, candidates: l.candidates.map(view), chosen: l.chosen?.id ?? null })), bill: x.bill ? { level: x.bill.level, rate: view(x.bill.chosen) } : null, cost: x.cost ? { level: x.cost.level, rate: view(x.cost.chosen) } : null }
}
