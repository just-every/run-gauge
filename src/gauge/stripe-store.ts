import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, Transaction, fence, get } from './store'
import { Fault, decode, need, text, type Kind, type Row, type Value } from './model'
import { dispatchCredential, recordProviderUse, ProviderDispatchError, type ProviderOperation } from './provider-custody'
import { parseStripeCredential, StripeFailure } from './stripe-api'

export type StripeKind='paymentLinks'|'processorPayments'|'processorEvents'|'stripeAccounts'
export async function stripeOwner(env:Bindings,a:Actor){
 need(a.role==='owner'&&a.session.operator.role==='owner'&&a.session.kind==='native'&&!a.appKey&&!a.scheduled&&!a.clientInvoice&&!a.clientProposal&&!a.clientMilestone,'Only the owner in a native browser session manages Stripe payments',403)
 await fence(env,a)
}
export function stripeTx(env:Bindings,a:Actor,key:string,action:string){
 const tx=new Transaction(env,a);tx.key=key;tx.action=action
 tx.guard("EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND s.kind='native' AND o.id=? AND o.role='owner' AND o.status='active' AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER))",a.session.id,a.session.operator.id)
 return tx
}
export async function stripeConnection(env:Bindings,tx:Transaction,id:unknown,version?:number){
 const connection=await get(env,'providerConnections',text(id,'Stripe connection'))
 need(connection.value.provider==='stripe'&&!connection.value.revokedAt,'Choose an active Stripe connection',409)
 need(version===undefined||connection.value.version===version,'Stripe credential rotated; this instruction cannot use the replacement credential',409)
 tx.observe('providerConnections',connection);return connection
}
export async function stripeCredential(env:Bindings,connection:Row,jobId:string,operation:ProviderOperation){
 return parseStripeCredential(await dispatchCredential(env,connection.id,connection.value.version,jobId,operation))
}
export async function rowsFor(env:Bindings,kind:Kind,field:string,id:string):Promise<Row[]>{
 need(/^[A-Za-z]+$/.test(field),'Unsupported Stripe relationship')
 return (await env.DB.prepare(`SELECT id,revision,data FROM g_${kind} WHERE json_extract(data,'$.${field}')=? ORDER BY id`).bind(id).all<{id:string;revision:string;data:string}>()).results.map(decode)
}
export async function linkAuthority(env:Bindings,tx:Transaction,link:Row){
 const params=[link.id,tx.actor.session.operator.id,link.value.connectionId,link.value.credentialVersion]
 const sql='EXISTS(SELECT 1 FROM g_stripe_authority WHERE link_id=? AND owner_id=? AND connection_id=? AND credential_version=?)'
 need((await env.DB.prepare(`SELECT (${sql}) AS ok`).bind(...params).first<{ok:number}>())?.ok===1,'Restored Stripe history has no payment readback authority',409)
 tx.guard(sql,...params)
}
export async function startStripe(env:Bindings,a:Actor,action:string,input:Value){
 await stripeOwner(env,a)
 const key=text(input.key,'Unique request key',200),digest=sha256(canonicalJson({...input,action}))
 const receipt=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>()
 if(receipt){need(receipt.actor===a.session.operator.id&&receipt.digest===digest,'Request key already used for different work',409);return {previous:JSON.parse(receipt.result),key,digest}}
 const claim=await env.DB.prepare('SELECT actor,digest,kind,record_id FROM g_stripe_claims WHERE key=?').bind(key).first<{actor:string;digest:string;kind:StripeKind;record_id:string}>()
 if(claim){need(claim.actor===a.session.operator.id&&claim.digest===digest,'Request key already used for different work',409);const row=await get(env,claim.kind,claim.record_id);return {previous:{id:row.id,revision:row.revision,saved:true,status:row.value.status},key,digest}}
 return {key,digest}
}
export async function claimStripe(tx:Transaction,digest:string,row:Row,kind:StripeKind){
 tx.sql('INSERT INTO g_stripe_claims(key,actor,digest,kind,record_id,at) VALUES(?,?,?,?,?,?)',tx.key,tx.actor.session.operator.id,digest,kind,row.id,Date.now());await tx.commit()
}
export async function finishStripe(tx:Transaction,digest:string,row:Row,metadata:Value={}){
 const result={id:row.id,revision:row.revision,saved:true,...metadata}
 tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)',tx.key,tx.actor.session.operator.id,digest,JSON.stringify(result))
 await tx.commit();return result
}
export async function stripeUse(tx:Transaction,connection:Row,jobId:string,operation:ProviderOperation,error?:unknown){
 const outcome=error instanceof ProviderDispatchError?error.outcome:error instanceof StripeFailure?error.outcome:error?'uncertain':'accepted'
 return recordProviderUse(tx,{connectionId:connection.id,credentialVersion:connection.value.version,jobId,operation,outcome})
}
export function stripeException(error:unknown):string {return error instanceof ProviderDispatchError?error.outcome:error instanceof StripeFailure?error.exceptionClass:'canonical-evidence-unconfirmed'}
export async function failedStripe(env:Bindings,a:Actor,key:string,action:string,connection:Row,jobId:string,operation:ProviderOperation,error:unknown):Promise<never>{
 const tx=stripeTx(env,a,key,action);await stripeUse(tx,connection,jobId,operation,error);tx.audit('stripe:refused','providerConnections',connection.id,{action,exceptionClass:stripeException(error),jobId});await tx.commit()
 throw new Fault('Stripe evidence could not be verified; inspect provider use and reconcile again',409)
}
