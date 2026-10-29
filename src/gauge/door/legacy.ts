import { localAgentId } from '../agent-grants'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../store'
import { Fault } from '../model'
import { gaugeDoor } from './index'

/** Existing native sessions keep their two proposal verbs and closed read scope;
 * their effects enter exactly the same policy, consent-independent local
 * credential, review, audit and idempotency path as MCP. */
export async function legacyAgentCall(env:Bindings,a:Actor,action:string,input:Record<string,unknown>){
 const row=await env.DB.prepare("SELECT business_agent_id FROM g_grants WHERE operator_id=? AND role='agent' AND enabled=1").bind(a.session.operator.id).first<{business_agent_id:string|null}>()
 const tools:Record<string,string>={'proposal:prepare':'gauge.proposals.prepare','proposal:withdraw':'gauge.proposals.withdraw',read:'gauge.review.read',history:'gauge.history.read'}
 const tool=tools[action]
 if(!tool||!a.agentScope||!row)throw new Fault('Agents prepare proposals; a person approves them',403)
 const {key,action:_action,revision,...args}=input
 const answer=await gaugeDoor(env).invoke(tool,{...args,...(key?{idempotency_key:String(key)}:{}),...(revision?{expected_revision:revision}:{})},{person:{id:a.agentScope.grantedBy},agent:{id:localAgentId(a.session.operator.id,a.agentScope.grantedBy),name:a.session.operator.displayName},clientId:a.session.operator.id,scopes:['gauge:read','gauge:proposals','events:read']})
 if(answer.outcome!=='done')throw new Fault(answer.code??answer.outcome,answer.code==='native_invalid'?400:['revision_conflict','idempotency_conflict'].includes(answer.code??'')?409:403)
 return answer.result
}
