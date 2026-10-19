// The page forms speak in people's units: dollars, hours, minutes, local wall-clock
// times and weekday checkboxes. This turns a posted form into the command input the
// API takes (currency minor units, seconds, instants with a UTC offset, "1,2,3,4,5"), so stored
// fields and the command API never change. Field names carry their unit: amountDollars
// becomes amountMinor, effortHours becomes effortSeconds, startLocal becomes start.
import { type Value, need, zone } from './model'

const lists = ['members', 'sources', 'completedItems', 'entries']
const decimal = (raw: string, label: string) => { need(/^\d+(\.\d+)?$/.test(raw.trim()), `${label}: enter a number such as 7.5`); return Number(raw.trim()) }
const cents = (raw: string) => {
 need(/^\d+(\.\d+)?$/.test(raw.trim()), 'Amount: enter a number such as 7.5')
 const [whole, fraction = ''] = raw.trim().split('.'), minor = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0')) + (Number(fraction[2] ?? 0) >= 5 ? 1n : 0n)
 need(minor <= BigInt(Number.MAX_SAFE_INTEGER), 'Amount is too large')
 return Number(minor)
}

/** The UTC offset ("+10:00") a timezone has at one instant. */
function offsetMinutes(ms: number, timeZone: string) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms).map(p => [p.type, p.value]))
 return Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms) / 60000)
}

/** "2026-10-06T09:00" in Australia/Brisbane → "2026-10-06T09:00:00+10:00". */
export function zonedInstant(local: string, timeZone: string) {
 need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local), 'Choose a date and time')
 const wall = Date.parse(`${local}:00Z`), first = wall - offsetMinutes(wall, timeZone) * 60000, offset = offsetMinutes(first, timeZone)
 const sign = offset < 0 ? '-' : '+', abs = Math.abs(offset)
 return `${local}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/** An instant as a datetime-local value in its work timezone. */
export function localValue(ms: number | string | null | undefined, timeZone: string) {
 if (ms == null || ms === '') return ''
 const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]))
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export function formInput(form: FormData): Value {
 const input: Value = Object.fromEntries(form)
 if(form.has('retainerInput'))Object.assign(input,JSON.parse(String(form.get('retainerInput'))))
 if(form.has('deliveryInput'))Object.assign(input,JSON.parse(String(form.get('deliveryInput'))))
 if(input.action==='delivery:preview'&&input.operation==='baseline') {
  input.previousId=input.previousId||null
  input.plan={calendar:{weekdays:form.getAll('weekdays').map(Number),holidays:String(form.get('deliveryHolidays')??'').split(',').map(s=>s.trim()).filter(Boolean)},nodes:form.getAll('nodeId').map(String).filter(id=>form.has(`include:${id}`)).map(id=>({id,kind:form.get(`nodeKind:${id}`),sourceId:form.get(`nodeSource:${id}`)||null,name:form.get(`nodeName:${id}`),start:form.get(`start:${id}`),durationDays:Number(form.get(`duration:${id}`)),predecessors:form.getAll(`predecessors:${id}`).map(String),staffingIds:form.getAll(`staffing:${id}`).map(String)}))}
 }

 if(input.action==='template:save'&&form.has('itemLines')){
  // One item per line: key | kind | name | offset days | duration days | after keys | owner | effort hours | fee.
  input.items=String(form.get('itemLines')).split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{const [key,kind,name,offsetDays,durationDays,after='',owner='',effort='',fee='']=line.split('|').map(s=>s.trim());return {key,kind,name,offsetDays,durationDays,predecessors:after.split(',').map(s=>s.trim()).filter(Boolean),owner:owner||null,effortSeconds:effort===''?0:Math.round(decimal(effort,'Effort hours')*3600),amountMinor:fee===''?(kind==='milestone'?'':null):cents(fee)}})
  delete input.itemLines;input.previousId=input.previousId||null
 }
 if(input.gridDate){input.startLocal=`${input.gridDate}T${input.startClock}`;input.endLocal=`${input.gridDate}T${input.endClock}`;delete input.startClock;delete input.endClock;delete input.gridDate}
 if(form.get('action')==='task:progress')input.completedItems=form.getAll('completedItems')
 for (const name of lists) if (form.getAll(name).length) input[name] = form.getAll(name)
 if (form.has('weekdays')) input.weekdays = form.getAll('weekdays').join(',')
 for (const key of Object.keys(input)) {
  const raw = input[key]; if (typeof raw !== 'string') continue
  const base = key.replace(/(Dollars|Hours|Minutes|Local)$/, '')
  if (key.endsWith('Dollars')) input[`${base}Minor`] = raw.trim() === '' ? '' : cents(raw)
  else if (key.endsWith('Hours')) input[`${base}Seconds`] = Math.round(decimal(raw, 'Hours') * 3600)
  else if (key.endsWith('Minutes')) input[`${base}Seconds`] = Math.round(decimal(raw, 'Minutes') * 60)
  else if (key.endsWith('Local')) { if (raw === '') continue; input[base] = zonedInstant(raw, zone(input.timezone)) }
  else continue
  delete input[key]
 }
 if(input.action==='retainer:preview'&&input.operation==='terms'){input.terms={name:input.name,frequency:input.frequency,unit:input.unit,allowance:input.unit==='value'?input.allowanceMinor:input.allowanceSeconds,services:String(input.services??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),consumes:input.consumes,proration:input.proration,start:input.start,end:input.end||null,renewal:input.renewal,noticeDays:input.noticeDays,rules:{carryCap:input.unit==='value'?input.carryCapMinor:input.carryCapSeconds,carryPeriods:input.carryPeriods,deficit:input.deficit==='on',overage:input.overage,overageRate:input.unit==='value'?Math.round(decimal(String(input.overagePercent),'Overage percent')*100):input.overageRateMinor}}}
 return input
}
