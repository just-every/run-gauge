import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Actor, Transaction, get } from './store'
import { decode, need, sum, workDate, type Row, type Value } from './model'
import { minor, objectId, stripeId, stripeList, stripeRequest } from './stripe-api'
import { linkAuthority, rowsFor, stripeConnection, stripeCredential, stripeUse } from './stripe-store'

/** Every amount comes from latest canonical objects, never event ordering or the hosted return URL. */
export async function canonicalPayment(key:string,link:Row):Promise<Value>{
 const sessionId=stripeId(link.value.sessionId,'cs')
 const session=await stripeRequest(key,'GET','/v1/checkout/sessions/'+sessionId)
 need(session.id===sessionId&&session.mode==='payment'&&session.client_reference_id===link.id&&session.metadata?.gaugeLinkId===link.id&&session.metadata?.gaugeInvoiceId===link.value.invoiceId,'Checkout session does not match this exact invoice instruction',409)
 need(session.currency===link.value.currency.toLowerCase()&&session.amount_total===link.value.amountMinor,'Checkout amount or currency differs from the owner instruction',409)
 need(['open','complete','expired'].includes(session.status)&&['paid','unpaid','no_payment_required'].includes(session.payment_status),'Stripe returned an unknown checkout state',409)
 if(link.value.testMode!==undefined)need(session.livemode===!link.value.testMode,'Stripe canonical checkout mode differs from its instruction',409)
 const paymentIntentId=objectId(session.payment_intent)
 const base={sessionStatus:session.status,sessionPaymentStatus:session.payment_status,paymentIntentId,pendingMinor:0,settledMinor:0,refundedMinor:0,disputedMinor:0,returnedMinor:0,feeMinor:null,netMinor:null,feeCurrency:null,balanceTransactionId:null,balanceStatus:null,refunds:[],disputes:[],refundableMinor:0}
 if(!paymentIntentId)return {...base,status:session.status==='expired'?'expired':'open',evidenceFingerprint:sha256(canonicalJson({sessionId,status:session.status,payment_status:session.payment_status}))}
 stripeId(paymentIntentId,'pi')
 const intent=await stripeRequest(key,'GET','/v1/payment_intents/'+paymentIntentId)
 need(intent.id===paymentIntentId&&intent.amount===link.value.amountMinor&&intent.currency===link.value.currency.toLowerCase()&&intent.metadata?.gaugeLinkId===link.id&&intent.metadata?.gaugeInvoiceId===link.value.invoiceId,'Payment intent differs from the exact invoice instruction',409)
 need(['requires_payment_method','requires_confirmation','requires_action','processing','requires_capture','canceled','succeeded'].includes(intent.status),'Stripe returned an unknown payment intent state',409)
 const charges=await stripeList(key,'/v1/charges?payment_intent='+encodeURIComponent(paymentIntentId)+'&expand[]=data.balance_transaction')
 need(charges.every(c=>objectId(c.payment_intent)===paymentIntentId&&c.currency===intent.currency),'Charge identity or currency differs from its payment intent',409)
 const paid=charges.filter(c=>c.paid===true&&c.captured===true&&c.status==='succeeded')
 need(paid.length<=1,'Payment intent has ambiguous successful charges; inspect in Stripe',409)
 const latestId=objectId(intent.latest_charge),charge=paid[0]??charges.find(c=>c.id===latestId)
 if(!charge){need(!['succeeded','processing'].includes(intent.status),'Stripe has not provided complete charge evidence',409);return {...base,status:intent.status==='canceled'?'cancelled':'failed',evidenceFingerprint:sha256(canonicalJson({sessionId,paymentIntentId,intentStatus:intent.status}))}}
 const chargeId=stripeId(charge.id,'ch')
 const refunds=await stripeList(key,'/v1/refunds?charge='+encodeURIComponent(chargeId)+'&expand[]=data.balance_transaction')
 const disputes=await stripeList(key,'/v1/disputes?charge='+encodeURIComponent(chargeId))
 const safeRefunds=refunds.map(r=>{need(['pending','requires_action','succeeded','failed','canceled'].includes(r.status),'Unknown canonical refund status',409);need(objectId(r.charge)===chargeId&&r.currency===intent.currency,'Refund differs from this charge',409);return {id:stripeId(r.id,'re'),amountMinor:minor(r.amount),status:r.status,claimId:typeof r.metadata?.gaugeRefundId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(r.metadata.gaugeRefundId)?r.metadata.gaugeRefundId:null,createdAt:minor(r.created)*1000}})
 const safeDisputes=disputes.map(d=>{need(objectId(d.charge)===chargeId&&d.currency===intent.currency,'Dispute differs from this charge',409);need(['warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost'].includes(d.status),'Unknown canonical dispute status',409);return {id:stripeId(d.id,'dp'),amountMinor:minor(d.amount),status:d.status,reason:typeof d.reason==='string'&&/^[a-z_]{1,80}$/.test(d.reason)?d.reason:'unspecified',createdAt:minor(d.created)*1000}})
 const refundedMinor=sum(safeRefunds.filter(r=>r.status==='succeeded').map(r=>r.amountMinor))
 need(refundedMinor===minor(charge.amount_refunded),'Stripe refund total does not reconcile to canonical refunds',409)
 const activeDisputes=safeDisputes.filter(d=>['needs_response','under_review','lost'].includes(d.status))
 const returnedMinor=link.value.method==='us_bank_account'?sum(activeDisputes.filter(d=>d.status==='lost').map(d=>d.amountMinor)):0
 const disputedMinor=sum(activeDisputes.map(d=>d.amountMinor))-returnedMinor
 let balance=charge.balance_transaction
 if(typeof balance==='string')balance=await stripeRequest(key,'GET','/v1/balance_transactions/'+stripeId(balance,'txn'))
 if(balance){need(balance.object==='balance_transaction'&&objectId(balance.source)===chargeId&&['available','pending'].includes(balance.status),'Canonical charge balance transaction does not match',409)}
 const amountMinor=minor(intent.amount),successful=intent.status==='succeeded'&&charge.paid===true&&charge.captured===true&&charge.status==='succeeded'
 const settled=successful&&balance?.status==='available'
 const failed=intent.status==='canceled'||intent.status==='requires_payment_method'||charge.status==='failed'
 const failedReturn=link.value.method==='us_bank_account'&&link.value.everSettled&&failed?amountMinor:0
 const totalReturned=Math.max(returnedMinor,failedReturn)
 need(refundedMinor+disputedMinor+totalReturned<=amountMinor,'Stripe reversal totals exceed payment principal',409)
 const settledMinor=settled?amountMinor:0,pendingMinor=!settled&&!failed&&(intent.status==='processing'||successful)?Math.max(0,amountMinor-refundedMinor-disputedMinor-totalReturned):0
 const transactions:Value[]=[]
 if(balance)transactions.push(balance)
 for(const r of refunds){if(r.status!=='succeeded')continue;let b=r.balance_transaction;if(typeof b==='string')b=await stripeRequest(key,'GET','/v1/balance_transactions/'+stripeId(b,'txn'));if(b)transactions.push(b)}
 for(const d of disputes)for(let b of d.balance_transactions??[]){if(typeof b==='string')b=await stripeRequest(key,'GET','/v1/balance_transactions/'+stripeId(b,'txn'));if(b)transactions.push(b)}
 const unique=[...new Map(transactions.map(b=>[stripeId(b.id,'txn'),b])).values()]
 const feeByCurrency:Record<string,number>={}
 for(const b of unique){need(typeof b.currency==='string'&&/^[a-z]{3}$/.test(b.currency)&&Number.isSafeInteger(b.fee),'Stripe fee currency or amount is unavailable',409);const currency=b.currency.toUpperCase();feeByCurrency[currency]=sum([feeByCurrency[currency]??0,b.fee])}
 const otherCurrencies=Object.keys(feeByCurrency).filter(c=>c!==link.value.currency)
 const feeMinor=otherCurrencies.length?null:feeByCurrency[link.value.currency]??(balance?0:null)
 const principalMinor=Math.max(0,settledMinor-refundedMinor-disputedMinor-totalReturned)
 const status=totalReturned?'returned':disputedMinor?'disputed':refundedMinor===amountMinor?'refunded':refundedMinor?'partially-refunded':settled?'settled':failed?'failed':'pending'
 const result={...base,status,paymentIntentId,chargeId,amountMinor,pendingMinor,settledMinor,refundedMinor,disputedMinor,returnedMinor:totalReturned,feeMinor,feeByCurrency,feeCurrency:balance?.currency?.toUpperCase()??null,netMinor:feeMinor===null?null:Math.max(0,(successful?amountMinor:0)-refundedMinor-disputedMinor-totalReturned)-feeMinor,principalMinor,refundableMinor:Math.max(0,(successful?amountMinor:0)-refundedMinor-disputedMinor-totalReturned-sum(safeRefunds.filter(r=>['pending','requires_action'].includes(r.status)).map(r=>r.amountMinor))),balanceTransactionId:balance?.id??null,balanceStatus:balance?.status??null,availableAt:balance?.available_on?minor(balance.available_on)*1000:null,refunds:safeRefunds,disputes:safeDisputes,intentStatus:intent.status}
 return {...result,evidenceFingerprint:sha256(canonicalJson(result))}
}

