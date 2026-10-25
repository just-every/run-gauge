import { parseApiJson } from '../modules/import-kit/src/readers/numeric-lexemes'
import { parseCsv } from './harvest'
import { need, text, type Value } from './model'
import { customScopes, customTypes } from './custom-values'

const providers=['harvest','forecast','kantata-ox','kantata-sx','scoro','teamwork','productive','rocketlane','float']
/** A separate explicit owner review maps original field exports to existing native records. */
export function sourceCustomFields(pkg:Value,mapping:Value={}) {
 need(providers.includes(pkg.provider),'Choose a supported source custom-field provider')
 const account=text(pkg.account,'Source field account',150),namespace=pkg.provider+':'+account
 need(pkg.namespace===namespace,'Custom-field namespace must bind its exact provider and source account')
 need(pkg.administrator===true&&pkg.permission===true&&pkg.complete===true&&pkg.filters==='all-records','Complete original custom-field exports and source administrator permission are required')
 const files=pkg.files;need(files&&typeof files==='object'&&Object.keys(files).length===2&&typeof files['definitions.csv']==='string'&&typeof files['values.csv']==='string','Supply original definitions.csv and values.csv')
 need(Object.values(files).every(v=>typeof v==='string'&&new TextEncoder().encode(v).length<=2*1024*1024),'Each original custom-field artifact is limited to 2 MiB')
 const definitions=parseCsv(files['definitions.csv']),values=parseCsv(files['values.csv'])
 need(definitions.length<=100&&values.length<=1000,'Custom-field originals exceed bounded definition or value counts')
 const findings:Value[]=[],fields:Value[]=[],records:Value[]=[],ids=new Set<string>(),valueIds=new Set<string>(),seen=new Set<string>()
 const columns=pkg.mapping?.columns,read=(row:Value,kind:string,key:string,optional=false)=>{const column=columns?.[kind]?.[key];need(optional&&!column||typeof column==='string'&&Object.hasOwn(row,column),'Review the source '+kind+' column '+key);return column?row[column]:undefined}
 const scope=(raw:string)=>pkg.mapping?.scopes?.[raw]
 for(const row of definitions){
  const id=text(read(row,'definitions','id'),'Source field ID',100);need(!ids.has(id),'Duplicate source field ID '+id);ids.add(id)
  const sourceScope=read(row,'definitions','scope'),nativeScope=scope(sourceScope),sourceType=read(row,'definitions','type'),type=pkg.mapping?.types?.[sourceType]
  if(!customScopes.includes(nativeScope)||!customTypes.includes(type)){findings.push({sourceId:id,reason:'Unmapped source field scope or type',scope:sourceScope});continue}
  const field:Value={id,scope:nativeScope,type,name:read(row,'definitions','name'),visibility:'finance-only',required:false}
  if(['single-select','multi-select'].includes(type)){try{field.options=JSON.parse(read(row,'definitions','options'))}catch{findings.push({sourceId:id,reason:'Invalid exported option definitions',scope:nativeScope});continue}}
  if(type==='currency')field.currency=read(row,'definitions','currency')
  fields.push(field)
 }
 const grouped=new Map<string,Value>()
 for(const row of values){
  const sourceId=text(read(row,'values','id'),'Source value ID',200);need(!valueIds.has(sourceId),'Duplicate source value ID '+sourceId);valueIds.add(sourceId)
  const fieldId=text(read(row,'values','fieldId'),'Source field relationship',100),f=fields.find(f=>f.id===fieldId),sourceScope=read(row,'values','scope'),nativeScope=scope(sourceScope),recordId=text(read(row,'values','recordId'),'Source record ID',200),raw=read(row,'values','value')
  const key=nativeScope+':'+recordId,marker=key+':'+fieldId;need(!seen.has(marker),'Duplicate source field value for one record');seen.add(marker)
  if(!f||f.scope!==nativeScope){findings.push({sourceId,field:fieldId,recordId,scope:sourceScope,reason:'Undefined field or unmapped source scope'});continue}
  let value:any=raw
  try{
   if(f.type==='multi-select')value=JSON.parse(raw)
   if(f.type==='currency'){const money=parseApiJson(raw,{artifact:'values.csv'},[],{namespace,url:'https://source.invalid/',preserveNumberLexeme:()=>true,parsePage:()=>({records:[]})}).value as Value;need(money&&money.currency===f.currency,'Source custom currency must match its explicit definition');need(typeof money.amountMinor==='string'&&/^-?\d+$/.test(money.amountMinor)&&Number.isSafeInteger(Number(money.amountMinor))&&Math.abs(Number(money.amountMinor))<=1e12,'Source custom money requires exact integer minor units');value=Number(money.amountMinor)}
   if(f.type==='person'){value=mapping.people?.[raw];need(value,'Source person value needs an explicit reviewed native mapping')}
  }catch(error){findings.push({sourceId,field:fieldId,recordId,scope:nativeScope,reason:error instanceof Error?error.message:'Invalid typed source value'});continue}
  const record=grouped.get(key)??{scope:nativeScope,id:recordId,values:Object.create(null),sourceValueIds:Object.create(null)}
  record.values[fieldId]=value;record.sourceValueIds[fieldId]=sourceId;grouped.set(key,record)
 }
 records.push(...grouped.values())
 if(pkg.controls?.definitions!==definitions.length||pkg.controls?.values!==values.length)findings.push({scope:'source',reason:'Independent source definition and value counts do not reconcile'})
 return {format:pkg.format,namespace,fields,records,controls:pkg.controls,findings}
}
