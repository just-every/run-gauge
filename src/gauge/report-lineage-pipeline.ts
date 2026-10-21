import { sum } from './model'
import { type Evidence, Lineage } from './report-lineage-shared'

export function pipelineLineage(c: Lineage) {
 for (const group of c.report.pipeline) {
  const prefix = `pipeline:${group.currency}:`, weighted = c.evidence(), booked = c.evidence()
  const include = (target: Evidence, source: Evidence) => {
   for (const s of source.sources) c.row(target, s.kind, s.id)
   target.unknown.push(...source.unknown)
  }
  let knownWeighted = 0, knownDemand = 0, knownBooked = 0
  for (const item of group.weighted) {
   const e = c.evidence(), row = c.row(e, 'opportunities', item.id)
   if (row && row.revision !== item.revision) e.unknown.push(`opportunities:${item.id}: weighted revision differs from source`)
   if (row && row.value.currency !== group.currency) e.unknown.push(`opportunities:${item.id}: source currency differs; no implicit FX`)
   if (!e.unknown.length) { knownWeighted = sum([knownWeighted, item.amountMinor]); knownDemand = sum([knownDemand, item.demandSeconds]) }
   c.add(prefix + `weighted:${item.id}:amountMinor`, 'Probability-weighted opportunity', item.amountMinor, 'minor', 'For each open opportunity (stage neither won nor lost): floor((amountMinor × probability + 50) / 100), using exact integer arithmetic; rounding occurs per opportunity.', e, group.currency, row ? item.amountMinor : 0)
   c.add(prefix + `weighted:${item.id}:demandSeconds`, 'Open tentative opportunity demand', item.demandSeconds, 'seconds', 'Open opportunity.demandSeconds, unweighted; this demand is separate from signed staffing.', e)
   include(weighted, e)
  }
  for (const [index, item] of group.booked.entries()) {
   const e = c.evidence(), [kind, id] = String(item.source).split(':'), row = c.row(e, kind, id)
   if (row && row.value.currency !== group.currency) e.unknown.push(`${item.source}: source currency differs; no implicit FX`)
   if (kind === 'budgets' && row) {
    c.row(e, 'engagements', row.value.engagementId)
    for (const opportunity of c.rows('opportunities').filter(r => r.value.stage === 'won' && r.value.engagementId === row.value.engagementId)) c.row(e, 'opportunities', opportunity.id)
   } else if (kind === 'opportunities' && row?.value.engagementId) c.row(e, 'engagements', row.value.engagementId)
   if (!e.unknown.length) knownBooked = sum([knownBooked, item.amountMinor])
   c.add(prefix + `booked:${index}:amountMinor`, 'Booked source value', item.amountMinor, 'minor', 'Latest approved budget.amountMinor per engagement; if absent, linked won opportunity.amountMinor. Unlinked wins count once. Lost/open opportunities excluded. Booked value is before billing, not cash.', e, group.currency, row ? item.amountMinor : 0)
   include(booked, e)
  }
  c.add(prefix + 'weightedMinor', 'Weighted open pipeline', group.weightedMinor, 'minor', 'SUM(each open opportunity amountMinor × probability, rounded half-up to minor units per opportunity). Excludes won and lost stages; no implicit FX.', weighted, group.currency, knownWeighted)
  c.add(prefix + 'tentativeDemandSeconds', 'Open tentative demand', group.tentativeDemandSeconds, 'seconds', 'SUM(open opportunity.demandSeconds) without probability weighting; excludes won/lost and signed staffing.', weighted, null, knownDemand)
  c.add(prefix + 'bookedMinor', 'Booked value before billing', group.bookedMinor, 'minor', 'SUM(latest approved budget per engagement, otherwise linked won value) + SUM(unlinked won opportunity value). Each signed engagement counts once; no billing/cash deduction or currency conversion.', booked, group.currency, knownBooked)
  if (group.billedMinor !== null) {
   const billed = c.evidence()
   for (const id of group.billedInvoices) {
    const e = c.evidence(), row = c.row(e, 'invoices', id)
    if (row && row.value.currency !== group.currency) e.unknown.push(`invoices:${id}: source currency differs; no implicit FX`)
    include(billed, e)
   }
   const knownBilled = billed.unknown.length ? null : group.billedMinor
   c.add(prefix + 'billedMinor', 'Billed against booked value', group.billedMinor, 'minor', 'SUM(totalMinor of native invoices, pre-tax, issued on or before the as-of day for engagements carrying booked value). Credit notes arrive with INVOICE-004; no cash or receipt deduction, no currency conversion.', billed, group.currency, knownBilled ?? 0)
   const backlog = c.evidence()
   include(backlog, booked); include(backlog, billed)
   c.add(prefix + 'backlogMinor', 'Booked backlog', group.backlogMinor, 'minor', 'Booked value before billing − billed against booked value; negative when billing exceeds booked value. Equals booked value while no invoice is issued.', backlog, group.currency, knownBilled === null ? 0 : sum([knownBooked, -knownBilled]))
  }
 }
}

export function correctionLineage(c: Lineage) {
 for (const review of c.report.correctionReviews ?? []) {
  const e = c.evidence(), seen = new Set<string>()
  let id: string | undefined = review.packetId
  while (id) {
   if (seen.has(id)) { e.unknown.push(`packets:${id}: correction ancestry cycle`); break }
   seen.add(id)
   const row = c.row(e, 'packets', id)
   if (!row) break
   if (id === review.packetId && row.revision !== review.revision) e.unknown.push(`packets:${id}: review revision differs from source`)
   if (row.value.status !== 'approved') e.unknown.push(`packets:${id}: correction ancestry is not approved`)
   id = row.value.correctsPacketId || undefined
  }
  const packet = c.rows('packets').find(r => r.id === review.packetId)
  const currency = packet?.value.currency ?? null
  if (!currency) e.unknown.push(`packets:${review.packetId}: currency unavailable`)
  for (const source of review.sources) {
   c.add(`corrections:${review.packetId}:${source.kind}:${source.sourceId}:currentAmountMinor`, 'Reviewed billing source amount', source.currentAmountMinor, 'minor', 'Original approved packet line.amountMinor, replaced by correctedAmountMinor for this source at each approved descendant in ancestry order. Frozen sourceRevision, rateId, budgetId, rate and rounding remain on packet lines.', e, currency)
  }
  c.add(`corrections:${review.packetId}:currentAmountMinor`, 'Reviewed billing total', sum(review.sources.map((s: {currentAmountMinor: number}) => s.currentAmountMinor)), 'minor', 'SUM(currentAmountMinor across original source lines after applying each approved correction in ancestry order); correction deltas do not replace the original artifact.', e, currency)
 }
}
