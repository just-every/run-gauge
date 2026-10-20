import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, need, text, date, workDate } from './model'
import { type Actor, type Transaction, all, finance, fence, get } from './store'
import { capacity } from './reports'
import { financeForecast } from './finance-forecast'
import { cashForecast } from './cash-forecast'
import { retainerStatements } from './retainer-statements'
import { staffingAlternative } from './project-scenario-staffing'
import { rateAlternative } from './project-scenario-rates'
import { scopeAlternative } from './project-scenario-scope'
import { deadlineAlternative } from './project-scenario-deadlines'
import type { Alternative, ScenarioEffect } from './project-scenario-effects'

// FINANCE-003: every comparison uses the native committed forecast and cash basis.
// Full set guards include inserts/deletes as well as revision changes.
const basisKinds: Kind[] = ['clients','people','engagements','budgets','tasks','milestones','rates','rateWithdrawals','calendars','leave','staffing','time','expenses','retainers','retainerPeriods','retainerCloses','retainerAdjustments','deliveryPlans']
const hash = (value: unknown) => sha256(canonicalJson(value))
async function basis(env: Bindings, tx?: Transaction) {
 const data = Object.fromEntries(await Promise.all(basisKinds.map(async k => [k, await all(env,k)]))) as Record<Kind,Row[]>
 if(tx) for(const k of basisKinds) { for(const row of data[k])tx.observe(k,row);tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,data[k].length) }
 return data
}
function normalize(input: unknown): Value[] {
 need(Array.isArray(input) && input.length > 0 && input.length <= 20, 'Choose between 1 and 20 alternatives')
 const changes = input.map(c => {
  need(c && typeof c === 'object' && !Array.isArray(c), 'Provide an alternative')
  const type = c.type ?? 'staffing', id = text(c.id, 'Alternative ID', 200)
  need(['staffing','rate','deadline','scope'].includes(type), 'Choose staffing, rate, deadline or scope')
  if(type === 'rate') return {type,id,card:c.card}
  const revision = text(c.revision, 'Record revision')
  if(type === 'scope') return {type,id,revision,scope:c.scope,allocations:c.allocations,tasks:c.tasks,terms:c.terms}
  return type === 'staffing' ? {type,id,revision,personId:text(c.personId,'Replacement person'),effectiveFrom:date(c.effectiveFrom)} : {type,id,revision,nodeId:text(c.nodeId,'Delayed work'),delayBusinessDays:c.delayBusinessDays}
 })
 need(new Set(changes.map(c => c.id)).size === changes.length, 'An alternative appears twice')
 return changes.sort((a,b) => a.id.localeCompare(b.id))
}
async function compare(env: Bindings, a: Actor, data: Record<Kind,Row[]>, changes: Value[], asOf: string, tx?: Transaction) {
 const candidate = {...data}, alternatives: Alternative[] = [], effects: ScenarioEffect[] = [], changed = new Set<string>(), digest = hash(data)
 // First plan the dated work; rate applicability then includes a selected replacement.
 for(const change of [...changes.filter(c => c.type !== 'rate'), ...changes.filter(c => c.type === 'rate')]) {
  const alternative: Alternative = change.type === 'rate' ? await rateAlternative(env,a,candidate,change,asOf,tx) : change.type === 'scope' ? scopeAlternative(candidate,change,asOf,a) : change.type === 'deadline' ? await deadlineAlternative(env,a,data,change,asOf,tx) : staffingAlternative(data,change,asOf)
  alternatives.push(alternative)
  for(const [index,effect] of alternative.effects.entries()) {
   if(effect.source) {
    const key = `${effect.kind}:${effect.source.id}`
    need(!changed.has(key), 'Alternatives change the same source; compare them separately', 409); changed.add(key)
   }
   effect.id = effect.source?.id ?? `scenario:${hash({digest,change,kind:effect.kind,index})}`
   const row = {id:effect.id, revision:effect.source?.revision ?? 'scenario', value:effect.value}
   candidate[effect.kind] = effect.source ? candidate[effect.kind].map(r => r.id === effect.source!.id ? row : r) : [...candidate[effect.kind],row]
   effects.push(effect)
  }
 }
 const ids = new Set(alternatives.flatMap(p => p.engagementIds)), peopleIds = new Set(alternatives.flatMap(p => p.peopleIds)), dates = alternatives.flatMap(p => p.dates).sort()
 const from = dates[0] ?? asOf, to = dates.at(-1) ?? asOf
 need(Date.parse(to)-Date.parse(from) <= 366*86400000, 'Compare a window of at most one year')
 const forecastOf = (d: typeof data) => financeForecast(d,asOf,retainerStatements(d,d.time,undefined,d))
 const originalForecast = forecastOf(data), candidateForecast = forecastOf(candidate)
 // Shared-person overtime can change a project outside the edited card or scope.
 for(const p of candidateForecast.engagements) {
  const b = originalForecast.engagements.find(e=>e.engagementId===p.engagementId)
  if(b && hash([p.months,p.incomplete]) !== hash([b.months,b.incomplete]))ids.add(p.engagementId)
 }
 const project = (d: typeof data, forecast: ReturnType<typeof financeForecast>) => {
  const cash = cashForecast(d,{...forecast,engagements:forecast.engagements.filter(e => ids.has(e.engagementId)),pipeline:[]})
  const cap = capacity(d,from,to).filter(p => peopleIds.has(p.personId)).map(p => ({personId:p.personId,availableSeconds:p.availableSeconds,knownAvailableSeconds:p.knownAvailableSeconds,committedSeconds:p.committedSeconds,tentativeSeconds:p.tentativeSeconds,remainingSeconds:p.remainingSeconds,missingCalendarDays:p.missingCalendarDays,conflicts:p.conflicts,utilizationPercent:p.availableSeconds ? 100*p.committedSeconds/p.availableSeconds : null}))
  const projectDates = [...ids].sort().map(engagementId => ({
   engagementId, finish: d.deliveryPlans.filter(p => p.value.engagementId === engagementId).at(-1)?.value.schedule.finish ?? null,
   tasks: d.tasks.filter(r => r.value.engagementId === engagementId).map(r => ({id:r.id,from:r.value.from ?? null,to:r.value.to ?? null})),
   milestones: d.milestones.filter(r => r.value.engagementId === engagementId).map(r => ({id:r.id,due:r.value.due})),
   staffing: d.staffing.filter(r => r.value.engagementId === engagementId).map(r => ({id:r.id,personId:r.value.personId,from:r.value.from,to:r.value.to,dailySeconds:r.value.dailySeconds,commitment:r.value.commitment}))
  }))
  return {projects:forecast.engagements.filter(e => ids.has(e.engagementId)).map(e => ({...e,marginMinor:e.complete ? e.marginMinor : null,etcCostMinor:e.complete ? e.etcCostMinor : null,eacCostMinor:e.complete ? e.eacCostMinor : null,eacFeesMinor:e.complete ? e.eacFeesMinor : null})),cash,capacity:cap,dates:projectDates}
 }
 const baseline = project(data,originalForecast), scenario = project(candidate,candidateForecast)
 const deltas = scenario.projects.map(p => {const b = baseline.projects.find(b => b.engagementId === p.engagementId)!; const delta = (k:'etcCostMinor'|'eacCostMinor'|'eacFeesMinor'|'marginMinor') => p[k] === null || b[k] === null ? null : p[k]!-b[k]!; return {engagementId:p.engagementId,currency:p.currency,etcCostMinor:delta('etcCostMinor'),eacCostMinor:delta('eacCostMinor'),eacFeesMinor:delta('eacFeesMinor'),marginMinor:delta('marginMinor')}})
 return {from,to,asOf,changes,baseline,scenario,deltas,alternatives:alternatives.map(p => p.details),effects}
}
export async function projectScenarioPreview(env: Bindings, a: Actor, input: Value, tx?: Transaction) {
 need(finance(a), 'Financial scenarios require finance or owner access', 403)
 const data = await basis(env,tx), asOf = date(input.asOf ?? workDate(Date.now(),a.timezone))
 let changes: Value[], stored: Row | undefined
 if(input.id) {
  stored = await get(env,'projectScenarios',text(input.id,'Scenario'))
  need(stored.revision === input.revision && stored.value.status === 'prepared', 'Scenario changed or already adopted', 409)
  need(asOf === stored.value.asOf && hash(data) === stored.value.basisDigest, 'Scenario baseline changed; prepare a new scenario', 409)
  need(Array.isArray(input.selectedIds) && input.selectedIds.length > 0, 'Explicitly select the alternatives to adopt')
  const selected = input.selectedIds.map((id:unknown) => text(id,'Selected alternative'))
  need(new Set(selected).size === selected.length && selected.every((id:string) => stored!.value.changes.some((c:Value) => c.id === id)), 'Select each prepared alternative at most once')
  changes = normalize(stored.value.changes.filter((c:Value) => selected.includes(c.id)))
  if(tx)tx.observe('projectScenarios',stored)
 } else changes = normalize(input.changes)
 const {effects,...comparison} = await compare(env,a,data,changes,asOf,tx)
 const fingerprint = hash({basis:data,comparison,scenario:stored ? {id:stored.id,revision:stored.revision} : null})
 await fence(env,a)
 return {...comparison,fingerprint,basisDigest:hash(data)}
}
export async function projectScenarioCommand(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row|null> {
 if(!['projectScenario:prepare','projectScenario:adopt'].includes(action))return null
 need(finance(a), 'Financial scenarios require finance or owner access', 403)
 const preview = await projectScenarioPreview(env,a,input,tx)
 need(input.fingerprint === preview.fingerprint, 'Scenario inputs changed; review again', 409)
 if(action === 'projectScenario:prepare') {
  need(!input.id, 'Prepare a new immutable scenario')
  return tx.record('projectScenarios',{name:text(input.name,'Scenario name',200),reason:text(input.reason,'Scenario reason'),status:'prepared',preparedBy:a.session.operator.id,preparedAt:Date.now(),...preview})
 }
 need(input.id, 'Select a prepared scenario')
 need(preview.asOf === workDate(Date.now(),a.timezone), 'Review as of today before adopting future work', 409)
 const reason = text(input.reason,'Adoption reason'), stored = await get(env,'projectScenarios',input.id), data = await basis(env,tx)
 need(hash(data) === preview.basisDigest, 'Scenario baseline changed; review again', 409)
 const candidate = await compare(env,a,data,preview.changes,preview.asOf,tx), effects: Value[] = []
 // All guards above precede every write. A selected alternative is one atomic effect set.
 for(const effect of candidate.effects) {
  let value = effect.kind === 'budgets' ? {...effect.value,createdAt:Date.now(),approvedAt:Date.now(),approvedBy:a.session.operator.id} : effect.kind === 'deliveryPlans' ? {...effect.value,reason,approvedBy:a.session.operator.id,approvedAt:Date.now()} : effect.value
  if(effect.kind === 'engagements') {
   const additions = candidate.effects.filter(p=>p.kind==='staffing'&&p.value.engagementId===effect.source?.id).map(p=>p.value.personId)
   value = {...value,members:[...new Set([...(value.members ?? []),...additions])]}
  }
  const row = await tx.record(effect.kind,value,effect.source,effect.id,'projectScenario:adopt')
  effects.push({kind:effect.kind,sourceId:effect.source?.id ?? null,id:row.id,revision:row.revision})
 }
 for(const e of data.engagements) {
  const current = candidate.effects.find(p=>p.kind==='engagements'&&p.source?.id===e.id)
  const additions = candidate.effects.filter(p => p.kind === 'staffing' && p.value.engagementId === e.id).map(p => p.value.personId), members = [...new Set([...(e.value.members ?? []),...additions])]
  if(current)continue
  if(additions.length && members.length !== (e.value.members ?? []).length)await tx.record('engagements',{...e.value,members},e,undefined,'projectScenario:assign')
 }
 return tx.record('projectScenarios',{...stored.value,status:'adopted',adoptedBy:a.session.operator.id,adoptedAt:Date.now(),adoptionReason:reason,selectedIds:preview.changes.map(c => c.id),approvedComparison:preview,effects},stored,undefined,action)
}
