import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Value, need, text } from './model'
import { type Actor, Transaction, fence, get } from './store'
import { catalog, approveTerms } from './catalog'
import { timeCommand } from './time'
import { expenseCommand } from './expenses'
import { billingCommand } from './billing'
import { importCommand } from './imports'
import { proposalCommand } from './proposals'
export async function command(env:Bindings,a:Actor,action:string,input:Value) {
 await fence(env,a)
 need(input.currency===undefined||input.currency==='AUD','Gauge phase 1 accepts AUD only; no implicit FX')
 // An agent grant prepares and withdraws proposals; every other effect needs a person.
 need(a.role!=='agent'||['proposal:prepare','proposal:withdraw'].includes(action),'Agents prepare proposals; a person approves them',403)
 if(action.startsWith('import:'))return importCommand(env,a,action,input)
 const key=text(input.key,'Unique request key',200),digest=sha256(canonicalJson({...input,file:input.file instanceof File?{name:input.file.name,size:input.file.size,hash:sha256(new Uint8Array(await input.file.arrayBuffer()))}:null,action})),previous=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>()
 if(previous){need(previous.actor===a.session.operator.id && previous.digest===digest,'Request key already used for different work',409);await fence(env,a);return JSON.parse(previous.result)}
 const tx=new Transaction(env,a)
 let result=await catalog(env,a,tx,action,input)
 if(!result&&['budget:approve','milestone:approve'].includes(action))result=await approveTerms(env,a,tx,action==='budget:approve'?'budgets':'milestones',input)
 if(!result)result=await timeCommand(env,a,tx,action,input)
 if(!result)result=await expenseCommand(env,a,tx,action,input)
 if(!result)result=await billingCommand(env,a,tx,action,input)
 if(!result)result=await proposalCommand(env,a,tx,action,input)
 need(result,'Unknown action')
 const acknowledgement={id:result.id??null,revision:result.revision??null,saved:true};
 tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)',key,a.session.operator.id,digest,JSON.stringify(acknowledgement))
 try {await tx.commit()}catch(error){const retry=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>();if(retry?.actor===a.session.operator.id&&retry.digest===digest){await fence(env,a);return JSON.parse(retry.result)}throw error}
 // Mutations acknowledge identifiers only: private rate snapshots never leak through staff receipts.
 return acknowledgement
}
export function publicResult(value:any):any {if(value?.value){const v={...value.value};delete v.economics;return {...value,value:v}}return value}
