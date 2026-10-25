import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {harness} from '../gauge-harness.mjs'
import {parseAddress} from '../../src/modules/mail/src/core/validation.mjs'

// Run only with the held-key injector. The paid mail edge is real; native data and
// sessions are created through the same built Worker public doors as the suite.
for(const name of ['SENDGRID_API_KEY','SENDGRID_FROM_EMAIL','TEST_MAIL_TO','QA_INBOX_RECEIPT_TOKEN'])assert(process.env[name],`Missing ${name}`)
const controlled=process.env.TEST_MAIL_TO.toLowerCase(),from=process.env.SENDGRID_FROM_EMAIL
const fromEmail=parseAddress(from).email
const inbox='https://rer-qa-inbox.runeditrun.workers.dev',since=Date.now(),hash=b=>createHash('sha256').update(b).digest('hex')
const receiptHeaders={Authorization:`Bearer ${process.env.QA_INBOX_RECEIPT_TOKEN}`}
const preflight=await fetch(inbox+'/receipts?limit=1',{headers:receiptHeaders,signal:AbortSignal.timeout(20000)});assert.equal(preflight.status,200,'QA receipt inbox must be readable before sending')
const h=await harness({currency:'USD',timezone:'America/New_York',mailFrom:from,databaseBinding:false});let browser
try{
 const {cmd,state,owner,request}=h
 h.providerEdge.handler=async(req,body)=>{
  if(new URL(req.url).origin!=='https://api.sendgrid.com')return null
  if(req.method==='POST'){
   assert.equal(new URL(req.url).pathname,'/v3/mail/send')
   assert.deepEqual(body.personalizations.map(p=>p.to.map(t=>t.email)),[[controlled]],'Only TEST_MAIL_TO may receive live proof mail')
   assert(body.personalizations.every(p=>!p.cc&&!p.bcc));assert.equal(body.from.email,fromEmail)
  }
  return fetch(req.url,{method:req.method,headers:req.headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)})
 }
 const client=await cmd('save:clients',{name:'Controlled invoice proof client',paymentTermsDays:30})
 const person=await cmd('save:people',{name:'Morgan Hale',timezone:'America/New_York'})
 await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:8000,billMinor:15000})
 const project=await cmd('save:engagements',{name:'October advisory workshop',clientId:client.id,leadId:person.id,members:[person.id],scope:'Controlled invoice mailbox proof',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:15000,effortSeconds:3600,roundingSeconds:60,reason:'Reviewed proof workshop'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Advisory workshop',remainingSeconds:0})
 let time=await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:'Advisory',notes:'Controlled mailbox proof',timezone:'America/New_York',billable:true,start:'2026-10-20T09:00:00-04:00',end:'2026-10-20T10:00:00-04:00'})
 time=await cmd('time:approve',await cmd('time:submit',time))
 const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Controlled workshop invoice',sources:['time:'+time.id]}))
 await cmd('invoice:settings',{clientId:null,timeMode:'service',expenseMode:'itemized',attachDetail:true,footer:'Controlled test invoice. No payment is requested.',additionalDetails:'<p>Invoice delivery proof.</p>',reason:'Controlled test document'})
 const issued=await cmd('invoice:issue',{...packet,issueDate:'2026-10-20',dueDate:'2026-11-19',remitTo:'Controlled proof only; no payment requested',reference:'sx-gauge-c-i816'})
 const invoice=(await state()).data.invoices.find(r=>r.id===issued.id)
 const recipient=await h.invite('Controlled recipient','member',controlled)
 const release=await cmd('invoice:release',{...issued,contact:controlled,days:1,reason:'Owner explicitly authorizes this controlled test recipient and exact invoice'})
 const connection=await cmd('provider:connect',{provider:'sendgrid',accountLabel:'Controlled invoice SendGrid proof',credential:process.env.SENDGRID_API_KEY})
 const delivery=await cmd('invoice:queue-mail',{...release,connectionId:connection.id,reason:'Explicitly send this one controlled invoice to TEST_MAIL_TO'})
 let data=await state(),event=data.data.commercialEvents.find(r=>r.id===delivery.id),job=data.data.providerJobs.find(r=>r.id===event.value.jobId)
 await cmd('providerJob:dispatch',job)
 data=await state();event=data.data.commercialEvents.find(r=>r.id===delivery.id);job=data.data.providerJobs.find(r=>r.id===job.id)
 assert.equal(job.value.status,'submitted','Live provider must accept the durable invoice job');assert.equal(event.value.senderEvidence.verified,true)
 console.log(JSON.stringify({provider:'sendgrid',providerMessageId:job.value.providerMessageId,invoiceId:invoice.id,invoiceRevision:invoice.revision,pdfSha256:invoice.value.pdf.sha256,senderVerified:true}))
 await cmd('providerJob:dispatch',job)
 let receipt
 for(let attempt=0;attempt<19&&!receipt;attempt++){
  const url=new URL(inbox+'/receipts');for(const[k,v]of Object.entries({to:controlled,subject:event.value.subject,since:String(since),limit:'20'}))url.searchParams.set(k,v)
  const res=await fetch(url,{headers:receiptHeaders,signal:AbortSignal.timeout(20000)});assert.equal(res.status,200,'Read controlled QA receipt')
  receipt=(await res.json()).receipts.find(r=>r.excerpt?.includes('Delivery reference: '+job.value.eventId))
  if(!receipt)await new Promise(r=>setTimeout(r,5000))
 }
 assert(receipt,'Controlled invoice mailbox receipt missing after 90 seconds');assert.equal(receipt.to.toLowerCase(),controlled);assert.equal(receipt.auth.dmarc,'pass');assert(receipt.rawUrl)
 const rawRes=await fetch(inbox+receipt.rawUrl,{headers:receiptHeaders,signal:AbortSignal.timeout(20000)});assert.equal(rawRes.status,200)
 const raw=Buffer.from(await rawRes.arrayBuffer())
 const parsed=JSON.parse(execFileSync('python3',['-I','-c',"import sys,json,email,base64;from email.policy import default;m=email.message_from_bytes(sys.stdin.buffer.read(),policy=default);print(json.dumps({'subject':str(m['Subject']),'messageId':str(m['Message-ID']),'attachments':[{'filename':p.get_filename(),'base64':base64.b64encode(p.get_payload(decode=True)).decode()} for p in m.iter_attachments()]}))"],{input:raw,encoding:'utf8'}))
 assert.equal(parsed.subject,event.value.subject)
 for(const [name,bytes]of [[invoice.value.number+'.pdf',Buffer.from(invoice.value.pdf.base64,'base64')],[invoice.value.number+'-detail.pdf',Buffer.from(invoice.value.detailPdf.base64,'base64')],[invoice.value.number+'-detail.csv',Buffer.from(invoice.value.detailCsv)]]){
  const attachment=parsed.attachments.find(a=>a.filename===name);assert(attachment,'Received exact invoice attachment');assert.deepEqual(Buffer.from(attachment.base64,'base64'),bytes)
 }
 await cmd('invoice:delivery-readback',event)
 event=(await state()).data.commercialEvents.find(r=>r.id===event.id)
 const path='/app/client-invoices/'+release.id,pdf=await request(path+'?format=pdf',recipient.cookie);assert.equal(pdf.status,200);assert.equal(hash(Buffer.from(await pdf.arrayBuffer())),invoice.value.pdf.sha256)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage(),shots=process.env.GAUGE_INVOICE_SHOTS
 if(shots)await mkdir(shots,{recursive:true})
 const cookies=cookie=>cookie.split('; ').map(p=>{const i=p.indexOf('=');return{name:p.slice(0,i),value:p.slice(i+1),url:h.origin}})
 for(const [name,cookie,url,selector]of [['live-owner',owner,'/api/gauge/invoice-documents/'+invoice.id,'#invoice-client-access'],['live-client',recipient.cookie,path,'#invoice-document']]){
  await context.clearCookies();await context.addCookies(cookies(cookie));await page.goto(h.origin+url)
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.locator(selector).isVisible());if(shots)await page.locator(selector).screenshot({path:`${shots}/${name}-${width}.png`})}
 }
 console.log(JSON.stringify({mailboxReceiptId:receipt.id,receivedAt:receipt.receivedAt,dmarc:receipt.auth.dmarc,receivedMessageId:parsed.messageId,attachmentsByteIdentical:true,providerMessageId:job.value.providerMessageId,providerState:event.value.mailboxState,readbackException:event.value.readbackException,providerEvidenceMessageId:event.value.providerEvidenceMessageId??null,hostedPageAndPdf:true}))
}finally{if(browser)await browser.close();await h.dispose()}
