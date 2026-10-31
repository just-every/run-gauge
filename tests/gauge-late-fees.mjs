import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

const asOf = '2020-09-02'
const termsInput = {lateFeeMode:'monthly-percentage',lateFeeRateBasisPoints:150,lateFeeCapMinor:100000,lateFeeAgreedOn:'2020-01-01',lateFeeReference:'synthetic-gauge-9100 signed monthly terms'}
async function seed(h, agreed = true) {
 const {cmd,state}=h,timezone='America/New_York'
 const person=await cmd('save:people',{name:'synthetic-gauge-9101',timezone})
 let client=await cmd('save:clients',{name:'synthetic-gauge-9102',billingCurrency:'USD',paymentTermsDays:0,...(agreed?termsInput:{})})
 const project=await cmd('save:engagements',{name:'synthetic-gauge-9103',clientId:client.id,leadId:person.id,members:[person.id],scope:'Native late-fee agreement',timezone})
 const issue=async(amountMinor=1000000,day='2020-08-01')=>{
  const expense=await cmd('expense:approve',await cmd('expense:submit',await cmd('expense:save',{engagementId:project.id,personId:person.id,date:day,description:'synthetic-gauge-9104 agreed reimbursement',amountMinor,reimbursable:true})))
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'synthetic-gauge-9105',sources:[`expenses:${expense.id}`]}))
  return cmd('invoice:issue',{...packet,issueDate:day,dueDate:day,billTo:'synthetic-gauge-9102',remitTo:'synthetic-gauge-9106',reference:'synthetic-gauge-9107'})
 }
 const clientRow=async()=> (await state()).data.clients.find(r=>r.id===client.id)
 const changeTerms=async(overrides)=>{const old=await clientRow();client=await cmd('save:clients',{...old,...old.value,...termsInput,...overrides});return client}
 return {person,client,project,issue,clientRow,changeTerms}
}
const preview = (h,invoice,cookie=h.owner,expected=200,day=asOf)=>h.cmd('invoice:late-fee-preview',{...invoice,asOf:day},cookie,expected)
const draft = (h,invoice,p,cookie=h.owner,expected=200,extra={})=>h.cmd('invoice:late-fee-draft',{...invoice,asOf:p.asOf,fingerprint:p.fingerprint,reason:'synthetic-gauge-9108 reviewed native draft',...extra},cookie,expected)

export async function prepareLateFeePortability(h) {
 const f=await seed(h),invoice=await f.issue(),p=await preview(h,invoice),saved=await draft(h,invoice,p)
 await f.changeTerms({lateFeeRateBasisPoints:200,lateFeeReference:'synthetic-gauge-9109 later agreement'})
 const before=await h.state(),client=before.data.clients.find(r=>r.id===f.client.id),issued=before.data.invoices.find(r=>r.id===invoice.id),fee=before.data.lateFeeDrafts.find(r=>r.id===saved.id)
 const history=await(await h.request('/api/gauge/history/clients/'+client.id,h.owner)).json()
 const auditPath='/api/gauge/audit?'+new URLSearchParams({kind:'lateFeeDrafts',recordId:fee.id})
 const audit=(await(await h.request(auditPath,h.owner)).json()).entries
 assert.equal(issued.value.lateFeeTerms.rateBasisPoints,150)
 assert.equal(audit.length,1)
 assert.deepEqual(audit[0].result,fee.value,'The public audit retains the exact draft, frozen terms and source revisions')
 assert.equal(audit[0].action,'invoice:late-fee-draft')
 return async restored=>{
  const after=await restored.state()
  for(const [kind,row]of [['clients',client],['invoices',issued],['lateFeeDrafts',fee]])assert.deepEqual(after.data[kind].find(r=>r.id===row.id),row,'Portable exact terms, invoice and draft')
  assert.deepEqual(await(await restored.request('/api/gauge/history/clients/'+client.id,restored.owner)).json(),history)
  assert.deepEqual((await(await restored.request(auditPath,restored.owner)).json()).entries,audit,'Draft attribution and exact source history survive restore')
  assert.equal((await restored.request('/api/gauge/history/lateFeeDrafts/'+fee.id,h.owner)).status,401,'Old finance session cannot inspect a restored draft')
  await preview(restored,invoice,restored.owner,409)
  await draft(restored,invoice,p,restored.owner,409)
  assert.equal((await restored.state()).data.lateFeeDrafts.filter(r=>r.value.invoiceId===invoice.id).length,1,'Restored history never duplicates an invoice period')
  console.log('PROBE INVOICE-007 restore: complete archive -> exact frozen agreement, draft and attributed source history; old session and duplicate requests refused')
 }
}

