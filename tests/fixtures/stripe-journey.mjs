import assert from 'node:assert/strict'
import {createHmac,randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {stripeEdge} from './stripe-edge.mjs'

export async function stripeInvoices(h) {
 const {cmd}=h,person=await cmd('save:people',{name:'Morgan Chen',timezone:'America/New_York'}),client=await cmd('save:clients',{name:'Northwind Studio',paymentTermsDays:30})
 const project=await cmd('save:engagements',{name:'October delivery',clientId:client.id,leadId:person.id,members:[person.id],scope:'Approved delivery',timezone:'America/New_York'})
 await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:4000,billMinor:10000})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:36000,roundingSeconds:60,reason:'Approved delivery terms'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Delivery',remainingSeconds:0}),invoices=[]
 for(let i=0;i<2;i++){
  let time=await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:'Delivery',notes:'Approved client work',timezone:'America/New_York',billable:true,start:`2026-10-0${6+i}T09:00:00-04:00`,end:`2026-10-0${6+i}T10:00:00-04:00`})
  time=await cmd('time:approve',await cmd('time:submit',time))
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:`October delivery ${i+1}`,sources:[`time:${time.id}`]}))
  const invoice=await cmd('invoice:issue',{...packet,issueDate:'2026-10-10',dueDate:'2026-11-09',billTo:'Northwind Studio accounts payable',remitTo:'Agency Stripe merchant account',reference:`Delivery ${i+1}`})
  invoices.push(invoice)
 }
 return {person,client,project,invoices}
}

