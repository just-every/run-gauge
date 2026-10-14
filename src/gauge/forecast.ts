import {date, integer, need, type Value} from './model'

// Aggregate exports cannot identify a person's non-work days. Use the dates
// explicitly reviewed against Forecast, rather than inferring a native calendar.
export function forecastDates(period: Value, totalSeconds: number) {
 need(period && typeof period==='object','Map the Forecast period')
 const from=date(period.from),to=date(period.to)
 need(to>=from,'Forecast period ends before it starts')
 const count=integer(period.workingDays,'Forecast working-day count',1,366)
 need(Array.isArray(period.workingDates) && period.workingDates.length===count,'Supply the exact Forecast workingDates matching workingDays')
 const days=period.workingDates.map((value: unknown)=>date(value))
 need(new Set(days).size===count,'Forecast workingDates must be unique')
 need(days.every((day: string)=>day>=from && day<=to),'Forecast workingDates must fall within the period')
 need(totalSeconds%count===0,'Forecast total must divide into exact whole seconds per working date')
 return days.sort().map((day: string)=>({day,dailySeconds:totalSeconds/count}))
}
