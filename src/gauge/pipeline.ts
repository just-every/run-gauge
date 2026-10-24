import { projectBillingData } from './consolidated-billing'
import type { Bindings } from '../auth.server'
import { liveInvoices } from './invoice-standing'
import { type Row, type Value, need, text, date, integer, money, sum } from './model'
import { type Actor, Transaction, finance, get, access } from './store'
import { activeClient } from './clients'

export async function opportunityCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (action !== 'save:opportunities') return null
 need(finance(a) || a.role === 'lead', 'Lead or finance access required', 403)
 const previous = input.id ? await get(env, 'opportunities', input.id) : undefined
 if (previous) {
  need(finance(a) || previous.value.ownerId === a.personId, 'This opportunity belongs to another lead', 403)
  need(previous.revision === input.revision, 'Opportunity changed; reload before saving', 409)
 }
 const owner = await get(env, 'people', text(input.ownerId, 'Opportunity owner'))
 need(finance(a) || owner.id === a.personId, 'Leads manage their own opportunities', 403)
 const client = await activeClient(env, input.clientId)
 tx.observe('people', owner); tx.observe('clients', client)
 need(['discovery', 'qualified', 'proposal', 'won', 'lost'].includes(input.stage), 'Choose an opportunity stage')
 const from = date(input.from), to = date(input.to)
 need(to >= from, 'Proposed end is before start')
 const probability = integer(input.probability, 'Probability percent', 0, 100)
 need(input.stage !== 'won' || probability === 100, 'Won work has 100% probability')
 need(input.stage !== 'lost' || probability === 0, 'Lost work has 0% probability')
 const engagementId = input.engagementId || null
 if (engagementId) {
  need(input.stage === 'won', 'Only won work links to signed delivery')
  const engagement = await access(env, a, text(engagementId, 'Engagement'), true)
  need(engagement.value.clientId === client.id, 'Opportunity and engagement must have the same client')
  need(engagement.value.currency === a.currency, 'Currency differs; no implicit FX')
  tx.observe('engagements', engagement)
 }
 const currency = previous?.value.currency ?? a.currency
 need(input.currency === undefined || input.currency === currency, 'Currency differs; no implicit FX')
 return tx.record('opportunities', {
  name: text(input.name, 'Opportunity', 200), clientId: client.id, ownerId: owner.id,
  stage: input.stage, probability, from, to, services: text(input.services, 'Services'),
  amountMinor: money(input.amountMinor), demandSeconds: integer(input.demandSeconds, 'Tentative staffing demand seconds'),
  currency, engagementId, updatedAt: Date.now(), updatedBy: a.session.operator.id,
 }, previous, undefined, previous ? 'update' : 'create')
}

/** Open demand is never written into the signed staffing calendar. Linked won
 * work uses its approved commercial terms once; an unconverted win uses its
 * recorded won value. Booked values are before billing, not cash forecasts.
 * With `billedAsOf` (finance only: leads never read invoice amounts), billed
 * is the pre-tax total of live native invoices issued on or before that day, less their issued
 * credit notes (INVOICE-004; a voided original drops out and its reissue counts once), for the
 * engagements that carry booked value, and backlog is booked minus billed in
 * minor units; it goes negative when billing exceeds booked value. */
export function pipeline(data: Record<string, Row[]>, billedAsOf: string | null = null) {
 const open = data.opportunities.filter(r => !['won', 'lost'].includes(r.value.stage))
 const won = data.opportunities.filter(r => r.value.stage === 'won')
 const currencies = [...new Set([...data.opportunities.map(r => r.value.currency), ...data.engagements.map(r => r.value.currency)])]
 return currencies.map(currency => {
  const weighted = open.filter(r => r.value.currency === currency).map(r => ({ id: r.id, revision: r.revision, amountMinor: Number((BigInt(r.value.amountMinor) * BigInt(r.value.probability) + 50n) / 100n), demandSeconds: r.value.demandSeconds }))
  const booked: { source: string, engagementId: string | null, amountMinor: number }[] = data.engagements.filter(e => e.value.currency === currency).flatMap(e => {
   const terms = data.budgets.filter(b => b.value.engagementId === e.id && b.value.status === 'approved').sort((a, b) => b.value.approvedAt - a.value.approvedAt)[0]
   const opportunity = won.find(r => r.value.engagementId === e.id)
   return terms ? [{ source: `budgets:${terms.id}`, engagementId: e.id, amountMinor: terms.value.amountMinor }] : opportunity ? [{ source: `opportunities:${opportunity.id}`, engagementId: e.id, amountMinor: opportunity.value.amountMinor }] : []
  })
  for (const r of won.filter(r => r.value.currency === currency && !r.value.engagementId)) booked.push({ source: `opportunities:${r.id}`, engagementId: null, amountMinor: r.value.amountMinor })
  const bookedMinor = sum(booked.map(r => r.amountMinor))
  const engagementIds = new Set(booked.flatMap(r => r.engagementId ? [r.engagementId] : []))
  const standings = billedAsOf === null ? [] : [...engagementIds].flatMap(id=>liveInvoices(projectBillingData(data,id,billedAsOf),billedAsOf)).filter(s=>s.invoice.value.currency===currency), billedMinor = sum(standings.map(s => s.netMinor))
  const billing = billedAsOf === null ? { billedMinor: null, backlogMinor: null } : { billedMinor, backlogMinor: bookedMinor - billedMinor }
  return { currency, ...billing, billedInvoices: [...new Set(standings.map(s => s.invoice.id))], billedCredits: [...new Set(standings.flatMap(s => s.credits.map(c => c.id)))], weightedMinor: sum(weighted.map(r => r.amountMinor)), tentativeDemandSeconds: sum(weighted.map(r => r.demandSeconds)), bookedMinor, weighted, booked }
 })
}
