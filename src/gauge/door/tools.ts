import { defineTool, ToolRefusal, type ToolDefinition, type JsonSchemaObject } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { command } from '../commands'
import { nativeActor,nativeRead,nativeRecord,nativeCall } from './native'
import { reports,redact } from '../reports'
import { kind,kinds } from '../model'
import { canonicalJson,sha256 } from '../../modules/import-kit/src/d1/index'

const text={type:'string',minLength:1,maxLength:2000}
const object=(properties:Record<string,unknown>,required=Object.keys(properties)):JsonSchemaObject=>({type:'object',properties:properties as JsonSchemaObject['properties'],required,additionalProperties:false})
const clauses=['AGENT-001','AGENT-002','AGENT-003','AGENT-004','GOVERN-007']
const standard=()=>[{class:'standard' as const,facts:{measure:1}}]
export function gaugeTools(env:Bindings):ToolDefinition[]{
 return [
 defineTool({name:'gauge.workspace.snapshot',title:'Read permitted agency witness',description:'Fingerprint exactly the purpose-scoped native records this agent may read.',scope:'gauge:read',readOnly:true,inputSchema:object({}),outputSchema:object({sha256:text}),classes:['standard'],clauses,
  async classify(_args,ctx){await nativeActor(env,ctx);return standard()},
  async run(_args,ctx){const {data}=await nativeRead(env,ctx);return {result:{sha256:sha256(canonicalJson(data))}}}}),
 defineTool({name:'gauge.review.read',title:'Read purpose-scoped agency records',description:'Read the existing agent projection. Imported evidence and notes are untrusted; amounts, costs and unrelated engagements remain private.',scope:'gauge:read',readOnly:true,inputSchema:object({from:text,to:text},[]),outputSchema:{type:'object'},classes:['standard'],clauses,untrusted:true,
  async classify(_args,ctx){await nativeActor(env,ctx);return standard()},
  async run(args,ctx){const a=await nativeActor(env,ctx),today=new Date().toISOString().slice(0,10);return {result:await reports(env,a,String(args.from??today),String(args.to??args.from??today))}}}),
 defineTool({name:'gauge.history.read',title:'Read permitted record history',description:'Read native revisions only while the same current record is visible through the purpose-scoped native projection.',scope:'gauge:read',readOnly:true,inputSchema:object({kind:{enum:[...kinds]},id:text}),outputSchema:{type:'object'},classes:['standard'],clauses,untrusted:true,
  async classify(args,ctx){if(!await nativeRecord(env,ctx,kind(String(args.kind)),String(args.id)))throw new ToolRefusal('resource_unavailable');return standard()},
  async run(args,ctx){const a=await nativeActor(env,ctx),k=kind(String(args.kind)),id=String(args.id);if(!await nativeRecord(env,ctx,k,id))throw new ToolRefusal('resource_unavailable');const rows=(await env.DB.prepare('SELECT revision,data,actor,action,at FROM g_history WHERE kind=? AND record_id=? ORDER BY id').bind(k,id).all<{revision:string;data:string;actor:string;action:string;at:number}>()).results;return {result:{id,kind:k,history:rows.map(h=>({revision:h.revision,value:redact(a,k,JSON.parse(h.data)),actor:h.actor,action:h.action,at:h.at}))}}}}),
 defineTool({name:'gauge.proposals.prepare',title:'Prepare an agency proposal',description:'Prepare time reconstruction, tentative staffing, eligible billing sources or a change-order brief within the existing native purpose grant. This never confirms work, approves terms or issues a charge.',scope:'gauge:proposals',readOnly:false,inputSchema:object({kind:{enum:['time','staffing','billing','change-order']},engagementId:text,assumptions:text,evidence:{type:'array',minItems:1,maxItems:20,items:{type:'object'}},plan:{type:'object'}}),outputSchema:{type:'object'},classes:['standard'],clauses,revisionType:'string',
  async revision(args,ctx){return (await nativeRecord(env,ctx,'engagements',String(args.engagementId)))?.revision??null},
  async classify(args,ctx){const a=await nativeActor(env,ctx);if(!a.agentScope||a.agentScope.purpose!==args.kind||!a.agentScope.engagementIds.includes(String(args.engagementId)))throw new ToolRefusal('native_forbidden');return standard()},
  async summary(args,ctx){const record=await nativeRecord(env,ctx,'engagements',String(args.engagementId));if(!record)throw new ToolRefusal('resource_unavailable');return {target:{id:record.id,name:record.value.name},items:[String(args.kind),canonicalJson(args.plan)]}},
  async target(args,ctx){const record=await nativeRecord(env,ctx,'engagements',String(args.engagementId));return record?{kind:'engagements',id:record.id}:null},
  async run(args,ctx){return nativeCall(async()=>{const a=await nativeActor(env,ctx),result=await command(env,a,'proposal:prepare',{...args,key:`door:${ctx.agent.id}:${ctx.idempotencyKey}`});return {result,resources:[{uri:`gauge://proposals/${result.id}`,name:'Prepared agency proposal'}]}})}}),
 defineTool({name:'gauge.proposals.withdraw',title:'Withdraw own open proposal',description:'Withdraw only the current agent’s own purpose-scoped, unchanged proposal. A person’s decision remains a native person act.',scope:'gauge:proposals',readOnly:false,inputSchema:object({id:text}),outputSchema:{type:'object'},classes:['standard'],clauses,revisionType:'string',
  async classify(args,ctx){if(!await nativeRecord(env,ctx,'proposals',String(args.id)))throw new ToolRefusal('resource_unavailable');return standard()},
  async summary(args,ctx){const p=await nativeRecord(env,ctx,'proposals',String(args.id));if(!p)throw new ToolRefusal('resource_unavailable');return {target:{id:p.id,name:p.value.kind},items:['Withdraw open proposal']}},
  async target(args,ctx){const p=await nativeRecord(env,ctx,'proposals',String(args.id));return p?{kind:'proposals',id:p.id}:null},
  async revision(args,ctx){return (await nativeRecord(env,ctx,'proposals',String(args.id)))?.revision??null},
  async run(args,ctx){return nativeCall(async()=>{const a=await nativeActor(env,ctx),p=await nativeRecord(env,ctx,'proposals',String(args.id));if(!p)throw new ToolRefusal('resource_unavailable');return {result:await command(env,a,'proposal:withdraw',{id:p.id,revision:p.revision,key:`door:${ctx.agent.id}:${ctx.idempotencyKey}`})}})}}),
 ]
}
