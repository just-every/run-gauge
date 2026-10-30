import type { Bindings } from '../auth.server'
import { type Kind, type Row, type Value, need, text, date, money, sum, uuid } from './model'
import { type Actor, type Transaction, all, access, finance, get, fence } from './store'
import { assertIndependentReview } from './approval-policy'
import { phaseFor } from './budget-phases'

/** Approved revisions remain immutable. A reviewed successor replaces only its own chain. */
export function currentVendors(rows:Row[]) {
 const approved=rows.filter(r=>r.value.status==='approved'),replaced=new Set(approved.map(r=>r.value.previousId))
 return approved.filter(r=>!replaced.has(r.id))
}
export function vendorCosts(data:Record<string,Row[]>,asOf='9999-12-31') {
 const bills=currentVendors((data.vendorBills??[]).filter(r=>r.value.date<=asOf))
 return currentVendors(data.vendorCommitments??[]).map(commitment=>{
  const matched=bills.filter(b=>b.value.commitmentRootId===commitment.value.rootId),actualMinor=sum(matched.map(b=>b.value.amountMinor))
  return {commitment,bills:matched,actualMinor,remainingMinor:Math.max(0,commitment.value.amountMinor-actualMinor)}
 })
}
const same=(a:Value,b:Value)=>a.engagementId===b.engagementId&&(!a.phaseKey||!b.phaseKey||a.phaseKey===b.phaseKey)
const vendorName=(s:unknown)=>String(s??'').trim().toLowerCase()
const overlaps=(c:Value,kind:string,v:Value,people:Row[])=>{
 if(!same(c,v))return false
 if(kind==='expenses')return v.date>=c.from&&v.date<=c.to&&(!v.vendor||vendorName(v.vendor)===vendorName(c.vendor))
 const person=people.find(p=>p.id===v.personId)
 if(!person?.value.contractor)return false
 return kind==='staffing'?v.from<=c.to&&v.to>=c.from:v.workDate>=c.from&&v.workDate<=c.to
}
async function observed(env:Bindings,tx:Transaction,k:Kind) {
 const rows=await all(env,k);for(const r of rows)tx.observe(k,r)
 tx.guard(`(SELECT COUNT(*) FROM g_${k})=?`,rows.length);return rows
}
async function noOverlap(env:Bindings,tx:Transaction,c:Value) {
 const people=await observed(env,tx,'people')
 for(const k of ['expenses','staffing','time'] as const){
  const rows=await observed(env,tx,k)
  need(!rows.some(r=>overlaps(c,k,r.value,people)),'Ambiguous vendor cost overlaps an expense or contractor work; reconcile native sources before approval',409)
 }
}
/** Every native writer uses this guard, including proposals and restored source edits. */
export async function assertVendorSource(env:Bindings,tx:Transaction,k:Kind,value:Value) {
 if(!['expenses','staffing','time'].includes(k))return
 const rows=await observed(env,tx,'vendorCommitments'),people=await observed(env,tx,'people')
 need(!currentVendors(rows).some(c=>overlaps(c.value,k,value,people)),'Ambiguous vendor cost overlaps an approved commitment; use its received-bill workflow',409)
}
export async function vendorCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(!action.startsWith('vendor:')&&!action.startsWith('vendorBill:'))return null
 need(finance(a),'Finance access required for private vendor costs',403)
 const isBill=action.startsWith('vendorBill:'),kind:Kind=isBill?'vendorBills':'vendorCommitments'
 const rows=await observed(env,tx,kind),old=input.id?rows.find(r=>r.id===input.id):undefined
 if(input.id)need(old&&old.revision===input.revision,'Vendor revision changed; reload',409)
 if(action.endsWith(':save')){
  need(!old||old.value.status==='draft','Approved vendor records are immutable; prepare a linked correction',409)
  const previous=input.previousId?rows.find(r=>r.id===input.previousId):undefined
  if(input.previousId)need(previous&&currentVendors(rows).some(r=>r.id===previous.id)&&previous.revision===input.previousRevision,'Review the current approved predecessor before correcting',409)
  if(old)need((old.value.previousId??null)===(previous?.id??null),'Keep the correction predecessor',409)
  const id=old?.id??uuid(),rootId=previous?.value.rootId??old?.value.rootId??id
  const e=await access(env,a,text(input.engagementId??previous?.value.engagementId??old?.value.engagementId,'Engagement'));tx.observe('engagements',e)
  need(e.value.type!=='internal','Vendor commitments require a client project')
  need(e.value.currency===a.currency&&(!input.currency||input.currency===a.currency),'Native vendor costs require the agency and project currency to match')
  if(old||previous){const parent=(old??previous)!;need(parent.value.engagementId===e.id,'A vendor record cannot move projects')}
  const phase=await phaseFor(env,tx,e.id,input.phaseKey??previous?.value.phaseKey??old?.value.phaseKey)
  const common={rootId,previousId:previous?.id??null,previousRevision:previous?.revision??null,engagementId:e.id,phaseKey:phase?.key??null,currency:a.currency,amountMinor:money(input.amountMinor),date:date(input.date),reason:text(input.reason,'Preparation reason'),createdBy:a.session.operator.id,createdAt:Date.now(),status:'draft'}
  need(common.amountMinor>0,'Enter a positive vendor amount')
  if(isBill){
   const commitment=await get(env,'vendorCommitments',text(input.commitmentId??previous?.value.commitmentId??old?.value.commitmentId,'Approved commitment'))
   tx.observe('vendorCommitments',commitment)
   const commitments=await observed(env,tx,'vendorCommitments')
   need(currentVendors(commitments).some(c=>c.id===commitment.id)&&commitment.revision===input.commitmentRevision,'Review the current approved commitment revision',409)
   need(same(commitment.value,common)&&commitment.value.phaseKey===common.phaseKey,'Bill must use its commitment project and phase')
   need(common.date>=commitment.value.from&&common.date<=commitment.value.to,'Bill date must be inside the commitment period')
   if(previous)need(previous.value.commitmentRootId===commitment.value.rootId,'Corrections must retain their original commitment')
   const reference=text(input.reference,'Vendor bill reference',200)
   need(!rows.some(r=>r.id!==old?.id&&r.value.rootId!==rootId&&r.value.commitmentRootId===commitment.value.rootId&&vendorName(r.value.reference)===vendorName(reference)),'Vendor bill reference already received; correct its existing record',409)
   return tx.record(kind,{...common,commitmentId:commitment.id,commitmentRevision:commitment.revision,commitmentRootId:commitment.value.rootId,vendor:commitment.value.vendor,reference,evidence:'User-recorded bill; not accounting-provider verified',attachmentIds:old?.value.attachmentIds??[]},old,id,action)
  }
  const from=date(input.from),to=date(input.to);need(to>=from,'Commitment end precedes its start')
  const v={...common,vendor:text(input.vendor,'Vendor',200),scope:text(input.scope,'Subcontractor scope'),poReference:text(input.poReference,'Purchase order reference',200),from,to,expectedDate:date(input.expectedDate)}
  need(v.expectedDate>=from&&v.expectedDate<=to,'Expected date must be inside the commitment period')
  if(previous)need(v.vendor===previous.value.vendor&&v.phaseKey===previous.value.phaseKey,'Corrections retain vendor and phase identity')
  return tx.record(kind,v,old,id,action)
 }
 need(old,'Vendor record not found',404);need(old.value.status==='draft','This revision is already approved',409)
 const e=await access(env,a,old.value.engagementId);tx.observe('engagements',e)
 need(old.value.currency===a.currency&&e.value.currency===a.currency,'Vendor currency changed; prepare a new review',409)
 if(action==='vendorBill:file'){
  const file=input.file;need(file instanceof File&&file.size>0&&file.size<=1024*1024,'Upload an original bill up to 1 MiB')
  need(['application/pdf','image/png','image/jpeg','text/plain'].includes(file.type),'Use PDF, PNG, JPEG or text')
  const id=uuid();tx.sql('INSERT INTO g_vendor_files(id,bill_id,name,media_type,bytes,size) VALUES(?,?,?,?,?,?)',id,old.id,file.name.slice(0,180),file.type,await file.arrayBuffer(),file.size)
  return tx.record(kind,{...old.value,attachmentIds:[...old.value.attachmentIds,id]},old,undefined,action)
 }
 need(action.endsWith(':approve'),'Unknown vendor command')
 if(old.value.previousId)need(currentVendors(rows).some(r=>r.id===old.value.previousId&&r.revision===old.value.previousRevision),'Another correction superseded this predecessor',409)
 let commitment=old
 if(isBill){
  const commitments=await observed(env,tx,'vendorCommitments')
  commitment=commitments.find(c=>c.id===old.value.commitmentId)!
  need(commitment&&currentVendors(commitments).some(c=>c.id===commitment.id)&&commitment.revision===old.value.commitmentRevision,'Commitment changed; prepare the bill against the current revision',409)
  need(old.value.attachmentIds.length>0,'Retain the original bill before approving')
 }else await phaseFor(env,tx,e.id,old.value.phaseKey)
 await noOverlap(env,tx,commitment.value)
 const bills=isBill?rows:await observed(env,tx,'vendorBills')
 const matched=currentVendors(bills).filter(b=>b.value.commitmentRootId===commitment.value.rootId&&b.value.id!==old.id&&b.id!==old.value.previousId)
 const total=sum([...matched.map(b=>b.value.amountMinor),...(isBill?[old.value.amountMinor]:[])])
 need(total<=commitment.value.amountMinor,'Received bills exceed the approved commitment',409)
 if(!isBill){
  const commitments=currentVendors(rows).filter(c=>c.value.rootId!==old.value.rootId)
  need(!commitments.some(c=>same(c.value,old.value)&&vendorName(c.value.vendor)===vendorName(old.value.vendor)&&c.value.from<=old.value.to&&c.value.to>=old.value.from),'Overlapping vendor commitments are ambiguous; use a linked correction',409)
  need(bills.filter(b=>b.value.commitmentRootId===old.value.rootId&&b.value.status==='approved').every(b=>b.value.date>=old.value.from&&b.value.date<=old.value.to),'Corrections must retain all received bill dates')
 }
 const prior=old.value.previousId?rows.find(r=>r.id===old.value.previousId):undefined
 await assertIndependentReview(env,a,tx,{createdBy:old.value.createdBy,currency:old.value.currency,amountMinor:Math.max(old.value.amountMinor,prior?.value.amountMinor??0)})
 const approved=await tx.record(kind,{...old.value,status:'approved',approvedBy:a.session.operator.id,approvedAt:Date.now(),approvalReason:text(input.reason,'Approval reason'),matched:!!isBill},old,undefined,action)
 if(isBill)tx.sql('INSERT INTO g_vendor_matches(bill_id,commitment_id,commitment_revision) VALUES(?,?,?)',old.id,commitment.id,commitment.revision)
 return approved
}
export async function vendorOriginal(env:Bindings,a:Actor,id:string) {
 need(finance(a),'Finance access required for bill originals',403)
 const file=await env.DB.prepare('SELECT *,hex(bytes) AS bytes_hex FROM g_vendor_files WHERE id=?').bind(id).first<any>()
 need(file,'Bill original not found',404);const bill=await get(env,'vendorBills',file.bill_id);await access(env,a,bill.value.engagementId);await fence(env,a)
 return file
}
