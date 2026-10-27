import { type Row, need } from './model'

const DAY=86400000
const halfUp=(minor:number,n:number,d:number)=>Number((2n*BigInt(minor)*BigInt(n)+BigInt(d))/(2n*BigInt(d)))
const previous=(day:string)=>new Date(Date.parse(day)-DAY).toISOString().slice(0,10)

/** REPORT-001: separate period fee, never the allowance's value. Cumulative rounding keeps month totals exact. */
export function retainerFees(data:Record<string,Row[]>,asOf:string) {
 return (data.retainerPeriods??[]).map(period=>{
  const p=period.value,version=(data.retainers??[]).find(r=>r.id===p.retainerId)
  need(version,'Retainer period has no commercial version',409)
  const t=version.value.terms,fee:number|null=t.feeMinor??null,calendar=version.value.calendar
  const eligible=(day:string)=>calendar.weekdays.includes(new Date(day+'T00:00:00Z').getUTCDay())&&!calendar.holidays.includes(day)
  const count=(from:string,through:string)=>{let n=0;for(let at=Date.parse(from);at<=Date.parse(through);at+=DAY)if(eligible(new Date(at).toISOString().slice(0,10)))n++;return n}
  const denominator=fee===null?null:count(p.periodStart,p.periodEnd)
  need(fee===null||denominator!>0,'The saved workweek has no working days for this period fee',409)
  const earnedThrough=(day:string)=>fee===null?null:halfUp(fee,count(p.activeStart,day<p.activeEnd?day:p.activeEnd),denominator!)
  const totalMinor=fee===null?null:halfUp(fee,count(p.activeStart,p.activeEnd),denominator!)
  const months=[]
  const first=new Date(p.activeStart+'T00:00:00Z');first.setUTCDate(1)
  for(let start=first.toISOString().slice(0,10);start<=p.activeEnd;){
   const next=new Date(start+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const end=previous(next.toISOString().slice(0,10))
   const before=earnedThrough(previous(start)),all=earnedThrough(end),actual=earnedThrough(end<asOf?end:asOf)
   // An as-of before this month contributes no actual fees.
   const actualMinor=fee===null?null:Math.max(0,actual!-before!),fullMinor=fee===null?null:all!-before!
   months.push({month:start.slice(0,7),actualMinor,totalMinor:fullMinor,etcMinor:fee===null?null:fullMinor!-actualMinor!})
   start=next.toISOString().slice(0,10)
  }
  return {periodId:period.id,retainerId:version.id,engagementId:p.engagementId,currency:t.currency,periodStart:p.periodStart,activeStart:p.activeStart,activeEnd:p.activeEnd,totalMinor,earnedMinor:earnedThrough(asOf),months,earnedBetween:(from:string,to:string)=>fee===null?null:Math.max(0,earnedThrough(to<asOf?to:asOf)!-earnedThrough(previous(from))!)}
 })
}
