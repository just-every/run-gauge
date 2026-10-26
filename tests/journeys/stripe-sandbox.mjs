import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {chromium} from '@playwright/test'
import {harness} from '../gauge-harness.mjs'
import {stripeInvoices} from '../fixtures/stripe-journey.mjs'

// Held test key only, injected by the fleet helper. The private key is never an artifact.
const secretKey=process.env.STRIPE_SECRET_KEY,payerEmail=process.env.GAUGE_STRIPE_TEST_EMAIL
assert(/^qa-inbox(?:-2)?@runeditrun[.]com$/.test(payerEmail??''),'Use a controlled QA mailbox through GAUGE_STRIPE_TEST_EMAIL')
assert(secretKey&&secretKey.startsWith('sk_test_'),'Inject the held Stripe test key through the fleet helper')
const h=await harness({currency:'USD',timezone:'America/New_York'}),webhookSecret=randomBytes(32).toString('hex')
let browser,page,sessionId,cleaned=false
const stripe=async(method,path,body)=>{
 const response=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{authorization:'Bearer '+secretKey,'stripe-version':'2024-06-20',...(body?{'content-type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{})})
 const result=await response.json();assert(response.ok,`Stripe sandbox request refused: HTTP ${response.status}; ${result.error?.code??'provider error'}`);return result
}
try{
 h.providerEdge.handler=async request=>{if(new URL(request.url).origin!=='https://api.stripe.com')return null;const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='GET'?{}:{body:await request.arrayBuffer()})});console.log('STRIPE_HTTP '+request.method+' '+new URL(request.url).pathname+' '+response.status);return response}
 await h.cmd('provider:initialize')
 const connection=await h.cmd('provider:connect',{provider:'stripe',accountLabel:'Agency held Stripe sandbox',credential:JSON.stringify({secretKey,webhookSecret})})
 await h.cmd('stripe:account',connection)
 const {invoices}=await stripeInvoices(h)
 const payouts=await stripe('GET','payouts?limit=1');if(payouts.data.length){const traced=await h.cmd('stripe:payout',{connectionId:connection.id,payoutId:payouts.data[0].id});const item=(await h.state()).data.processorEvents.find(r=>r.id===traced.id);assert.equal(item.value.reconciled,true);console.log('STRIPE_PAYOUT '+JSON.stringify({id:item.value.payoutId,currency:item.value.currency,amountMinor:item.value.amountMinor,netMinor:item.value.netMinor,differenceMinor:item.value.differenceMinor,transactions:item.value.transactions.length}))}
 const ach=await h.cmd('stripe:checkout',{...invoices[1],connectionId:connection.id,method:'us_bank_account',amountMinor:10000,testMode:true});const achRow=(await h.state()).data.paymentLinks.find(r=>r.id===ach.id);console.log('STRIPE_ACH '+JSON.stringify({status:achRow.value.status,exceptionClass:achRow.value.exceptionClass}));if(achRow.value.sessionId)await stripe('POST','checkout/sessions/'+achRow.value.sessionId+'/expire',{})
 const made=await h.cmd('stripe:checkout',{...invoices[0],connectionId:connection.id,method:'card',amountMinor:10000,testMode:true})
 let state=await h.state(),link=state.data.paymentLinks.find(r=>r.id===made.id)
 assert.equal(link.value.status,'open','Native owner instruction creates a real test Checkout')
 sessionId=link.value.sessionId;console.log('STRIPE_SESSION '+sessionId)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true});page=await context.newPage()
 await page.goto(link.value.url,{waitUntil:'domcontentloaded'});await page.getByLabel('Email',{exact:true}).fill(payerEmail)
 await page.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242')
 await page.getByPlaceholder('MM / YY').fill('1230')
 await page.getByPlaceholder('CVC').fill('123')
 const name=page.locator('input[name="billingName"]');if(await name.count())await name.fill('Gauge Sandbox')
 const save=page.getByRole('checkbox',{name:/Save my information/});if(await save.count())await save.uncheck()
 const country=page.getByLabel('Country or region');if(await country.count())await country.selectOption('US')
 const zip=page.getByPlaceholder('ZIP');if(await zip.count())await zip.fill('10001')
 await mkdir('./artifacts/stripe',{recursive:true});await page.screenshot({path:'./artifacts/stripe/checkout-ready.png',fullPage:true});
 await page.getByTestId('hosted-payment-submit-button').click()
 await page.waitForURL(h.origin+'/**',{timeout:60000})
 await h.cmd('stripe:reconcile',link)
 state=await h.state();link=state.data.paymentLinks.find(r=>r.id===made.id)
 let payment=state.data.processorPayments.find(r=>r.value.invoiceId===invoices[0].id)
 assert(payment,'Canonical readback retains the real processor payment')
 const before={status:payment.value.status,pendingMinor:payment.value.pendingMinor,settledMinor:payment.value.settledMinor,feeMinor:payment.value.feeMinor,netMinor:payment.value.netMinor,balanceStatus:payment.value.balanceStatus}
 const refund=await h.cmd('stripe:refund',{id:payment.id,revision:payment.revision,amountMinor:1000,reason:'Sandbox proof partial refund',ownerInstruction:`Refund 1000 USD for payment ${payment.id}`})
 await h.cmd('stripe:reconcile',link)
 state=await h.state();payment=state.data.processorPayments.find(r=>r.id===payment.id)
 assert.equal(payment.value.refundedMinor,1000)
 if(payment.value.balanceStatus==='pending')assert.equal(payment.value.pendingMinor,9000,'Pending principal excludes the confirmed refund')
 for(const path of ['/api/gauge/state?from=2026-10-01&to=2026-10-31','/api/gauge/audit/export','/app/billing']){
  const text=await(await h.request(path,h.owner)).text();for(const value of [secretKey,webhookSecret,'4242424242424242'])assert(!text.includes(value),'Sensitive details never enter Gauge read doors')
 }
 const receipt={candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mode:'Stripe test',checkoutSessionId:sessionId,paymentIntentId:payment.value.paymentIntentId,beforeRefund:before,afterRefund:{refundedMinor:payment.value.refundedMinor,settledMinor:payment.value.settledMinor,pendingMinor:payment.value.pendingMinor,allocatedMinor:payment.value.allocatedMinor},refundEventId:refund.id,achGap:'Held AU test account has no activated US bank account capability',signedDeliveryGap:'No public sandbox callback endpoint is configured; signed replay is asserted at the network edge'}
 await mkdir('./artifacts/stripe',{recursive:true});await writeFile('./artifacts/stripe/sandbox.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt))
 // Remove only this journey's remaining collected test principal.
 await stripe('POST','refunds',{payment_intent:payment.value.paymentIntentId,amount:'9000',reason:'requested_by_customer'});cleaned=true
}catch(error){if(page){await mkdir('./artifacts/stripe',{recursive:true});await page.screenshot({path:'./artifacts/stripe/checkout-failure.png',fullPage:true});console.log('CHECKOUT_ALERTS '+JSON.stringify(await page.getByRole('alert').allTextContents()));console.log('CHECKOUT_ORIGIN '+new URL(page.url()).origin)}if(sessionId){const live=await stripe('GET','checkout/sessions/'+sessionId);console.log('CHECKOUT_STATE '+JSON.stringify({status:live.status,paymentStatus:live.payment_status}))}const data=await h.state();console.log('STRIPE_OUTCOMES '+JSON.stringify(data.data.providerUses.map(r=>({operation:r.value.operation,outcome:r.value.outcome}))));throw error
}finally{
 if(sessionId&&!cleaned){const session=await stripe('GET','checkout/sessions/'+sessionId);if(session.status==='open')await stripe('POST','checkout/sessions/'+sessionId+'/expire',{})}
 await browser?.close();await h.dispose()
}
