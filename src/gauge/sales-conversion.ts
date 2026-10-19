import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, sum } from './model'
import { type Actor, Transaction, finance, get } from './store'

/**
 * SALES-004: finance converts one won opportunity into one client engagement with a draft fixed-fee
 * budget for the won value and effort, and one open resource request per listed service. The
 * opportunity and its engagement link both ways; converting again returns the same engagement.
 * Demand splits evenly by service, then by every inclusive date of the won window, in whole seconds;
 * what does not divide stays on the opportunity as unplacedSeconds.
 */
export async function conversionCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | null> {
 if (action !== 'opportunity:convert') return null
 need(finance(a), 'Finance converts won work into engagements', 403)
 const opportunity = await get(env, 'opportunities', text(input.id, 'Opportunity')), o = opportunity.value
 if (o.engagementId) return get(env, 'engagements', o.engagementId)
 need(opportunity.revision === input.revision, 'Opportunity changed; reload before converting', 409)
 need(o.stage === 'won', 'Only won work converts to an engagement', 409)
 need(o.currency === a.currency, 'Currency differs; no implicit FX')
 const client = await get(env, 'clients', o.clientId), lead = await get(env, 'people', o.ownerId)
 tx.observe('clients', client); tx.observe('people', lead)
 const engagement = await tx.record('engagements', { type: 'client', clientId: client.id, leadId: lead.id, name: o.name, scope: `Won opportunity ${o.name}: ${o.services}`, currency: o.currency, timezone: a.timezone, members: [], opportunityId: opportunity.id }, undefined, undefined, action)
 const budget = await tx.record('budgets', { engagementId: engagement.id, currency: o.currency, mode: 'fixed', amountMinor: o.amountMinor, effortSeconds: o.demandSeconds, roundingSeconds: 60, reason: `Won opportunity ${o.name}`, status: 'draft', createdAt: Date.now(), opportunityId: opportunity.id }, undefined, undefined, action)
 const services = [...new Set(String(o.services).split(',').map(s => s.trim()).filter(Boolean))]
 const days = (Date.parse(o.to) - Date.parse(o.from)) / 86400000 + 1, dailySeconds = Math.min(86400, Math.floor(Math.floor(o.demandSeconds / services.length) / days))
 const requests: Row[] = []
 if (dailySeconds > 0) for (const service of services) requests.push(await tx.record('resourceRequests', { engagementId: engagement.id, role: service, skill: service, minProficiency: 1, from: o.from, to: o.to, dailySeconds, service, billable: true, team: '', location: '', employmentType: '', status: 'open', opportunityId: opportunity.id }, undefined, undefined, action))
 const placedSeconds = sum(requests.map(() => dailySeconds * days))
 await tx.record('opportunities', { ...o, engagementId: engagement.id, conversion: { engagementId: engagement.id, budgetId: budget.id, resourceRequestIds: requests.map(r => r.id), unplacedSeconds: o.demandSeconds - placedSeconds, convertedAt: Date.now(), convertedBy: a.session.operator.id }, updatedAt: Date.now(), updatedBy: a.session.operator.id }, opportunity, undefined, action)
 return engagement
}
