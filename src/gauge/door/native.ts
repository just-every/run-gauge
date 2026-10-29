import { authConfig, type Bindings } from '../../auth.server'
import { isActiveOperator, type Operator } from '../../modules/operator-auth/index.mjs'
import { ToolRefusal, type ResourceContext, type ToolContext } from '../../modules/agent-door/index.ts'
import { boundAgent } from '../agent-grants'
import { actor, fence, type Actor } from '../store'
import { visible } from '../reports'
import { Fault, type Kind, type Row } from '../model'

export type PrincipalContext = Pick<ResourceContext, 'person' | 'agent'>
/** A company credential does not replace the owner's native, purpose-scoped grant.
 * Company agent ids bind explicitly to native operators, never through email. */
export async function nativeActor(env: Bindings, ctx: PrincipalContext): Promise<Actor> {
 const grant = await boundAgent(env, ctx.agent.id)
 const sponsor = await env.DB.prepare('SELECT id,version,role,status FROM oa_operators WHERE id=?').bind(ctx.person.id).first<{id:string;version:number;role:string;status:string}>()
 const operator = await env.DB.prepare('SELECT id,email,display_name AS displayName,role,status,version,created_at AS createdAt FROM oa_operators WHERE id=?').bind(grant?.operatorId??'').first<Operator>()
 if (!grant || grant.granted_by !== ctx.person.id || sponsor?.role !== 'owner' || sponsor.status !== 'active' || !isActiveOperator(operator, authConfig(env).allowList)) throw new ToolRefusal('native_agent_grant_required')
 const a = await actor(env, {id:null,kind:'agent',operator:operator!})
 const policy = await env.DB.prepare('SELECT envelope,local_document,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string|null;local_document:string|null;local_revision:number}>()
 if (!policy) throw new ToolRefusal('policy_unset')
 const tool = ctx as ToolContext
 a.door = {sponsor:ctx.person.id,sponsorVersion:sponsor.version,envelope:policy.envelope,document:policy.local_document,revision:policy.local_revision,actor:{agent:{id:ctx.agent.id,name:ctx.agent.name},for:{id:ctx.person.id,name:ctx.person.name},label:`${ctx.agent.name} for ${ctx.person.name}`},operationId:tool.operationId??'',approvers:tool.approvers??[]}
 await nativeCall(()=>fence(env,a))
 return a
}
export async function nativeRead(env: Bindings, ctx: PrincipalContext) {
 const a=await nativeActor(env,ctx)
 return {a,data:await visible(env,a)}
}
export async function nativeRecord(env: Bindings,ctx:PrincipalContext,kind:Kind,id:string):Promise<Row|null> {
 const {data}=await nativeRead(env,ctx)
 return data[kind].find(r=>r.id===id)??null
}
export async function nativeCall<T>(run:()=>Promise<T>):Promise<T> {
 try{return await run()}catch(error){if(error instanceof Fault)throw new ToolRefusal(error.status===403?'native_forbidden':error.status===409?'revision_conflict':'native_invalid',error.message);throw error}
}
