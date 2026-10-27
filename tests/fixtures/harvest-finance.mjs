// Separately supplied source controls are literal receipts, never calculated from importer output.
export function harvestFinancePackage(pack) {
 const currency=pack.manifest.currency,clientId='c-1',projectId='j-1',base={clientId,projectId,currency}
 const capture={
  expenses:[{...base,id:'synthetic-gauge-expense-1',date:'2026-09-03',amountMinor:1200}],
  estimates:[{...base,id:'synthetic-gauge-estimate-1',date:'2026-09-01',amountMinor:30000}],
  invoices:[{...base,id:'synthetic-gauge-invoice-1',date:'2026-09-30',amountMinor:10000,paidMinor:7000,outstandingMinor:3000},{...base,id:'synthetic-gauge-credit-1',date:'2026-10-03',amountMinor:-1000,paidMinor:-1000,outstandingMinor:0}],
  payments:[{id:'synthetic-gauge-payment-1',invoiceId:'synthetic-gauge-invoice-1',date:'2026-09-30',amountMinor:2000,currency},{id:'synthetic-gauge-payment-2',invoiceId:'synthetic-gauge-invoice-1',date:'2026-10-02',amountMinor:5000,currency},{id:'synthetic-gauge-refund-1',invoiceId:'synthetic-gauge-credit-1',date:'2026-10-03',amountMinor:-1000,currency}],
  retainers:[{...base,id:'synthetic-gauge-retainer-1',familyId:'synthetic-gauge-family-1',date:'2026-09-01',openingMinor:100,allowanceMinor:200,usedMinor:350,closingMinor:-50,carryInMinor:100,carryOutMinor:-50},{...base,id:'synthetic-gauge-retainer-2',familyId:'synthetic-gauge-family-1',date:'2026-10-01',openingMinor:-50,allowanceMinor:200,usedMinor:50,closingMinor:100,carryInMinor:-50,carryOutMinor:100}]
 }
 pack.files['finance.json']=JSON.stringify(capture)
 pack.manifest.finance.controls={counts:{expenses:1,estimates:1,invoices:2,payments:3,retainers:2},financial:{
  [`c-1/2026-09/${currency}`]:{expenseMinor:1200,estimateMinor:30000,invoiceMinor:10000,invoicePaidMinor:7000,paidMinor:2000,outstandingMinor:3000,openingMinor:100,allowanceMinor:200,usedMinor:350,closingMinor:-50,carryInMinor:100,carryOutMinor:-50},
  [`c-1/2026-10/${currency}`]:{expenseMinor:0,estimateMinor:0,invoiceMinor:-1000,invoicePaidMinor:-1000,paidMinor:4000,outstandingMinor:0,openingMinor:-50,allowanceMinor:200,usedMinor:50,closingMinor:100,carryInMinor:-50,carryOutMinor:100}
 }}
 for(const [kind,count]of Object.entries(pack.manifest.finance.controls.counts))pack.manifest.sourceCoverage[kind].count=count
 return pack
}

export async function harvestFinanceRestart(pack) {
 const {harness}=await import('../gauge-harness.mjs'),{rm}=await import('node:fs/promises'),{default:assert}=await import('node:assert/strict')
 let h=await harness({currency:'USD',timezone:'America/New_York'});const directory=h.directory
 try{
  const p=await h.cmd('import:preview',{package:pack});assert(p.canApply)
  let job=await h.cmd('import:create',{package:pack,fingerprint:p.fingerprint})
  job=await h.cmd('import:resume',{id:job.id});assert.equal(job.state,'applying');assert(job.checkpoint>10&&job.checkpoint<job.total,'Interrupt within the financial source records')
  const checkpoint=job.checkpoint;await h.close();h=await harness({currency:'USD',persistenceDirectory:directory})
  assert.equal((await h.cmd('import:read',{id:job.id})).checkpoint,checkpoint)
  while(job.state==='applying')job=await h.cmd('import:resume',{id:job.id});assert.equal(job.state,'completed')
  assert.equal((await h.state()).data.archives.filter(r=>r.value.harvestFinance).length,9)
  const again=await h.cmd('import:preview',{package:pack});let replay=await h.cmd('import:create',{package:pack,fingerprint:again.fingerprint});while(replay.state==='applying')replay=await h.cmd('import:resume',{id:replay.id})
  assert.equal((await h.state()).data.archives.filter(r=>r.value.harvestFinance).length,9)
  for(let reverse of [replay,job]){reverse=await h.cmd('import:undo',{id:reverse.id});while(reverse.state==='undoing')reverse=await h.cmd('import:resume',{id:reverse.id});assert.equal(reverse.state,'undone')}
  assert.equal((await h.state()).data.archives.length,0)
  const originals=await h.cmd('import:originals',{id:job.id});assert.equal(Buffer.from(originals.find(a=>a.name==='finance.json').original.base64,'base64').toString(),pack.files['finance.json'])
 }finally{await h.close();await rm(directory,{recursive:true,force:true})}
}
