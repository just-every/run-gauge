import assert from 'node:assert/strict'
export async function attachVendorOriginal(h,bill,bytes='synthetic-gauge-8101 original bill',cookie=h.owner) {
 const form=new FormData()
 for(const[k,v]of Object.entries({...bill,key:crypto.randomUUID(),action:'vendorBill:file'}))form.set(k,String(v))
 form.set('file',new File([bytes],'bill.txt',{type:'text/plain'}))
 const response=await h.request('/api/gauge/command',cookie,{method:'POST',headers:{origin:h.origin},body:form})
 assert.equal(response.status,200,await response.clone().text());return response.json()
}
export async function prepareVendorPortability(h) {
 const currency=(await h.state()).agency.currency
 const person=await h.cmd('save:people',{name:'synthetic-gauge-8102',timezone:'Etc/UTC'})
 const client=await h.cmd('save:clients',{name:'Portable vendor client',billingCurrency:currency})
 const project=await h.cmd('save:engagements',{name:'Portable vendor scope',clientId:client.id,leadId:person.id,members:[],scope:'Retained vendor originals',timezone:'Etc/UTC'})
 const approver=await h.invite('synthetic-gauge-8103')
 await h.cmd('grant',{operatorId:approver.id,personId:person.id,role:'finance',enabled:true})
 const input={engagementId:project.id,vendor:'Portable vendor',scope:'Portable deliverables',poReference:'PO-8102',amountMinor:800000,date:'2026-10-01',from:'2026-10-01',to:'2026-12-31',expectedDate:'2026-12-15',reason:'Reviewed native scope'}
 const commitment=await h.cmd('vendor:approve',{...await h.cmd('vendor:save',input),reason:'Independent review'},approver.cookie)
 const first=await h.cmd('vendorBill:save',{engagementId:project.id,commitmentId:commitment.id,commitmentRevision:commitment.revision,reference:'BILL-8101',amountMinor:200000,date:'2026-10-08',reason:'Received native bill'})
 const original=await attachVendorOriginal(h,first)
 const approved=await h.cmd('vendorBill:approve',{...original,reason:'Independent bill review'},approver.cookie)
 const correction=await h.cmd('vendorBill:save',{engagementId:project.id,commitmentId:commitment.id,commitmentRevision:commitment.revision,previousId:approved.id,previousRevision:approved.revision,reference:'BILL-8101 corrected',amountMinor:150000,date:'2026-10-09',reason:'Linked corrected bill'})
 const fixed=await attachVendorOriginal(h,correction,'synthetic-gauge-8104 corrected original')
 await h.cmd('vendorBill:approve',{...fixed,reason:'Independent correction review'},approver.cookie)
 return {commitment,approved,approver,project}
}
