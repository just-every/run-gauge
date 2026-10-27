import type { Bindings } from '../auth.server'
import { type Actor, get } from './store'
import { integer, need, text, uuid, sum, type Row, type Value } from './model'
import { settledMinor } from './invoices'
import { hostedUrl, objectId, stripeId, stripeRequest, stripeList, StripeFailure } from './stripe-api'
import { canonicalPayment, reconcileLink } from './stripe-reconcile'
import { claimStripe, failedStripe, finishStripe, linkAuthority, rowsFor, startStripe, stripeConnection, stripeCredential, stripeException, stripeTx, stripeUse } from './stripe-store'
export { stripeWebhook } from './stripe-webhook'
export { parseStripeCredential } from './stripe-api'

export const refundInstruction=(paymentId:string,amountMinor:number,currency:string)=>`Refund ${amountMinor} ${currency} for payment ${paymentId}`

async function account(env:Bindings,a:Actor,key:string,digest:string,input:Value){
 const tx=stripeTx(env,a,key,'stripe:account'),connection=await stripeConnection(env,tx,input.connectionId??input.id)
 const previous=(await rowsFor(env,'stripeAccounts','connectionId',connection.id))[0]
 if(input.revision!==undefined)need(connection.revision===input.revision,'Stripe connection changed; refresh',409)
 let canonical:Value
 try {const credential=await stripeCredential(env,connection,connection.id,'payment:read');canonical=await stripeRequest(credential.secretKey,'GET','/v1/account');await stripeCredential(env,connection,connection.id,'payment:read')}
 catch(error){return failedStripe(env,a,key,'stripe:account',connection,connection.id,'payment:read',error)}
 let testMode:boolean
 try{const credential=await stripeCredential(env,connection,connection.id,'payment:read');const balance=await stripeRequest(credential.secretKey,'GET','/v1/balance');need(typeof balance.livemode==='boolean','Stripe did not confirm account mode',409);testMode=!balance.livemode;await stripeCredential(env,connection,connection.id,'payment:read')}catch(error){return failedStripe(env,a,key,'stripe:account',connection,connection.id,'payment:read',error)}
 const requirements=canonical.requirements??{}
 const list=(v:any)=>{need(v===undefined||Array.isArray(v),'Stripe returned invalid account requirements',409);return (v??[]).map((x:unknown)=>{need(typeof x==='string'&&/^[a-zA-Z0-9_.-]{1,200}$/.test(x),'Stripe returned an unsafe account requirement',409);return x})}
 const disabledReason=typeof requirements.disabled_reason==='string'&&/^[a-z_.]{1,200}$/.test(requirements.disabled_reason)?requirements.disabled_reason:null
 const chargesEnabled=canonical.charges_enabled===true,payoutsEnabled=canonical.payouts_enabled===true
 const saved=await tx.record('stripeAccounts',{connectionId:connection.id,credentialVersion:connection.value.version,accountId:stripeId(canonical.id,'acct'),testMode,chargesEnabled,payoutsEnabled,detailsSubmitted:canonical.details_submitted===true,currentlyDue:list(requirements.currently_due),pastDue:list(requirements.past_due),pendingVerification:list(requirements.pending_verification),disabledReason,status:disabledReason?'restricted':chargesEnabled&&payoutsEnabled?'enabled':'onboarding-required',onboardingUrl:'https://dashboard.stripe.com/account/status',restrictedBusinessReview:'Stripe determines eligibility. The owner must review https://stripe.com/legal/restricted-businesses and resolve Stripe requirements before accepting live payments.',lastReadAt:Date.now()},previous,undefined,'stripe:account')
 await stripeUse(tx,connection,connection.id,'payment:read');return finishStripe(tx,digest,saved)
}