/** Native HTTP commands, signed provider callbacks and independent processor outcomes. */
export async function stripePaymentJourney(h,{browserProof=true}={}) {
 const edge=stripeEdge(),oldHandler=h.providerEdge.handler;h.providerEdge.handler=edge.handler
 const {cmd,state,owner,request}=h,secret='synthetic-gauge-8801',webhookSecret='synthetic-gauge-8802',credential=JSON.stringify({secretKey:secret,webhookSecret})
 let browser
 try{
  await cmd('provider:initialize')
  const connection=await cmd('provider:connect',{provider:'stripe',accountLabel:'Agency Stripe test merchant',credential})
  await cmd('stripe:account',connection)
  const {person,invoices}=await stripeInvoices(h),[invoice,achInvoice]=invoices
  const row=async(kind,id)=>(await state()).data[kind].find(r=>r.id===id)
  const balance=async(id)=>(await(await request('/api/gauge/receivables?asOf=2027-01-01',owner)).json()).invoices.find(i=>i.id===id)
  await cmd('stripe:checkout',{...invoice,connectionId:connection.id,method:'card',amountMinor:6000},owner,409)
  const link=await cmd('stripe:checkout',{...invoice,connectionId:connection.id,method:'card',amountMinor:6000,testMode:true})
  let card=await row('paymentLinks',link.id);assert.equal(card.value.amountMinor,6000);assert.equal(new URL(card.value.url).hostname,'checkout.stripe.com')
  assert.equal((await balance(invoice.id)).openMinor,10000,'Creating a partial hosted link is not cash received')
  const readback=()=>cmd('stripe:reconcile',{id:card.id,revision:card.revision})
  await readback();card=await row('paymentLinks',link.id)
  edge.collect(card.value.sessionId,{status:'succeeded',available:false});await readback();card=await row('paymentLinks',link.id)
  let payment=(await state()).data.processorPayments.find(p=>p.value.invoiceId===invoice.id)
  assert.equal(payment.value.pendingMinor,6000);assert.equal(payment.value.settledMinor,0);assert.equal((await balance(invoice.id)).paidMinor,0)
  const sign=async(id,type,signatureSecret=webhookSecret,seconds=Math.floor(Date.now()/1000))=>{
   const event={id,type,object:'event',created:1791763200,livemode:false,data:{object:{id:payment.value.paymentIntentId,object:'payment_intent',metadata:{invoiceId:invoice.id},payment_method_details:{card:{number:'synthetic-gauge-8803'},us_bank_account:{account_number:'synthetic-gauge-8804'}}}}}
   edge.events.set(id,event);const payload=JSON.stringify(event)
   const signature=createHmac('sha256',signatureSecret).update(`${seconds}.${payload}`).digest('hex')
   return request('/api/gauge/stripe/webhook?connectionId='+connection.id,'',{method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${seconds},v1=${signature}`},body:payload})
  }
  assert.equal((await sign('synthetic-gauge-8810','payment_intent.succeeded','synthetic-gauge-8899')).status,400)
  assert.equal((await sign('synthetic-gauge-8811','payment_intent.succeeded',webhookSecret,1)).status,400)
  assert.equal((await sign('synthetic-gauge-8812','payment_intent.succeeded')).status,200)
  assert.equal((await sign('synthetic-gauge-8812','payment_intent.succeeded')).status,200)
  assert.equal((await sign('synthetic-gauge-8813','payment_intent.processing')).status,200)
  assert.equal((await balance(invoice.id)).paidMinor,0,'Callbacks do not allocate money or execute owner actions')
  edge.collect(card.value.sessionId,{status:'succeeded',available:true});await readback();card=await row('paymentLinks',link.id)
  payment=(await state()).data.processorPayments.find(p=>p.value.invoiceId===invoice.id)
  assert.equal(payment.value.settledMinor,6000);assert.equal(payment.value.feeMinor,320);assert.equal(payment.value.netMinor,5680)
  assert.equal((await balance(invoice.id)).openMinor,4000)
  await readback();card=await row('paymentLinks',link.id);assert.equal((await balance(invoice.id)).paidMinor,6000,'Repeated canonical read-back allocates one payment')
  payment=await row('processorPayments',payment.id)
  const payout=await cmd('stripe:payout',{connectionId:connection.id,payoutId:'synthetic-gauge-8830'})
  const payoutRow=await row('processorEvents',payout.id);assert.equal(payoutRow.value.reconciled,true);assert.equal(payoutRow.value.differenceMinor,0);assert.equal(payoutRow.value.netMinor,5680)
  payment=await row('processorPayments',payment.id);assert.equal(payment.value.payoutId,'synthetic-gauge-8830')
  const refundInput={id:payment.id,revision:payment.revision,amountMinor:1000,reason:'Agreed partial refund',ownerInstruction:`Refund 1000 USD for payment ${payment.id}`}
  await cmd('stripe:refund',{...refundInput,ownerInstruction:'No explicit authorization'},owner,400)
  const refundKey=randomUUID();await cmd('stripe:refund',{...refundInput,key:refundKey});await cmd('stripe:refund',{...refundInput,key:refundKey})
  await readback();card=await row('paymentLinks',link.id);payment=await row('processorPayments',payment.id)
  assert.equal(payment.value.refundedMinor,1000);assert.equal((await balance(invoice.id)).paidMinor,5000);assert.equal((await balance(invoice.id)).openMinor,5000)
  assert.equal([...edge.refunds.values()].length,1,'A refund replay executes the provider instruction once')
  const ach=await cmd('stripe:checkout',{...achInvoice,connectionId:connection.id,method:'us_bank_account',amountMinor:10000,testMode:true})
  let bank=await row('paymentLinks',ach.id)
  edge.collect(bank.value.sessionId,{status:'processing'});await cmd('stripe:reconcile',bank);bank=await row('paymentLinks',ach.id)
  let bankPayment=(await state()).data.processorPayments.find(p=>p.value.invoiceId===achInvoice.id)
  assert.equal(bankPayment.value.pendingMinor,10000);assert.equal(bankPayment.value.settledMinor,0);assert.equal((await balance(achInvoice.id)).openMinor,10000)
  edge.collect(bank.value.sessionId,{status:'succeeded',available:true});await cmd('stripe:reconcile',bank);bank=await row('paymentLinks',ach.id)
  assert.equal((await balance(achInvoice.id)).paidMinor,10000)
  edge.collect(bank.value.sessionId,{status:'succeeded',available:true,returned:true});await cmd('stripe:reconcile',bank);bank=await row('paymentLinks',ach.id)
  bankPayment=await row('processorPayments',bankPayment.id);assert.equal(bankPayment.value.settledMinor,0);assert.equal((await balance(achInvoice.id)).openMinor,10000,'ACH return reopens the invoice')
  const adjustments=(await state()).data.payments.filter(p=>p.value.invoiceId===invoice.id);assert.deepEqual(adjustments.map(p=>p.value.amountMinor),[6000,-1000],'Refund appends a signed adjustment without rewriting cash history')
  assert.equal((await state()).data.payments.filter(p=>p.value.invoiceId===achInvoice.id).reduce((n,p)=>n+p.value.amountMinor,0),0)
  const handoff=await cmd('handoff:prepare',{purpose:'accounting',recipient:'Agency accountant',reason:'Exact Stripe settlement and refund entries',sources:adjustments.map(p=>({kind:'payments',id:p.id,revision:p.revision}))})
  const packet=await row('specialistHandoffs',handoff.id);assert.equal(packet.value.controlTotals[0].amountMinor,5000);assert.deepEqual(packet.value.lines.map(l=>l.amountMinor),[6000,-1000])
  await cmd('handoff:record-result',{...handoff,result:{handoffId:handoff.id,artifactHash:packet.value.artifactHash,lines:packet.value.lines.map(l=>({id:l.id,status:'accepted',currency:l.currency,amountMinor:l.amountMinor,durationSeconds:null}))}})
  const finance=await h.invite('synthetic-gauge-8820');await cmd('grant',{operatorId:finance.id,personId:person.id,role:'finance',enabled:true})
  for(const action of ['stripe:account','stripe:checkout','stripe:reconcile','stripe:refund','stripe:poll','stripe:payout'])await cmd(action,connection,finance.cookie,403)
  for(const kind of ['paymentLinks','processorPayments','processorEvents','stripeAccounts']){
   assert.deepEqual((await state(finance.cookie)).data[kind],[])
   const own=(await state()).data[kind][0];if(own)assert.equal((await request(`/api/gauge/history/${kind}/${own.id}`,finance.cookie)).status,403)
  }
  for(const path of ['/api/gauge/state?from=2026-10-01&to=2026-10-31','/api/gauge/audit/export','/app/billing','/app/access']){
   const text=await(await request(path,owner)).text()
   for(const sensitive of [secret,webhookSecret,'synthetic-gauge-8803','synthetic-gauge-8804','synthetic-gauge-991','synthetic-gauge-992','synthetic-gauge-993'])assert(!text.includes(sensitive),`Sensitive provider detail withheld through ${path}`)
  }
  if(browserProof){
   await mkdir('./artifacts/stripe',{recursive:true});browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
   const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
   const page=await context.newPage()
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/billing')
    const section=page.locator('#stripe-'+invoice.id);await section.locator('details').first().evaluate(el=>el.open=true)
    if(width===1440){
     const form=section.locator('form').filter({has:page.locator('input[value="stripe:checkout"]')});await form.getByLabel('Amount to collect (USD)',{exact:true}).fill('10.00');
     const existing=new Set((await state()).data.paymentLinks.map(r=>r.id));await form.getByRole('button',{name:'Create payment link',exact:true}).click();await page.waitForLoadState('domcontentloaded');
     const fresh=(await state()).data.paymentLinks.find(r=>!existing.has(r.id));assert(fresh&&fresh.value.status==='open');edge.collect(fresh.value.sessionId,{status:'succeeded',available:false});
     const reconcile=()=>page.locator('#stripe-'+invoice.id+' form').filter({has:page.locator('input[name=id][value="'+fresh.id+'"]')}).getByRole('button',{name:'Reconcile Stripe payment',exact:true}).click();
     await page.locator('#stripe-'+invoice.id+' details').first().evaluate(el=>el.open=true);await reconcile();await page.waitForLoadState('domcontentloaded');await page.locator('#stripe-'+invoice.id+' details').first().evaluate(el=>el.open=true);
     const pending=(await state()).data.processorPayments.find(r=>r.value.linkId===fresh.id);assert.equal(pending.value.pendingMinor,1000);await page.locator('#stripe-'+invoice.id).screenshot({path:`./artifacts/stripe/pending-${width}.png`});
     edge.collect(fresh.value.sessionId,{status:'succeeded',available:true});await reconcile();await page.waitForLoadState('domcontentloaded');await page.locator('#stripe-'+invoice.id+' details').first().evaluate(el=>el.open=true);assert.equal((await balance(invoice.id)).paidMinor,6000);
    }
    if(width===390){const fresh=(await state()).data.paymentLinks.find(r=>r.value.invoiceId===invoice.id&&r.id!==link.id);edge.collect(fresh.value.sessionId,{status:'succeeded',available:true,disputed:true});const current=await row('paymentLinks',fresh.id);await cmd('stripe:reconcile',current);const disputed=(await state()).data.processorPayments.find(r=>r.value.linkId===fresh.id);assert.equal(disputed.value.disputedMinor,1000);assert.equal(disputed.value.allocatedMinor,0);assert.equal((await balance(invoice.id)).paidMinor,5000);await page.reload();await section.locator('details').first().evaluate(el=>el.open=true)}
    await section.screenshot({path:`./artifacts/stripe/billing-${width}.png`})
    assert(await page.getByText('Pending payments are separate from settled cash.',{exact:false}).count())
    assert(await page.getByRole('button',{name:'Reconcile Stripe payment',exact:true}).count())
    assert.equal(await page.locator('input[name="cardNumber"],input[name="accountNumber"]').count(),0)
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Billing fits viewport: '+JSON.stringify(await page.locator('body *').evaluateAll(els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).slice(-10).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,100),width:el.getBoundingClientRect().width})))))
    await page.goto(h.origin+'/app/access');await page.locator('#stripe-setup').screenshot({path:`./artifacts/stripe/setup-${width}.png`})
    assert(await page.getByRole('button',{name:'Check Stripe account',exact:true}).count());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Settings fits viewport')
    const iconOnly=await page.locator('button,a,summary').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().width>0&&!el.textContent.trim()&&!el.querySelector('img[alt]')?.alt).map(el=>el.outerHTML));assert.deepEqual(iconOnly,[],'Touched screens have no icon-only controls lacking text')
   }
  }
  return {connection,invoices,payment,bankPayment}
 }finally{await browser?.close();h.providerEdge.handler=oldHandler}
}
