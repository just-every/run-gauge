import { hours, money } from './ui-format'
import { fieldMoney } from './ui-custom-fields'
import { operatorAuth, type Bindings } from '../auth.server'
import { type Actor, type Transaction, actor, all, get, fence, finance } from './store'
import { type Value, type Row, type Kind, need, text, integer, uuid, Fault, sum } from './model'
import { visibleCustom } from './custom-values'
import { retainerStatements } from './retainer-statements'
import { clientDeliveryPage } from './ui-client-delivery'
import { escape as e, form, input, area, choices } from './ui-forms'

export async function clientPortalCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Value|null>{
 if(!['client:invite-project','client:revoke-project','client:share-money','client:configure-role'].includes(action))return null
 need(a.session.kind==='native'&&finance(a),'Native finance authority required',403)
 const reason=text(input.reason,'Client access reason')
 const roleInput=()=>{
  const role=input.clientRole??'sponsor'
  need(['sponsor','collaborator'].includes(role),'Choose sponsor or collaborator')
  need(['yes','no',undefined].includes(input.reviewEnabled),'Choose whether delivery decisions are permitted')
  need(role!=='collaborator'||input.reviewEnabled!=='yes','Collaborators cannot approve deliveries',403)
  return {role,review:role==='sponsor'&&input.reviewEnabled!=='no'?1:0}
 }
 if(action==='client:invite-project'){
  need(a.role==='owner','Only the owner invites project recipients',403)
  const project=await get(env,'engagements',text(input.engagementId,'Project'));tx.observe('engagements',project)
  const contact=text(input.contact,'Confirmed recipient email',254).toLowerCase(),recipient=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=? AND status='active' AND role='member'").bind(contact).first<{id:string}>()
  need(recipient,'Invite and confirm the recipient email through Access first',409)
  tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,contact,recipient.id)
  const {role,review}=roleInput()
  const id=uuid(),revision=uuid(),expiresAt=Date.now()+integer(input.days??7,'Access duration',1,30)*86400000
  // Fresh explicit scope replaces earlier authority; revocation cannot fall back to an older invitation.
  tx.sql('DELETE FROM g_client_portal_authority WHERE engagement_id=? AND recipient_id=?',project.id,recipient.id)
  tx.sql('INSERT INTO g_client_portal_authority(id,revision,engagement_id,client_id,recipient_id,contact,owner_id,expires_at,client_role,review_enabled) VALUES(?,?,?,?,?,?,?,?,?,?)',id,revision,project.id,project.value.clientId,recipient.id,contact,a.session.operator.id,expiresAt,role,review)
  tx.audit(action,'engagements',project.id,{id,revision,contact,expiresAt,reason,shareMoney:false,clientRole:role,reviewEnabled:!!review})
  return {id,revision}
 }
 const grant=await env.DB.prepare('SELECT * FROM g_client_portal_authority WHERE id=?').bind(text(input.id,'Client access')).first<any>()
 need(grant&&grant.revision===input.revision,'Client access changed; reload',409)
 tx.guard('EXISTS(SELECT 1 FROM g_client_portal_authority WHERE id=? AND revision=?)',grant.id,grant.revision)
 const revision=uuid()
 if(action==='client:configure-role'){
  need(a.role==='owner','Only the owner configures client roles',403)
  need(input.clientRole!==undefined&&input.reviewEnabled!==undefined,'Choose both the role and delivery decision permission')
  const {role,review}=roleInput()
  tx.sql("UPDATE g_client_portal_authority SET revision=?,client_role=?,review_enabled=?,share_money=CASE WHEN ?='collaborator' THEN 0 ELSE share_money END WHERE id=?",revision,role,review,role,grant.id)
  tx.audit(action,'engagements',grant.engagement_id,{id:grant.id,revision,clientRole:role,reviewEnabled:!!review,reason})
  return {id:grant.id,revision}
 }
 if(action==='client:revoke-project')tx.sql('UPDATE g_client_portal_authority SET revision=?,expires_at=0,share_money=0,review_enabled=0 WHERE id=?',revision,grant.id)
 else {need(grant.client_role!=='collaborator'||input.shareMoney!=='yes','Collaborators cannot receive monetary details',403);need(['yes','no'].includes(input.shareMoney),'Choose whether to share monetary details');tx.sql('UPDATE g_client_portal_authority SET revision=?,share_money=? WHERE id=?',revision,input.shareMoney==='yes'?1:0,grant.id)}
 tx.audit(action,'engagements',grant.engagement_id,{id:grant.id,revision,shareMoney:action==='client:share-money'?input.shareMoney==='yes':false,reason})
 return {id:grant.id,revision}
}
const quantity=(b:Value,key:string)=>b.unit==='hours'?hours(b[key]):money(b[key],b.currency)
const pick=(v:Value,keys:string[]):Value=>Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]))
export async function clientPortalResponse(request:Request,env:Bindings):Promise<Response>{
 const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}
 try{
  const url=new URL(request.url),match=url.pathname.match(/^\/(app|api\/gauge)\/client-projects\/([^/%]+)$/)
  need(match,'Project not found',404);need(request.method==='GET','Use GET',405)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  const session=await operatorAuth(env).getSession(request);need(session&&session.kind==='native','Sign in with your invited email',401)
  const grant=await env.DB.prepare('SELECT * FROM g_client_portal_authority WHERE engagement_id=? AND recipient_id=? ORDER BY expires_at DESC LIMIT 1').bind(match[2],session.operator.id).first<any>()
  need(grant,'Project is not invited',403)
  const a:Actor={...await actor(env,session),role:'client',clientPortal:{id:grant.id,revision:grant.revision}}
  await fence(env,a)
  const sponsor=grant.client_role==='sponsor',shareMoney=sponsor&&!!grant.share_money
  const project=await get(env,'engagements',match[2]),client=await get(env,'clients',grant.client_id)
  const rows=async(k:Kind)=>(await all(env,k)).filter(r=>r.value.engagementId===project.id)
  const tasks=await rows('tasks'),milestones=await rows('milestones'),budgets=await rows('budgets')
  const data={retainers:await rows('retainers'),retainerPeriods:await rows('retainerPeriods'),retainerCloses:await rows('retainerCloses'),retainerAdjustments:await rows('retainerAdjustments'),time:await rows('time')}
  const statements:Value[]=(sponsor?retainerStatements(data):[]).filter(b=>shareMoney||b.unit==='hours').map(b=>({...pick(data.retainerPeriods.find(p=>p.id===b.periodId)!.value,['periodStart','periodEnd']),...pick(b,['periodId','retainerId','unit','currency','allowance','rollover','deficitOpening','opening','consumed','remaining','pending','pendingSeconds','projectedRemaining','provisional','adjustments','projectedAdjustments','unallocatedSeconds','closed']),sources:[...new Set([...b.sources,...b.pendingSources])].map(id=>{const t=data.time.find(t=>t.id===id);return t?{id:t.id,revision:t.revision,...pick(t.value,['workDate','durationSeconds','status','service'])}:null}).filter(Boolean),rules:data.retainers.filter(r=>r.id===b.retainerId).map(r=>({id:r.id,revision:r.revision,...pick(r.value.terms,['name','unit','allowance']),rules:pick(r.value.terms.rules??{},['carryCap','carryPeriods','deficit'])})),linkedAdjustments:b.linkedAdjustments.map((r:Value)=>pick(r,['id','revision','unit','kind','status','periodId','originPeriodId','allowanceDelta','sourceId','sourceRevision','ruleId','ruleRevision']))}))
  // Share only approved aggregate effort and commercial hourly value, never rates or costs.
  const approved=data.time.filter(t=>t.value.status==='approved'),priced=approved.filter(t=>t.value.billable&&t.value.economics?.mode==='hourly')
  const knownHourlyValueMinor=sum(priced.map(t=>t.value.economics?.billMinor??0)),unknownHourlyValues=priced.filter(t=>t.value.economics?.billMinor==null).length
  const burn=shareMoney?{approvedSeconds:sum(approved.map(t=>t.value.durationSeconds)),pendingSeconds:sum(data.time.filter(t=>t.value.status!=='approved'&&t.value.durationSeconds>0).map(t=>t.value.durationSeconds)),hourlyValueMinor:unknownHourlyValues?null:knownHourlyValueMinor,knownHourlyValueMinor,unknownHourlyValues,currency:project.value.currency}:null
  const fields=(scope:string,row:Row)=>Object.entries(visibleCustom(a,scope,row.value).customFields??{}).flatMap(([id,value])=>{
   const f=a.customDefinitions!.find(f=>f.id===id)!
   if(f.value.type==='currency'&&!shareMoney)return []
   // A person field is a selected reference, never an invitation to inspect a staff record.
   return [{id,definitionRevision:f.revision,valueRevision:row.value.customFieldVersions[id],name:f.value.name,type:f.value.type,currency:f.value.currency,value}]
  })
  const customFields=[{scope:'clients',recordId:client.id,fields:fields('clients',client)},{scope:'engagements',recordId:project.id,fields:fields('engagements',project)},...tasks.map(t=>({scope:'tasks',recordId:t.id,fields:fields('tasks',t)}))].filter(r=>r.fields.length)
  const document:Value={clientRole:grant.client_role,reviewEnabled:sponsor&&!!grant.review_enabled,burn,customFields,id:project.id,name:project.value.name,client:client.value.name,scope:project.value.scope,tasks:tasks.map(r=>({id:r.id,...pick(r.value,['name','status','from','to'])})),milestones:milestones.map(r=>({id:r.id,...pick(r.value,['name','due','status']),reviews:(sponsor&&grant.review_enabled?r.value.delivery?.clientReviews??[]:[]).filter((v:Value)=>v.recipientId===session.operator.id).map((v:Value)=>({id:v.id,name:v.name,date:v.date,href:`/app/client-milestones/${r.id}/${v.id}`}))})),budgets:shareMoney?budgets.filter(r=>r.value.status==='approved').map(r=>({id:r.id,revision:r.revision,...pick(r.value,['amountMinor','currency','effortSeconds','mode'])})):[],statements}
  await fence(env,a)
  if(match[1]!=='app')return Response.json(document,{headers})
  return clientDeliveryPage(`<h2>${e(document.name)}</h2><p>${e(document.client)} · ${e(document.clientRole)}</p><section class="g-card"><h2>Scope</h2><p>${e(document.scope)}</p></section><section class="g-card"><h2>Deliverables and actions</h2>${document.tasks.map((t:Value)=>`<p>${e(t.name)} · ${e(t.status)}</p>`).join('')}${document.milestones.map((m:Value)=>`<h3>${e(m.name)}</h3><p>Due ${e(m.due)}</p>${m.reviews.map((r:Value)=>`<p><a href="${e(r.href)}">Review ${e(r.name)} · ${e(r.date)}</a></p>`).join('')}`).join('')}</section>${customFields.length?`<section class="g-card"><h2>Shared project fields</h2>${customFields.map(r=>r.fields.map(f=>`<p>${e(f.name)} · ${e(f.type==='currency'?fieldMoney(Number(f.value),f.currency):Array.isArray(f.value)?f.value.join(', '):String(f.value))}</p>`).join('')).join('')}</section>`:''}${shareMoney?`<section class="g-card"><h2>Shared budget</h2>${document.budgets.map((b:Value)=>`<p>${e(b.currency)} ${(b.amountMinor/100).toFixed(2)} · ${e(b.mode)}</p>`).join('')}<h3>Approved burn</h3><p>Approved effort ${e(hours(burn!.approvedSeconds))} · provisional pending ${e(hours(burn!.pendingSeconds))}</p><p>Approved hourly work value ${e(money(burn!.hourlyValueMinor,burn!.currency))} · known subtotal ${e(money(burn!.knownHourlyValueMinor,burn!.currency))} · unknown values ${e(burn!.unknownHourlyValues)}. Commercial work value, not invoiced or paid.</p></section>`:''}${sponsor?`<section class="g-card"><h2>Retainer statements</h2>${statements.map(b=>`<article><h3>${e(b.rules[0]?.name)}</h3><p>${e(b.periodStart)} to ${e(b.periodEnd)}</p><p>${e(b.unit)} · opening ${e(quantity(b,'opening'))} · rollover ${e(quantity(b,'rollover'))} · approved ${e(quantity(b,'consumed'))} · adjustments ${e(quantity(b,'adjustments'))} · remaining ${e(quantity(b,'remaining'))}</p><p>Provisional pending ${e(quantity(b,'pending'))} · projected remaining ${e(quantity(b,'projectedRemaining'))} · prepared adjustments ${e(quantity(b,'projectedAdjustments'))}</p><details><summary>Sources and rule versions</summary>${b.sources.map((t:Value)=>`<p>${e(t.workDate)} · ${e(t.durationSeconds)} seconds · ${e(t.status)} · revision ${e(t.revision)}</p>`).join('')}${b.linkedAdjustments.map((r:Value)=>`<p>Linked ${e(r.kind)} · ${e(r.status)} · allowance change ${e(quantity({...b,change:r.allowanceDelta},'change'))} · source ${e(r.sourceId??'None')} · source revision ${e(r.sourceRevision??'None')} · rule version ${e(r.ruleRevision)}</p>`).join('')}${b.rules.map((r:Value)=>`<p>${e(r.name)} · version ${e(r.revision)}</p>`).join('')}</details></article>`).join('')||'<p>No permitted retainer statements.</p>'}</section>`:''}`,200,'Client project')
 }catch(error){return Response.json({error:error instanceof Fault?error.message:'Client project unavailable'},{status:error instanceof Fault?error.status:409,headers})}
}
export async function clientPortalSection(env:Bindings,a:Actor,project:Row){
 if(!finance(a))return ''
 const grants=(await env.DB.prepare('SELECT * FROM g_client_portal_authority WHERE engagement_id=? AND expires_at>0').bind(project.id).all<any>()).results
 return `<section class="g-card"><h2>Client project access</h2><p>Native confirmed recipients only. No notification is sent. Monetary sharing is off until finance chooses it.</p>${a.role==='owner'?form('client:invite-project','Invite confirmed project contact',`<input type="hidden" name="engagementId" value="${e(project.id)}">`+input('contact','Confirmed recipient email','','email')+input('days','Access duration in days',7,'number')+choices('clientRole','Client role',['sponsor','collaborator'],'sponsor')+choices('reviewEnabled','Permit released delivery decisions',['yes','no'],'yes')+area('reason','Client access reason'),undefined,'Invite to project'):''}${grants.map(g=>`<p>${e(g.contact)} · ${e(g.client_role)} · delivery decisions ${g.review_enabled?'permitted':'denied'} · <a href="/app/client-projects/${e(project.id)}">Client project link</a></p>${a.role==='owner'?form('client:configure-role','Configure client role',choices('clientRole','Client role',['sponsor','collaborator'],g.client_role)+choices('reviewEnabled','Permit released delivery decisions',['yes','no'],g.review_enabled?'yes':'no')+area('reason','Client access reason'),{id:g.id,revision:g.revision,value:{}},'Save client role'):''}${form('client:share-money','Choose monetary sharing',choices('shareMoney','Share monetary details',['no','yes'],g.share_money?'yes':'no')+area('reason','Client access reason'),{id:g.id,revision:g.revision,value:{}},'Save sharing')}${form('client:revoke-project','Revoke project access',area('reason','Client access reason'),{id:g.id,revision:g.revision,value:{}},'Revoke project access')}`).join('')}</section>`
}