async function checkout(env:Bindings,a:Actor,key:string,digest:string,input:Value){
 const tx=stripeTx(env,a,key,'stripe:checkout'),invoice=await get(env,'invoices',text(input.id??input.invoiceId,'Invoice'))
 need(invoice.revision===(input.revision??input.invoiceRevision),'Choose the exact invoice revision',409);tx.observe('invoices',invoice)
 const connection=await stripeConnection(env,tx,input.connectionId)
 const method=text(input.method,'Payment method')
 need(method==='card'||method==='us_bank_account','Choose card or us_bank_account')
 need(method!=='us_bank_account'||invoice.value.currency==='USD','US bank account payments require a USD invoice')
 need(input.currency===undefined||input.currency===invoice.value.currency,'Payment currency differs from the invoice; no implicit FX')
 let testMode=false
 try {
  const credential=await stripeCredential(env,connection,connection.id,'payment:read')
  const merchant=await stripeRequest(credential.secretKey,'GET','/v1/account'),balance=await stripeRequest(credential.secretKey,'GET','/v1/balance')
  need(typeof balance.livemode==='boolean','Stripe did not confirm whether this connection is live or test mode',409)
  testMode=balance.livemode===false
  const requestedTest=input.testMode===true||input.testMode==='true'||input.testMode==='on'
  need(requestedTest===testMode,'Selected payment mode differs from Stripe; test mode can never authorize live collection')
  need(testMode||(merchant.charges_enabled===true&&merchant.payouts_enabled===true&&!merchant.requirements?.disabled_reason),'Stripe onboarding or account restrictions prevent live payments; inspect account requirements',409)
  await stripeCredential(env,connection,connection.id,'payment:read')
 }catch(error){return failedStripe(env,a,key,'stripe:checkout',connection,connection.id,'payment:read',error)}
 const amountMinor=integer(input.amountMinor,'Checkout amount',1,99999999),used=await settledMinor(env,invoice.id)
 const reservation=await env.DB.prepare("SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) AS amount FROM g_paymentLinks WHERE json_extract(data,'$.invoiceId')=? AND json_extract(data,'$.status') IN ('creating','uncertain','open','pending')").bind(invoice.id).first<{amount:number}>()
 const reserved=reservation?.amount??0
 need(amountMinor+reserved<=invoice.value.totalMinor-used,'Checkout amount exceeds the invoice outstanding amount or its active links; reconcile existing links first',409)
 tx.guard("COALESCE((SELECT SUM(amount_minor) FROM g_payments WHERE invoice_id=?1),0)+COALESCE((SELECT SUM(amount_minor) FROM g_invoiceCorrections WHERE invoice_id=?1 AND status='issued' AND kind<>'void'),0)=?2 AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections WHERE invoice_id=?1 AND status='issued' AND kind='void')",invoice.id,used)
 tx.guard("COALESCE((SELECT SUM(json_extract(data,'$.amountMinor')) FROM g_paymentLinks WHERE json_extract(data,'$.invoiceId')=? AND json_extract(data,'$.status') IN ('creating','uncertain','open','pending')),0)=?",invoice.id,reserved)
 const id=uuid(),createdAt=Date.now()
 const claimed=await tx.record('paymentLinks',{invoiceId:invoice.id,invoiceRevision:invoice.revision,connectionId:connection.id,credentialVersion:connection.value.version,amountMinor,currency:invoice.value.currency,method,testMode,status:'creating',sessionId:null,url:null,createdBy:a.session.operator.id,createdAt,lastReadAt:null,nextReadAt:createdAt,exceptionClass:null},undefined,id,'stripe:checkout-claim')
 tx.sql('INSERT INTO g_stripe_authority(link_id,owner_id,connection_id,credential_version) VALUES(?,?,?,?)',id,a.session.operator.id,connection.id,connection.value.version)
 await stripeUse(tx,connection,connection.id,'payment:read')
 await claimStripe(tx,digest,claimed,'paymentLinks')
 let status='uncertain',sessionId:string|null=null,url:string|null=null,error:unknown
 try {
  const credential=await stripeCredential(env,connection,id,'payment:write')
  const origin=new URL(env.AUTH_ORIGIN).origin
  const form=new URLSearchParams({mode:'payment',client_reference_id:id,'payment_method_types[0]':method,'line_items[0][price_data][currency]':invoice.value.currency.toLowerCase(),'line_items[0][price_data][unit_amount]':String(amountMinor),'line_items[0][price_data][product_data][name]':'Invoice '+invoice.value.number,'line_items[0][quantity]':'1',success_url:origin+'/app/billing?stripe=returned',cancel_url:origin+'/app/billing?stripe=cancelled','metadata[gaugeLinkId]':id,'metadata[gaugeInvoiceId]':invoice.id,'payment_intent_data[metadata][gaugeLinkId]':id,'payment_intent_data[metadata][gaugeInvoiceId]':invoice.id})
  const result=await stripeRequest(credential.secretKey,'POST','/v1/checkout/sessions',form,'gauge-checkout-'+id)
  need(result.mode==='payment'&&result.client_reference_id===id&&result.amount_total===amountMinor&&result.currency===invoice.value.currency.toLowerCase()&&result.metadata?.gaugeLinkId===id&&result.metadata?.gaugeInvoiceId===invoice.id,'Stripe did not confirm this exact checkout instruction',409)
  need(result.livemode===!testMode,'Stripe checkout mode differs from the reviewed connection',409)
  sessionId=stripeId(result.id,'cs');url=hostedUrl(result.url);status='open'
 } catch(caught){error=caught;if(caught instanceof StripeFailure&&caught.outcome!=='uncertain')status='refused'}
 const done=stripeTx(env,a,key,'stripe:checkout'),current=await get(env,'paymentLinks',id)
 const saved=await done.record('paymentLinks',{...current.value,status,sessionId,url,exceptionClass:error?stripeException(error):null,completedAt:Date.now()},current,undefined,'stripe:checkout')
 await stripeUse(done,connection,id,'payment:write',error)
 return finishStripe(done,digest,saved,{status})
}

