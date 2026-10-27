import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

const sendUrl='https://api.sendgrid.com/v3/mail/send'
const credential='synthetic-gauge-8161'

function assertInvoiceEnvelope(body,{issued,release,job,origin}){
 assert.deepEqual(body.personalizations,[{to:[{email:release.value.contact}]}],'Only the authorized client receives the invoice')
 assert.equal(body.from.email,'auth@example.test')
 assert.equal(body.subject,`Invoice ${issued.value.number} · ${issued.value.document.agencyName}`)
 assert.equal(body.custom_args.rer_delivery_id,job.value.eventId)
 assert.equal(body.headers['X-Gauge-Delivery'],job.value.eventId)
 assert.equal(body.headers['X-Gauge-Invoice-Revision'],issued.revision)
 const text=body.content.find(part=>part.type==='text/plain').value
 for(const line of [`Invoice revision: ${issued.revision}`,`PDF SHA-256: ${issued.value.pdf.sha256}`,`Delivery reference: ${job.value.eventId}`])assert(text.split('\n').includes(line))
 assert(text.includes(origin+'/app/client-invoices/'+release.id),'Hosted access points to this exact release')
 const originals=[
  {filename:issued.value.number+'.pdf',type:'application/pdf',bytes:Buffer.from(issued.value.pdf.base64,'base64')},
  {filename:issued.value.number+'-detail.pdf',type:'application/pdf',bytes:Buffer.from(issued.value.detailPdf.base64,'base64')},
  {filename:issued.value.number+'-detail.csv',type:'text/csv',bytes:Buffer.from(issued.value.detailCsv)},
 ]
 assert.equal(body.attachments.length,originals.length)
 for(const original of originals){const attachment=body.attachments.find(row=>row.filename===original.filename);assert(attachment);assert.equal(attachment.type,original.type);assert.deepEqual(Buffer.from(attachment.content,'base64'),original.bytes,'Mail attaches the retained original bytes')}
}

function assertDeliveryLink(delivery,issued,release,job){
 assert.equal(delivery.value.type,'invoice-delivery')
 assert.equal(delivery.value.accessId,release.id)
 assert.equal(delivery.value.accessRevision,release.revision)
 assert.equal(delivery.value.invoiceId,issued.id)
 assert.equal(delivery.value.invoiceRevision,issued.revision)
 assert.equal(delivery.value.pdfSha256,issued.value.pdf.sha256)
 assert.equal(delivery.value.detailPdfSha256,issued.value.detailPdf.sha256)
 assert.equal(delivery.value.contact,release.value.contact)
 assert.equal(delivery.value.jobId,job.id)
 assert.deepEqual(job.value.source,{kind:'invoiceAccess',id:release.id,revision:release.revision})
}

