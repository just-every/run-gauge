import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { actor, type Actor, Transaction, fence, get } from './store'
import { need, text, uuid } from './model'
import { visible } from './reports'
import { command, publicResult } from './commands'

const encode = (value:unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(value)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const decode = (value:string) => { try { return JSON.parse(decodeURIComponent(escape(atob(value.replace(/-/g,'+').replace(/_/g,'/'))))) } catch { need(false,'Invalid page cursor',400) } }

export async function appKeyCommand(env:Bindings,a:Actor,action:string,input:Record<string,any>) {
 await fence(env,a);need(a.role==='owner'&&a.session.kind==='native','Only the native owner manages app credentials',403)
 need(['appkey:create','appkey:revoke'].includes(action),'Unknown app credential action')
 const key=text(input.key,'Unique request key',200),digest=sha256(canonicalJson({action,label:input.label??null,operatorId:input.operatorId??null,scope:input.scope??null,engagementIds:input.engagementIds??null,expiryDays:input.expiryDays??null,id:input.id??null}))
 const previous=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<any>()
 if(previous){need(previous.actor===a.session.operator.id&&previous.digest===digest,'Request key already used for different work',409);return JSON.parse(previous.result)}
 const tx=new Transaction(env,a);tx.key=key
 let result:any,token:string|undefined
 if(action==='appkey:create'){
  const label=text(input.label,'App label',80),operatorId=text(input.operatorId,'Staff operator'),scope=text(input.scope,'App scope')
  need(['projects:read','projects:read time:write'].includes(scope),'Choose a supported app scope')
  const grant=await env.DB.prepare("SELECT o.version AS operatorVersion,g.version AS grantVersion,g.person_id AS personId FROM oa_operators o JOIN g_grants g ON g.operator_id=o.id WHERE o.id=? AND o.status='active' AND o.role='member' AND g.enabled=1 AND g.role='staff'").bind(operatorId).first<any>()
  need(grant?.personId,'Choose an active staff operator with a person',403)
  const person=await get(env,'people',grant.personId);tx.observe('people',person)
  tx.guard("EXISTS(SELECT 1 FROM oa_operators o JOIN g_grants g ON g.operator_id=o.id WHERE o.id=? AND o.status='active' AND o.role='member' AND o.version=? AND g.enabled=1 AND g.role='staff' AND g.version=? AND g.person_id=?)",operatorId,grant.operatorVersion,grant.grantVersion,grant.personId)
  const expiryDays=Number(input.expiryDays);need(Number.isInteger(expiryDays)&&expiryDays>=1&&expiryDays<=365,'Expiry must be 1 to 365 days')
  need(Array.isArray(input.engagementIds)&&input.engagementIds.length>0&&input.engagementIds.length<=100,'Choose 1 to 100 exact assigned projects')
  const engagementIds=[...new Set(input.engagementIds.map((id:unknown)=>text(id,'Project identity')))].sort()
  for(const id of engagementIds){const project=await get(env,'engagements',id);need(project.value.members?.includes(grant.personId),'Project is not assigned to this staff member',403);tx.observe('engagements',project)}
  const createdAt=Date.now(),expiresAt=createdAt+expiryDays*86400000
  token='gauge_app_'+encode(Array.from(crypto.getRandomValues(new Uint8Array(32))))
  result={id:uuid(),label,scope,engagementIds,expiresAt,credentialVersion:1,saved:true}
  tx.sql('INSERT INTO g_app_keys(id,label,hash,operator_id,operator_version,grant_version,scope,created_by,created_at,expires_at,engagement_ids,person_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',result.id,label,sha256(token),operatorId,grant.operatorVersion,grant.grantVersion,scope,a.session.operator.id,createdAt,expiresAt,JSON.stringify(engagementIds),grant.personId)
  tx.audit(action,'appKeys',result.id,{label,operatorId,personId:grant.personId,scope,engagementIds,operatorVersion:grant.operatorVersion,grantVersion:grant.grantVersion,credentialVersion:1,createdAt,expiresAt})
 }else{
  const id=text(input.id,'App credential'),row=await env.DB.prepare('SELECT label,scope FROM g_app_keys WHERE id=? AND revoked_at IS NULL').bind(id).first<any>();need(row,'Active app credential not found',404)
  tx.guard('EXISTS(SELECT 1 FROM g_app_keys WHERE id=? AND revoked_at IS NULL)',id)
  tx.sql('UPDATE g_app_keys SET revoked_at=? WHERE id=?',Date.now(),id)
  result={id,label:row.label,scope:row.scope,revoked:true,saved:true};tx.audit(action,'appKeys',id,{label:row.label,scope:row.scope})
 }
 tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)',key,a.session.operator.id,digest,JSON.stringify(result))
 await tx.commit();return {...result,...(token?{token}:{})}
}

