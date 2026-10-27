import type { Bindings } from '../auth.server'
import { type Kind, type Row, type Value, need, kinds, Fault, decode } from './model'
import { type Actor, Transaction, all, get } from './store'
import { liveAgent, liveAgentSql } from './agent-grants'
import { agentData } from './agent-data'

type Source = { kind: Kind; id: string; revision: string }
const signature = (sources: Source[]) => JSON.stringify([...sources].sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)))

/** Bind the full relevant sets as well as their revisions: a newly added allocation/rate also changes the inputs. */
export async function captureSources(env: Bindings, value: Value, tx?: Transaction): Promise<Source[]> {
 const refs = new Map<string,Source>()
 const capture = async (kind: Kind, where: string, params: string[]) => {
  const rows=(await env.DB.prepare(`SELECT id,revision,data FROM g_${kind} WHERE ${where} ORDER BY id`).bind(...params).all<any>()).results.map(decode)
  if(tx)tx.guard(`(SELECT COUNT(*) FROM g_${kind} WHERE ${where})=?`,...params,rows.length)
  for(const row of rows){if(tx)tx.observe(kind,row);refs.set(`${kind}:${row.id}`,{kind,id:row.id,revision:row.revision})}
 }
 await capture('engagements','id=?',[value.engagementId])
 const people=value.kind==='staffing'?value.plan.alternatives.map((x:Value)=>x.personId):value.kind==='time'?[value.plan.personId]:[]
 for(const id of new Set<string>(people)) {
  await capture('people','id=?',[id])
  for(const kind of ['calendars','leave','staffing','time'] as Kind[])await capture(kind,"json_extract(data,'$.personId')=?",[id])
 }
 if(value.kind==='staffing'){await capture('rates','1=1',[]);await capture('rateWithdrawals','1=1',[])}
 if(value.kind==='time')await capture('tasks','id=?',[value.plan.taskId])
 const context:Kind[]=value.kind==='billing'?['budgets','retainers','retainerPeriods','packets']:value.kind==='change-order'?['budgets','tasks','milestones','staffing','time','expenses','deliveryPlans']:[]
 for(const kind of context)await capture(kind,"json_extract(data,'$.engagementId')=?",[value.engagementId])
 if(value.kind==='billing')for(const source of value.plan.sources){const [kind,id]=source.split(':');await capture(kind,'id=?',[id])}
 for(const citation of value.evidence??[])if(citation.record)await capture(citation.record.kind,'id=?',[citation.record.id])
 return [...refs.values()]
}

export async function validateCitations(env: Bindings, a: Actor, evidence: Value[]) {
 const linked=evidence.filter(x=>x.record)
 if(!linked.length)return
 const raw=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<Kind,Row[]>,permitted=agentData(a,raw)
 for(const {record} of linked){
  need(kinds.includes(record.kind),'Unknown cited record')
  const row=permitted[record.kind as Kind].find(r=>r.id===record.id)
  need(row,'Cited record is outside the agent purpose or engagement',403)
  need(row.revision===record.revision,'Cited source changed; prepare from its current revision',409)
 }
}

export async function proposalAvailability(env: Bindings, proposal: Row): Promise<string|null> {
 const p=proposal.value.sources?proposal:await get(env,'proposals',proposal.id),v=p.value
 const grant=await liveAgent(env,v.preparedBy)
 if(!grant)return 'Agent revoked'
 if(grant.version!==v.agentGrantVersion||grant.purpose!==v.kind||!JSON.parse(grant.engagement_ids).includes(v.engagementId))return 'Agent grant changed; request a fresh proposal'
 if(!Array.isArray(v.sources)||signature(v.sources)!==signature(await captureSources(env,v)))return 'Stale inputs; request a fresh proposal'
 return null
}
export async function fenceProposal(env: Bindings, a: Actor, tx: Transaction, p: Row) {
 const reason=await proposalAvailability(env,p)
 if(reason){
  // The refused decision writes no effect, proposal revision or request receipt. GOVERN-005 requires its reason-class audit.
  const refusal=new Transaction(env,a);refusal.key=tx.key
  refusal.audit('proposal:refused','proposals',p.id,{reason,revision:p.revision})
  await refusal.commit()
  throw new Fault(reason,409)
 }
 tx.guard(`EXISTS(${liveAgentSql} AND g.version=? AND g.purpose=? AND EXISTS(SELECT 1 FROM json_each(g.engagement_ids) WHERE value=?))`,p.value.preparedBy,p.value.agentGrantVersion,p.value.kind,p.value.engagementId)
 const current=await captureSources(env,p.value,tx)
 need(signature(current)===signature(p.value.sources),'Stale inputs; request a fresh proposal',409)
}
