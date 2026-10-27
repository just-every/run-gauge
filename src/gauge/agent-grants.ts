import type { Bindings } from '../auth.server'
import { type Value, need, text, flag } from './model'
import { type Actor, type Transaction, get } from './store'

export const agentPurposes = { time: 'Time reconstruction', staffing: 'Resourcing', billing: 'Billing preparation', 'change-order': 'Delivery exceptions' }
export interface AgentScope { purpose: string; engagementIds: string[]; grantedBy: string }

export async function saveAgentScope(env: Bindings, a: Actor, tx: Transaction, input: Value) {
 if (input.role !== 'agent') return { purpose: null, engagementIds: [], grantedBy: null }
 const previous = await env.DB.prepare('SELECT purpose,engagement_ids,granted_by FROM g_grants WHERE operator_id=?').bind(input.operatorId).first<any>()
 // Revocation never requires the caller to reconstruct the old scope.
 if (!flag(input.enabled)) return { purpose: previous?.purpose ?? null, engagementIds: JSON.parse(previous?.engagement_ids ?? '[]'), grantedBy: previous?.granted_by ?? a.session.operator.id }
 const purpose = text(input.purpose, 'Agent purpose')
 need(Object.hasOwn(agentPurposes, purpose), 'Choose one agent purpose')
 const engagementIds = [...new Set((Array.isArray(input.engagementIds) ? input.engagementIds : String(input.engagementIds ?? '').split(',')).map(String).filter(Boolean))]
 need(engagementIds.length > 0 && engagementIds.length <= 100, 'Choose between 1 and 100 agent engagements')
 for (const id of engagementIds) tx.observe('engagements', await get(env, 'engagements', id))
 return { purpose, engagementIds, grantedBy: a.session.operator.id }
}

// The granting owner must still be an active owner; no session or authority cache is inherited.
export const liveAgentSql = `SELECT g.* FROM g_grants g JOIN oa_operators agent ON agent.id=g.operator_id JOIN oa_operators owner ON owner.id=g.granted_by WHERE g.operator_id=? AND g.role='agent' AND g.enabled=1 AND agent.status='active' AND agent.role<>'owner' AND owner.status='active' AND owner.role='owner' AND g.purpose IS NOT NULL AND json_array_length(g.engagement_ids)>0`
export async function liveAgent(env: Bindings, operatorId: string) {
 return env.DB.prepare(liveAgentSql).bind(operatorId).first<{ version: number; purpose: string; engagement_ids: string; granted_by: string }>()
}
export function requireAgentScope(a: Actor, purpose: string, engagementId: string) {
 need(a.role === 'agent' && a.agentScope?.purpose === purpose && a.agentScope.engagementIds.includes(engagementId), 'Agent purpose or engagement is outside its grant', 403)
}
