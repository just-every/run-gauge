import type { Bindings } from '../auth.server'
import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { type Kind,type Row,type Value,need,text,date,workDate,integer,sum } from './model'
import { type Actor,type Transaction,all,get,finance,fence } from './store'
import { assertIndependentReview } from './approval-policy'
import { timePolicyCommand } from './time-policy'
import { liveInvoices } from './invoice-standing'
import { capBalances } from './budget-caps'
import { retainerFees } from './retainer-fees'
import { retainerCovers } from './retainer-eligibility'

const kinds:Kind[]=['people','engagements','calendars','leave','time','expenses','tasks','budgets','milestones','packets','retainers','retainerPeriods','retainerCloses','retainerAdjustments','retainerCharges','retainerSchedules','timeSlices','capWriteDowns','invoices','payments','invoiceCorrections','invoiceDisputes','periodMatches','timePolicies','periodCloses','periodReopens']
const plus=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
function bounds(month:unknown){const m=text(month,'Agency month');need(/^\d{4}-(0[1-9]|1[0-2])$/.test(m),'Use YYYY-MM');const from=date(m+'-01'),next=new Date(from+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);return {month:m,from,to:plus(next.toISOString().slice(0,10),-1)}}
const dated=(kind:string,row:Row)=>kind==='time'?row.value.workDate:kind==='invoices'?row.value.issueDate:kind==='milestones'?row.value.due:row.value.date
const inWindow=(day:string|undefined,from:string,to:string)=>!!day&&day>=from&&day<=to
const total=(rows:Row[],value:(r:Row)=>number,currency:(r:Row)=>string)=>Object.fromEntries([...new Set(rows.map(currency))].sort().map(c=>[c,sum(rows.filter(r=>currency(r)===c).map(value))]))

