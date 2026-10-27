import { type Row, type Value, sum } from './model'

/** Finance report projection. One immutable document remains one receivable.
 * Receipts and promises use cumulative half-up shares of the live line balances,
 * so project and phase figures reconcile exactly, including the final cent. */
export function projectBillingData(data:Record<string,Row[]>,engagementId:string,asOf='9999-12-31',phaseKey?:string):Record<string,Row[]> {
 const matches=(line:Value,parent:Row)=>{
  const source=line.sourceSnapshot?.value??(data[line.kind]??[]).find(r=>r.id===line.sourceId)?.value
  return (line.engagementId??source?.engagementId??parent.value.engagementId)===engagementId && (phaseKey===undefined||(line.phaseKey??source?.phaseKey)===phaseKey)
 }
 const projected={...data},weights=new Map<string,{before:number;through:number;total:number}>()
 projected.invoices=(data.invoices??[]).flatMap(invoice=>{
  const all:Value[]=invoice.value.lines,lines=all.filter(l=>matches(l,invoice));if(!lines.length)return []
  // Group by stable project and phase identity before allocating each amount.
  const key=(l:Value)=>JSON.stringify([l.engagementId??l.sourceSnapshot?.value.engagementId??invoice.value.engagementId,l.phaseKey??l.sourceSnapshot?.value.phaseKey??null])
  const groups=[...new Set(all.map(key))].sort(),net=all.map((l,index)=>l.amountMinor-sum((data.invoiceCorrections??[]).filter(c=>c.value.invoiceId===invoice.id&&c.value.status==='issued'&&c.value.type!=='void'&&c.value.date<=asOf).flatMap(c=>(c.value.lines??[]).filter((x:Value)=>x.index===index).map((x:Value)=>x.amountMinor))))
  let before=0,through=0,total=0
  for(const group of groups){const amount=sum(all.map((l,i)=>key(l)===group?net[i]:0));if(all.some(l=>key(l)===group&&matches(l,invoice))){if(!through)before=total;through=total+amount}total+=amount}
  weights.set(invoice.id,{before,through,total})
  return [{...invoice,value:{...invoice.value,engagementId,lines,totalMinor:sum(lines.map(l=>l.amountMinor))}}]
 })
 projected.packets=(data.packets??[]).flatMap(packet=>{const lines=packet.value.lines.filter((l:Value)=>matches(l,packet));return lines.length?[{...packet,value:{...packet.value,engagementId,lines,totalMinor:sum(lines.map((l:Value)=>l.amountMinor))}}]:[]})
 const ids=new Set(projected.invoices.map(i=>i.id))
 projected.invoiceCorrections=(data.invoiceCorrections??[]).flatMap(c=>{
  if(!ids.has(c.value.invoiceId))return []
  const invoice=data.invoices.find(i=>i.id===c.value.invoiceId)!
  const selected=invoice.value.lines.map((l:Value,index:number)=>matches(l,invoice)?index:-1).filter((i:number)=>i>=0)
  const lines=(c.value.lines??[]).filter((l:Value)=>selected.includes(l.index)).map((l:Value)=>({...l,index:selected.indexOf(l.index)}))
  return c.value.type==='void'?[{...c,value:{...c.value,engagementId}}]:lines.length?[{...c,value:{...c.value,engagementId,lines,amountMinor:sum(lines.map((l:Value)=>l.amountMinor))}}]:[]
 })
 for(const kind of ['payments','paymentPromises','invoiceDisputes'])projected[kind]=(data[kind]??[]).flatMap(row=>{
  const w=weights.get(row.value.invoiceId);if(!w)return []
  const share=(n:number)=>w.total?Number((BigInt(row.value.amountMinor)*BigInt(n)*2n+BigInt(w.total))/(2n*BigInt(w.total))):0
  return [{...row,value:{...row.value,engagementId,amountMinor:share(w.through)-share(w.before),allocationBasis:'Cumulative half-up share of immutable source lines net of issued credits'}}]
 })
 return projected
}