// Folded into the existing presentation journey: real owner forms and commands,
// with the paid SendGrid transport alone replaced at the harness network edge.
export async function invoiceDeliveryJourney(h,{issued,release,recipient,personId,page,capture}){
 const {cmd,owner,request}=h,issuedPath='/api/gauge/invoice-documents/'+issued.id
 const read=async(kind,id)=>(await h.state()).data[kind].find(row=>row.id===id)
 const form=(action,id,scope=page)=>scope.locator('form').filter({has:page.locator(`input[name="action"][value="${action}"]`)}).filter({has:page.locator(`input[name="id"][value="${id}"]`)})
 const submit=async(target,label)=>{
  const details=target.locator('xpath=ancestor::details[1]')
  if(await details.count()&&await details.getAttribute('open')===null)await details.locator('summary').first().click()
  const [response]=await Promise.all([
   page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),
   page.waitForNavigation({waitUntil:'domcontentloaded'}),
   target.getByRole('button',{name:label,exact:true}).click(),
  ])
  assert.equal(response.status(),303,`Owner ${label} form commits`)
 }
 const sends=[],deliveryJobs=[],evidenceById=new Map(),previousEdge=h.providerEdge.handler
 let evidence=null,override={}
 h.providerEdge.handler=async(req,body)=>{
  const url=new URL(req.url)
  if(url.origin!=='https://api.sendgrid.com')return previousEdge?.(req,body)
  if(req.method==='POST'&&req.url===sendUrl){
   const id='synthetic-gauge-816-message_'+(sends.length+1)
   sends.push({id,body,authorization:req.headers.get('authorization')})
   return new Response(null,{status:202,headers:{'x-message-id':id}})
  }
  if(req.method==='GET'&&url.pathname==='/v3/verified_senders')return Response.json({results:[{verified:true,from_email:'auth@example.test'}]})
  if(req.method==='GET'&&url.pathname==='/v3/whitelabel/domains')return Response.json([])
  if(req.method==='GET'&&url.pathname==='/v3/messages'){
   const query=url.searchParams.get('query'),record=[...evidenceById.values()].find(row=>query.includes(row.id))
   assert(record,'Readback follows a captured native submission')
   assert(query.includes(record.to_email))
   return Response.json({messages:[{msg_id:record.msg_id,to_email:record.to_email}]})
  }
  if(req.method==='GET'&&url.pathname.startsWith('/v3/messages/')){
   const record=[...evidenceById.values()].find(row=>url.pathname==='/v3/messages/'+row.msg_id)
   assert(record,'Exact activity lookup belongs to an admitted invoice message')
   return Response.json({...record,...(record===evidence?override:{})})
  }
  throw Error('Unexpected synthetic SendGrid operation')
 }
 try{
  await page.goto(h.origin+'/app/access')
  const connect=page.locator('form').filter({has:page.locator('input[name="action"][value="provider:connect"]')})
  assert.equal(await connect.getByLabel('Provider credential',{exact:true}).inputValue(),'')
  await connect.locator('select[name=provider]').selectOption('sendgrid')
  await connect.getByLabel('Account label',{exact:true}).fill('Invoice delivery SendGrid')
  await capture('invoice-sendgrid-connect', 'section.g-card:has(form input[value="provider:connect"])')
  await page.setViewportSize({width:1440,height:1000})
  await connect.getByLabel('Provider credential',{exact:true}).fill(credential)
  await submit(connect,'Connect provider')
  const connection=(await h.state()).data.providerConnections.find(row=>row.value.provider==='sendgrid'&&row.value.accountLabel==='Invoice delivery SendGrid')
  assert(connection)
  const connections=page.locator('section.g-card').filter({has:page.getByRole('heading',{name:'Connections',exact:true})})
  assert.match(await connections.locator(`[id="${connection.id}"]`).innerText(),/connected/)
  assert(!JSON.stringify(connection).includes(credential),'Only connection metadata leaves credential custody')
  const staff=await h.invite('synthetic-gauge-8162')
  await cmd('grant',{operatorId:staff.id,personId,role:'staff',enabled:true})
  await cmd('invoice:queue-mail',{...release,connectionId:connection.id,reason:'Staff cannot send client documents'},staff.cookie,403)

  for(const width of [1440,390]){
   const currentRelease=width===1440?release:await read('invoiceAccess',(await cmd('invoice:release',{...issued,contact:release.value.contact,days:1,reason:'Explicit second viewport delivery authorization'})).id)
   await page.goto(h.origin+issuedPath);await page.setViewportSize({width,height:1000})
   const selector='#invoice-mail-'+currentRelease.id,mail=page.locator(selector),queue=form('invoice:queue-mail',currentRelease.id,mail)
   const before=sends.length
   await queue.locator('select[name=connectionId]').selectOption(connection.id)
   await queue.getByLabel('Explicit mail release reason',{exact:true}).fill('Owner sends the reviewed immutable invoice to its authorized client')
   await submit(queue,'Queue invoice email')
   let delivery=(await h.state()).data.commercialEvents.find(row=>row.value.type==='invoice-delivery'&&row.value.accessId===currentRelease.id)
   assert(delivery)
   const queued=await read('providerJobs',delivery.value.jobId)
   deliveryJobs.push(queued.id)
   assertDeliveryLink(delivery,issued,currentRelease,queued)
   assert.equal(queued.value.status,'queued');assert.equal(delivery.value.status,'queued')
   assert.equal(sends.length,before,'Queueing records an owner decision without sending')
   await cmd('invoice:queue-mail',{...currentRelease,connectionId:connection.id,reason:'Duplicate release'},owner,409)
   await cmd('providerJob:dispatch',queued,staff.cookie,403)
   await cmd('invoice:delivery-readback',delivery,staff.cookie,403)
   await page.goto(h.origin+issuedPath);await page.setViewportSize({width,height:1000})
   const dispatch=form('providerJob:dispatch',queued.id,mail)
   const dispatchInput={id:queued.id,revision:queued.revision,key:await dispatch.locator('[name="key"]').inputValue()}
   // Two native owner requests contend for the same durable dispatch claim.
   await Promise.all([submit(dispatch,'Dispatch invoice email'),cmd('providerJob:dispatch',{id:queued.id,revision:queued.revision})])
   assert.equal(sends.length,before+1,'Concurrent owner dispatch sends exactly once')
   const sent=sends.at(-1),submitted=await read('providerJobs',queued.id)
   delivery=await read('commercialEvents',delivery.id)
   assert.equal(submitted.value.status,'submitted')
   assert.equal(submitted.value.providerMessageId,sent.id)
   assert.equal(delivery.value.status,'accepted')
   assert.equal(delivery.value.mailboxState,'unconfirmed','Provider admission alone is not mailbox delivery')
   assert.equal(delivery.value.providerMessageId,sent.id)
   assert.equal(delivery.value.senderEvidence.verified,true)
   assert.equal(sent.authorization,`Bearer ${credential}`)
   assertInvoiceEnvelope(sent.body,{issued,release:currentRelease,job:queued,origin:h.origin})
   await cmd('providerJob:dispatch',dispatchInput)
   assert.equal(sends.length,before+1,'Exact dispatch replay never resends')
   await page.goto(h.origin+issuedPath);await capture('invoice-delivery-accepted-'+width,selector)

   evidence={id:sent.id,msg_id:sent.id+'.filter-1',to_email:currentRelease.value.contact,subject:sent.body.subject,unique_args:{rer_delivery_id:queued.value.eventId},status:'delivered',events:[{event_name:'delivered'}]}
   evidenceById.set(sent.id,evidence)
   for(const mismatch of [{to_email:'wrong-client@example.test'},{subject:'Different invoice'},{unique_args:{rer_delivery_id:randomUUID()}}]){
    override=mismatch
    await cmd('invoice:delivery-readback',{id:delivery.id,revision:delivery.revision})
    delivery=await read('commercialEvents',delivery.id)
    assert.equal(delivery.value.mailboxState,'unknown','Mismatched provider evidence cannot confirm mailbox delivery')
    assert(delivery.value.readbackException)
    assert.equal(delivery.value.providerEvidenceMessageId,null)
    assertDeliveryLink(delivery,issued,currentRelease,await read('providerJobs',queued.id))
   }
   override={unique_args:null}
   await cmd('invoice:delivery-readback',{id:delivery.id,revision:delivery.revision})
   delivery=await read('commercialEvents',delivery.id)
   assert.equal(delivery.value.mailboxState,'delivered','An optional absent custom-argument field preserves the durable admission-id, recipient and subject match')
   assert.equal(delivery.value.providerMessageId,sent.id)
   assert.equal(delivery.value.providerEvidenceMessageId,evidence.msg_id)
   assert.equal(delivery.value.readbackException,null)
   override={}
   await page.goto(h.origin+issuedPath);await page.setViewportSize({width,height:1000})
   await submit(form('invoice:delivery-readback',delivery.id,mail),'Reconcile invoice delivery')
   delivery=await read('commercialEvents',delivery.id)
   assert.equal(delivery.value.mailboxState,'delivered')
   assert.equal(delivery.value.providerMessageId,sent.id)
   assert.equal(delivery.value.providerEvidenceMessageId,evidence.msg_id,'Admission id remains distinct from exact activity id')
   assert.equal(delivery.value.readbackException,null)
   assert.equal((await read('providerJobs',queued.id)).value.providerState,'delivered')

   override={status:'not_delivered',events:[{event_name:'bounced'}]}
   await page.goto(h.origin+issuedPath);await page.setViewportSize({width,height:1000})
   await submit(form('invoice:delivery-readback',delivery.id,mail),'Reconcile invoice delivery')
   delivery=await read('commercialEvents',delivery.id)
   assert.equal(delivery.value.mailboxState,'bounced')
   assert.equal(delivery.value.providerEvidenceMessageId,evidence.msg_id)
   assert(delivery.value.actionRequired,'Provider failure gives the owner a next action')
   assertDeliveryLink(delivery,issued,currentRelease,await read('providerJobs',queued.id))
   await page.goto(h.origin+issuedPath)
   assert.equal((await mail.getByRole('alert').innerText()),delivery.value.actionRequired)
   await capture('invoice-delivery-bounced-'+width,selector)
   const terminal=await read('providerJobs',queued.id)
   await Promise.all([cmd('providerJob:dispatch',terminal),cmd('providerJob:dispatch',terminal)])
   assert.equal(sends.length,before+1,'Reconciliation and terminal dispatch races never resend bounced mail')
   await page.goto(h.origin+'/app/access');await page.setViewportSize({width,height:1000})
   const registered=page.locator(`[id="${queued.id}"]`)
   assert(await registered.isVisible(),'Invoice mail appears in the ordinary provider job register')
   assert((await registered.innerText()).includes(connection.value.accountLabel),'The job register identifies the authorized mail connection')
   assert.equal(await registered.locator('input[value="providerJob:dispatch"]').count(),0,'Submitted invoice jobs have no resend action')
   await capture('invoice-provider-job-'+width,`[id="${queued.id}"]`)
   if(currentRelease.id!==release.id)await cmd('invoice:revoke-access',{...currentRelease,reason:'End second viewport authorization'})
   evidenceById.set(sent.id,{...evidence,...override});evidence=null;override={}
  }

  const beforeSync=sends.length,sync=await cmd('providerSync:start',{connectionId:connection.id}),snapshot=await read('providerSyncs',sync.id)
  const currency=issued.value.currency,expectedTotals={[currency]:issued.value.totalMinor*2}
  assert.equal(snapshot.value.sourceCount,2,'The native snapshot includes both invoice delivery jobs')
  assert.deepEqual(snapshot.value.sourceTotals,expectedTotals,'Source controls retain the exact issued value for each delivery source')
  assert.deepEqual(snapshot.value.items.map(item=>item.jobId).sort(),[...deliveryJobs].sort())
  assert(snapshot.value.items.every(item=>item.kind==='invoice'&&item.invoiceId===issued.id))
  const first=await cmd('providerSync:advance',snapshot),checkpoint=await read('providerSyncs',sync.id)
  assert.equal(checkpoint.value.cursor,1);assert.equal(checkpoint.value.reconciledCount,1)
  assert.deepEqual(checkpoint.value.reconciledTotals,{[currency]:issued.value.totalMinor})
  await cmd('providerSync:advance',first)
  const completed=await read('providerSyncs',sync.id)
  assert.equal(completed.value.status,'completed')
  assert.equal(completed.value.cursor,2);assert.equal(completed.value.reconciledCount,2)
  assert.deepEqual(completed.value.reconciledTotals,expectedTotals)
  assert.deepEqual(completed.value.sourceTotals,expectedTotals)
  assert.deepEqual(completed.value.outcomes.map(outcome=>outcome.jobId).sort(),[...deliveryJobs].sort(),'Each delivery is reconciled exactly once')
  assert(completed.value.outcomes.every(outcome=>outcome.state==='bounced'),'Provider sync retains the observed actionable mailbox failures')
  assert.equal(sends.length,beforeSync,'Snapshot and checkpoint advancement only read provider evidence')
  await page.goto(h.origin+'/app/access')
  const health='section.g-card:has(h2:text-is("Connector health"))',checkpoints='section.g-card:has(h2:text-is("Reconciliation checkpoints"))'
  assert(await page.locator(checkpoints).locator(`[id="${sync.id}"]`).isVisible())
  await capture('invoice-provider-health',health)
  await capture('invoice-provider-reconciliation',checkpoints)

  // Revocation after queueing must stop the outbound send, even though its exact
  // source revision is still retained in the provider job for the owner's audit.
  const pendingRelease=await read('invoiceAccess',(await cmd('invoice:release',{...issued,contact:release.value.contact,days:1,reason:'Authorize a queued source then withdraw before dispatch'})).id)
  const pendingDelivery=await cmd('invoice:queue-mail',{...pendingRelease,connectionId:connection.id,reason:'Queue before source revocation'})
  const pending=await read('commercialEvents',pendingDelivery.id),pendingJob=await read('providerJobs',pending.value.jobId)
  const revoked=await cmd('invoice:revoke-access',{...pendingRelease,reason:'Withdraw authorization before any send'})
  const before=sends.length
  await cmd('invoice:queue-mail',{...revoked,connectionId:connection.id,reason:'Revoked access cannot authorize another email'},owner,409)
  await cmd('providerJob:dispatch',pendingJob)
  const refused=await read('providerJobs',pendingJob.id)
  assert.equal(refused.value.status,'exception')
  assert(!refused.value.providerMessageId)
  await cmd('providerJob:dispatch',refused)
  assert.equal(sends.length,before,'A revoked source and its dispatch replay never submit mail')
  assertDeliveryLink(await read('commercialEvents',pending.id),issued,pendingRelease,refused)
  assert.deepEqual(await read('invoices',issued.id),issued,'Sending and provider readback preserve the issued original')
  const retained=JSON.stringify(await h.state())
  assert(!retained.includes(credential),'Sealed SendGrid credential is absent from public owner state')
  assert(!h.logs.join('\n').includes(credential),'SendGrid credential is absent from application logs')
  assert.equal((await request('/app/client-invoices/'+release.id,recipient.cookie)).status,200)
 }finally{
  h.providerEdge.handler=previousEdge
  await page.goto(h.origin+issuedPath)
 }
}