export async function periodPreview(env:Bindings,a:Actor,input:Value,tx?:Transaction){
 need(finance(a),'Finance access required',403);await fence(env,a)
 const window=bounds(input.month),data=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await all(env,k)]))) as Record<Kind,Row[]>
 if(tx)for(const k of kinds){for(const row of data[k])tx.observe(k,row);tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,data[k].length)}
 const closed=data.periodCloses.filter(c=>c.value.month===window.month&&!data.periodReopens.some(r=>r.value.closeId===c.id))
 const time=data.time.filter(t=>inWindow(t.value.workDate,window.from,window.to)),expenses=data.expenses.filter(e=>inWindow(e.value.date,window.from,window.to)),approved=time.filter(t=>t.value.status==='approved')
 const blocking:Value[]=[],unknownCalendars:string[]=[]
 if(workDate(Date.now(),a.timezone)<=window.to)blocking.push({kind:'period',id:window.month,reason:'Close only after the agency-local month has ended'})
 if(closed.length)blocking.push({kind:'periodCloses',id:closed[0].id,reason:'The agency period is already closed'})
 const policy=data.timePolicies[0]
 if(!policy?.value.lockThrough||policy.value.lockThrough<window.to)blocking.push({kind:'timePolicies',id:policy?.id??null,reason:'Finance time locked-through date must reach the period end'})
 for(const t of time){if(t.value.status!=='approved')blocking.push({kind:'time',id:t.id,reason:'Time is not approved'});else if(t.value.economics?.costMinor==null)blocking.push({kind:'time',id:t.id,reason:'Approved labor cost is missing'})}
 for(const e of expenses)if(e.value.status!=='approved')blocking.push({kind:'expenses',id:e.id,reason:'Cost is not approved'})
 for(const person of data.people){
  let expected=0,known=false
  for(let day=window.from;day<=window.to;day=plus(day,1)){
   const c=data.calendars.find(c=>c.value.personId===person.id&&c.value.from<=day&&c.value.to>=day);if(!c)continue;known=true
   if(!c.value.weekdays.split(',').includes(String(new Date(day+'T00:00:00Z').getUTCDay()))||c.value.holidays?.includes(day))continue
   const leave=sum(data.leave.filter(l=>l.value.personId===person.id&&l.value.from<=day&&l.value.to>=day).map(l=>l.value.dailySeconds));expected+=Math.max(0,c.value.dailySeconds-leave)
  }
  if(!known)unknownCalendars.push(person.id)
  const recorded=sum(time.filter(t=>t.value.personId===person.id&&t.value.durationSeconds>0).map(t=>t.value.durationSeconds))
  if(expected>recorded)blocking.push({kind:'people',id:person.id,reason:'Missing time against the recorded calendar',expectedSeconds:expected,recordedSeconds:recorded})
 }
 const invoices=data.invoices.filter(i=>inWindow(i.value.issueDate,window.from,window.to)),standings=liveInvoices(data,window.to)
 for(const invoice of invoices){const standing=standings.find(s=>s.invoice.id===invoice.id),net=standing?.netMinor??0,credits=data.invoiceCorrections.filter(c=>c.value.invoiceId===invoice.id&&c.value.status==='issued'&&c.value.date<=window.to).map(c=>({id:c.id,revision:c.revision})),basis=sha256(canonicalJson({invoice,credits,net})),match=data.periodMatches.find(m=>m.value.invoiceId===invoice.id&&m.value.month===window.month&&m.value.basis===basis&&m.value.amountMinor===net&&m.value.currency===invoice.value.currency)
  if(!match)blocking.push({kind:'invoices',id:invoice.id,reason:'Unmatched invoice or changed reconciliation basis',amountMinor:net,currency:invoice.value.currency,basis})
 }
 const families=[...new Set(data.retainers.filter(t=>t.value.terms.start<=window.to&&(!t.value.terms.end||t.value.terms.end>=window.from)).map(t=>t.value.rootId))]
 const retainerExceptions:Record<string,string>=input.retainerExceptions&&typeof input.retainerExceptions==='object'?Object.fromEntries(Object.entries(input.retainerExceptions).map(([id,reason])=>[id,text(reason,'Retainer exception reason')])):{}
 const retainers=families.map(rootId=>{
  const periods=data.retainerPeriods.filter(p=>p.value.rootId===rootId&&p.value.activeStart<=window.to&&p.value.activeEnd>=window.from)
  const links=periods.map(period=>{const close=data.retainerCloses.find(c=>c.value.periodId===period.id);return {periodId:period.id,periodRevision:period.revision,closeId:close?.id??null,closeRevision:close?.revision??null}})
  const open=!links.length||links.some(l=>!l.closeId),exception=open?retainerExceptions[rootId]??null:null
  if(open&&!exception)blocking.push({kind:'retainers',id:rootId,reason:'Name the open retainer period exception'})
  return {rootId,periods:links,exception}
 })
 const reserved=new Set(data.packets.filter(p=>p.value.status!=='cancelled').flatMap(p=>p.value.lines.map((l:Value)=>`${l.kind}:${l.sourceId}`))),issued=new Set(data.invoices.filter(i=>i.value.issueDate<=window.to).flatMap(i=>i.value.lines.map((l:Value)=>`${l.kind}:${l.sourceId}`)))
 const caps=capBalances(data)
 const unbilled:Value[]=data.time.filter(t=>t.value.workDate<=window.to&&t.value.status==='approved'&&t.value.billable&&t.value.economics?.mode==='hourly'&&!t.value.source?.billed&&!retainerCovers(data.retainers,t.value)&&!caps.some(c=>c.engagementId===t.value.engagementId)&&!issued.has('time:'+t.id)).map(t=>({kind:'time',id:t.id,revision:t.revision,amountMinor:t.value.economics.billMinor,currency:t.value.economics.currency,reserved:reserved.has('time:'+t.id)}))
 for(const kind of ['expenses','milestones','retainerCharges','timeSlices'] as const)for(const row of data[kind])if(row.value.status==='approved'&&(kind!=='expenses'||row.value.reimbursable)&&(dated(kind,row)??row.value.date)<=window.to&&!issued.has(kind+':'+row.id))unbilled.push({kind,id:row.id,revision:row.revision,amountMinor:row.value.amountMinor,currency:row.value.currency,reserved:reserved.has(kind+':'+row.id)})
 for(const cap of caps)for(const row of cap.rows)if(row.workDate<=window.to&&row.heldSeconds>0)unbilled.push({kind:'time',id:row.sourceId,revision:row.revision,amountMinor:row.heldMinor,currency:cap.currency,held:true,reason:'Over-cap work; not invoice eligible',durationSeconds:row.heldSeconds})
 for(const fee of retainerFees(data,window.to).filter(f=>f.activeStart<=window.to))if(fee.earnedMinor===null||fee.earnedMinor>0){const charge=data.retainerCharges.find(c=>c.value.periodId===fee.periodId);if(charge&&issued.has('retainerCharges:'+charge.id))continue;if(charge&&unbilled.some(u=>u.kind==='retainerCharges'&&u.id===charge.id))continue;unbilled.push({kind:'retainerPeriods',id:fee.periodId,amountMinor:fee.earnedMinor,currency:fee.currency,reason:'Earned period fee not issued; unknown remains explicit'})}
 const wip=data.tasks.filter(t=>t.value.remainingSeconds>0&&(!t.value.from||t.value.from<=window.to)).map(t=>({id:t.id,revision:t.revision,engagementId:t.value.engagementId,remainingSeconds:t.value.remainingSeconds}))
 const payments=data.payments.filter(p=>inWindow(p.value.date,window.from,window.to))
 const snapshot={...window,timezone:a.timezone,timeLock:{id:policy?.id??null,revision:policy?.revision??null,lockThrough:policy?.value.lockThrough??null},checklist:{blocking,unknownCalendarPeople:unknownCalendars,wip,unbilled,retainers},totals:{approvedSeconds:sum(approved.map(t=>t.value.durationSeconds)),laborCostByCurrency:total(approved.filter(t=>t.value.economics?.costMinor!=null),t=>t.value.economics.costMinor,t=>t.value.economics.costCurrency??t.value.economics.currency),expenseByCurrency:total(expenses.filter(e=>e.value.status==='approved'),e=>e.value.amountMinor,e=>e.value.currency),invoicedByCurrency:total(invoices,i=>i.value.totalMinor,i=>i.value.currency),netInvoicedByCurrency:total(invoices,i=>standings.find(s=>s.invoice.id===i.id)?.netMinor??0,i=>i.value.currency),invoiceAdjustmentsByCurrency:total(invoices,i=>i.value.totalMinor-(standings.find(s=>s.invoice.id===i.id)?.netMinor??0),i=>i.value.currency),unbilledKnownByCurrency:Object.fromEntries([...new Set(unbilled.map(u=>u.currency))].map(c=>[c,sum(unbilled.filter(u=>u.currency===c&&u.amountMinor!=null).map(u=>u.amountMinor))])),receivedByCurrency:total(payments,p=>p.value.amountMinor,p=>p.value.currency)},sources:{time,expenses,invoices,payments,invoiceCorrections:data.invoiceCorrections.filter(c=>c.value.status==='issued'&&c.value.date<=window.to&&invoices.some(i=>i.id===c.value.invoiceId)),matches:data.periodMatches.filter(m=>m.value.month===window.month)},notice:'Agency operational reconciliation; finance-recorded matches are not provider-verified or statutory accountant close'}
 const fingerprint=sha256(canonicalJson({snapshot,inputs:data,operator:a.session.operator.id,role:a.role}))
 return {month:window.month,from:window.from,to:window.to,fingerprint,snapshot,input:{month:window.month,retainerExceptions}}
}
export async function periodCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(!['period:match','period:prepare','period:approve','period:reopen-prepare','period:reopen'].includes(action))return null
 need(finance(a),'Finance access required',403)
 if(action==='period:match'){
  const invoice=await get(env,'invoices',text(input.invoiceId,'Invoice'));need(invoice.revision===input.invoiceRevision,'Invoice changed; review its exact revision',409);tx.observe('invoices',invoice)
  const window=bounds(input.month);need(inWindow(invoice.value.issueDate,window.from,window.to),'Invoice is outside this agency month')
  const corrections=await all(env,'invoiceCorrections');for(const c of corrections)tx.observe('invoiceCorrections',c);tx.guard('(SELECT COUNT(*) FROM g_invoiceCorrections)=?',corrections.length)
  const standing=liveInvoices({invoices:[invoice],invoiceCorrections:corrections},window.to)[0],net=standing?.netMinor??0
  need(integer(input.amountMinor,'External invoice amount')===net&&input.currency===invoice.value.currency,'External invoice amount/currency must reconcile exactly to native net',409)
  const externalIdentity=text(input.system,'Accounting system')+':'+text(input.externalId,'External invoice identity'),matches=await all(env,'periodMatches'),old=matches.find(m=>m.value.invoiceId===invoice.id)
  need(!old||old.id===input.id&&old.revision===input.revision,'Reconciliation changed; reload',409)
  need(!matches.some(m=>m.value.externalIdentity===externalIdentity&&m.value.invoiceId!==invoice.id),'That external identity already reconciles another invoice',409)
  tx.guard('(SELECT COUNT(*) FROM g_periodMatches)=?',matches.length)
  const credits=corrections.filter(c=>c.value.invoiceId===invoice.id&&c.value.status==='issued'&&c.value.date<=window.to).map(c=>({id:c.id,revision:c.revision}))
  return tx.record('periodMatches',{invoiceId:invoice.id,invoiceRevision:invoice.revision,month:window.month,externalIdentity,amountMinor:net,currency:invoice.value.currency,basis:sha256(canonicalJson({invoice,credits,net})),reference:text(input.reference,'Reconciliation evidence reference'),reason:text(input.reason,'Reconciliation reason'),recordedBy:a.session.operator.id,recordedAt:Date.now(),verification:'Finance-recorded; not provider-verified'},old)
 }
 if(action==='period:prepare'){
  const preview=await periodPreview(env,a,input,tx)
  need(preview.fingerprint===input.fingerprint,'Close inputs changed; preview again',409)
  need(preview.snapshot.checklist.blocking.length===0,'Resolve the close checklist before preparing the period',409)
  need(input.acknowledgeWip===true||input.acknowledgeWip==='on','Reconcile WIP and unbilled work explicitly')
  const buckets=preview.snapshot.totals,currencies=[...new Set(Object.values(buckets).filter(v=>typeof v==='object').flatMap(v=>Object.keys(v)))]
  const reviewByCurrency=Object.fromEntries(currencies.map(c=>[c,sum(Object.values(buckets).filter(v=>typeof v==='object').map(v=>Math.abs((v as Record<string,number>)[c]??0)))]))
  return tx.record('periodCloseDrafts',{...preview,review:{unpriced:preview.snapshot.checklist.unbilled.some(u=>u.amountMinor==null),amountMinor:Math.max(0,...Object.values(reviewByCurrency)),currency:currencies.length===1?currencies[0]:currencies.length?a.currency+'-MULTI':a.currency},status:'prepared',reason:text(input.reason,'Close preparation reason'),wipReconciliation:text(input.wipReconciliation,'WIP and unbilled reconciliation note'),createdBy:a.session.operator.id,createdAt:Date.now()})
 }
 if(action==='period:approve'){
  const draft=await get(env,'periodCloseDrafts',text(input.id,'Close draft'));need(draft.revision===input.revision&&draft.value.status==='prepared','Review the exact prepared close',409);tx.observe('periodCloseDrafts',draft)
  const preview=await periodPreview(env,a,draft.value.input,tx)
  // An independent approver reads the same business basis; operator identity is not a financial input.
  need(canonicalJson(preview.snapshot)===canonicalJson(draft.value.snapshot)&&preview.snapshot.checklist.blocking.length===0,'Period inputs changed; prepare a fresh reconciliation',409)
  await assertIndependentReview(env,a,tx,{...draft.value.review,createdBy:draft.value.createdBy})
  tx.guard("NOT EXISTS(SELECT 1 FROM g_periodCloses c WHERE json_extract(c.data,'$.month')=? AND NOT EXISTS(SELECT 1 FROM g_periodReopens r WHERE r.close_id=c.id))",draft.value.month)
  const history=(await all(env,'periodCloses')).filter(c=>c.value.month===draft.value.month),heads=history.filter(c=>!history.some(next=>next.value.previousCloseId===c.id));need(heads.length===(history.length?1:0),'Agency close history has an invalid chain',409);const previous=heads[0]
  return tx.record('periodCloses',{month:draft.value.month,from:draft.value.from,to:draft.value.to,previousCloseId:previous?.id??null,draftId:draft.id,draftRevision:draft.revision,snapshot:draft.value.snapshot,review:draft.value.review,reason:draft.value.reason,wipReconciliation:draft.value.wipReconciliation,preparedBy:draft.value.createdBy,closedBy:a.session.operator.id,closedAt:Date.now()})
 }
 if(action==='period:reopen-prepare'){
  const close=await get(env,'periodCloses',text(input.id,'Closed period'));need(close.revision===input.revision,'Closed period revision changed',409);tx.observe('periodCloses',close)
  need(!await env.DB.prepare('SELECT 1 FROM g_periodReopens WHERE close_id=?').bind(close.id).first(),'This close has already reopened',409)
  tx.guard('NOT EXISTS(SELECT 1 FROM g_periodReopens WHERE close_id=?)',close.id)
  const policy=(await all(env,'timePolicies'))[0];need(policy,'Finance time policy is missing',409);tx.observe('timePolicies',policy)
  return tx.record('periodReopenRequests',{timePolicy:{id:policy.id,revision:policy.revision,lockThrough:policy.value.lockThrough},proposedLockThrough:plus(close.value.from,-1),closeId:close.id,closeRevision:close.revision,review:close.value.review,reason:text(input.reason,'Agency reopening reason'),status:'prepared',createdBy:a.session.operator.id,createdAt:Date.now()})
 }
 const request=await get(env,'periodReopenRequests',text(input.id,'Reopen request'));need(request.revision===input.revision&&request.value.status==='prepared','Review the exact prepared reopen',409);tx.observe('periodReopenRequests',request)
 const close=await get(env,'periodCloses',request.value.closeId);need(close.revision===request.value.closeRevision,'Close basis changed',409);tx.observe('periodCloses',close)
 await assertIndependentReview(env,a,tx,{...request.value.review,createdBy:request.value.createdBy})
 tx.guard('NOT EXISTS(SELECT 1 FROM g_periodReopens WHERE close_id=?)',close.id)
 tx.reopeningCloseId=close.id
 const policy=(await all(env,'timePolicies'))[0]
 need(policy&&policy.id===request.value.timePolicy.id&&policy.revision===request.value.timePolicy.revision,'Finance time cutoff changed; prepare a new agency reopen',409)
 const newPolicy=await timePolicyCommand(env,a,tx,'time:policy',{...policy,lockThrough:request.value.proposedLockThrough,reason:`Agency period reopen: ${request.value.reason}`})
 const reopened=await tx.record('periodReopens',{previousTimePolicy:request.value.timePolicy,newTimePolicy:{id:newPolicy!.id,revision:newPolicy!.revision,lockThrough:request.value.proposedLockThrough},closeId:close.id,closeRevision:close.revision,requestId:request.id,month:close.value.month,reason:request.value.reason,reopenedBy:a.session.operator.id,reopenedAt:Date.now()})
 await tx.record('periodReopenRequests',{...request.value,status:'approved',approvedBy:a.session.operator.id,approvedAt:Date.now()},request)
 return reopened
}