export async function appKeyRequest(env:Bindings,request:Request,url:URL,headers:Record<string,string>) {
 const token=request.headers.get('authorization')?.match(/^Bearer (\S{1,300})$/)?.[1];need(token,'Send Authorization: Bearer <app credential>',401)
 const key=await env.DB.prepare("SELECT * FROM g_app_keys WHERE hash=? AND revoked_at IS NULL AND expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER)").bind(sha256(token)).first<any>();need(key,'Invalid or revoked app credential',401)
 const operator=await env.DB.prepare('SELECT * FROM oa_operators WHERE id=?').bind(key.operator_id).first<any>();need(operator,'Invalid app principal',401)
 const a=await actor(env,{id:'app:'+key.id,kind:'native',operatorId:operator.id,createdAt:0,expiresAt:0,operator:{id:operator.id,email:operator.email,displayName:operator.display_name,role:operator.role,status:operator.status,version:operator.version,createdAt:operator.created_at}})
 a.appKey={id:key.id,hash:key.hash,ownerId:key.created_by,engagementIds:JSON.parse(key.engagement_ids)}
 await fence(env,a)
 const audit=new Transaction(env,a);audit.audit('appkey:use','appKeys',key.id,{label:key.label,scope:key.scope,method:request.method,path:url.pathname});audit.sql('UPDATE g_app_keys SET last_used_at=? WHERE id=?',Date.now(),key.id);await audit.commit()
 const responseHeaders={...headers,'gauge-api-version':'1'}
 if(url.pathname==='/api/gauge/v1/projects'){
  need(request.method==='GET','Use GET for projects',405);need(key.scope.includes('projects:read'),'Project read scope required',403)
  const limit=Number(url.searchParams.get('limit')??50);need(Number.isInteger(limit)&&limit>=1&&limit<=100,'Page size must be 1 to 100')
  const clientId=url.searchParams.get('clientId')??'',q=url.searchParams.get('q')??''
  const rows=(await visible(env,a)).engagements.filter(r=>a.appKey!.engagementIds.includes(r.id)&&(!clientId||r.value.clientId===clientId)&&r.value.name.toLowerCase().includes(q.toLowerCase())).sort((x,y)=>x.id.localeCompare(y.id))
  const fingerprint=sha256(canonicalJson({key:key.id,clientId,q,rows})),cursor=url.searchParams.get('cursor');let start=0
  if(cursor){const c=decode(cursor);need(c.fingerprint===fingerprint,'Project list or filters changed; restart pagination',409);const index=rows.findIndex(r=>r.id===c.after);need(index>=0,'Invalid page cursor');start=index+1}
  const projects=rows.slice(start,start+limit),next=start+limit<rows.length?encode({fingerprint,after:projects.at(-1)!.id}):null
  await fence(env,a);return Response.json({version:'1',projects,nextCursor:next},{headers:responseHeaders})
 }
 need(url.pathname==='/api/gauge/v1/time','App credential cannot open this route',403)
 need(request.method==='POST','Use POST for draft time',405);need(key.scope.includes('time:write'),'Draft time scope required',403)
 need(Number(request.headers.get('content-length')??0)<=16384,'Request too large',413)
 const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;if(reader){for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();need(false,'Request too large',413)}chunks.push(value)}}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 let input:any;try{input=JSON.parse(new TextDecoder().decode(bytes))}catch{need(false,'Use a JSON object')}
 need(input&&typeof input==='object'&&!Array.isArray(input),'Use a JSON object')
 need(!input.action||input.action==='time:save','App credentials save draft time only',403)
 const requestKey=text(input.key,'Unique request key',120)
 // Namespace receipts by credential, so another app cannot receive its outcome.
 const result=await command(env,a,'time:save',{...input,key:'app:'+key.id+':'+requestKey})
 return Response.json(publicResult(result),{headers:responseHeaders})
}
