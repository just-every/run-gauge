import { cashBasis, cashReference, cashProbability, type CashBasis, type CashReference } from './cash-assumptions'
import { projectBillingData } from './consolidated-billing'
import { capBalances } from './budget-caps'
import { retainerConsumption } from './retainer-consumption'
import { retainerIssueDate } from './retainer-schedule'
import { retainerFees } from './retainer-fees'
import { type Row, type Kind, sum } from './model'
import { liveInvoices } from './invoice-standing'
import { acceptedDelivery } from './milestone-delivery'
import type { financeForecast } from './finance-forecast'

// FINANCE-002 revenue and expected cash by month, on the FINANCE-006 revenue basis and the FINANCE-007 cash basis for the
// records that exist today. Unissued hourly fees, retainer overages and billable expenses are invoiced monthly in arrears on
// the 1st of the next month; an approved fixed-fee milestone on its due date or later current acceptance date. Issued invoices replace their source schedule
// once, use their immutable actual issue/due dates, and deduct user-recorded receipts and issued credit notes (INVOICE-004)
// dated through the as-of day. A void dated through the as-of day removes its invoice; its reissue is a separate invoice,
// and the original lines still leave the schedule once, so written-down amounts are never expected again.
// Unissued receipt = invoice date + the client's payment terms (Net N days, "Net 30 assumed" while unset);
// an approved per-client days late adds the "historical timing" date; a date before the as-of day is placed in the as-of month
// and flagged past due, never in a past month. Expected cash = open amount × collection probability, round half up to the cent.
export const cashLabels = { issued: 'None issued', pending: 'No payments recorded', settled: 'No payments recorded', onTerms: 'on terms', historical: 'historical timing', pretax: 'pre-tax', collection: 'collection probability' }
type Forecast = ReturnType<typeof financeForecast>
const DAY = 86400000
const addDays = (day: string, days: number) => new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10)
const nextMonthStart = (month: string) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10) }
type CashMonth = { currency: string, month: string, revenueMinor: number, tentativeMinor: number, pipelineMinor: number, invoicesMinor: number, openMinor: number, expectedMinor: number, historicalOpenMinor: number, historicalExpectedMinor: number, pastDueMinor: number, engagements: string[] }
type ScheduledInvoice = { collectibleOpenMinor?: number, probabilityBasis?: CashBasis, inheritedBasis?: CashBasis, source: string, revenueMonth: string | null, invoiceDate: string, amountMinor: number, openMinor: number, issued: boolean, invoiceSnapshot: Row | null, promiseSnapshot?: Row, promised?:boolean, paymentSnapshots: Row[], creditSnapshots?: Row[], creditedMinor?: number, disputedMinor?: number, disputeSnapshot?: Row, assumption?: string }
const percentOf = (minor: number, percent: number) => Number((BigInt(minor) * BigInt(percent) + 50n) / 100n)
const milestoneInvoiceDate = (row: Row): string => acceptedDelivery(row.value) && row.value.delivery.decisions.at(-1).date > row.value.due ? row.value.delivery.decisions.at(-1).date : row.value.due