export async function lateFeeJourney(h) {
 const {cmd,state,request,owner,post}=h,f=await seed(h,false),missing=await f.issue()
 await preview(h,missing,owner,409)
 // Save a real agreement through the existing native client form.
 const browser=await chromium.launch({headless:true,...(process.env.GAUGE_CHROMIUM?{executablePath:process.env.GAUGE_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const shots=process.env.GAUGE_LATE_FEE_SHOTS
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.setViewportSize({width:1440,height:1000})
  const capture=async(name)=>{if(shots){await mkdir(shots,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`${shots}/${name}-${width}.png`,fullPage:true})}await page.setViewportSize({width:1440,height:1000})}}
  await page.goto(h.origin+'/app/engagements?edit='+f.client.id)
  const clientForm=page.locator('form').filter({has:page.locator('[name=action][value="save:clients"]')})
  await clientForm.getByText('Agreed late-fee terms',{exact:true}).click()
  await clientForm.getByLabel('Late-fee agreement').selectOption('monthly-percentage')
  await clientForm.getByLabel('Monthly rate (150 means 1.5%)',{exact:true}).fill('150')
  await clientForm.getByLabel('Agreed total fee cap in client currency',{exact:true}).fill('1000.00')
  await clientForm.getByLabel('Agreement date',{exact:true}).fill('2020-01-01')
  await clientForm.getByLabel('Agreed terms reference',{exact:true}).fill(termsInput.lateFeeReference)
  await capture('agreed-terms')
  await clientForm.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/app/engagements?saved=1')
  const agreed=await f.clientRow();assert.equal(agreed.value.lateFeeTerms.rateBasisPoints,150);assert.equal(agreed.value.lateFeeTerms.capMinor,100000)
  await preview(h,missing,owner,409)
  const invoice=await f.issue(),before=await state(),original=before.data.invoices.find(r=>r.id===invoice.id)
  await preview(h,invoice,owner,409,'2020-08-31')
  const p=await preview(h,invoice)
  assert.deepEqual([p.principalMinor,p.amountMinor,p.periodStart,p.periodEnd,p.status],[1000000,15000,'2020-08-01','2020-09-01','awaiting-finance-approval'])
  assert.equal(p.terms.clientRevision,agreed.revision)
  assert.equal((await state()).data.lateFeeDrafts.length,0,'Preview alone creates no draft')
  await page.goto(h.origin+'/app/billing')
  const card=page.locator('#invoice-'+invoice.id)
  await card.getByText('Preview a late-fee draft',{exact:true}).click()
  await card.getByLabel('Preview as of',{exact:true}).fill(asOf)
  await card.getByRole('button',{name:'Preview late fee',exact:true}).click()
  await page.getByRole('heading',{name:'Review late-fee preview',exact:true}).waitFor()
  const review=page.locator('form').filter({has:page.locator('[name=action][value="invoice:late-fee-draft"]')})
  assert.match(await review.innerText(),/\$10,000\.00[\s\S]*1\.5%[\s\S]*\$150\.00/)
  await capture('fee-preview')
  await review.getByLabel('Draft reason',{exact:true}).fill('synthetic-gauge-9110 finance requests review')
  await review.getByRole('button',{name:'Create late-fee draft',exact:true}).click();await page.waitForURL('**/app/billing?saved=1')
  let after=await state(),fee=after.data.lateFeeDrafts.find(r=>r.value.invoiceId===invoice.id)
  assert.equal(fee.value.amountMinor,15000);assert.equal(fee.value.status,'awaiting-finance-approval')
  assert.match(await page.locator('#late-fee-'+fee.id).innerText(),/\$150\.00[\s\S]*Awaiting finance approval/)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Native forms fit 1440')
  const icons=await page.locator('button,a,summary').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&n.querySelector('svg,img')&&!n.getAttribute('aria-label')).map(n=>n.outerHTML));assert.deepEqual(icons,[])
  await capture('fee-draft')
  assert.deepEqual(after.data.invoices,before.data.invoices,'Draft preserves every issued original')
  assert.deepEqual(after.data.payments,before.data.payments,'Draft changes no payments')
  const receipts=await request('/api/gauge/receivables?asOf='+asOf,owner);assert.equal(receipts.status,200)
  assert.equal((await receipts.json()).invoices.find(i=>i.id===invoice.id).openMinor,1000000)
  const cashBefore=before.cash.engagements.find(e=>e.engagementId===f.project.id),cashAfter=after.cash.engagements.find(e=>e.engagementId===f.project.id)
  assert.deepEqual(cashAfter,cashBefore,'A draft adds no expected cash')
  assert.deepEqual(after.data.invoices.find(r=>r.id===invoice.id),original)
  await preview(h,invoice,owner,409);await draft(h,invoice,p,owner,409)
  const frozenBeforeEdit=await f.issue()
  await f.changeTerms({lateFeeRateBasisPoints:900,lateFeeReference:'synthetic-gauge-9111 later terms'})
  assert.equal((await preview(h,frozenBeforeEdit)).amountMinor,15000,'A later client rate cannot reprice an issued invoice preview')
  assert.equal((await state()).data.invoices.find(r=>r.id===invoice.id).value.lateFeeTerms.rateBasisPoints,150,'Later client edits never retrofit an invoice')
  assert.equal((await state()).data.lateFeeDrafts.find(r=>r.id===fee.id).value.terms.rateBasisPoints,150)
  console.log('PROBE INVOICE-007 agreement and draft: native forms, USD 10000 at 1.5% -> one USD 150 draft awaiting finance approval, original and cash unchanged')

  // Cap and integer-cent rounding, independently calculated from explicit values.
  await f.changeTerms({lateFeeCapMinor:10000})
  const capped=await f.issue()
  await f.changeTerms({lateFeeCapMinor:100000})
  assert.equal((await preview(h,capped)).amountMinor,10000,'A later client cap cannot expand an issued invoice entitlement')
  await draft(h,capped,await preview(h,capped))
  const boundary=await f.issue(1000000,'2020-01-31')
  await preview(h,boundary,owner,409,'2020-02-29')
  assert.equal((await preview(h,boundary,owner,200,'2020-03-02')).periodEnd,'2020-02-29','Monthly anniversary clamps to leap month end, with no entitlement before 30 days overdue')
  const cents=await f.issue(10100),rounded=await preview(h,cents)
  assert.equal(rounded.amountMinor,152,'101 dollars times 1.5 percent is 151.5 cents, rounded half up')
  const replayKey=randomUUID(),body={action:'invoice:late-fee-draft',...cents,asOf,fingerprint:rounded.fingerprint,reason:'synthetic-gauge-9112 exact replay',key:replayKey}
  const replay=await post('/api/gauge/command',body,owner);assert.equal(replay.status,200)
  assert.deepEqual(await(await post('/api/gauge/command',body,owner)).json(),await replay.json())
  const raced=await f.issue(),racePreview=await preview(h,raced)
  const races=await Promise.all([1,2].map(()=>post('/api/gauge/command',{action:'invoice:late-fee-draft',...raced,asOf,fingerprint:racePreview.fingerprint,reason:'synthetic-gauge-9113 concurrent draft',key:randomUUID()},owner)))
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409])
  assert.equal((await state()).data.lateFeeDrafts.filter(r=>r.value.invoiceId===raced.id).length,1)
  console.log('PROBE INVOICE-007 amount and replay: capped USD 100; USD 101 principal -> 152 cents; replay and concurrent requests -> one draft')

  // Changed balances and dispute history invalidate exact previews, including a resolved dispute.
  const balance=await f.issue(),oldBalance=await preview(h,balance)
  await cmd('payment:record',{...balance,date:asOf,amountMinor:10000,reference:'synthetic-gauge-9114'})
  await draft(h,balance,oldBalance,owner,409)
  const reduced=await preview(h,balance);assert.equal(reduced.principalMinor,990000);assert.equal(reduced.amountMinor,14850)
  const credit=await cmd('invoice:credit',{...balance,type:'credit',lines:[{line:0,amountMinor:10000}],date:asOf,reason:'synthetic-gauge-9115'})
  await draft(h,balance,reduced,owner,409)
  assert.equal((await preview(h,balance)).amountMinor,14700)
  const allocated=await f.issue(),beforeAllocation=await preview(h,allocated)
  const receipt=await cmd('receipt:record',{clientId:f.client.id,currency:'USD',date:asOf,amountMinor:250000,reference:'synthetic-gauge-9130'})
  assert.equal((await preview(h,allocated)).principalMinor,1000000,'An unapplied receipt cannot reduce an invoice principal')
  await cmd('receipt:allocate',{...receipt,invoiceId:allocated.id,date:asOf,amountMinor:250000})
  await draft(h,allocated,beforeAllocation,owner,409)
  const afterAllocation=await preview(h,allocated)
  assert.deepEqual([afterAllocation.principalMinor,afterAllocation.amountMinor],[750000,11250],'An allocated USD 2500 receipt reduces the USD 10000 principal and fee to USD 112.50')
  console.log('PROBE INVOICE-007 receipt allocation: unapplied USD 2500 leaves USD 10000 principal; allocation invalidates the preview and yields USD 7500 principal and USD 112.50 fee')
  const disputed=await f.issue(),oldDispute=await preview(h,disputed)
  const dispute=await cmd('invoice:dispute',{...disputed,date:asOf,amountMinor:1,reason:'synthetic-gauge-9116 partial dispute'})
  await draft(h,disputed,oldDispute,owner,409);await preview(h,disputed,owner,409)
  await cmd('invoice:dispute-resolve',{...dispute,date:asOf,outcome:'withdrawn',resolution:'synthetic-gauge-9117'})
  await draft(h,disputed,oldDispute,owner,409)
  await draft(h,disputed,await preview(h,disputed))
  const held=await f.issue(),heldDispute=await cmd('invoice:dispute',{...held,date:asOf,amountMinor:100,reason:'synthetic-gauge-9123 dated hold'})
  await cmd('invoice:dispute-resolve',{...heldDispute,date:'2020-09-03',outcome:'withdrawn',resolution:'synthetic-gauge-9124 dated resolution'})
  await preview(h,held,owner,409)
  assert.equal((await preview(h,held,owner,200,'2020-09-04')).amountMinor,15000,'A resolution after the preview day cannot release that day’s dispute hold')
  for(const action of ['payment:record','invoice:credit','invoice:void']){
   const closed=await f.issue(),was=await preview(h,closed)
   if(action==='payment:record')await cmd(action,{...closed,date:asOf,amountMinor:1000000,reference:'synthetic-gauge-9118'})
   if(action==='invoice:credit')await cmd(action,{...closed,type:'credit',lines:[{line:0,amountMinor:1000000}],date:asOf,reason:'synthetic-gauge-9119'})
   if(action==='invoice:void')await cmd(action,{...closed,reissue:[],date:asOf,reason:'synthetic-gauge-9120'})
   await preview(h,closed,owner,409);await draft(h,closed,was,owner,409)
   assert.equal((await state()).data.lateFeeDrafts.filter(r=>r.value.invoiceId===closed.id).length,0)
  }
  console.log('PROBE INVOICE-007 unsafe balances: changed payment, credit and dispute revisions -> stale refusal; paid, void and fully credited invoices -> no draft')

  // Immediate finance revocation, foreign roles, state and history do not expose terms or drafts.
  const candidate=await f.issue(),approvedPreview=await preview(h,candidate)
  const differentInvoice=await f.issue()
  await draft(h,differentInvoice,approvedPreview,owner,409)
  assert.equal((await state()).data.lateFeeDrafts.filter(r=>r.value.invoiceId===differentInvoice.id).length,0,'A preview cannot authorize a different invoice')
  const user=await h.invite('synthetic-gauge-9121')
  const financePerson=await cmd('save:people',{name:'synthetic-gauge-9125',timezone:'America/New_York'})
  await cmd('grant',{operatorId:user.id,personId:financePerson.id,role:'finance',enabled:true})
  assert.equal((await preview(h,candidate,user.cookie)).amountMinor,15000)
  const financePreview=await preview(h,differentInvoice,user.cookie)
  const financeBody={action:'invoice:late-fee-draft',...differentInvoice,asOf,fingerprint:financePreview.fingerprint,reason:'synthetic-gauge-9126 finance draft',key:randomUUID()}
  const financeResponse=await post('/api/gauge/command',financeBody,user.cookie)
  assert.equal(financeResponse.status,200)
  const financeDraft=await financeResponse.json(),financeRow=(await state()).data.lateFeeDrafts.find(r=>r.id===financeDraft.id)
  assert.deepEqual([financeRow.value.preparedBy,financeRow.value.amountMinor,financeRow.value.status],[user.id,15000,'awaiting-finance-approval'])
  assert.equal((await request('/api/gauge/history/lateFeeDrafts/'+financeDraft.id,user.cookie)).status,200)
  await cmd('grant',{operatorId:user.id,personId:financePerson.id,role:'staff',enabled:true})
  await preview(h,candidate,user.cookie,403);await draft(h,candidate,approvedPreview,user.cookie,403)
  assert.equal((await post('/api/gauge/command',financeBody,user.cookie)).status,403,'Revocation refuses even the exact successful draft request key')
  assert.equal((await request('/api/gauge/history/lateFeeDrafts/'+financeDraft.id,user.cookie)).status,403)
  for(const role of ['staff','lead','agent','none']){
   const actor=await h.invite('synthetic-gauge-9122-'+role)
   if(role!=='none')await cmd('grant',{operatorId:actor.id,personId:f.person.id,role,enabled:true,...(role==='agent'?{purpose:'billing',engagementIds:[f.project.id]}:{})})
   await preview(h,candidate,actor.cookie,403);await draft(h,candidate,approvedPreview,actor.cookie,403)
   assert.equal((await request('/api/gauge/history/lateFeeDrafts/'+fee.id,actor.cookie)).status,403)
   if(role!=='none'){
    const scoped=await state(actor.cookie);assert.deepEqual(scoped.data.lateFeeDrafts,[])
    assert(scoped.data.clients.every(c=>!Object.hasOwn(c.value,'lateFeeTerms')))
    const history=await request('/api/gauge/history/clients/'+f.client.id,actor.cookie)
    if(history.status===200)assert.doesNotMatch(await history.text(),/lateFeeTerms/)
   }
  }
  assert.equal((await state()).data.lateFeeDrafts.filter(r=>r.value.invoiceId===candidate.id).length,0)
  assert.equal((await request('/api/gauge/history/lateFeeDrafts/'+fee.id,owner)).status,200)
  await cmd('grant',{operatorId:user.id,personId:financePerson.id,role:'finance',enabled:false})
  await cmd('privacy:policy',{personalDays:0,fileDays:0,evidenceDays:0,reason:'synthetic-gauge-9127 native retention'})
  await cmd('privacy:exit',{personId:financePerson.id,date:'2020-09-02',reason:'synthetic-gauge-9128 finance exit'})
  const erase=await cmd('privacy:preview',{personId:financePerson.id})
  assert.deepEqual(erase.blockers,[])
  await cmd('privacy:erase',{personId:financePerson.id,fingerprint:erase.fingerprint,reason:'synthetic-gauge-9129 owner reviewed erasure',confirm:'erase-reviewed-native-scope',lawfulReceiptRemoval:'authorized'})
  await cmd('grant',{operatorId:user.id,personId:financePerson.id,role:'finance',enabled:true},owner,410)
  assert.equal((await post('/api/gauge/command',financeBody,user.cookie)).status,403)
  assert.equal((await request('/api/gauge/history/lateFeeDrafts/'+financeDraft.id,user.cookie)).status,403)
  assert.deepEqual((await state()).data.lateFeeDrafts.find(r=>r.id===financeDraft.id),financeRow,'Erasure and replay preserve lawful immutable fee evidence')
  console.log('PROBE INVOICE-007 authority: revoked finance and other roles -> preview, draft and private history refused; no private terms in scoped state')
  console.log('PROBE INVOICE-007 finance and erasure: finance creates an attributed USD 150 draft; revoked or erased finance cannot replay or read it; another invoice cannot reuse its preview')
 } finally {await browser.close()}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const h=await harness({currency:'USD',timezone:'America/New_York'})
 try{await lateFeeJourney(h)}finally{await h.dispose()}
}