async function reconcile(env:Bindings,a:Actor,key:string,digest:string,input:Value){
 const tx=stripeTx(env,a,key,'stripe:reconcile'),link=await get(env,'paymentLinks',text(input.id,'Payment link'))
 need(link.revision===input.revision,'Payment link changed; refresh',409)
 // An interrupted create may be resolved by an exact owner-supplied Stripe session id, never by reissuing it.
 let candidate=link
 if(!link.value.sessionId){text(input.reason,'Interrupted checkout reconciliation reason',500);candidate=await tx.record('paymentLinks',{...link.value,sessionId:stripeId(input.sessionId,'cs'),recoveryReason:input.reason},link,undefined,'stripe:bind-session')}
 let saved:Row
 try{const result=await reconcileLink(env,a,tx,candidate);saved=result.saved}
 catch(error){const connection=await get(env,'providerConnections',link.value.connectionId);return failedStripe(env,a,key,'stripe:reconcile',connection,link.id,'payment:read',error)}
 return finishStripe(tx,digest,saved)
}

async function refund(env:Bindings,a:Actor,key:string,digest:string,input:Value){
 const tx=stripeTx(env,a,key,'stripe:refund'),payment=await get(env,'processorPayments',text(input.id,'Processor payment'))
 need(payment.revision===input.revision,'Processor payment changed; reconcile and refresh',409)
 const amountMinor=integer(input.amountMinor,'Refund amount',1,99999999),reason=text(input.reason,'Refund reason',500)
 need(input.ownerInstruction===refundInstruction(payment.id,amountMinor,payment.value.currency),'Type the exact owner refund instruction shown for this payment')
 const link=await get(env,'paymentLinks',payment.value.linkId);await linkAuthority(env,tx,link)
 const connection=await stripeConnection(env,tx,link.value.connectionId,link.value.credentialVersion)
 let evidence:Value
 try{const credential=await stripeCredential(env,connection,payment.id,'payment:read');evidence=await canonicalPayment(credential.secretKey,link)}
 catch(error){return failedStripe(env,a,key,'stripe:refund',connection,payment.id,'payment:read',error)}
 need(evidence.paymentIntentId===payment.value.paymentIntentId&&amountMinor<=evidence.refundableMinor,'Refund exceeds the canonical refundable amount; reconcile first',409)
 tx.observe('processorPayments',payment);tx.observe('paymentLinks',link)
 tx.guard("NOT EXISTS(SELECT 1 FROM g_processorEvents WHERE json_extract(data,'$.paymentId')=? AND json_extract(data,'$.type')='refund' AND json_extract(data,'$.status') IN ('sending','uncertain','pending'))",payment.id)
 const id=uuid(),claimed=await tx.record('processorEvents',{type:'refund',paymentId:payment.id,linkId:link.id,invoiceId:payment.value.invoiceId,connectionId:connection.id,credentialVersion:connection.value.version,amountMinor,currency:payment.value.currency,reason,ownerInstruction:input.ownerInstruction,status:'sending',createdBy:a.session.operator.id,createdAt:Date.now()},undefined,id,'stripe:refund-claim')
 await stripeUse(tx,connection,payment.id,'payment:read')
 await claimStripe(tx,digest,claimed,'processorEvents')
 let result:Value={status:'uncertain'},error:unknown
 try{
  const credential=await stripeCredential(env,connection,id,'payment:write')
  const created=await stripeRequest(credential.secretKey,'POST','/v1/refunds',new URLSearchParams({payment_intent:payment.value.paymentIntentId,amount:String(amountMinor),reason:'requested_by_customer','metadata[gaugeRefundId]':id}),'gauge-refund-'+id)
  need(objectId(created.payment_intent)===payment.value.paymentIntentId&&created.amount===amountMinor&&created.currency===payment.value.currency.toLowerCase()&&created.metadata?.gaugeRefundId===id,'Stripe did not confirm this exact refund',409)
  result={refundId:stripeId(created.id,'re'),status:created.status==='succeeded'?'succeeded':created.status==='failed'||created.status==='canceled'?'failed':'pending'}
 }catch(caught){error=caught;if(caught instanceof StripeFailure&&caught.outcome!=='uncertain')result={status:'failed'}}
 const done=stripeTx(env,a,key,'stripe:refund'),current=await get(env,'processorEvents',id)
 const saved=await done.record('processorEvents',{...current.value,...result,exceptionClass:error?stripeException(error):null,completedAt:Date.now()},current,undefined,'stripe:refund')
 await stripeUse(done,connection,id,'payment:write',error)
 // The refund acknowledgement never changes paid status: a fresh canonical read reconciles every outcome together.
 return finishStripe(done,digest,saved,{status:result.status})
}

