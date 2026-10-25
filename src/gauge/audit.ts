import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, finance, fence } from './store'
import { type Kind, type Value, date, kinds, need, workDate } from './model'
import { redact } from './reports'

// GOVERN-005 searchable business audit. g_audit holds one append-only row per native record write (people and
// agents), grant change, API key event, packet export, agency setup and import effect, in commit order. Each row
// is sealed into one SHA-256 chain: hash = SHA-256(canonical JSON of {previous: the prior row's hash, or the
// genesis label for the first row, entry: the row's fields}). Pending rows are sealed in sequence before every
// command and every audit read, so at most the latest command's rows wait for the next one. Verification
// recomputes the chain, reports edited rows, missing sequence numbers and unsealed rows, and compares an earlier
// export's head (sequence and hash) as a checkpoint. Favorites are private to their person (TIME-003): their rows
// are withheld as hash-only stubs so the chain still verifies. No row holds a key, token, password or session.
export const GENESIS = 'gauge-audit-v1'
interface AuditRow { seq: number; at: number; actor: string; role: string | null; person_id: string | null; request_key: string | null; action: string; kind: string; record_id: string; previous_revision: string | null; revision: string | null; data: string; reference: string | null; hash: string | null }
const fields = (r: AuditRow) => ({ seq: r.seq, at: r.at, actor: r.actor, role: r.role, personId: r.person_id, requestKey: r.request_key, action: r.action, kind: r.kind, recordId: r.record_id, previousRevision: r.previous_revision, revision: r.revision, data: JSON.parse(r.data), reference: r.reference })
export const chainHash = (previous: string, r: AuditRow) => sha256(canonicalJson({ previous, entry: fields(r) }))
const ownerPrivate = (kind: string) => ['providerConnections','providerUses','providerJobs','providerSyncs','providerFollowups','providerInstallation','retentionPolicies','privacyExits','privacyErasures','operationalCases','caseEvents','kantataAdoptions','agencyProfiles'].includes(kind)
const withheld = (kind: string, a:Actor, data?:string) => kind === 'timeFavorites' || (a.role!=='owner'&&(ownerPrivate(kind)||kind==='commercialEvents'&&String(JSON.parse(data??'{}').type).startsWith('signature-')))
const PAGE = 500

/** Mirrors import effects (attributed to the job's principal and operation key) once per direction. */
async function mirrorImports(env: Bindings) {
 const at = Date.now(), mirror = (action: string, reversed: string) => env.DB.prepare(`INSERT OR IGNORE INTO g_audit(at,actor,request_key,action,kind,record_id,data,reference) SELECT ?,j.principal_id,j.operation_key,'${action}',p.target_kind,p.target_id,json_object('job',p.job_id,'namespace',j.namespace,'sourceIdentity',p.source_identity,'provenance',json(p.record_json)),p.id FROM ik_provenance p JOIN ik_jobs j ON j.id=p.job_id WHERE ${reversed} NOT EXISTS(SELECT 1 FROM g_audit g WHERE g.action='${action}' AND g.reference=p.id) ORDER BY p.job_id,p.ordinal,p.effect_ordinal`).bind(at)
 await env.DB.batch([mirror('import:apply', ''), mirror('import:undo', 'p.reversed=1 AND')])
}

/** Seals pending rows in sequence order. Deterministic, so concurrent sealers write the same hashes. */
export async function seal(env: Bindings, imports = false) {
 if (imports) await mirrorImports(env)
 for (;;) {
  const head = await env.DB.prepare('SELECT seq,hash FROM g_audit WHERE hash IS NOT NULL ORDER BY seq DESC LIMIT 1').first<{ seq: number; hash: string }>()
  const pending = (await env.DB.prepare('SELECT * FROM g_audit WHERE seq>? ORDER BY seq LIMIT ?').bind(head?.seq ?? 0, PAGE).all<AuditRow>()).results
  if (!pending.length) return
  let previous = head?.hash ?? GENESIS
  await env.DB.batch(pending.map(r => { previous = chainHash(previous, r); return env.DB.prepare('UPDATE g_audit SET hash=? WHERE seq=? AND hash IS NULL').bind(previous, r.seq) }))
  if (pending.length < PAGE) return
 }
}

async function* rows(env: Bindings) {
 for (let after = 0; ;) {
  const page = (await env.DB.prepare('SELECT * FROM g_audit WHERE seq>? ORDER BY seq LIMIT ?').bind(after, PAGE).all<AuditRow>()).results
  for (const r of page) yield r
  if (page.length < PAGE) return
  after = page.at(-1)!.seq
 }
}