export function cashForecast(data: Record<string, Row[]>, forecast: Forecast) {
 const caps=capBalances(data)
 const balances=retainerConsumption({retainers:data.retainers??[],retainerPeriods:data.retainerPeriods??[],time:data.time??[],retainerCloses:data.retainerCloses??[],retainerAdjustments:data.retainerAdjustments??[]})
 const asOf = forecast.asOf, clients = new Map((data.clients ?? []).map(c => [c.id, c]))

 const place = (day: string) => (day < asOf ? asOf : day).slice(0, 7)
 const engagements = forecast.engagements.map(f => {
  // The client's finance-set Net N is used when set; "Net 30 assumed" appears only while it is unset (SETUP-002).
  const e = data.engagements.find(r => r.id === f.engagementId)!, client = clients.get(e.value.clientId), set = client?.value.paymentTermsDays ?? null, terms: number = set ?? 30
  const daysLate = client?.value.daysLate ?? null, percent = client?.value.collectionPercent ?? 100
  const incomplete = [...f.incomplete], sources = { ...f.sources, clients: client ? [client.id] : [], milestones: [...(f.sources.milestones ?? [])], invoices: [] as string[], payments: [] as string[], invoiceCorrections: [] as string[], fixedCharges: [] as string[],timeSlices:(data.timeSlices??[]).filter(s=>s.value.engagementId===e.id).map(s=>s.id),capWriteDowns:(data.capWriteDowns??[]).filter(s=>s.value.engagementId===e.id).map(s=>s.id),retainerSchedules:[] as string[],retainerCharges:[] as string[] }
  const billing=projectBillingData(data,e.id,asOf),actualInvoices=billing.invoices.filter(i=>i.value.issueDate<=asOf),receipts=billing.payments.filter(p=>p.value.date<=asOf),live=new Map(liveInvoices(billing,asOf).map(s=>[s.invoice.id,s]))
  const issuedMilestones = new Set<string>(), billedByMonth = new Map<string, number>()
  for (const invoice of actualInvoices.filter(i => !i.value.reissueOf)) for (const line of invoice.value.lines) {
   if(line.kind==='timeSlices'){const slice=(data.timeSlices??[]).find(s=>s.id===line.sourceId);const sourceDate=line.sourceDate??slice?.value.date;if(sourceDate){const month=sourceDate.slice(0,7);billedByMonth.set(month,sum([billedByMonth.get(month)??0,line.amountMinor]))}continue}
   if (line.kind === 'milestones' || line.kind === 'fixedCharges' || line.kind === 'retainerCharges' || line.kind === 'retainerPeriods') { issuedMilestones.add(line.sourceId); continue }
   // The issue command supports only hourly time, reimbursable expenses and fixed-fee milestones.
   // Prefer the frozen source date on the invoice over the current source revision.
   const source = (data[line.kind] ?? []).find(r => r.id === line.sourceId)
   const sourceDate = line.sourceDate ?? (line.kind === 'time' ? source?.value.workDate : line.kind === 'expenses' ? source?.value.date : null)
   if (!['time', 'expenses'].includes(line.kind) || !sourceDate) {
    incomplete.push(`invoices:${invoice.id}: source date unavailable for ${line.kind}:${line.sourceId}`)
    continue
   }
   if(line.kind==='time' && !['hourly','mixed'].includes(f.basis)) continue
   const month = sourceDate.slice(0, 7)
   billedByMonth.set(month, sum([billedByMonth.get(month) ?? 0, line.amountMinor]))
  }
  // Expected invoices: milestones on their due dates; every other committed fee of a month on the 1st of the next month.
  const invoices: ScheduledInvoice[] = []
  const basis = (key: string, invoiceDate: string, amountMinor: number, references: CashReference[], net = terms) => cashBasis(key, e.id, e.value.clientId, f.currency, invoiceDate, amountMinor, net, references)
  const references = (source: string): CashReference[] => {
   const [kind, id] = source.split(':')
   const row = data[kind]?.find(r => r.id === id)
   if (row) return [cashReference(kind as Kind, row)]
   return Object.entries(f.sources).flatMap(([k, ids]) => (ids as string[]).flatMap(id => {const r = data[k]?.find(r => r.id === id); return r ? [cashReference(k as Kind, r)] : []})).sort((a,b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
  }
  const retainerReferences = (period: Row, charge?: Row) => {
   const frozen = charge?.value, term = frozen?.termsSnapshot ?? data.retainers.find(r => r.id === period.value.retainerId)!
   const savedPeriod = frozen?.periodSnapshot ?? period, configured = (data.retainerSchedules ?? []).find(s => s.value.rootId === period.value.rootId && period.value.activeStart >= s.value.from)
   return [cashReference('retainerPeriods', savedPeriod), cashReference('retainers', term), ...(frozen?.scheduleId ? [{kind: 'retainerSchedules' as const, id: frozen.scheduleId, revision: frozen.scheduleRevision}] : configured ? [cashReference('retainerSchedules', configured)] : [])]
  }
  const schedule = (source: string, revenueMonth: string, invoiceDate: string, amountMinor: number, assumption?: string, refs = references(source)) => invoices.push({ probabilityBasis: basis(source, invoiceDate, amountMinor, refs), source, revenueMonth, invoiceDate, amountMinor, openMinor: amountMinor, issued: false, invoiceSnapshot: null, paymentSnapshots: [], ...(assumption ? { assumption } : {}) })
  const milestones = ['fixed','mixed'].includes(f.basis) ? (data.milestones ?? []).filter(m => m.value.engagementId === e.id && m.value.status === 'approved') : []
  for (const m of milestones) { if (!sources.milestones.includes(m.id)) sources.milestones.push(m.id); if (!issuedMilestones.has(m.id)) schedule(`milestones:${m.id}`, m.value.due.slice(0, 7), milestoneInvoiceDate(m), m.value.amountMinor) }
  for (const charge of (data.fixedCharges??[]).filter(c=>c.value.engagementId===e.id&&c.value.status==='approved')) {
   (sources.fixedCharges??=[]).push(charge.id)
   if (!issuedMilestones.has(charge.id)) schedule(`fixedCharges:${charge.id}`,charge.value.date.slice(0,7),charge.value.date,charge.value.amountMinor)
  }
  if(f.basis==='retainer')for(const fee of retainerFees(data,asOf).filter(p=>p.engagementId===e.id&&p.totalMinor!==null)){
   const period=data.retainerPeriods.find(p=>p.id===fee.periodId)!,configured=(data.retainerSchedules??[]).find(s=>s.value.rootId===period.value.rootId&&period.value.activeStart>=s.value.from)
   const charge=(data.retainerCharges??[]).find(c=>c.value.periodId===fee.periodId)
   if(configured)sources.retainerSchedules.push(configured.id);if(charge)sources.retainerCharges.push(charge.id)
   if(!charge||!issuedMilestones.has(charge.id))schedule(`retainerPeriods:${fee.periodId}`,fee.periodStart.slice(0,7),charge?.value.date??(configured?retainerIssueDate(period,configured.value.basis):fee.activeStart),fee.totalMinor!,configured?'Contractual retainer schedule; not issued':'Assumed in advance on active period start, not issued; RETAINER-005 sets the schedule',retainerReferences(period,charge))
  }
  const periodOverages=f.basis==='retainer'?balances.filter(b=>b.engagementId===e.id&&b.overageMinor>0):[]
  for(const balance of periodOverages){
   const period=data.retainerPeriods.find(p=>p.id===balance.periodId)!,policy=(data.retainerSchedules??[]).find(s=>s.value.rootId===period.value.rootId)
   if(policy&&!sources.retainerSchedules.includes(policy.id))sources.retainerSchedules.push(policy.id)
   if(issuedMilestones.has(period.id))continue
   const held=policy?.value.heldPeriodIds.includes(period.id)
   invoices.push({source:`retainerPeriods:${period.id}:overage`,revenueMonth:period.value.periodEnd.slice(0,7),invoiceDate:addDays(period.value.periodEnd,1),amountMinor:balance.overageMinor,openMinor:held?0:balance.overageMinor,issued:false,invoiceSnapshot:null,paymentSnapshots:[],...(held?{disputedMinor:balance.overageMinor,assumption:'Disputed retainer overage held; not expected as cash'}:{})})
  }
  for (const month of f.months) {
   const cap=caps.find(c=>c.engagementId===e.id),held=cap?sum(cap.rows.filter(r=>r.workDate.slice(0,7)===month.month).map(r=>r.heldMinor??0)):0,written=sum((data.capWriteDowns??[]).filter(w=>w.value.engagementId===e.id&&w.value.status==='approved'&&w.value.sourceSnapshot.value.workDate.slice(0,7)===month.month).map(w=>w.value.amountMinor))
   const cycle = month.committedFeesMinor - held - written - month.periodFeesMinor - sum(periodOverages.filter(b=>data.retainerPeriods.find(p=>p.id===b.periodId)!.value.periodEnd.slice(0,7)===month.month).map(b=>b.overageMinor)) - sum(milestones.filter(m => m.value.due.slice(0, 7) === month.month).map(m => m.value.amountMinor)) - (billedByMonth.get(month.month) ?? 0)
   if (cycle) schedule(`cycle:${month.month}`, month.month, nextMonthStart(month.month), cycle)
  }
  for (const invoice of actualInvoices) {
   const standing = live.get(invoice.id)
   if (!standing) { sources.invoiceCorrections.push(...(data.invoiceCorrections ?? []).filter(c => c.value.invoiceId === invoice.id && c.value.type === 'void' && c.value.status === 'issued').map(c => c.id)); continue }
   const payments = receipts.filter(p => p.value.invoiceId === invoice.id)
   sources.invoices.push(invoice.id); sources.payments.push(...payments.map(p => p.id)); sources.invoiceCorrections.push(...standing.credits.map(c => c.id))
   const paidMinor = sum(payments.map(p => p.value.amountMinor))
   const openMinor=invoice.value.totalMinor-paidMinor-standing.creditedMinor
   const promise=(billing.paymentPromises??[]).filter(p=>p.value.invoiceId===invoice.id).at(-1)
   // INVOICE-006/FINANCE-007: a standing dispute is listed apart and never expected as cash until it is resolved.
   const dispute=(billing.invoiceDisputes??[]).filter(x=>x.value.invoiceId===invoice.id&&x.value.openedDate<=asOf&&(x.value.status==='open'||x.value.resolvedDate>asOf)).at(-1)
   const disputed=dispute?Math.min(openMinor,dispute.value.amountMinor):0
   const promised=promise?Math.min(openMinor-disputed,promise.value.amountMinor):0
   const invoiceBasis = basis(`invoices:${invoice.id}`, invoice.value.issueDate, data.invoices.find(i => i.id === invoice.id)!.value.totalMinor, [cashReference('invoices', invoice)], invoice.value.paymentTermsDays)
   const explicit = cashProbability(data,e.id,invoiceBasis,client).decisionSnapshot
   const lineBases = invoice.value.lines.map((line: any) => {
    const snapshot = line.sourceSnapshot as Row | undefined
    if (!snapshot || line.amountMinor <= 0) return null
    if (line.kind === 'retainerCharges') return basis(`retainerPeriods:${snapshot.value.periodId}`, snapshot.value.date, line.amountMinor, retainerReferences(snapshot.value.periodSnapshot, snapshot), invoice.value.paymentTermsDays)
    if (['milestones','fixedCharges'].includes(line.kind)) return basis(`${line.kind}:${line.sourceId}`, line.kind === 'milestones' ? milestoneInvoiceDate(snapshot) : snapshot.value.date, line.amountMinor, [cashReference(line.kind, snapshot)], invoice.value.paymentTermsDays)
    return null
   }) as (CashBasis | null)[]
   const inherited = !explicit && lineBases.some(b => b && cashProbability(data,e.id,b,client).assumptionSnapshot)
   const netWeights: number[] = invoice.value.lines.map((l: any, index: number) => Math.max(0,l.amountMinor-sum(standing.credits.flatMap(c => (c.value.lines ?? []).filter((credit: any) => credit.index === index).map((credit: any) => credit.amountMinor)))))
   const weights: number[] = inherited ? sum(netWeights)>0 ? netWeights : invoice.value.lines.map((l: any) => Math.max(0,l.amountMinor)) : [invoice.value.totalMinor]
   const totalWeight = sum(weights)
   let cumulative = 0, remainingPromised = promised
   for (const [index, weight] of weights.entries()) {
    const before = cumulative; cumulative += weight
    const portion = (amount: number) => Number((BigInt(amount)*BigInt(cumulative)+BigInt(Math.floor(totalWeight/2)))/BigInt(totalWeight)) - Number((BigInt(amount)*BigInt(before)+BigInt(Math.floor(totalWeight/2)))/BigInt(totalWeight))
    const lineOpen = portion(openMinor-disputed), linePromised = Math.min(remainingPromised,lineOpen); remainingPromised -= linePromised
    const inheritedBasis = inherited ? lineBases[index] ?? undefined : undefined
    const source = `invoices:${invoice.id}${inherited ? `:line:${index}` : ''}`
    const common = {collectibleOpenMinor: lineOpen, probabilityBasis: invoiceBasis, ...(inheritedBasis ? {inheritedBasis} : {}), revenueMonth:null, invoiceDate:invoice.value.issueDate, issued:true, invoiceSnapshot:invoice}
    if (promised) invoices.push({...common,source:source+':promise',amountMinor:0,openMinor:linePromised,promiseSnapshot:promise,promised:true,paymentSnapshots:[]})
    invoices.push({...common,source,amountMinor:portion(invoice.value.totalMinor),openMinor:lineOpen-linePromised,paymentSnapshots:index===0?payments:[],creditSnapshots:index===0?standing.credits:[],creditedMinor:index===0?standing.creditedMinor:0,disputedMinor:portion(disputed),...(disputed?{disputeSnapshot:dispute}:{})})
   }
  }
  const items = invoices.map(x => {
   const receiptDate = x.promiseSnapshot?.value.date ?? x.invoiceSnapshot?.value.dueDate ?? addDays(x.invoiceDate, terms), historicalDate = x.promised ? receiptDate : daysLate === null ? null : addDays(receiptDate, daysLate)
   const probabilityBasis = x.probabilityBasis ?? basis(x.source,x.invoiceDate,x.amountMinor,references(x.source))
   const direct = cashProbability(data,e.id,probabilityBasis,client)
   const inherited = x.inheritedBasis && !direct.decisionSnapshot ? cashProbability(data,e.id,x.inheritedBasis,client) : null
   const probability = inherited?.assumptionSnapshot ? {...inherited, probabilitySource:'scheduled source override'} : direct
   return { ...x, collectibleOpenMinor: x.collectibleOpenMinor ?? x.openMinor, probabilityBasis, ...probability, invoiceId: x.invoiceSnapshot?.id ?? null, paidMinor: x.promised?0:sum(x.paymentSnapshots.map(p=>p.value.amountMinor)), invoiceMonth: x.invoiceDate.slice(0, 7), receiptDate, cashMonth: place(receiptDate), pastDue: x.openMinor > 0 && receiptDate < asOf, historicalDate, historicalMonth: historicalDate && place(historicalDate), expectedMinor: percentOf(x.openMinor, probability.collectionPercent) }
  }).sort((x, y) => x.invoiceDate.localeCompare(y.invoiceDate) || x.source.localeCompare(y.source))
  return { engagementId: e.id, name: e.value.name, clientId: e.value.clientId, currency: f.currency, basis: f.basis, paymentTermsDays: terms, termsLabel: set === null ? 'Net 30 assumed' : `Net ${terms}`, daysLate, daysLateApprovedBy: client?.value.daysLateApprovedBy ?? null, collectionPercent: percent,
   bookedRevenueMinor: f.actualFeesMinor, backlogMinor: f.eacFeesMinor - f.actualFeesMinor, items, complete: incomplete.length === 0, incomplete: [...new Set(incomplete)], sources }
 })
 // One invoice decision has one rounded expected amount, even when promises,
 // source lines or project shares place it in several rows. Allocate its cents
 // cumulatively, with promised portions first, so a date move creates no cash.
 type CashPart = {engagementId: string; item: (typeof engagements)[number]['items'][number]}
 const probabilityGroups = new Map<string, CashPart[]>()
 for (const engagement of engagements) for (const item of engagement.items) {
  if (!item.invoiceId) continue
  const key = JSON.stringify([item.invoiceId, item.assumptionSnapshot?.id ?? null, item.collectionPercent])
  const group = probabilityGroups.get(key) ?? []
  group.push({engagementId: engagement.engagementId, item}); probabilityGroups.set(key, group)
 }
 for (const group of probabilityGroups.values()) {
  group.sort((a,b) => Number(!!b.item.promised)-Number(!!a.item.promised) || a.engagementId.localeCompare(b.engagementId) || a.item.source.localeCompare(b.item.source))
  let through = 0
  for (const {item} of group) {
   const before = through; through += item.openMinor
   item.expectedMinor = percentOf(through,item.collectionPercent)-percentOf(before,item.collectionPercent)
  }
 }
 // Per currency and month: committed revenue (FINANCE-006), expected invoices, and cash on terms and at historical timing.
 const months: Record<string, Record<string, CashMonth>> = {}
 const at = (currency: string, month: string) => (months[currency] ??= {})[month] ??= { currency, month, revenueMinor: 0, tentativeMinor: 0, pipelineMinor: 0, invoicesMinor: 0, openMinor: 0, expectedMinor: 0, historicalOpenMinor: 0, historicalExpectedMinor: 0, pastDueMinor: 0, engagements: [] }
 for (const f of forecast.engagements) for (const m of f.months) { const row = at(f.currency, m.month); row.revenueMinor += m.committedFeesMinor; row.tentativeMinor += m.tentativeFeesMinor }
 for (const p of forecast.pipeline) for (const m of p.months) at(p.currency, m.month).pipelineMinor += m.weightedMinor
 for (const e of engagements) for (const x of e.items) {
  at(e.currency, x.invoiceMonth).invoicesMinor += x.amountMinor
  const cash = at(e.currency, x.cashMonth); cash.openMinor += x.openMinor; cash.expectedMinor += x.expectedMinor; if (x.pastDue) cash.pastDueMinor += x.openMinor
  const late = at(e.currency, x.historicalMonth ?? x.cashMonth); late.historicalOpenMinor += x.openMinor; late.historicalExpectedMinor += x.expectedMinor
  for (const row of [cash, late]) if (!row.engagements.includes(e.engagementId)) row.engagements.push(e.engagementId)
 }
 // A month is incomplete when any engagement in its currency has an incomplete FINANCE-006 forecast.
 const unplaced = engagements.filter(e => !e.complete)
 const list = Object.values(months).flatMap(byMonth => Object.values(byMonth)).sort((x, y) => x.currency.localeCompare(y.currency) || x.month.localeCompare(y.month)).map(row => {
  const complete = !unplaced.some(e => e.currency === row.currency)
  return { ...row, complete, rangeLowMinor: Math.min(row.expectedMinor, row.historicalExpectedMinor), rangeHighMinor: Math.max(row.expectedMinor, row.historicalExpectedMinor) }
 })
 const issuedItems = engagements.flatMap(e => e.items.filter(i => i.issued).map(i => ({ currency: e.currency, ...i })))
 const issuedTotals = [...new Set(issuedItems.map(i => i.currency))].sort().map(currency => {
  const items = issuedItems.filter(i => i.currency === currency)
  return { currency, invoicedMinor: sum(items.map(i => i.amountMinor)), creditedMinor: sum(items.map(i => i.creditedMinor ?? 0)), paidMinor: sum(items.map(i => i.paidMinor)), disputedMinor: sum(items.map(i => i.disputedMinor ?? 0)), openMinor: sum(items.map(i => i.openMinor + (i.disputedMinor ?? 0))) }
 })
 const paymentTotals = issuedTotals.filter(t => issuedItems.some(i => i.currency === t.currency && i.paymentSnapshots.length)).map(t => ({ currency: t.currency, amountMinor: t.paidMinor }))
 const processor=(data.processorPayments??[]).filter(p=>new Date(p.value.lastReadAt??p.value.recordedAt??0).toISOString().slice(0,10)<=asOf)
 const pending=[...new Set(processor.map(p=>p.value.currency))].map(currency=>({currency,amountMinor:sum(processor.filter(p=>p.value.currency===currency).map(p=>p.value.pendingMinor??0))})).filter(p=>p.amountMinor>0)
 const settled=[...new Set(processor.map(p=>p.value.currency))].map(currency=>({currency,amountMinor:sum(processor.filter(p=>p.value.currency===currency).map(p=>(p.value.allocatedMinor??0)+(p.value.unappliedMinor??0)))})).filter(p=>p.amountMinor>0)
 const manualTotals=issuedTotals.map(t=>({currency:t.currency,amountMinor:sum((data.payments??[]).filter(p=>p.value.currency===t.currency&&p.value.source!=='stripe'&&p.value.date<=asOf).map(p=>p.value.amountMinor))})).filter(t=>t.amountMinor>0)
 const format = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`
 return { asOf, labels: cashLabels, processorPendingTotals:pending, processorSettledTotals:settled, engagements, months: list, issuedTotals, paymentTotals,
  issuedReceivables: issuedTotals.length ? issuedTotals.map(t => `${format(t.openMinor, t.currency)} open${t.disputedMinor ? ` (${format(t.disputedMinor, t.currency)} disputed, not expected as cash)` : ''}`).join('; ') : cashLabels.issued,
  recordedCash: manualTotals.length ? `${manualTotals.map(t => format(t.amountMinor, t.currency)).join('; ')} user-recorded receipts; not processor-verified or settled` : cashLabels.pending,
  pendingCash: pending.length ? pending.map(p=>format(p.amountMinor,p.currency)+' processor pending').join('; ') : paymentTotals.length ? 'No processor-pending cash recorded; manual receipts are user-recorded' : cashLabels.pending,
  settledCash: settled.length ? settled.map(p=>format(p.amountMinor,p.currency)+' processor settled').join('; ') : paymentTotals.length ? 'No processor-verified settlement; manual receipts are user-recorded' : cashLabels.settled }
}
