import type { Bindings } from '../../auth.server'
import { gaugeTools } from './tools'

/** Public documentation contains registry declarations, never native records. */
export function agentDocumentation(request:Request,env:Bindings):Response|null{
 if(new URL(request.url).pathname!=='/docs/agents')return null
 const headers={'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD'}})
 const tools=gaugeTools(env)
 const text=[
 '# Gauge agency operations coordinator',
 '',
 'Use /mcp discovery and the canonical /.well-known/oauth-protected-resource/mcp metadata. MCP 2026-07-28 and 2025-11-25 are supported.',
 'A current native owner must grant one purpose and engagements to an accepted native agent operator, and explicitly bind the Business agent id on Access. Signed Business subjects bind through owner_id, never token email.',
 'Company policy decides each call. Unset, unavailable, blocked or paused policy permits no effect. Native people retain worker truth, commercial decisions and their existing grants.',
 '',
 ...tools.flatMap(tool=>[`${tool.name} (${tool.readOnly?'read':'mutation'})`,tool.description,`Scope: ${tool.scope}; classes: ${tool.classes.join(', ')}; clauses: ${tool.clauses.join(', ')}.`,'Evidence: agent-surface.json conformance journey; tests/gauge-agent.mjs native public-door journeys.','']),
 'Declared capabilities: tools, policy, pause, audit and idempotency. Events, resources, prompts and subscriptions are undeclared and return capability_not_declared.',
 '',
 'Native purpose-scoped record reads use gauge.review.read and gauge.history.read. Imported record text is untrusted; no public resource templates or links are offered.',
 '',
 'Native mutations require idempotency_key, accept a string expected_revision and retain native transaction fences. Replay has one effect; changed arguments conflict.',
 'Refusals include native_agent_grant_required, native_forbidden, resource_unavailable, insufficient_scope, revision_conflict, idempotency_conflict, policy_unset, policy_unavailable, policy_blocked and agents_paused. MCP preserves com.runeditrun/error metadata.',
 'Device work, connectors, imports and installation use their own doors. No sends, charges, committed staffing, access/security mutations, provider cost or paid AI are registered. Spend is {none:true}.',
 'Capacity limits are returned by server/discover; they do not replace company policy. Native people decide named approvals and inspect audit at /agents.',
 'Normal rer verify uses signed owner claim, native invitation and owner grant, then binds the discovered Business agent through the native Access command before the specialist journey.',
 ].join('\n')+'\n'
 return new Response(request.method==='HEAD'?null:text,{headers})
}
