import {date, integer, need, type Value} from './model'

export function forecastSeconds(value: unknown, unit = 'decimal-hours', max = 366 * 86400) {
 if(unit==='seconds')return integer(value,'Forecast seconds',0,max)
 need(unit==='decimal-hours','Declare Forecast duration units')
 const raw=String(value);need(/^\d+(\.\d{1,6})?$/.test(raw),'Forecast hours must be decimal text')
 const [whole,frac='']=raw.split('.'),den=10n**BigInt(frac.length),num=(BigInt(whole)*den+BigInt(frac||0))*3600n
 need(num%den===0n,'Forecast hours must represent whole seconds')
 return integer(Number(num/den),'Forecast duration',0,max)
}
// An export total is not an original daily fact. Only explicitly reviewed dates
// distribute it; exact one-day API captures retain their own supplied quantity.
export function forecastDates(period: Value, totalSeconds: number) {
 need(period && typeof period==='object','Map the Forecast period')
 const from=date(period.from),to=date(period.to)
 need(to>=from && Date.parse(to)-Date.parse(from)<366*86400000,'Forecast period must span at most one year')
 const count=integer(period.workingDays,'Forecast working-day count',1,366)
 need(Array.isArray(period.workingDates) && period.workingDates.length===count,'Supply the exact Forecast workingDates matching workingDays')
 const days=period.workingDates.map((value: unknown)=>date(value))
 need(new Set(days).size===count,'Forecast workingDates must be unique')
 need(days.every((day: string)=>day>=from && day<=to),'Forecast workingDates must fall within the period')
 need(totalSeconds%count===0,'Forecast total must divide into exact whole seconds per working date')
 return days.sort().map((day: string)=>({day,dailySeconds:integer(totalSeconds/count,'Forecast seconds per date',0,86400)}))
}
