import { createAgentDoor,operatorAuthPeople,type Trust } from '../../modules/agent-door/index.ts'
import { createBusinessSettings } from '../../modules/business-settings/index.ts'
import { createOperatorAuth } from '../../modules/operator-auth/index.mjs'
import { authConfig,operatorAuth,runtimeBindings,type Bindings } from '../../auth.server'
import { operatorMail } from '../../mail.server.mjs'
import { gaugeTools } from './tools'
import { gaugeResources } from './resources'
import { liveAgent } from '../agent-grants'

export const business={settings:1 as const,values:['display_name'] as const,team:{roles:{admin:'admin',member:'member'}}}
export function gaugeBusiness(env:Bindings){
 const team=createOperatorAuth({db:env.DB,config:authConfig(env),mailSender:operatorMail(env),clientIp:()=>''}).businessTeam
 return createBusinessSettings({db:env.DB,trust:env.RER_BUSINESS_TRUST,business,team})
}
function trust(env:Bindings):Trust|null{
 const {RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:publicKeys}=env
 if(![issuer,installationId,publicKeys].some(Boolean))return null
 if(!issuer||!installationId||!publicKeys)throw Error('Incomplete agent trust configuration')
 return {issuer,installationId,appOrigin:env.AUTH_ORIGIN,publicKeys:JSON.parse(publicKeys)}
}
export function gaugeDoor(original:Bindings){
 const env=runtimeBindings(original)
 const nativePeople=operatorAuthPeople({db:env.DB,allowList:authConfig(env).allowList,session:request=>operatorAuth(env).getSession(request)})
 const people={...nativePeople,businessRole:(person:{role:string})=>person.role==='owner'?'owner' as const:null,async sponsor(claims:{sub:string}){const person=await nativePeople.sponsor(claims);return person?.active&&person.role==='owner'?person:null}}
 return createAgentDoor({seed:'gauge',name:'Gauge',specialist:'agency operations coordinator',db:env.DB,origin:env.AUTH_ORIGIN,trust:trust(env),people,tools:gaugeTools(env),resources:gaugeResources(env),
  notTools:[{clauses:['MOVE-001'],reason:'import-door'},{clauses:['CONNECT-007','CONNECT-013','CONNECT-014'],reason:'connector'},{clauses:['MOBILE-001'],reason:'device'},{clauses:['BASE-001'],reason:'installation'}],
  async currentScopes(principal){const grant=await liveAgent(env,principal.agent.id);return grant?.granted_by===principal.person.id?['gauge:read','gauge:proposals','events:read']:[]},
  async localCredentials(request){const session=await operatorAuth(env).getSession(request);if(!session)return null;const row=await env.DB.prepare("SELECT granted_by FROM g_grants WHERE operator_id=? AND role='agent' AND enabled=1").bind(session.operator.id).first<{granted_by:string}>();if(!row)return null;return {sponsor:{id:row.granted_by},agent:{id:session.operator.id,name:session.operator.displayName},clientId:session.operator.id,scopes:['gauge:read','gauge:proposals','events:read']}},
 })
}
export async function gaugeAgentResponse(request:Request,original:Bindings){
 const env=runtimeBindings(original)
 // The signed settings and policy doors run before native app/setup redirects.
 const settings=await gaugeBusiness(env).handle(request);if(settings)return settings
 return gaugeDoor(env).handle(request)
}
