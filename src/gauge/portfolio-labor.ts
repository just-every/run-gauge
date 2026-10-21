import { type Row, sum } from './model'

interface LaborRow {key:string;team:string;service:string;currency:string;seconds:number;knownCostMinor:number;knownLaborCostMinor:number;expenseCostMinor:number;knownHourlyBillableMinor:number;unknown:string[];billUnknown:string[];sources:{kind:string,id:string}[]}
/** Additive approved sources. Commercial fixed/retainer fees are never attributed to a worker. */
export function portfolioLabor(data:Record<string,Row[]>,projects:{engagementId:string;basis:string}[],from:string,to:string) {
 const rows=new Map<string,LaborRow>(),basis=new Map(projects.map(p=>[p.engagementId,p.basis])),people=new Map(data.people.map(p=>[p.id,p]))
 for(const kind of ['time','expenses'])for(const row of data[kind]??[]){
  const v=row.value,day=kind==='time'?v.workDate:v.date
  if(v.status!=='approved'||!basis.has(v.engagementId)||day<from||day>to)continue
  const person=people.get(v.personId),project=data.engagements.find(e=>e.id===v.engagementId)!,team=String(person?.value.team||'Unassigned'),service=kind==='time'?String(v.service||'Unspecified'):'Unassigned expense service',currency=project.value.currency
  const key=JSON.stringify([team,service,currency]),group:LaborRow=rows.get(key)??{key,team,service,currency,seconds:0,knownCostMinor:0,knownLaborCostMinor:0,expenseCostMinor:0,knownHourlyBillableMinor:0,unknown:[],billUnknown:[],sources:[]}
  const cost=kind==='time'?v.economics?.costMinor:v.amountMinor,costCurrency=kind==='time'?(v.economics?.costCurrency??v.economics?.currency):v.currency
  if(kind==='time')group.seconds+=v.durationSeconds
  if(cost==null)group.unknown.push(`${kind}:${row.id}: frozen cost unknown`)
  else if(costCurrency!==currency)group.unknown.push(`${kind}:${row.id}: unconverted ${costCurrency} cost`)
  else {group.knownCostMinor+=cost;if(kind==='time')group.knownLaborCostMinor+=cost;else group.expenseCostMinor+=cost}
  if(kind==='time'&&basis.get(v.engagementId)==='hourly'&&v.billable){if(v.economics?.billMinor==null)group.billUnknown.push(`time:${row.id}: frozen bill value unknown`);else group.knownHourlyBillableMinor+=v.economics.billMinor}
  group.sources.push({kind,id:row.id});if(person)group.sources.push({kind:'people',id:person.id})
  rows.set(key,group)
 }
 const list=[...rows.values()].map(r=>({...r,costMinor:r.unknown.length?null:r.knownCostMinor,laborCostMinor:r.unknown.some(u=>u.startsWith('time:'))?null:r.knownLaborCostMinor,hourlyBillableMinor:r.billUnknown.length?null:r.knownHourlyBillableMinor})),currencies=[...new Set(list.map(r=>r.currency))]
 return {rows:list,totals:currencies.map(currency=>{const bucket=list.filter(r=>r.currency===currency);return {currency,knownCostMinor:sum(bucket.map(r=>r.knownCostMinor)),costMinor:bucket.some(r=>r.costMinor===null)?null:sum(bucket.map(r=>r.knownCostMinor))}}),seconds:sum(list.map(r=>r.seconds))}
}
