import { type Row, sum } from './model'

interface LaborRow {key:string;team:string;service:string;currency:string;seconds:number;knownCostMinor:number;unknown:string[];sources:{kind:string,id:string}[]}

/** Additive approved costs by the worker's current team and recorded service; commercial fees are not allocated. */
export function portfolioLabor(data:Record<string,Row[]>,projectIds:string[],from:string,to:string) {
 const rows=new Map<string,LaborRow>(),ids=new Set(projectIds),people=new Map(data.people.map(p=>[p.id,p]))
 for(const kind of ['time','expenses'])for(const row of data[kind]??[]){
  const v=row.value,day=kind==='time'?v.workDate:v.date
  if(v.status!=='approved'||!ids.has(v.engagementId)||day<from||day>to)continue
  const person=people.get(v.personId),project=data.engagements.find(e=>e.id===v.engagementId)!,team=String(person?.value.team||'Unassigned'),service=kind==='time'?v.service:'Unassigned expense service',currency=project.value.currency
  const key=JSON.stringify([team,service,currency]),group:LaborRow=rows.get(key)??{key,team,service,currency,seconds:0,knownCostMinor:0,unknown:[],sources:[]}
  const cost=kind==='time'?v.economics?.costMinor:v.amountMinor,costCurrency=kind==='time'?(v.economics?.costCurrency??v.economics?.currency):v.currency
  if(kind==='time')group.seconds+=v.durationSeconds
  if(cost==null)group.unknown.push(`${kind}:${row.id}: frozen cost unknown`)
  else if(costCurrency!==currency)group.unknown.push(`${kind}:${row.id}: unconverted ${costCurrency} cost`)
  else group.knownCostMinor+=cost
  group.sources.push({kind,id:row.id});if(person)group.sources.push({kind:'people',id:person.id})
  rows.set(key,group)
 }
 const list=[...rows.values()].map(r=>({...r,costMinor:r.unknown.length?null:r.knownCostMinor})),currencies=[...new Set(list.map(r=>r.currency))]
 return {rows:list,totals:currencies.map(currency=>{const bucket=list.filter(r=>r.currency===currency);return {currency,knownCostMinor:sum(bucket.map(r=>r.knownCostMinor)),costMinor:bucket.some(r=>r.costMinor===null)?null:sum(bucket.map(r=>r.knownCostMinor))}}),seconds:sum(list.map(r=>r.seconds))}
}