/** Recomputes the whole chain. A mismatch continues from the stored hash, so each edited row is named; a checkpoint
 * is compared with the chain recomputed from genesis alone, so any change up to it, stored hashes included, fails it. */
export async function verifyAudit(env: Bindings, checkpoint?: { seq: number; hash: string }) {
 let previous = GENESIS, recomputed = GENESIS, last = 0, entries = 0, checkpointMatches: boolean | null = checkpoint ? false : null
 const mismatches: number[] = [], unsealed: number[] = [], gaps: { after: number; before: number }[] = []
 for await (const r of rows(env)) {
  entries++
  if (r.seq !== last + 1) gaps.push({ after: last, before: r.seq })
  const computed = chainHash(previous, r)
  if (r.hash === null) unsealed.push(r.seq)
  else if (r.hash !== computed) mismatches.push(r.seq)
  recomputed = chainHash(recomputed, r)
  if (checkpoint && r.seq === checkpoint.seq) checkpointMatches = recomputed === checkpoint.hash && !gaps.length
  previous = r.hash ?? computed; last = r.seq
 }
 return { entries, head: { seq: last, hash: last ? previous : GENESIS }, mismatches, gaps, unsealed, checkpoint: checkpoint ? { ...checkpoint, matches: checkpointMatches } : null, intact: !mismatches.length && !gaps.length && !unsealed.length && checkpointMatches !== false }
}

export interface AuditQuery { kind?: string | null; recordId?: string | null; actor?: string | null; action?: string | null; text?: string | null; from?: string | null; to?: string | null }
const decisions = /:(approve|return|decline|withdraw|correct|reopen|adjust|close|cancel|revoke|limit|assign|apply|convert|undo)\b|^grant$|^apikey:|^import:/
const referenceKeys = ['reviewId','method','status','notice','source', 'sourceId', 'sourceIdentity', 'externalId', 'importJobId', 'provenance', 'results', 'result', 'receiver', 'proposalId', 'opportunityId', 'correctsPacketId']
const policyKeys = ['policyId', 'policyRevision', 'policy', 'reviewAboveMinor', 'approvalPolicyId', 'approvalPolicyRevision', 'rules', 'ruleVersion']
const pick = (value: Value | null, keys: string[]) => value ? Object.fromEntries(keys.filter(k => value[k] !== undefined && value[k] !== null).map(k => [k, value[k]])) : {}
const changed = (before: Value | null, after: Value) => [...new Set([...Object.keys(before ?? {}), ...Object.keys(after)])].filter(k => canonicalJson(before?.[k] ?? null) !== canonicalJson(after[k] ?? null)).sort()

/** One audit entry as finance reads it: who, when, what changed (previous and resulting values), decision, approval, policy, source and external references, and the row's chain hash. */
async function present(env: Bindings, a: Actor, r: AuditRow, names: Map<string, string>) {
 const k = r.kind as Kind, record = kinds.includes(k)
 const raw = JSON.parse(r.data) as Value, result = record ? redact(a, k, raw) : raw
 const prior = r.previous_revision && record ? await env.DB.prepare('SELECT data FROM g_history WHERE kind=? AND record_id=? AND revision=?').bind(r.kind, r.record_id, r.previous_revision).first<{ data: string }>() : null
 const previous = prior ? redact(a, k, JSON.parse(prior.data)) : null
 const internalApproval = result.changeOrder&&result.reviewStatus==='approved' ? {by:result.reviewedBy,byName:names.get(result.reviewedBy)??null,at:result.reviewedAt,label:'Internal approval'} : null
 const approval = internalApproval ?? (result.approvedBy && result.approvedBy !== previous?.approvedBy ? { by: result.approvedBy, byName: names.get(result.approvedBy) ?? null, at: result.approvedAt ?? null } : null)
 return {
  seq: r.seq, at: new Date(r.at).toISOString(), atMs: r.at, actor: { id: r.actor, name: names.get(r.actor) ?? (r.actor.startsWith('key:') ? `API key ${r.actor.slice(4)}` : null), role: r.role ?? (r.action.startsWith('import:') ? 'import job' : null), personId: r.person_id },
  automated: r.role === 'agent' || r.actor.startsWith('key:') || r.action.startsWith('import:'),
  action: r.action, decision: decisions.test(r.action), kind: r.kind, recordId: r.record_id, previousRevision: r.previous_revision, revision: r.revision,
  previous, result, changes: changed(previous, result), approval, policy: pick(result, policyKeys), requestKey: r.request_key,
  references: { ...pick(result, referenceKeys), ...(r.reference ? { importEffect: r.reference } : {}) }, hash: r.hash,
  history: record ? `/api/gauge/history/${r.kind}/${r.record_id}` : null,
 }
}

