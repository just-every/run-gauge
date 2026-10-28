import { mergeCustomValues } from './custom-values'
// SETUP-002 / SETUP-007 / SETUP-008 client and contact workspace. Finance keeps each client's legal name, billing and project contacts,
// addresses, tax and exemption references, PO requirement and numbers, tags and external IDs beside the FINANCE-002 / FINANCE-009 / FINANCE-010
// payment terms, searches clients by name, PO or external ID, and merges a duplicate into a surviving client.
import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, flag } from './model'
import { type Actor, Transaction, finance, get, all, fence } from './store'
import { activeRates } from './rate-cards'

/** Workspace fields only finance sees; others keep seeing the client's name, as before. */
export const privateClientKeys = ['paymentTermsDays', 'daysLate', 'daysLateApprovedBy', 'collectionPercent', 'legalName', 'contacts', 'addresses', 'taxId', 'exemptions', 'poRequired', 'poNumbers', 'tags', 'externalIds', 'merge', 'mergedFrom']
const optional = (v: unknown, name: string, max = 200) => v === undefined || v === null || String(v).trim() === '' ? null : text(String(v), name, max)
const lines = (v: unknown): unknown[] => Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
const parts = (v: unknown, keys: string[]): Value => typeof v === 'string' ? Object.fromEntries(v.split(';').map((s, i) => [keys[i], s.trim()])) : { ...(v as Value) }
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)
function words(v: unknown, name: string, max = 100): string[] {
 const out: string[] = []
 for (const w of Array.isArray(v) ? v : String(v ?? '').split(',')) { const s = optional(w, name, max); if (s && !out.some(x => x.toLowerCase() === s.toLowerCase())) out.push(s) }
 need(out.length <= 50, `${name}: at most 50`); return out
}
function contacts(v: unknown) {
 const out = lines(v).map(item => {
  const c = parts(item, ['role', 'name', 'email', 'phone']), role = String(c.role ?? '').trim().toLowerCase(), email = optional(c.email, 'Contact email', 254)
  need(['billing', 'project'].includes(role), 'Each contact is a billing or project contact')
  need(!email || /^[^\s@;]+@[^\s@;]+\.[^\s@;]+$/.test(email), 'Use a valid contact email')
  return { role, name: text(String(c.name ?? ''), 'Contact name', 200), email, phone: optional(c.phone, 'Contact phone', 50) }
 })
 need(out.length <= 50, 'At most 50 contacts'); return out
}
function addresses(v: unknown) {
 const out = lines(v).map(item => {
  const x = parts(item, ['purpose', 'line1', 'line2', 'city', 'region', 'postalCode', 'country']), purpose = String(x.purpose ?? '').trim().toLowerCase(), country = (optional(x.country, 'Country', 2) ?? 'US').toUpperCase()
  need(['billing', 'legal', 'project'].includes(purpose), 'Each address is a billing, legal or project address')
  need(/^[A-Z]{2}$/.test(country), 'Country is a two-letter ISO 3166 code')
  return { purpose, line1: text(String(x.line1 ?? ''), 'Address line 1', 200), line2: optional(x.line2, 'Address line 2'), city: text(String(x.city ?? ''), 'City', 100), region: optional(x.region, 'State or region', 100), postalCode: optional(x.postalCode, 'Postal code', 20), country }
 })
 need(out.length <= 20, 'At most 20 addresses'); return out
}
function externalIds(v: unknown) {
 const out: { system: string, id: string }[] = []
 for (const item of lines(Array.isArray(v) ? v : String(v ?? '').replaceAll(',', '\n'))) {
  const x = typeof item === 'string' ? (need(item.includes(':'), 'Write each external ID as system:id'), { system: item.slice(0, item.indexOf(':')), id: item.slice(item.indexOf(':') + 1) }) : item as Value
  const system = String(x.system ?? '').trim().toLowerCase(), id = text(String(x.id ?? ''), 'External ID', 200)
  need(/^[a-z0-9][a-z0-9._-]{0,39}$/.test(system), 'An external ID system is a short name such as hubspot or quickbooks')
  if (!out.some(o => o.system === system && o.id === id)) out.push({ system, id })
 }
 need(out.length <= 50, 'At most 50 external IDs'); return out
}
/** Every external identity a client carries: its import source and the IDs finance recorded or merged in. */
export const identities = (v: Value): { system: string, id: string }[] => [...(v.source ? [{ system: String(v.source.namespace), id: String(v.source.externalId) }] : []), ...(v.externalIds ?? [])]

