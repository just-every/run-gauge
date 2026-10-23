import type { Bindings } from '../auth.server'
import { type Value, type Row, date, integer, need, workDate, flag } from './model'
import { type Transaction, all } from './store'
const shift = (day:string,n:number) => new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
const dates = (raw:unknown):string[] => (Array.isArray(raw)?raw:String(raw??'').split(',').map(s=>s.trim()).filter(Boolean)).map(date)
/** Observed US federal holidays; explicit workdays can override an observed holiday. */
export function federalHolidays(year:number) {
 const result:string[]=[]
 const fixed=(month:number,day:number,y=year)=>{const d=`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,w=new Date(d).getUTCDay();result.push(shift(d,w===6?-1:w===0?1:0))}
 const nth=(month:number,weekday:number,n:number)=>{const first=`${year}-${String(month).padStart(2,'0')}-01`,offset=(weekday-new Date(first).getUTCDay()+7)%7;result.push(shift(first,offset+7*(n-1)))}
 fixed(1,1);fixed(1,1,year+1);nth(1,1,3);nth(2,1,3)
 const last=`${year}-05-31`;result.push(shift(last,-((new Date(last).getUTCDay()+6)%7)))
 fixed(6,19);fixed(7,4);nth(9,1,1);nth(10,1,2);fixed(11,11);nth(11,4,4);fixed(12,25)
 return result.filter(d=>d.startsWith(String(year))).sort()
}
export async function calendarFields(env:Bindings,tx:Transaction,input:Value,value:Value,previous?:Row) {
 let weekdaySeconds=input.weekdaySeconds
 if(typeof weekdaySeconds==='string') {try {weekdaySeconds=weekdaySeconds.trim()?JSON.parse(weekdaySeconds):undefined}catch {need(false,'Use a JSON array of seven weekday second values')}}
 if(weekdaySeconds!==undefined) {need(Array.isArray(weekdaySeconds)&&weekdaySeconds.length===7,'Use seven weekday second values, Sunday first');weekdaySeconds=weekdaySeconds.map((v:unknown)=>integer(v,'Weekday seconds',0,86400))}
 else weekdaySeconds=previous?.value.weekdaySeconds
 const workdays=dates(input.workdays??previous?.value.workdays)
 let holidays=[...value.holidays],agencyCalendarId=previous?.value.agencyCalendarId??null
 if(flag(input.useAgencyHolidays)){const calendars=await all(env,'agencyCalendars'),current=calendars.at(-1);if(current){tx.observe('agencyCalendars',current);agencyCalendarId=current.id;holidays.push(...current.value.calendar.holidays)}tx.guard('(SELECT COUNT(*) FROM g_agencyCalendars)=?',calendars.length)}
 const federalYear=input.federalYear?integer(input.federalYear,'Federal holiday year (2021 onward)',2021,2200):previous?.value.federalYear??null
 if(federalYear)holidays.push(...federalHolidays(federalYear))
 holidays=[...new Set(holidays)].filter(d=>d>=value.from&&d<=value.to&&!workdays.includes(d)).sort()
 need(workdays.every(d=>d>=value.from&&d<=value.to),'Agreed workdays must be inside the calendar period')
 return {...(weekdaySeconds?{weekdaySeconds}:{}),workdays,holidays,agencyCalendarId,federalYear}
}
export function protectCalendar(previous:Value,next:Value,timezone:string) {
 const today=workDate(Date.now(),timezone)
 const seconds=(v:Value,day:string)=>{if(day<v.from||day>v.to)return null;const w=new Date(day).getUTCDay();return v.holidays?.includes(day)?0:v.weekdaySeconds?v.weekdaySeconds[w]:v.weekdays.split(',').includes(String(w))?v.dailySeconds:0}
 for(let day=previous.from<next.from?previous.from:next.from;day<=(previous.to>next.to?previous.to:next.to)&&day<=today;day=shift(day,1))need(seconds(previous,day)===seconds(next,day)&&previous.timezone===next.timezone,'Historical capacity is protected; start a new calendar after this period',409)
}
