import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Row, type Value, type Kind, need, text, date, integer, uuid, workDate, decode, sum } from './model'
import { type Actor, type Transaction, finance, authority, fence, get } from './store'

/** Agreed terms are finance-recorded evidence, never a default entitlement. */
export function clientLateFeeTerms(input: Value, previous: Value | undefined, a: Actor, currency: string) {
 if (input.lateFeeMode === undefined) return previous?.lateFeeTerms ?? null
 need(['none', 'monthly-percentage'].includes(input.lateFeeMode), 'Choose no late fee or agreed monthly percentage')
 if (input.lateFeeMode === 'none') return null
 const terms = { mode: 'monthly-percentage', rateBasisPoints: integer(input.lateFeeRateBasisPoints, 'Agreed monthly rate in basis points', 1, 10000),
  capMinor: integer(input.lateFeeCapMinor, 'Agreed cap in cents', 1, Number.MAX_SAFE_INTEGER), currency,
  agreedOn: date(input.lateFeeAgreedOn), reference: text(input.lateFeeReference, 'Agreed terms reference') }
 need(terms.agreedOn <= workDate(Date.now(), a.timezone), 'Agreement date cannot be in the future')
 const old = previous?.lateFeeTerms
 if (old && Object.entries(terms).every(([k, v]) => old[k] === v)) return old
 return { ...terms, id: uuid(), recordedBy: a.session.operator.id, recordedAt: Date.now(), verification: 'finance-recorded agreement; not provider verified' }
}

export function frozenLateFeeTerms(client: Row, currency: string, issueDate: string) {
 const terms = client.value.lateFeeTerms
 return terms?.currency === currency && terms.agreedOn <= issueDate ? { ...structuredClone(terms), clientId: client.id, clientRevision: client.revision } : null
}

/** First monthly anniversary of the frozen due date; clamp to the month's last day. */
export function firstLateFeePeriod(dueDate: string) {
 const [year, month, day] = dueDate.split('-').map(Number), last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
 return new Date(Date.UTC(year, month, Math.min(day, last))).toISOString().slice(0, 10)
}
const sourceKinds = ['payments', 'invoiceCorrections', 'invoiceDisputes', 'lateFeeDrafts'] as const

async function lateFeeBasis(env: Bindings, a: Actor, input: Value, tx?: Transaction) {
 need(finance(a), 'Finance access required', 403)
 await fence(env, a)
 const invoice = await get(env, 'invoices', text(input.id, 'Invoice'))
 need(invoice.revision === input.revision, 'Invoice revision changed; reload before previewing', 409)
 const asOf = date(input.asOf), v = invoice.value, terms = v.lateFeeTerms
 need(asOf <= workDate(Date.now(), a.timezone), 'Late fees cannot be previewed for a future day')
 need(terms?.mode === 'monthly-percentage' && terms.currency === v.currency && terms.agreedOn <= v.issueDate, 'No agreed late-fee terms were frozen with this invoice', 409)
 const periodEnd = firstLateFeePeriod(v.dueDate)
 need(asOf >= periodEnd && Date.parse(asOf) - Date.parse(v.dueDate) > 30 * 86400000, 'The first monthly period must be complete and more than 30 days overdue', 409)
 const sources = {} as Record<typeof sourceKinds[number], Row[]>
 for (const kind of sourceKinds) {
  const rows = (await env.DB.prepare(`SELECT id,revision,data FROM g_${kind} WHERE invoice_id=? ORDER BY id`).bind(invoice.id).all<{id: string; revision: string; data: string}>()).results.map(decode)
  sources[kind] = rows
  if (tx) {
   tx.guard(`(SELECT COUNT(*) FROM g_${kind} WHERE invoice_id=?)=?`, invoice.id, rows.length)
   for (const row of rows) tx.observe(kind, row)
  }
 }
 need(!sources.invoiceCorrections.some(r => r.value.type === 'void' && r.value.status !== 'withdrawn'), 'Invoice is void or awaiting void approval', 409)
 need(!sources.invoiceDisputes.some(r => r.value.status === 'open'), 'Resolve the invoice dispute before preparing any late fee', 409)
 need(!sources.lateFeeDrafts.some(r => r.value.periodEnd === periodEnd), 'This invoice period already has a late-fee draft', 409)
 const paidMinor = sum(sources.payments.map(r => r.value.amountMinor)), creditedMinor = sum(sources.invoiceCorrections.filter(r => r.value.status === 'issued').map(r => r.value.amountMinor))
 const principalMinor = sum([v.totalMinor, -paidMinor, -creditedMinor])
 need(principalMinor > 0, 'No unpaid principal remains for a late fee', 409)
 // Use integer arithmetic: half up to cents; a fee never compounds or enters principal.
 const uncapped = (BigInt(principalMinor) * BigInt(terms.rateBasisPoints) + 5000n) / 10000n
 const available = Math.max(0, terms.capMinor - sum(sources.lateFeeDrafts.map(r => r.value.amountMinor)))
 const amountMinor = Number(uncapped < BigInt(available) ? uncapped : BigInt(available))
 need(Number.isSafeInteger(amountMinor) && amountMinor > 0, 'The agreed cap or cent rounding leaves no fee to draft', 409)
 const basis = { invoiceId: invoice.id, invoiceRevision: invoice.revision, invoiceNumber: v.number, engagementId: v.engagementId, clientId: v.clientId,
  currency: v.currency, terms: structuredClone(terms), periodStart: v.dueDate, periodEnd, asOf, principalMinor, paidMinor, creditedMinor,
  amountMinor, uncappedMinor: uncapped.toString(), sourceRevisions: Object.fromEntries(sourceKinds.map(k => [k, sources[k].map(r => ({id: r.id, revision: r.revision}))])) }
 if (tx) { tx.observe('invoices', invoice); const p = authority(a, true); tx.guard(p.sql, ...p.params) }
 await fence(env, a)
 return { ...basis, fingerprint: sha256(canonicalJson(basis)), status: 'awaiting-finance-approval',
  notice: 'First overdue monthly period only. Simple percentage of current unpaid principal, rounded half up to cents and capped by the frozen agreement. No issuance, sending, receivable or cash effect.' }
}
export const lateFeePreview = (env: Bindings, a: Actor, input: Value) => lateFeeBasis(env, a, input)

export async function lateFeeCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action !== 'invoice:late-fee-draft') return null
 const preview = await lateFeeBasis(env, a, input, tx)
 need(text(input.fingerprint, 'Preview fingerprint') === preview.fingerprint, 'Late-fee inputs changed; review a fresh preview', 409)
 return tx.record('lateFeeDrafts', { ...preview, reason: text(input.reason, 'Draft reason'), preparedBy: a.session.operator.id, preparedAt: Date.now() }, undefined, undefined, action)
}