/** The posted workspace fields; a field left out of the request keeps its saved value. */
export function clientDetails(input: Value, previous?: Value): Value {
 const keep = (key: string, parse: (v: unknown) => unknown, empty: unknown) => input[key] === undefined ? previous?.[key] ?? empty : parse(input[key])
 return {
  legalName: keep('legalName', v => optional(v, 'Legal name'), null), contacts: keep('contacts', contacts, []), addresses: keep('addresses', addresses, []),
  taxId: keep('taxId', v => optional(v, 'Tax ID reference', 100), null), exemptions: keep('exemptions', v => words(v, 'Exemption certificate reference'), []),
  poRequired: keep('poRequired', flag, false), poNumbers: keep('poNumbers', v => words(v, 'PO number'), []), tags: keep('tags', v => words(v, 'Tag', 50), []),
  externalIds: keep('externalIds', externalIds, []), mergedFrom: previous?.mergedFrom ?? [], ...(previous?.source ? { source: previous.source } : {}),
 }
}

/** An external identity belongs to one active client, so a search by it finds exactly that client. */
export async function claimIdentities(env: Bindings, tx: Transaction, value: Value, id = '') {
 const owners = (await all(env, 'clients')).filter(r => r.id !== id && !r.value.merge)
 for (const x of identities(value)) {
  const owner = owners.find(r => identities(r.value).some(o => o.system === x.system && o.id === x.id))
  need(!owner, `External ID ${x.system}:${x.id} already belongs to ${owner?.value.name}; merge the duplicate client instead`, 409)
  tx.guard(`NOT EXISTS(SELECT 1 FROM g_clients c WHERE c.id<>? AND json_extract(c.data,'$.merge') IS NULL AND ((json_extract(c.data,'$.source.namespace')=? AND json_extract(c.data,'$.source.externalId')=?) OR EXISTS(SELECT 1 FROM json_each(c.data,'$.externalIds') e WHERE json_extract(e.value,'$.system')=? AND json_extract(e.value,'$.id')=?)))`, id, x.system, x.id, x.system, x.id)
 }
}

/** A client new work may name: merged duplicates send people to their surviving client. */
export async function activeClient(env: Bindings, id: string): Promise<Row> {
 const client = await get(env, 'clients', text(id, 'Client'))
 need(!client.value.merge, 'This client was merged into another client; choose the surviving client', 409)
 return client
}

const terms = (v: Value) => ({ paymentTermsDays: v.paymentTermsDays ?? null, daysLate: v.daysLate ?? null, collectionPercent: v.collectionPercent ?? 100 })
export const termsLabel = (v: Value) => `${v.paymentTermsDays == null ? 'Net 30 assumed' : `Net ${v.paymentTermsDays}`}${v.daysLate == null ? '' : `, ${v.daysLate} days late`}, ${v.collectionPercent ?? 100}% collection`