export const operatorNames = async (env: Bindings) => new Map((await env.DB.prepare('SELECT id,display_name FROM oa_operators').all<{ id: string; display_name: string }>()).results.map(o => [o.id, o.display_name]))

/** Finance and the owner search the audit; newest first, at most 500 entries per read. */
export async function auditSearch(env: Bindings, a: Actor, q: AuditQuery) {
 need(finance(a), 'Finance or the owner reads the business audit', 403)
 await seal(env, true)
 const from = q.from ? date(q.from) : null, to = q.to ? date(q.to) : null
 if (from && to) need(from <= to, 'The audit search ends on or after its start')
 const where: string[] = ["kind<>'timeFavorites'"], params: unknown[] = []
 if(a.role!=='owner')where.push("NOT(kind='commercialEvents' AND json_extract(data,'$.type') IN ('signature-binding','signature-evidence'))","kind NOT IN ('providerConnections','providerUses','providerJobs','providerSyncs','providerFollowups','providerInstallation')")
 if (q.kind) { where.push('kind=?'); params.push(q.kind) }
 if (q.recordId) { where.push('record_id=?'); params.push(q.recordId.trim()) }
 if (q.actor) { where.push('actor=?'); params.push(q.actor) }
 if (q.action) { where.push('action LIKE ?'); params.push(`${q.action.trim()}%`) }
 if (q.text) { where.push("(instr(lower(data),lower(?))>0 OR instr(lower(record_id),lower(?))>0 OR instr(lower(action),lower(?))>0 OR instr(lower(COALESCE(request_key,'')),lower(?))>0)"); params.push(...Array(4).fill(q.text.trim())) }
 const names = await operatorNames(env), found: Awaited<ReturnType<typeof present>>[] = []
 // Dates are agency-calendar days (inclusive), read from newest to oldest.
 for (let before = Number.MAX_SAFE_INTEGER; found.length < 500;) {
  const page = (await env.DB.prepare(`SELECT * FROM g_audit WHERE ${where.join(' AND ')} AND seq<? ORDER BY seq DESC LIMIT ?`).bind(...params, before, PAGE).all<AuditRow>()).results
  for (const r of page) { const day = workDate(r.at, a.timezone); if ((!from || day >= from) && (!to || day <= to) && found.length < 500) found.push(await present(env, a, r, names)) }
  if (page.length < PAGE) break
  before = page.at(-1)!.seq
 }
 const verification = await verifyAudit(env)
 await fence(env, a)
 return { entries: found, head: verification.head, intact: verification.intact, timezone: a.timezone }
}

/** The complete audit as one file: every entry in sequence with the hashed fields, withheld favorites as stubs. */
export async function auditExport(env: Bindings, a: Actor) {
 need(finance(a), 'Finance or the owner exports the business audit', 403)
 await seal(env, true)
 const names = await operatorNames(env), entries: Value[] = []
 for await (const r of rows(env)) {
  if(r.kind==='leave'&&JSON.parse(r.data).personId!==a.personId){entries.push({seq:r.seq,kind:r.kind,withheld:'Private leave category',hash:r.hash,view:await present(env,a,r,names)});continue}
  entries.push(withheld(r.kind,a,r.data) ? { seq: r.seq, kind: r.kind, withheld: r.kind==='timeFavorites'?'Private to their person (TIME-003)':'Owner-only provider metadata (GOVERN-008)', hash: r.hash } : { ...fields(r), hash: r.hash, view: await present(env, a, r, names) })
 }
 const verification = await verifyAudit(env)
 await fence(env, a)
 return { format: GENESIS, chain: 'hash = SHA-256(canonical JSON {previous, entry}); entry = seq, at, actor, role, personId, requestKey, action, kind, recordId, previousRevision, revision, data, reference', exportedAt: new Date().toISOString(), timezone: a.timezone, head: verification.head, verification, entries }
}

export async function auditVerify(env: Bindings, a: Actor, seq: string | null, hash: string | null) {
 need(finance(a), 'Finance or the owner verifies the business audit', 403)
 await seal(env, true)
 need((seq === null) === (hash === null), 'A checkpoint needs both its sequence number and hash')
 const checkpoint = seq !== null && hash !== null ? (need(/^\d{1,15}$/.test(seq) && /^[0-9a-f]{64}$/.test(hash), 'Use a checkpoint from an audit export: seq and its 64-character hash'), { seq: Number(seq), hash }) : undefined
 const result = await verifyAudit(env, checkpoint)
 await fence(env, a)
 return result
}