async function poll(env:Bindings,a:Actor,key:string,digest:string){
 const tx=stripeTx(env,a,key,'stripe:poll'),links=await env.DB.prepare("SELECT id,revision,data FROM g_paymentLinks WHERE COALESCE(json_extract(data,'$.nextReadAt'),0)<=? AND json_extract(data,'$.sessionId') IS NOT NULL ORDER BY json_extract(data,'$.nextReadAt'),id LIMIT 10").bind(Date.now()).all<{id:string;revision:string;data:string}>()
 let last:Row|undefined;const reconciled:string[]=[]
 for(const raw of links.results){const link={id:raw.id,revision:raw.revision,value:JSON.parse(raw.data)};const {saved}=await reconcileLink(env,a,tx,link);last=saved;reconciled.push(saved.id)}
 if(!last){last=await tx.record('processorEvents',{type:'poll',status:'current',at:Date.now(),count:0},undefined,undefined,'stripe:poll')}
 return finishStripe(tx,digest,last,{reconciled})
}


async function payout(env:Bindings,a:Actor,key:string,digest:string,input:Value){
 const tx=stripeTx(env,a,key,'stripe:payout'),connection=await stripeConnection(env,tx,input.connectionId)
 const payoutId=stripeId(input.payoutId??input.id,'po')
 let canonical:Value,members:Value[]
 try{
  const credential=await stripeCredential(env,connection,payoutId,'payment:read')
  canonical=await stripeRequest(credential.secretKey,'GET','/v1/payouts/'+payoutId)
  need(canonical.automatic===true,'Payout membership is supported only for automatic Stripe payouts',409)
  need(canonical.id===payoutId&&['paid','pending','in_transit','canceled','failed'].includes(canonical.status),'Stripe returned an unknown payout state',409)
  members=await stripeList(credential.secretKey,'/v1/balance_transactions?payout='+encodeURIComponent(payoutId))
  await stripeCredential(env,connection,payoutId,'payment:read')
 }catch(error){return failedStripe(env,a,key,'stripe:payout',connection,payoutId,'payment:read',error)}
 const currency=text(canonical.currency,'Payout currency',3).toUpperCase(),amountMinor=integer(canonical.amount,'Payout amount',0,Number.MAX_SAFE_INTEGER)
 const transactions=members.map(b=>{
  need(String(b.currency).toUpperCase()===currency&&Number.isSafeInteger(b.amount)&&Number.isSafeInteger(b.fee)&&Number.isSafeInteger(b.net)&&b.amount-b.fee===b.net,'Payout transaction currencies or net amounts do not reconcile',409)
  need(typeof b.type==='string'&&/^[a-z_]{1,80}$/.test(b.type),'Unknown Stripe balance transaction type',409)
  const sourceId=objectId(b.source);if(sourceId)stripeId(sourceId,'source')
  return {id:stripeId(b.id,'txn'),sourceId,type:b.type,amountMinor:b.amount,feeMinor:b.fee,netMinor:b.net,currency}
 })
 need(new Set(transactions.map(b=>b.id)).size===transactions.length,'Payout contains duplicate balance transactions',409)
 const included=transactions.filter(b=>b.type!=='payout'),netMinor=sum(included.map(b=>b.netMinor)),feeMinor=sum(included.map(b=>b.feeMinor))
 const previous=(await rowsFor(env,'processorEvents','payoutId',payoutId)).find(e=>e.value.type==='payout'&&e.value.connectionId===connection.id)
 const saved=await tx.record('processorEvents',{type:'payout',connectionId:connection.id,credentialVersion:connection.value.version,payoutId,status:canonical.status,currency,amountMinor,feeMinor,netMinor,differenceMinor:amountMinor-netMinor,reconciled:amountMinor===netMinor,transactions,lastReadAt:Date.now(),arrivalDate:Number.isSafeInteger(canonical.arrival_date)?new Date(canonical.arrival_date*1000).toISOString().slice(0,10):null,meaning:'Canonical payout membership and net amounts. A paid payout confirms Stripe payout status, not independent bank reconciliation.'},previous,undefined,'stripe:payout')
 const payments=await rowsFor(env,'processorPayments','connectionId',connection.id),membership=new Set(included.map(b=>b.id))
 for(const payment of payments){
  if(!membership.has(payment.value.balanceTransactionId))continue
  const link=await get(env,'paymentLinks',payment.value.linkId);await linkAuthority(env,tx,link)
  need(link.value.credentialVersion===connection.value.version,'Payout payment credential rotated; owner review required',409)
  await tx.record('processorPayments',{...payment.value,payoutId,payoutStatus:canonical.status,payoutReconciledAt:Date.now(),payoutReconciled:amountMinor===netMinor},payment,undefined,'stripe:payout')
 }
 await stripeUse(tx,connection,payoutId,'payment:read');return finishStripe(tx,digest,saved)
}

export async function stripeCommand(env:Bindings,a:Actor,action:string,input:Value):Promise<Value>{
 need(['stripe:checkout','stripe:reconcile','stripe:refund','stripe:account','stripe:poll','stripe:payout'].includes(action),'Unknown Stripe action')
 const {previous,key,digest}=await startStripe(env,a,action,input);if(previous)return previous
 if(action==='stripe:payout')return payout(env,a,key,digest,input)
 if(action==='stripe:account')return account(env,a,key,digest,input)
 if(action==='stripe:checkout')return checkout(env,a,key,digest,input)
 if(action==='stripe:reconcile')return reconcile(env,a,key,digest,input)
 if(action==='stripe:refund')return refund(env,a,key,digest,input)
 return poll(env,a,key,digest)
}
