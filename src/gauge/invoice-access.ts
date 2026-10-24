import { operatorAuth, type Bindings } from '../auth.server'
import { actor, fence, get, Transaction, type Actor } from './store'
import { type Value, type Row, need, text, integer, Fault } from './model'
import { invoiceDocumentResponse } from './invoice-documents'

/** Exact recipient authorization is separate from immutable financial documents. */
export async function invoiceAccessCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(!['invoice:release','invoice:revoke-access'].includes(action))return null
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner authorizes client invoice access',403)
 const reason=text(input.reason,'Authorization reason')
 if(action==='invoice:revoke-access'){
  const row=await get(env,'invoiceAccess',text(input.id,'Invoice access'))
  need(row.revision===input.revision,'Invoice access changed; reload',409)
  tx.sql('DELETE FROM g_invoice_access_authority WHERE access_id=?',row.id)
  return tx.record('invoiceAccess',{...row.value,status:'revoked',revokedBy:a.session.operator.id,revokedAt:Date.now(),revocationReason:reason},row,undefined,action)
 }
 const invoice=await get(env,'invoices',text(input.id,'Issued invoice'))
 need(invoice.revision===input.revision&&invoice.value.document&&invoice.value.pdf,'Choose an exact issued invoice with its retained document',409)
 tx.observe('invoices',invoice)
 const contact=text(input.contact,'Invited recipient email',254).toLowerCase(),days=integer(input.days??7,'Access duration',1,30)
 const recipient=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=? AND status='active' AND role='member'").bind(contact).first<{id:string}>()
 need(recipient,'Invite the recipient and have them confirm their native email first',409)
 tx.guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND status='active' AND role='member') AND NOT EXISTS(SELECT 1 FROM g_grants WHERE operator_id=? AND enabled=1)",recipient.id,contact,recipient.id)
 const row=await tx.record('invoiceAccess',{invoiceId:invoice.id,invoiceRevision:invoice.revision,pdfSha256:invoice.value.pdf.sha256,contact,recipientId:recipient.id,ownerId:a.session.operator.id,status:'released',releasedAt:Date.now(),expiresAt:Date.now()+days*86400000,reason},undefined,undefined,action)
 tx.sql('INSERT INTO g_invoice_access_authority(access_id,revision,recipient_id,owner_id) VALUES(?,?,?,?)',row.id,row.revision,recipient.id,a.session.operator.id)
 return row
}
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex,nofollow'}
export async function invoiceClientResponse(request:Request,env:Bindings):Promise<Response>{
 try{
  const url=new URL(request.url),match=url.pathname.match(/^\/app\/client-invoices\/([^/%]+)$/)
  need(match,'Invoice access not found',404);need(request.method==='GET','Use GET',405)
  need(url.origin===env.AUTH_ORIGIN&&(!request.headers.has('host')||request.headers.get('host')===url.host),'Invalid host',403)
  const session=await operatorAuth(env).getSession(request)
  if(!session)return new Response(null,{status:303,headers:{...headers,location:'/signin?returnTo='+encodeURIComponent(url.pathname)}})
  need(session.kind==='native','Confirm your invited email through native sign-in',403)
  const access=await get(env,'invoiceAccess',match[1]),a:Actor={...await actor(env,session),role:'client',clientInvoice:{id:access.id,revision:access.revision}}
  await fence(env,a)
  need(['html','pdf','detail-pdf','csv'].includes(url.searchParams.get('format')??'html'),'Choose the retained invoice or its attachment')
  return await invoiceDocumentResponse(env,a,url,access.value.invoiceId,true)
 }catch(error){return Response.json({error:error instanceof Fault?error.message:'Invoice access changed; ask the agency owner'},{status:error instanceof Fault?error.status:409,headers})}
}
