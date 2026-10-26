// Stripe's paid network edge is the only fake in this public HTTP journey.
export function stripeEdge() {
 let serial=0
 const sessions=new Map(),intents=new Map(),charges=new Map(),refunds=new Map()
 const next=()=>`synthetic-gauge-${++serial}`
 const state={sessions,intents,charges,refunds,events:new Map()}
 const balance=(charge,status='available')=>({id:charge.balance_transaction?.id??next(),object:'balance_transaction',source:charge.id,amount:charge.amount,fee:320,net:charge.amount-320,currency:charge.currency,status,available_on:1791849600,created:1791763200,type:'charge'})
 state.collect=(sessionId,{status='succeeded',available=true,returned=false,disputed=false}={})=>{
  const session=sessions.get(sessionId),id=session.payment_intent??next(),existing=intents.get(id),chargeId=existing?.latest_charge?.id??next()
  const charge={id:chargeId,object:'charge',payment_intent:id,amount:session.amount_total,amount_captured:session.amount_total,amount_refunded:existing?.latest_charge?.amount_refunded??0,currency:session.currency,paid:status==='succeeded'&&!returned,captured:status==='succeeded',refunded:false,disputed,livemode:false,status:returned?'failed':status==='succeeded'?'succeeded':'pending',failure_code:returned?'insufficient_funds':null,created:1791763200,payment_method_details:{type:session.method,card:{last4:'synthetic-gauge-991'},us_bank_account:{last4:'synthetic-gauge-992',routing_number:'synthetic-gauge-993'}}}
  charge.balance_transaction=existing?.latest_charge?.balance_transaction
  charge.balance_transaction=status==='succeeded'?balance(charge,available?'available':'pending'):null
  const intent={id,object:'payment_intent',status:returned?'requires_payment_method':status,amount:session.amount_total,amount_received:status==='succeeded'&&!returned?session.amount_total:0,currency:session.currency,latest_charge:charge,metadata:session.metadata,livemode:false,created:1791763200,last_payment_error:returned?{code:'payment_failed',decline_code:'insufficient_funds'}:null}
  charges.set(chargeId,charge);intents.set(id,intent);session.payment_intent=id;session.status='complete';session.payment_status=status==='succeeded'&&!returned?'paid':'unpaid';return intent
 }
 state.handler=async(request,body)=>{
  const url=new URL(request.url);if(url.origin!=='https://api.stripe.com')return null
  const path=url.pathname,parts=path.split('/'),id=decodeURIComponent(parts.at(-1)),list=data=>Response.json({object:'list',data,has_more:false,url:path})
  if(path.startsWith('/v1/events/'))return Response.json(state.events.get(id))
  if(path==='/v1/balance')return Response.json({object:'balance',livemode:false,available:[],pending:[]})
  if(path==='/v1/account')return Response.json({id:'synthetic-gauge-990',object:'account',country:'US',default_currency:'usd',charges_enabled:true,payouts_enabled:true,details_submitted:true,capabilities:{card_payments:'active',us_bank_account_ach_payments:'active'},requirements:{currently_due:[],past_due:[],disabled_reason:null}})
  if(path==='/v1/checkout/sessions'&&request.method==='POST'){
   const sid=next(),amount=Number(body['line_items[0][price_data][unit_amount]']),currency=body['line_items[0][price_data][currency]'],method=body['payment_method_types[0]']??'card'
   const metadata=Object.fromEntries(Object.entries(body).filter(([k])=>k.startsWith('payment_intent_data[metadata][')).map(([k,v])=>[k.slice('payment_intent_data[metadata]['.length,-1),v]))
   const session={id:sid,object:'checkout.session',mode:'payment',url:`https://checkout.stripe.com/c/pay/${sid}`,amount_total:amount,currency,method,client_reference_id:body.client_reference_id,metadata:{...metadata,gaugeLinkId:body['metadata[gaugeLinkId]'],gaugeInvoiceId:body['metadata[gaugeInvoiceId]']},status:'open',payment_status:'unpaid',payment_intent:null,livemode:false,expires_at:1893456000};sessions.set(sid,session);return Response.json(session)
  }
  if(path.startsWith('/v1/checkout/sessions/'))return sessions.has(id)?Response.json(sessions.get(id)):Response.json({error:{code:'resource_missing'}},{status:404})
  if(path.startsWith('/v1/payment_intents/'))return Response.json(intents.get(id))
  if(path==='/v1/charges')return list([...charges.values()].filter(c=>!url.searchParams.get('payment_intent')||c.payment_intent===url.searchParams.get('payment_intent')))
  if(path.startsWith('/v1/charges/'))return Response.json(charges.get(id))
  if(path==='/v1/refunds'&&request.method==='POST'){
   const intent=intents.get(body.payment_intent)??[...intents.values()].find(i=>i.latest_charge.id===body.charge),charge=intent.latest_charge
   const refund={id:next(),object:'refund',payment_intent:intent.id,charge:charge.id,amount:Number(body.amount),currency:charge.currency,status:'succeeded',balance_transaction:null,failure_balance_transaction:null,created:1791849600,metadata:{gaugeRefundId:body['metadata[gaugeRefundId]']}};refunds.set(refund.id,refund);charge.amount_refunded+=refund.amount;charge.refunded=charge.amount_refunded===charge.amount;return Response.json(refund)
  }
  if(path==='/v1/refunds')return list([...refunds.values()].filter(r=>(!url.searchParams.get('payment_intent')||r.payment_intent===url.searchParams.get('payment_intent'))&&(!url.searchParams.get('charge')||r.charge===url.searchParams.get('charge'))))
  if(path==='/v1/disputes')return list([...charges.values()].filter(c=>c.disputed).map(c=>({id:`dispute-${c.id}`,charge:c.id,payment_intent:c.payment_intent,amount:c.amount,currency:c.currency,status:c.payment_method_details.type==='us_bank_account'?'lost':'needs_response',created:1791849600,reason:c.payment_method_details.type==='us_bank_account'?'insufficient_funds':'fraudulent',balance_transactions:[]})))
  if(path.startsWith('/v1/balance_transactions/'))return Response.json([...charges.values()].map(c=>c.balance_transaction).find(b=>b?.id===id))
  if(path.startsWith('/v1/payouts/'))return Response.json({id,object:'payout',status:'paid',amount:[...charges.values()].filter(c=>c.balance_transaction).reduce((n,c)=>n+c.balance_transaction.net,0),currency:'usd',arrival_date:1791936000,automatic:true,balance_transaction:'synthetic-gauge-994',failure_balance_transaction:null})
  if(path==='/v1/balance_transactions'){const members=[...charges.values()].filter(c=>c.balance_transaction).map(c=>c.balance_transaction),total=members.reduce((n,b)=>n+b.net,0);return list([...members,{id:'synthetic-gauge-994',object:'balance_transaction',source:url.searchParams.get('payout'),type:'payout',amount:-total,fee:0,net:-total,currency:'usd',status:'available'}])}
  throw Error(`Unexpected Stripe test endpoint ${request.method} ${path}`)
 }
 return state
}
