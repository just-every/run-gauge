import type { Bindings } from '../auth.server'
import { type Actor, Transaction, fence } from './store'
import { type Value, need, text } from './model'
import { providerCommand, providerInputDigest } from './provider-custody'

/** Credential-bearing requests never enter ordinary receipt hashes or business history. */
export async function providerRequest(env:Bindings,a:Actor,action:string,input:Value):Promise<Value>{
 need(a.role==='owner'&&a.session.kind==='native','Only the owner in a native browser session manages providers',403)
 await fence(env,a)
 const key=text(input.key,'Unique request key',200),digest=await providerInputDigest(env,{...input,action})
 const prior=await env.DB.prepare('SELECT actor,digest,result FROM g_provider_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>()
 if(prior){need(prior.actor===a.session.operator.id&&prior.digest===digest,'Request key already used for different work',409);await fence(env,a);return JSON.parse(prior.result)}
 const tx=new Transaction(env,a);tx.key=key;tx.action=action
 const result=await providerCommand(env,a,tx,action,input);need(result,'Unknown provider action')
 tx.sql('INSERT INTO g_provider_receipts(key,actor,digest,result) VALUES(?,?,?,?)',key,a.session.operator.id,digest,JSON.stringify(result))
 try{await tx.commit()}catch(error){const retry=await env.DB.prepare('SELECT actor,digest,result FROM g_provider_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>();if(retry?.actor===a.session.operator.id&&retry.digest===digest){await fence(env,a);return JSON.parse(retry.result)}throw error}
 return result
}
