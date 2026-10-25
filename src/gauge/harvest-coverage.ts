import { type Value, date } from './model'

// Full-history declarations come from the source administrator, never from the rows present.
export function harvestCoverage(manifest:Value, records:Record<string,Value[]>, schedule:Value[], files:Record<string,string>) {
 const findings:Value[]=[],report=(kind:string,reason:string)=>findings.push({kind,reason})
 const review=manifest.sourceCoverage
 if(!review||typeof review!=='object')return [{kind:'coverage',reason:'Independent source coverage review is missing'}]
 const kinds=['clients','people','projects','time',...(files['forecast.csv']||files['forecast.json']?['forecast']:[])]
 for(const kind of kinds){
  const source=review[kind],provider=kind==='forecast'?'forecast':'harvest'
  if(!source||source.provider!==provider||typeof source.account!=='string'||!source.account.trim()){report(kind,'Source provider and account identity are missing');continue}
  if(kind!=='forecast'&&source.account!==review.clients?.account)report(kind,'Harvest source objects must belong to the same reviewed account')
  if(source.administrator!==true||source.permission!==true)report(kind,'Source administrator or object permission is missing')
  if(source.complete!==true||source.filters!=='all-records')report(kind,'Filtered or incomplete original export cannot establish completeness')
  const windows=source.windows,extent=source.historyRange
  if(!Array.isArray(windows)||!windows.length||windows.length>20||!extent?.from||!extent?.to){report(kind,'Full source history range and contiguous export windows are required');continue}
  let previous=''
  for(const window of windows){
   const from=date(window.from),to=date(window.to)
   if(from>to||window.complete!==true||previous&&new Date(Date.parse(previous+'T00:00:00Z')+86400000).toISOString().slice(0,10)!==from)report(kind,'Export windows are incomplete or not contiguous')
   previous=to
  }
  if(date(extent.from)!==windows[0].from||date(extent.to)!==windows.at(-1).to)report(kind,'Export windows do not cover the independent source history range')
  if(kind==='forecast'){
   if(source.pagesComplete!==true)report(kind,'All Forecast source pages must be captured')
   for(const item of schedule)if(item.from<extent.from||item.to>extent.to)report(kind,'Schedule lies outside the source coverage review')
  }else{
   if(!Number.isSafeInteger(source.count)||source.count!==records[kind+'.csv'].length)report(kind,'Independent source object count is missing or does not reconcile')
   if(kind==='time')for(const row of records['time.csv']){const day=date(row[manifest.columns?.time?.date??'Date']);if(day<extent.from||day>extent.to)report(kind,'Work date lies outside the source coverage review')}
  }
 }
 return findings
}
