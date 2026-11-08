import type { Bindings } from '../auth.server'
import { type Value, need, text } from './model'
import { type Actor, finance, fence, get } from './store'
import { scenarioData, scenarioObservation, observationSources, observationBasis, observationHash } from './scenario-observations'

async function read(env: Bindings, a: Actor, input: Value) {
 need(a.session.kind === 'native' && finance(a), 'Outcome comparisons require a native owner or finance session', 403)
 need(Object.keys(input).every(k => ['action','key','id','revision','basisDigest'].includes(k)), 'Supply scenario references only; outcome figures and success claims are not accepted')
 await fence(env,a)
 const row = await get(env,'projectScenarios',text(input.id,'Adopted scenario'))
 need(row.revision === input.revision, 'Scenario revision changed; select the adopted revision', 409)
 need(row.value.status === 'adopted' && !row.value.changeOrder, 'Choose an adopted native financial scenario', 409)
 const approved = row.value.approvedComparison, retained = approved?.observation
 need(retained?.basis === observationBasis, 'Incompatible or absent retained calculation basis; historical predictions cannot be reconstructed', 409)
 need(retained.asOf === approved.asOf && retained.from === approved.from && retained.to === approved.to, 'Incompatible retained comparison window', 409)
 const data = await scenarioData(env), sources = observationSources(data)
 need(retained.currencies.every((c: Value) => data.engagements.some(p => p.id === c.engagementId && p.value.currency === c.currency)) && retained.projectIds.length === retained.currencies.length, 'Project set or currency basis changed; comparison is incompatible', 409)
 const digest = observationHash({ scenario: {id:row.id,revision:row.revision}, sources })
 return { row, approved, retained, data, sources, digest }
}
export async function recoveryOutcome(env: Bindings, a: Actor, action: string, input: Value) {
 const { row, retained, data, sources, digest } = await read(env,a,input)
 if (action === 'recovery:outcome-compare') need(input.basisDigest === digest, 'Observed sources changed; capture current revisions again', 409)
 const observed = scenarioObservation(data,retained.projectIds,retained.asOf,retained.from,retained.to)
 const difference = (left: number | null, right: number | null) => left === null || right === null ? null : right-left
 const projects = retained.projectIds.map((engagementId: string) => {
  const before = retained.before.projects.find((p: Value) => p.engagementId === engagementId), expected = retained.expected.projects.find((p: Value) => p.engagementId === engagementId), current = observed.projects.find(p => p.engagementId === engagementId)!
  need(before && expected && current, 'Retained project calculation basis is incomplete', 409)
  return { engagementId, currency:current.currency, marginImprovementMinor:difference(before.marginMinor,current.marginMinor), marginVarianceMinor:difference(expected.marginMinor,current.marginMinor), costVarianceMinor:difference(expected.eacCostMinor,current.eacCostMinor), feesVarianceMinor:difference(expected.eacFeesMinor,current.eacFeesMinor) }
 })
 const months = [...new Set<string>([retained.before,retained.expected,observed].flatMap(s => s.cash.months.map((m: Value) => `${m.currency}:${m.month}`)))].sort().map(key => {
  const [currency,month] = key.split(':')
  const amount = (snapshot: Value, field: string) => {
   const complete = snapshot.cash.engagements.filter((p: Value) => p.currency === currency).every((p: Value) => p.complete)
   return complete ? snapshot.cash.months.find((m: Value) => m.currency === currency && m.month === month)?.[field] ?? 0 : null
  }
  const before = amount(retained.before,'expectedMinor'), expected = amount(retained.expected,'expectedMinor'), current = amount(observed,'expectedMinor')
  const historicalBefore = amount(retained.before,'historicalExpectedMinor'), historicalExpected = amount(retained.expected,'historicalExpectedMinor'), historicalObserved = amount(observed,'historicalExpectedMinor')
  return { currency,month,historicalBeforeMinor:historicalBefore,historicalExpectedMinor:historicalExpected,historicalObservedMinor:historicalObserved,beforeMinor:before,expectedMinor:expected,observedMinor:current,varianceMinor:difference(expected,current),improvementMinor:difference(before,current),historicalVarianceMinor:difference(amount(retained.expected,'historicalExpectedMinor'),amount(observed,'historicalExpectedMinor')) }
 })
 const dateVariances = retained.projectIds.map((engagementId: string) => {
  const dates = [retained.before,retained.expected,observed].map(s => s.dates.find((d: Value) => d.engagementId === engagementId))
  const finish = dates.map(d => d?.finish ?? null)
  return {engagementId,beforeFinish:finish[0],expectedFinish:finish[1],observedFinish:finish[2],finishVarianceDays:finish[1] && finish[2] ? (Date.parse(finish[2])-Date.parse(finish[1]))/86400000 : null}
 })
 const loads = [...new Set<string>([retained.before,retained.expected,observed].flatMap(s => s.loads.map((p: Value) => p.personId)))].flatMap(personId => {
  const people = [retained.before,retained.expected,observed].map(s => s.loads.find((p: Value) => p.personId === personId))
  return [...new Set<string>(people.flatMap(p => p?.days.map((d: Value) => d.date) ?? []))].sort().map(date => {
   const days = people.map(p => p?.days.find((d: Value) => d.date === date)), [before,expected,current] = days
   return { personId,date,beforeSeconds:before?.committedSeconds ?? 0,expectedSeconds:expected?.committedSeconds ?? 0,observedSeconds:current?.committedSeconds ?? 0,varianceSeconds:(current?.committedSeconds ?? 0)-(expected?.committedSeconds ?? 0),beforeAvailableSeconds:before?.availableSeconds ?? null,expectedAvailableSeconds:expected?.availableSeconds ?? null,observedAvailableSeconds:current?.availableSeconds ?? null,capacityVarianceSeconds:difference(expected?.availableSeconds ?? null,current?.availableSeconds ?? null) }
  }).filter(d => d.beforeSeconds || d.expectedSeconds || d.observedSeconds)
 })
 const expectedSources = new Map<string,Value>(retained.sources.map((s: Value) => [`${s.kind}:${s.id}`,s]))
 for (const effect of row.value.effects) expectedSources.set(`${effect.kind}:${effect.id}`,effect)
 const currentSources = new Map(sources.map(s => [`${s.kind}:${s.id}`,s]))
 const changedInputs = [...new Set([...expectedSources.keys(),...currentSources.keys()])].sort().flatMap(key => {
  const expected = expectedSources.get(key), current = currentSources.get(key)
  return expected?.revision === current?.revision ? [] : [{kind:current?.kind ?? expected!.kind,id:current?.id ?? expected!.id,expectedRevision:expected?.revision ?? null,observedRevision:current?.revision ?? null,change:!expected?'added':!current?'removed':'revised'}]
 })
 // Double read includes inserts and deletes. Never return figures from a drifting read.
 const again = await read(env,a,input)
 need(again.digest === digest, 'Concurrent source change; capture current revisions again', 409)
 await fence(env,a)
 const capture = { id:row.id,revision:row.revision,basisDigest:digest }
 if (action === 'recovery:outcome-capture') return capture
 return { ...capture, basis:retained.basis,asOf:retained.asOf,from:retained.from,to:retained.to,projectIds:retained.projectIds,
  adoptedBy:row.value.adoptedBy,adoptedAt:row.value.adoptedAt,selectedIds:row.value.selectedIds,effects:row.value.effects,
  before:retained.before,expected:retained.expected,observed,projects,months,loads,dateVariances,changedInputs,
  sources:{before:retained.sources,expected:[...expectedSources.values()],observed:sources},
  unknowns:[...new Set([...([['Before',retained.before],['Expected',retained.expected],['Observed',observed]] as const).flatMap(([label,snapshot]) => [...snapshot.projects.flatMap((p: Value)=>p.incomplete),...snapshot.cash.engagements.flatMap((p: Value)=>p.incomplete)].map(s=>`${label}: ${s}`)),...loads.filter(d=>d.observedAvailableSeconds===null).map(d=>`Dated capacity unknown: ${d.personId} on ${d.date}`)])],
  boundaries:['Read-only native observation; no approval, recovery completion or case status is granted','Manual receipts are user-recorded, not bank or processor verified','Provider outcomes unobserved; cross-system freshness and settlement qualification remain unproved','Historical before and expected figures are frozen observations; current native changes are variance, never a rewritten baseline','FINANCE-006 margin and supported FINANCE-007 expected cash; original projects, currencies, as-of day and capacity window remain fixed'] }
}
