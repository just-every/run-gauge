import { sha256, canonicalJson } from '../modules/import-kit/src/d1/index'
import { parseApiJson } from '../modules/import-kit/src/readers/numeric-lexemes'
import { ReaderError } from '../modules/import-kit/src/readers/errors'
import { need, type Value } from './model'
import { parseCsv } from './harvest'

// Source-produced report metadata and original page envelopes are retained artifacts.
// Manifest administrator attestations cannot stand in for either one.
export function forecastCapture(m:Value,files:Record<string,string>) {
 const findings:Value[]=[],report=(reason:string)=>findings.push({kind:'forecast',reason})
 if(!files['forecast.csv']&&!files['forecast.json'])return {capture:undefined,findings}
 const decode=(name:string)=>{try{return parseApiJson(files[name],{artifact:name},[],{namespace:'forecast:'+m.namespace,url:'https://source.invalid/',preserveNumberLexeme:()=>true,parsePage:()=>({records:[]})}).value as Value}catch(error){if(error instanceof ReaderError)need(false,'Invalid Forecast capture: '+error.code);throw error}}
 const count=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=1000?Number(value):-1
 const metadata=files['forecast-metadata.json']?decode('forecast-metadata.json'):undefined,review=m.sourceCoverage?.forecast
 if(!metadata||metadata.provider!=='forecast'||metadata.account!==review?.account||canonicalJson(metadata.historyRange??null)!==canonicalJson(review?.historyRange??null)||canonicalJson(metadata.windows??null)!==canonicalJson(review?.windows??null))report('Independently captured Forecast account, history range and window metadata are missing or do not match the review')
 if(files['forecast.csv']){
  const rows=parseCsv(files['forecast.csv'])
  if(count(metadata?.csv?.count)!==rows.length||metadata?.csv?.sha256!==sha256(files['forecast.csv']))report('Independent Forecast report row count or original digest does not reconcile')
 }
 let capture:Value|undefined
 if(files['forecast.json']){
  const doc=decode('forecast.json'),cfg=m.forecastApi??{};capture={}
  for(const kind of ['people','projects','assignments','availability']){
   const key=cfg.arrays?.[kind]??kind,object=doc[key],pages=object?.pages
   if(!Array.isArray(pages)||!pages.length||pages.length>100){report('Original Forecast '+kind+' page envelopes are required');capture[key]=Array.isArray(object)?object:[];continue}
   const rows:Value[]=[],seen=new Set<string>()
   for(const [index,page]of pages.entries()){
    need(page&&typeof page==='object'&&Array.isArray(page.data),'Supply original Forecast page data arrays')
    if(count(page.page)!==index+1||count(page.totalPages)!==pages.length||count(page.totalCount)!==count(metadata?.counts?.[kind])||page.next!==(index+1===pages.length?null:pages[index+1].cursor))report('Forecast '+kind+' pages are incomplete, reordered or have inconsistent captured totals')
    if(index&&(!page.cursor||seen.has(page.cursor)))report('Forecast '+kind+' page cursor is missing or repeated')
    if(page.cursor)seen.add(page.cursor)
    rows.push(...page.data)
   }
   if(count(metadata?.counts?.[kind])!==rows.length)report('Independent Forecast '+kind+' object count does not reconcile')
   capture[key]=rows
  }
 }
 return {capture,findings}
}
