import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind, type Row, type Value, need, text, date, workDate } from './model'
import { type Actor, type Transaction, all, finance, fence, get } from './store'
import { capacity } from './reports'
import { financeForecast } from './finance-forecast'
import { cashForecast } from './cash-forecast'
import { retainerStatements } from './retainer-statements'

// FINANCE-003: isolated staffing replacements. All pricing uses the same native forecast basis.
// Full set guards include inserts/deletes as well as revision changes between review and adoption.
const basisKinds: Kind[] = ['clients','people','engagements','budgets','tasks','milestones','rates','rateWithdrawals','calendars','leave','staffing','time','expenses','retainers','retainerPeriods','retainerCloses','retainerAdjustments','deliveryPlans']
const hash = (value: unknown) => sha256(canonicalJson(value))
const before = (day: string) => new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)
type Change = { id: string; revision: string; personId: string; effectiveFrom: string }
async function basis(env: Bindings, tx?: Transaction) {
 const data = Object.fromEntries(await Promise.all(basisKinds.map(async k => [k, await all(env,k)]))) as Record<Kind,Row[]>
 if(tx) for(const k of basisKinds) { for(const row of data[k])tx.observe(k,row);tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,data[k].length) }
 return data
}
function replacements(data: Record<Kind,Row[]>, changes: Change[], asOf: string) {
 const parts: { source: Row; values: Value[] }[] = []
 for(const change of changes) {
  const row=data.staffing.find(s=>s.id===change.id)
  need(row && row.revision===change.revision,'Staffing changed; prepare a new scenario',409)
  const v=row.value
  need(data.people.some(p=>p.id===change.personId),'Replacement person not found',404)
  need(change.personId!==v.personId,'Choose a different replacement person')
  need(change.effectiveFrom>asOf && change.effectiveFrom>=v.from && change.effectiveFrom<=v.to,'Replace only future dates inside the booking',409)
  const latest=data.deliveryPlans.filter(p=>p.value.engagementId===v.engagementId).at(-1)
  need(!latest?.value.schedule.nodes.some((n:Value)=>n.staffingIds.includes(row.id)),'Booking belongs to an approved delivery baseline; use the delivery schedule door first',409)
  const future={...v,personId:change.personId,from:change.effectiveFrom}
  parts.push({source:row,values:change.effectiveFrom===v.from?[future]:[{...v,to:before(change.effectiveFrom)},future]})
 }
 return parts
}
function compare(data: Record<Kind,Row[]>, changes: Change[], asOf: string) {
 const parts=replacements(data,changes,asOf), ids=new Set(parts.map(p=>p.source.value.engagementId)), peopleIds=new Set(parts.flatMap(p=>[p.source.value.personId,...p.values.map(v=>v.personId)]))
 const candidate={...data,staffing:data.staffing.flatMap(s=>{const p=parts.find(p=>p.source.id===s.id);return p?p.values.map((value,i)=>({id:i?`${s.id}:future`:s.id,revision:s.revision,value})): [s]})}
 const from=changes.map(c=>c.effectiveFrom).sort()[0],to=parts.map(p=>p.source.value.to).sort().at(-1)!
 need(Date.parse(to)-Date.parse(from)<=366*86400000,'Compare a window of at most one year')
 const project=(d:typeof data)=>{
  const balances=retainerStatements(d,d.time,undefined,d),forecast=financeForecast(d,asOf,balances)
  const cash=cashForecast(d,{...forecast,engagements:forecast.engagements.filter(e=>ids.has(e.engagementId)),pipeline:[]})
  const cap=capacity(d,from,to).filter(p=>peopleIds.has(p.personId)).map(p=>({personId:p.personId,availableSeconds:p.availableSeconds,knownAvailableSeconds:p.knownAvailableSeconds,committedSeconds:p.committedSeconds,tentativeSeconds:p.tentativeSeconds,remainingSeconds:p.remainingSeconds,missingCalendarDays:p.missingCalendarDays,conflicts:p.conflicts,utilizationPercent:p.availableSeconds?100*p.committedSeconds/p.availableSeconds:null}))
  return {projects:forecast.engagements.filter(e=>ids.has(e.engagementId)).map(e=>({...e,marginMinor:e.complete?e.marginMinor:null,etcCostMinor:e.complete?e.etcCostMinor:null,eacCostMinor:e.complete?e.eacCostMinor:null,eacFeesMinor:e.complete?e.eacFeesMinor:null})),cash,capacity:cap}
 }
 const baseline=project(data),scenario=project(candidate)
 const deltas=scenario.projects.map(p=>{const b=baseline.projects.find(b=>b.engagementId===p.engagementId)!;const delta=(k:'etcCostMinor'|'eacCostMinor'|'eacFeesMinor'|'marginMinor')=>p[k]===null||b[k]===null?null:p[k]!-b[k]!;return {engagementId:p.engagementId,currency:p.currency,etcCostMinor:delta('etcCostMinor'),eacCostMinor:delta('eacCostMinor'),eacFeesMinor:delta('eacFeesMinor'),marginMinor:delta('marginMinor')}})
 return {from,to,asOf,changes,baseline,scenario,deltas,parts}
}
function normalize(input: unknown): Change[] {
 need(Array.isArray(input)&&input.length>0&&input.length<=20,'Choose between 1 and 20 staffing replacements')
 const changes=input.map(c=>({id:text(c.id,'Booking'),revision:text(c.revision,'Booking revision'),personId:text(c.personId,'Replacement person'),effectiveFrom:date(c.effectiveFrom)}))
 need(new Set(changes.map(c=>c.id)).size===changes.length,'A booking appears twice')
 return changes.sort((a,b)=>a.id.localeCompare(b.id))
}
export async function projectScenarioPreview(env:Bindings,a:Actor,input:Value,tx?:Transaction) {
 need(finance(a),'Financial scenarios require finance or owner access',403)
 const data=await basis(env,tx),asOf=date(input.asOf??workDate(Date.now(),a.timezone))
 let changes:Change[],stored:Row|undefined
 if(input.id) {
  stored=await get(env,'projectScenarios',text(input.id,'Scenario'))
  need(stored.revision===input.revision&&stored.value.status==='prepared','Scenario changed or already adopted',409)
  need(asOf===stored.value.asOf && hash(data)===stored.value.basisDigest,'Scenario baseline changed; prepare a new scenario',409)
  need(Array.isArray(input.selectedIds)&&input.selectedIds.length>0,'Explicitly select the bookings to adopt')
  const selected=input.selectedIds.map((id:unknown)=>text(id,'Selected booking'))
  need(new Set(selected).size===selected.length&&selected.every((id:string)=>stored!.value.changes.some((c:Change)=>c.id===id)),'Select each prepared booking at most once')
  changes=stored.value.changes.filter((c:Change)=>selected.includes(c.id))
  if(tx)tx.observe('projectScenarios',stored)
 } else changes=normalize(input.changes)
 const {parts,...comparison}=compare(data,changes,asOf)
 const fingerprint=hash({basis:data,comparison,scenario:stored?{id:stored.id,revision:stored.revision}:null})
 await fence(env,a)
 return {...comparison,fingerprint,basisDigest:hash(data)}
}
export async function projectScenarioCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(!['projectScenario:prepare','projectScenario:adopt'].includes(action))return null
 need(finance(a),'Financial scenarios require finance or owner access',403)
 const preview=await projectScenarioPreview(env,a,input,tx)
 need(input.fingerprint===preview.fingerprint,'Scenario inputs changed; review again',409)
 if(action==='projectScenario:prepare') {
  need(!input.id,'Prepare a new immutable scenario')
  return tx.record('projectScenarios',{name:text(input.name,'Scenario name',200),reason:text(input.reason,'Scenario reason'),status:'prepared',preparedBy:a.session.operator.id,preparedAt:Date.now(),...preview})
 }
 need(input.id,'Select a prepared scenario')
 need(preview.asOf===workDate(Date.now(),a.timezone),'Review as of today before adopting future work',409)
 const stored=await get(env,'projectScenarios',input.id),data=await basis(env,tx),parts=replacements(data,preview.changes,preview.asOf)
 need(hash(data)===preview.basisDigest,'Scenario baseline changed; review again',409)
 // Keep the selected comparison with the named human approval. Unselected bookings are unchanged.
 const effects:Value[]=[]
 for(const part of parts) {
  const first=await tx.record('staffing',part.values[0],part.source,undefined,'projectScenario:adopt');effects.push({sourceId:part.source.id,id:first.id,revision:first.revision})
  for(const value of part.values.slice(1)){const row=await tx.record('staffing',value,undefined,undefined,'projectScenario:split');effects.push({sourceId:part.source.id,id:row.id,revision:row.revision})}
 }
 for(const e of data.engagements) {
  const additions=parts.filter(p=>p.source.value.engagementId===e.id).flatMap(p=>p.values.map(v=>v.personId)),members=[...new Set([...(e.value.members??[]),...additions])]
  if(additions.length&&members.length!==(e.value.members??[]).length)await tx.record('engagements',{...e.value,members},e,undefined,'projectScenario:assign')
 }
 return tx.record('projectScenarios',{...stored.value,status:'adopted',adoptedBy:a.session.operator.id,adoptedAt:Date.now(),adoptionReason:text(input.reason,'Adoption reason'),selectedIds:preview.changes.map(c=>c.id),approvedComparison:preview,effects},stored,undefined,action)
}