export async function clientCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Value | null> {
 if (action !== 'client:merge') return null
 need(finance(a), 'Finance access required', 403)
 // A page form names the surviving client as "id@revision"; programs send the two fields.
 const [survivorId, survivorRevision] = input.survivor ? String(input.survivor).split('@') : [input.survivorId, input.survivorRevision]
 const survivor = await get(env, 'clients', text(survivorId, 'Surviving client')), duplicate = await get(env, 'clients', text(input.duplicateId, 'Duplicate client'))
 need(survivor.id !== duplicate.id, 'Choose two different clients')
 need(survivor.revision === survivorRevision && duplicate.revision === input.duplicateRevision, 'A client changed; reload before merging', 409)
 need(!survivor.value.merge && !duplicate.value.merge, 'A merged client cannot take part in another merge', 409)
 const reason = text(input.reason, 'Merge reason', 500), s = survivor.value, d = duplicate.value
 // Payment terms, days late and collection probability travel as one set; differing sets need finance's explicit choice.
 const agreed = same(terms(s), terms(d))
 need(agreed || ['survivor', 'duplicate'].includes(input.terms), `Payment terms differ (${termsLabel(s)} against ${termsLabel(d)}); choose which terms the merged client keeps`, 409)
 const kept = agreed || input.terms === 'survivor' ? s : d
 // Client rate cards price future work by client; the duplicate's cards in force are withdrawn first, never silently moved.
 need(!activeRates(await all(env, 'rates'), await all(env, 'rateWithdrawals')).some(r => r.value.clientId === duplicate.id), 'The duplicate has client rate cards in force; withdraw them (RATE-002) before merging', 409)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_rates r WHERE json_extract(r.data,'$.clientId')=? AND NOT EXISTS(SELECT 1 FROM g_rateWithdrawals w WHERE json_extract(w.data,'$.rateId')=r.id))", duplicate.id)
 // Every linked engagement and opportunity moves to the surviving client as a new revision.
 for (const k of ['engagements', 'opportunities'] as const) for (const r of (await all(env, k)).filter(r => r.value.clientId === duplicate.id)) await tx.record(k, { ...r.value, clientId: survivor.id }, r, undefined, action)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_engagements WHERE json_extract(data,'$.clientId')=?) AND NOT EXISTS(SELECT 1 FROM g_opportunities WHERE json_extract(data,'$.clientId')=?)", duplicate.id, duplicate.id)
 const list = (key: string, eq: (x: any, y: any) => boolean = same) => [...(s[key] ?? []), ...(d[key] ?? []).filter((x: unknown) => !(s[key] ?? []).some((y: unknown) => eq(x, y)))]
 const word = (x: string, y: string) => x.toLowerCase() === y.toLowerCase(), own = identities({ source: s.source })
 const merged = {
  ...s, paymentTermsDays: kept.paymentTermsDays ?? null, daysLate: kept.daysLate ?? null, daysLateApprovedBy: kept.daysLate == null ? null : kept.daysLateApprovedBy ?? null, collectionPercent: kept.collectionPercent ?? 100,
  legalName: s.legalName ?? d.legalName ?? null, taxId: s.taxId ?? d.taxId ?? null, poRequired: Boolean(s.poRequired || d.poRequired),
  contacts: list('contacts'), addresses: list('addresses'), exemptions: list('exemptions', word), poNumbers: list('poNumbers', word), tags: list('tags', word),
  externalIds: [...(s.externalIds ?? []), ...identities(d)].filter((x, i, xs) => !own.some(o => same(o, x)) && xs.findIndex(y => same(x, y)) === i),
  mergedFrom: [...(s.mergedFrom ?? []), duplicate.id],
 }
 const custom=mergeCustomValues(s,d,input.customFieldChoices);const result = await tx.record('clients', merged, survivor, undefined, action,custom)
 await tx.record('clients', { ...d, merge: { into: survivor.id, reason, terms: agreed ? 'same' : input.terms, by: a.session.operator.id, at: new Date().toISOString() } }, duplicate, undefined, action)
 return result
}

/** Exact semantics: PO numbers, tags and external IDs (system:id or the bare id) match whole and case-insensitively;
 * names, legal names and contact names or emails match by contained text. Merged duplicates are never results. */
export function searchClients(clients: Row[], engagements: Row[], q: unknown) {
 const query = text(q, 'Search', 200).toLowerCase(), has = (x: unknown) => typeof x === 'string' && x.toLowerCase().includes(query)
 return clients.filter(r => !r.value.merge).flatMap(r => {
  const v = r.value, matches = [
   ...((v.poNumbers ?? []).some((p: string) => p.toLowerCase() === query) ? ['po'] : []),
   ...(identities(v).some(x => `${x.system}:${x.id}`.toLowerCase() === query || x.id.toLowerCase() === query) ? ['externalId'] : []),
   ...((v.tags ?? []).some((t: string) => t.toLowerCase() === query) ? ['tag'] : []),
   ...([v.name, v.legalName].some(has) ? ['name'] : []),
   ...((v.contacts ?? []).some((c: Value) => has(c.name) || has(c.email)) ? ['contact'] : []),
  ]
  return matches.length ? [{ id: r.id, revision: r.revision, name: v.name, legalName: v.legalName ?? null, matches, engagementIds: engagements.filter(e => e.value.clientId === r.id).map(e => e.id) }] : []
 })
}

/** GET /api/gauge/clients?q=: finance's client search. */
export async function clientSearchRead(env: Bindings, a: Actor, q: string | null) {
 need(finance(a), 'Finance access required', 403)
 const [clients, engagements] = await Promise.all([all(env, 'clients'), all(env, 'engagements')]), result = { query: String(q ?? '').trim(), clients: searchClients(clients, engagements, q) }
 await fence(env, a); return result
}
