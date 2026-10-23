import { Buffer } from 'node:buffer'
import * as XLS from '@e965/xlsx'
import { Fault, need, text, type Value } from './model'
/** Bounded, value-only legacy BIFF workbook intake. No formula, macro or
 * external reference is evaluated. XLSX uses the existing bounded ZIP reader. */
export function legacyWorkbook(base64:unknown,worksheet:unknown,dateColumn='Date'){
 try{
  need(typeof base64==='string'&&base64.length<=2800000,'XLS workbook is limited to 2 MiB base64');const bytes=Buffer.from(base64,'base64')
  need(bytes.length>0&&bytes.length<=2*1024*1024&&bytes.toString('base64')===base64,'Invalid XLS base64')
  need(bytes.subarray(0,8).toString('hex')==='d0cf11e0a1b11ae1','Supply an original legacy compound BIFF XLS workbook')
  const name=text(worksheet,'Exact exported worksheet name',200),book=XLS.read(bytes,{type:'buffer',cellFormula:true,cellHTML:false,cellStyles:false,cellDates:false,bookVBA:false,sheetRows:1002,raw:true})
  need(book.SheetNames.length<=32&&book.SheetNames.filter(n=>n===name).length===1,'Select one exact worksheet from at most 32 sheets')
  const sheet=book.Sheets[name],range=XLS.utils.decode_range(sheet['!fullref']??sheet['!ref']??'A1')
  need(range.s.r===0&&range.e.r<=1000&&range.e.c<256,'XLS needs row-1 headers, at most 1000 rows and 256 columns')
  for(const [key,cell]of Object.entries(sheet))if(!key.startsWith('!')){need(!cell.f&&!cell.F,'Workbook formulas are unsupported; supply exported values');need(['s','n','b','z'].includes(cell.t),'Unsupported XLS cell type')}
  const matrix=XLS.utils.sheet_to_json<any[]>(sheet,{header:1,raw:true,defval:'',blankrows:true}),header=matrix[0].map(String)
  need(header.length>0&&header.every(Boolean)&&new Set(header).size===header.length,'XLS requires unique nonempty headers')
  const modern=Boolean(book.Workbook?.WBProps?.date1904),dateIndex=header.indexOf(dateColumn),records:{value:Value;row:number}[]=[]
  for(let at=1;at<matrix.length;at++){
   const values=matrix[at];if(!values.some(v=>v!==''))continue
   if(dateIndex>=0&&typeof values[dateIndex]==='number'){const serial=values[dateIndex];need(Number.isSafeInteger(serial)&&serial>=(modern?0:1)&&serial<=(modern?2957003:2958465)&&(modern||serial!==60),'XLS date must be a whole real Excel date');values[dateIndex]=new Date((modern?Date.UTC(1904,0,1):Date.UTC(1899,11,31))+(serial-(!modern&&serial>60?1:0))*86400000).toISOString().slice(0,10)}
   records.push({row:at+1,value:Object.fromEntries(header.map((key,index)=>[key,String(values[index]??'')]))})
  }
  return {bytes,records,worksheet:name}
 }catch(error){if(error instanceof Fault)throw error;need(false,'Invalid legacy XLS workbook; use an original value-only export')}
}