export async function applyCanonical(env:Bindings,a:Actor,tx:Transaction,link:Row,connection:Row,evidence:Value):Promise<Row>{
 await linkAuthority(env,tx,link)
 tx.observe('paymentLinks',link)
 const invoice=await get(env,'invoices',link.value.invoiceId);tx.observe('invoices',invoice)
 need(invoice.revision===link.value.invoiceRevision&&invoice.value.currency===link.value.currency,'Invoice instruction changed',409)
 const at=Date.now(),lastReadAt=at,nextReadAt=at+3600000
 let payment:Row|undefined
 if(evidence.paymentIntentId){
  const existing=await rowsFor(env,'processorPayments','paymentIntentId',evidence.paymentIntentId)
  need(existing.length<=1,'Duplicate local processor intent',409);payment=existing[0]
  if(payment)need(payment.value.linkId===link.id&&payment.value.connectionId===connection.id,'Payment intent is already bound to another invoice instruction',409)
  const allocations=payment?await rowsFor(env,'payments','processorPaymentId',payment.id):[]
  const oldAmount=sum(allocations.map(p=>p.value.amountMinor))
  const standing=await env.DB.prepare("SELECT COALESCE((SELECT SUM(amount_minor) FROM g_payments WHERE invoice_id=?1),0)+COALESCE((SELECT SUM(amount_minor) FROM g_invoiceCorrections WHERE invoice_id=?1 AND status='issued' AND kind<>'void'),0) AS used,EXISTS(SELECT 1 FROM g_invoiceCorrections WHERE invoice_id=?1 AND status='issued' AND kind='void') AS voided").bind(invoice.id).first<{used:number;voided:number}>()
  const used=standing?.used??0
  const room=standing?.voided?0:Math.max(0,invoice.value.totalMinor-used+oldAmount)
  const principal=evidence.principalMinor??0,allocatedMinor=Math.min(principal,room),unappliedMinor=principal-allocatedMinor
  tx.guard("COALESCE((SELECT SUM(amount_minor) FROM g_payments WHERE invoice_id=?1),0)+COALESCE((SELECT SUM(amount_minor) FROM g_invoiceCorrections WHERE invoice_id=?1 AND status='issued' AND kind<>'void'),0)=?2 AND EXISTS(SELECT 1 FROM g_invoiceCorrections WHERE invoice_id=?1 AND status='issued' AND kind='void')=?3",invoice.id,used,standing?.voided??0)
  const {sessionStatus,sessionPaymentStatus,evidenceFingerprint,principalMinor,...safe}=evidence
  const value={...payment?.value,...safe,invoiceId:invoice.id,linkId:link.id,connectionId:connection.id,credentialVersion:link.value.credentialVersion,currency:link.value.currency,method:link.value.method,allocatedMinor,unappliedMinor,lastReadAt,nextReadAt,evidenceFingerprint,verification:'Stripe canonical readback',everSettled:payment?.value.everSettled||evidence.settledMinor>0,recordedBy:payment?.value.recordedBy??a.session.operator.id,recordedAt:payment?.value.recordedAt??at}
  payment=await tx.record('processorPayments',value,payment,undefined,'stripe:reconcile')
  // Append dated signed adjustments so a later return never rewrites earlier cash.
  if(oldAmount!==allocatedMinor){
   const date=workDate(at,a.timezone)<invoice.value.issueDate?invoice.value.issueDate:workDate(at,a.timezone)
   await tx.record('payments',{invoiceId:invoice.id,engagementId:invoice.value.engagementId,currency:invoice.value.currency,amountMinor:allocatedMinor-oldAmount,date,reference:'stripe:'+evidence.paymentIntentId+':'+evidence.evidenceFingerprint,processorPaymentId:payment.id,source:'stripe',verification:'Stripe canonical readback; balance available',recordedBy:a.session.operator.id,recordedAt:at,reconciledAt:at},undefined,undefined,'stripe:allocation')
  }
 }
 const refundClaims=(await rowsFor(env,'processorEvents','linkId',link.id)).filter(e=>e.value.type==='refund'&&['sending','uncertain','pending'].includes(e.value.status))
 for(const claim of refundClaims){
  const confirmed=(evidence.refunds??[]).find((r:Value)=>r.claimId===claim.id)
  if(!confirmed)continue
  need(confirmed.amountMinor===claim.value.amountMinor,'Canonical refund differs from its owner claim',409)
  await tx.record('processorEvents',{...claim.value,refundId:confirmed.id,status:confirmed.status==='canceled'?'failed':confirmed.status,canonicalReadAt:at,exceptionClass:null},claim,undefined,'stripe:refund-readback')
 }
 const saved=await tx.record('paymentLinks',{...link.value,status:evidence.status,paymentIntentId:evidence.paymentIntentId,processorPaymentId:payment?.id??null,everSettled:link.value.everSettled||evidence.settledMinor>0,lastReadAt,nextReadAt,evidenceFingerprint:evidence.evidenceFingerprint,exceptionClass:null},link,undefined,'stripe:reconcile')
 await stripeUse(tx,connection,link.id,'payment:read')
 return saved
}

export async function reconcileLink(env:Bindings,a:Actor,tx:Transaction,link:Row){
 await linkAuthority(env,tx,link)
 const connection=await stripeConnection(env,tx,link.value.connectionId,link.value.credentialVersion)
 const credential=await stripeCredential(env,connection,link.id,'payment:read')
 const evidence=await canonicalPayment(credential.secretKey,link)
 await stripeCredential(env,connection,link.id,'payment:read')
 return {saved:await applyCanonical(env,a,tx,link,connection,evidence),connection,evidence}
}
