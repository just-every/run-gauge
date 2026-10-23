import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, sum, csv, flag } from './model'
import { type Actor, Transaction, finance, all, get, fence } from './store'

export const timeModes = ['service', 'task', 'person', 'phase', 'project', 'entry'] as const
export const expenseModes = ['itemized', 'category'] as const
export const presentationDefaults = { timeMode: 'service', expenseMode: 'category', attachDetail: true, footer: '', additionalDetails: '', logo: null }
export function presentationOptions(input: Value, base: Value = presentationDefaults) {
 const value = { ...base }
 for (const key of ['timeMode', 'expenseMode', 'footer', 'additionalDetails', 'attachDetail']) if (input[key] !== undefined) value[key] = input[key]
 need(timeModes.includes(value.timeMode), 'Choose a supported time presentation')
 need(expenseModes.includes(value.expenseMode), 'Choose itemized expenses or category totals')
 value.attachDetail = flag(value.attachDetail)
 for (const key of ['footer', 'additionalDetails']) { need(typeof value[key] === 'string' && value[key].length <= 4000, 'Document text is limited to 4000 characters'); value[key] = value[key].trim() }
 // A small formatting vocabulary has no links, remote images, attributes or executable content.
 need(!/<(?!\/?(?:b|strong|i|em|p|br)\s*\/?\s*>)/i.test(value.additionalDetails), 'Additional details allow only paragraphs, line breaks, bold and italic text')
 return value
}
export async function invoiceSettingsCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value) {
 if (action !== 'invoice:settings') return null
 need(finance(a), 'Finance access required', 403)
 const clientId = input.clientId || null
 if (clientId) { const client = await get(env, 'clients', text(clientId, 'Client')); need(!client.value.mergedInto, 'Choose the surviving client'); tx.observe('clients', client) }
 const rows = await all(env, 'invoiceSettings'), old = rows.find(r => r.value.clientId === clientId)
 if (old) need(input.id === old.id && input.revision === old.revision, 'Invoice settings changed; reload before saving', 409)
 else tx.guard("NOT EXISTS(SELECT 1 FROM g_invoiceSettings WHERE json_extract(data,'$.clientId') IS ?)", clientId)
 const settings = presentationOptions(input, old?.value ?? presentationDefaults)
 if (input.clearLogo === true || input.clearLogo === 'on') settings.logo = null
 if (input.file instanceof File && input.file.size) {
  need(input.file.size <= 131072 && ['image/png', 'image/jpeg'].includes(input.file.type), 'Upload a PNG or JPEG logo up to 128 KiB')
  const bytes = new Uint8Array(await input.file.arrayBuffer()); let binary = ''; for (const b of bytes) binary += String.fromCharCode(b)
  settings.logo = { mediaType: input.file.type, base64: btoa(binary) }
 }
 return tx.record('invoiceSettings', { ...settings, clientId, reason: text(input.reason, 'Reason for the settings change'), setBy: a.session.operator.id, setAt: Date.now() }, old, undefined, action)
}
export async function selectedPresentation(env: Bindings, tx: Transaction, clientId: string, input: Value) {
 const rows = await all(env, 'invoiceSettings'), agency = rows.find(r => r.value.clientId === null), client = rows.find(r => r.value.clientId === clientId)
 // Bind absence too: a concurrently created default cannot silently change an issued document.
 for (const id of [null, clientId]) { const row = rows.find(r => r.value.clientId === id); if (row) tx.observe('invoiceSettings', row); else tx.guard("NOT EXISTS(SELECT 1 FROM g_invoiceSettings WHERE json_extract(data,'$.clientId') IS ?)", id) }
 return presentationOptions(input, { ...presentationDefaults, ...agency?.value, ...client?.value })
}
export async function presentationDocument(env: Bindings, tx: Transaction, packet: Row, client: Row, engagement: Row, lines: Value[], input: Value) {
 const settings = await selectedPresentation(env, tx, client.id, input)
 const profiles = await all(env, 'agencyProfiles'), profile = profiles[0]
 if (profile) tx.observe('agencyProfiles', profile)
 const detail: Value[] = []
 for (const line of lines) {
  const frozen = line.sourceSnapshot.value, source = line.kind==='timeSlices'?frozen.sourceSnapshot.value:frozen, time = line.kind === 'time' || line.kind === 'timeSlices'
  const person = source.personId ? await get(env, 'people', source.personId) : null, task = source.taskId ? await get(env, 'tasks', source.taskId) : null
  if (person) tx.observe('people', person); if (task) tx.observe('tasks', task)
  detail.push({ kind: line.kind, sourceId: line.sourceId, sourceRevision: line.sourceRevision, originalSourceId:line.kind==='timeSlices'?frozen.sourceId:line.sourceId, originalSourceRevision:line.kind==='timeSlices'?frozen.sourceRevision:line.sourceRevision, offsetSeconds:line.offsetSeconds??0, date: line.sourceDate,
   personId:person?.id??null,taskId:task?.id??null,person: person?.value.name ?? '', task: task?.value.name ?? '', service: source.service ?? '', phase: source.phaseKey ?? line.phaseKey ?? '', project: engagement.value.name,
   notes: source.notes ?? source.description ?? line.description ?? '', actualSeconds: time ? source.durationSeconds ?? line.durationSeconds ?? null : null,
   billedSeconds: time ? line.roundedBillingSeconds ?? source.economics?.roundedBillingSeconds ?? line.durationSeconds ?? null : null,
   rateMinor: line.billRateMinor ?? null, amountMinor: line.amountMinor, category: source.category ?? 'Uncategorized', vendor: source.vendor ?? '', receipts: source.attachmentIds ?? [],
  })
 }
 const groups = new Map<string, Value>()
 for (const row of detail) {
  const time = row.kind === 'time' || row.kind === 'timeSlices', expense = row.kind === 'expenses'
  const group = time ? settings.timeMode === 'entry' ? row.sourceId : String(row[settings.timeMode==='person'?'personId':settings.timeMode==='task'?'taskId':settings.timeMode] || 'Unassigned') : expense ? settings.expenseMode === 'category' ? row.category : row.sourceId : row.sourceId
  const key = JSON.stringify([time ? 'time' : row.kind, group])
  const label = time ? settings.timeMode === 'entry' ? `${row.date} · ${row.person} · ${row.task} · ${row.notes}` : `${settings.timeMode}: ${row[settings.timeMode] || 'Unassigned'}` : expense ? settings.expenseMode === 'category' ? `Expenses: ${row.category}` : `${row.date} · ${row.category} · ${row.vendor} · ${row.notes} · Receipts: ${row.receipts.join(', ') || 'none'}` : row.notes
  const current = groups.get(key) ?? { label, amountMinor: 0, sourceIds: [], actualSeconds: 0, billedSeconds: 0, rateMinor: row.rateMinor }
  current.amountMinor = sum([current.amountMinor, row.amountMinor]); current.sourceIds.push(row.sourceId)
  current.actualSeconds += row.actualSeconds ?? 0; current.billedSeconds += row.billedSeconds ?? 0
  if (current.rateMinor !== row.rateMinor) current.rateMinor = null
  groups.set(key, current)
 }
 const presentedLines = [...groups.values()]
 need(sum(presentedLines.map(r => r.amountMinor)) === packet.value.totalMinor && sum(detail.map(r => r.amountMinor)) === packet.value.totalMinor, 'Presentation does not reconcile to the approved packet', 409)
 return { format: 'gauge-invoice-document-v1', settings, agencyName: profile?.value.legalBusiness ?? 'Agency', address: profile?.value.billingAddress ?? null,
  clientName: client.value.legalName ?? client.value.name, project: engagement.value.name, currency: packet.value.currency, totalMinor: packet.value.totalMinor,
  lines: presentedLines, detail, packetId: packet.id, packetRevision: packet.revision }
}
export function invoiceDetailCsv(document: Value) {
 return csv([['kind', 'source id', 'source revision', 'date', 'person', 'task', 'service', 'phase', 'project', 'notes', 'actual seconds', 'billed seconds', 'rate minor', 'amount minor', 'currency', 'category', 'vendor', 'receipt references', 'original source id', 'original source revision', 'offset seconds'],
  ...document.detail.map((r: Value) => [r.kind, r.sourceId, r.sourceRevision, r.date, r.person, r.task, r.service, r.phase, r.project, r.notes, r.actualSeconds, r.billedSeconds, r.rateMinor, r.amountMinor, document.currency, r.category, r.vendor, r.receipts.join(', '), r.originalSourceId, r.originalSourceRevision, r.offsetSeconds])])
}
export async function assertDocumentReader(env: Bindings, a: Actor) { need(finance(a), 'Finance access required', 403); await fence(env, a) }
