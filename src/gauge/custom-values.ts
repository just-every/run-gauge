import type { Bindings } from '../auth.server'
import { type Row,type Value,type Kind,need,text,date,integer,decode } from './model'
import type { Actor,Transaction } from './store'
export const customScopes=['clients','engagements','people','tasks']
export const customTypes=['text','number','currency','date','single-select','multi-select','person']
export const empty=(v:any)=>v===undefined||v===null||v===''||Array.isArray(v)&&!v.length
export const canField=(a:Actor,f:Row)=>['owner','finance'].includes(a.role)||f.value.visibility==='everyone'&&['staff','lead'].includes(a.role)||f.value.visibility==='lead-finance'&&a.role==='lead'
export const definitionStamp=(rows:Row[])=>JSON.stringify(rows.map(r=>[r.id,r.revision]).sort((a,b)=>a[0].localeCompare(b[0])))
export function visibleCustom(a:Actor,scope:string,value:Value):Value {
 if(['owner','finance'].includes(a.role))return value
 const out={...value};for(const key of ['customFields','customFieldVersions','customFieldSources'])if(value[key])out[key]={}
 for(const [id,v] of Object.entries(value.customFields??{})){
  const f=a.customDefinitions?.find(f=>f.id===id&&f.value.scope===scope),version=value.customFieldVersions?.[id]
  const original=f?.revision===version?f:a.customHistory?.find(h=>h.id===id&&h.revision===version)
  if(f&&original&&canField(a,f)&&canField(a,original)){out.customFields[id]=v;if(value.customFieldVersions)out.customFieldVersions[id]=version;if(value.customFieldSources?.[id])out.customFieldSources[id]=value.customFieldSources[id]}
 }
 return out
}
export function filters(a:Actor,raw:any,scope?:string,displayUnits=false):Value {
 need(raw===undefined||raw&&typeof raw==='object'&&!Array.isArray(raw),'Custom filters must be a field/value object')
 const result:Value={};for(const [id,v]of Object.entries(raw??{})){const f=a.customDefinitions?.find(f=>f.id===id);need(f&&canField(a,f)&&(!scope||f.value.scope===scope),'Custom filter is unavailable',403);need(typeof v==='string'||typeof v==='number','Choose one filter value');let value:any=v;if(displayUnits&&f.value.type==='currency'){const digits=new Intl.NumberFormat('en-US',{style:'currency',currency:f.value.currency}).resolvedOptions().maximumFractionDigits??2,s=String(v);need(/^-?\d+(?:\.\d+)?$/.test(s),'Use a decimal currency filter');const [whole,fraction='']=s.replace('-','').split('.');need(fraction.length<=digits,'Currency filter has too many decimal places');const minor=(BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0')||'0'))*(s.startsWith('-')?-1n:1n);need(minor<=BigInt(Number.MAX_SAFE_INTEGER)&&minor>=BigInt(Number.MIN_SAFE_INTEGER),'Currency filter exceeds exact range');value=Number(minor)}if(f.value.type==='number'&&/^-?\d{1,9}(?:\.\d{1,6})?$/.test(String(value)))value=String(Number(value));result[id]=value}return result
}
export function matchesCustom(value:Value,filter:Value){return Object.entries(filter).every(([id,v])=>{const actual=value.customFields?.[id];return Array.isArray(actual)?actual.some(x=>String(x)===String(v)):actual!==undefined&&String(actual)===String(v)})}
export async function observeDefinitions(env:Bindings,tx:Transaction){if(tx.customObserved)return;tx.customObserved=true;const defs=(await env.DB.prepare('SELECT id,revision,data FROM g_customFields').all<any>()).results;need(tx.actor.customStamp===undefined||definitionStamp(defs.map(decode))===tx.actor.customStamp,'Custom field policy changed; refresh before saving',409);tx.guard('(SELECT COUNT(*) FROM g_customFields)=?',defs.length);for(const r of defs)tx.guard('EXISTS(SELECT 1 FROM g_customFields WHERE id=? AND revision=?)',r.id,r.revision)}
export async function normalizeCustom(env:Bindings,tx:Transaction,k:Kind,value:Value,previous?:Row,inherited?:Value):Promise<Value>{
 if(!customScopes.includes(k))return value
 await observeDefinitions(env,tx)
 const defs=tx.customOverlay??tx.actor.customDefinitions??[],old=inherited??previous?.value??{}
 const supplied=tx.customWrite?.scope===k&&(!tx.customWrite.id||tx.customWrite.id===previous?.id)?tx.customWrite.values:undefined
 need(supplied===undefined||supplied&&typeof supplied==='object'&&!Array.isArray(supplied),'Custom values must be a field/value object')
 const values:Value={...(old.customFields??{})},versions:Value={...(old.customFieldVersions??{})},sources:Value={...(old.customFieldSources??{})}
 for(const [id,raw]of Object.entries(supplied??{})){
  const f=defs.find(f=>f.id===id&&f.value.scope===k);need(f&&canField(tx.actor,f),'Custom field is unavailable',403)
  const d=f.value;need(!d.retired||raw===values[id],'Retired fields preserve history; no new values')
  if(empty(raw)){delete values[id];delete versions[id];delete sources[id];continue}
  let v:any=raw
  if(d.type==='text')v=text(raw,d.name,2000)
  if(d.type==='number'){need(typeof raw==='number'||typeof raw==='string','Use a decimal number');const s=String(raw);need(/^-?\d{1,9}(?:\.\d{1,6})?$/.test(s),'Use an exact decimal with at most six places');const [whole,fraction='']=s.replace('-','').split('.'),digits=whole.replace(/^0+(?=\d)/,''),decimals=fraction.replace(/0+$/,'');v=(s.startsWith('-')&&/[1-9]/.test(digits+decimals)?'-':'')+digits+(decimals?'.'+decimals:'')}
  if(d.type==='currency')v=integer(raw,`${d.name} in ${d.currency} minor units`,-1e12,1e12)
  if(d.type==='date')v=date(raw)
  if(d.type==='person'){v=text(raw,'Person');const person=await env.DB.prepare('SELECT revision FROM g_people WHERE id=?').bind(v).first<{revision:string}>();need(person,'Choose a saved person');tx.guard('EXISTS(SELECT 1 FROM g_people WHERE id=? AND revision=?)',v,person.revision)}
  if(['single-select','multi-select'].includes(d.type)){const vs=d.type==='multi-select'?raw:[raw];need(Array.isArray(vs)&&vs.length<=100,'Choose at most 100 options');for(const item of vs){const o=d.options.find((o:Value)=>o.id===item);need(o,'Undefined custom field option');need(!o.retired||(Array.isArray(values[id])?values[id].includes(item):values[id]===item)||tx.customImport,'Retired options cannot be newly assigned')}v=d.type==='multi-select'?[...new Set(vs)]:vs[0]}
  values[id]=v;versions[id]=f.revision;delete sources[id]
  if(tx.customImport)sources[id]=tx.customImport
 }
 for(const f of defs.filter(f=>f.value.scope===k&&!f.value.retired&&f.value.required&&(!previous||Object.hasOwn(supplied??{},f.id))))need(!empty(values[f.id]),canField(tx.actor,f)?`Required custom field: ${f.value.name}`:'A required custom field needs finance review')
 if(!Object.keys(values).length&&!old.customFields&&supplied===undefined)return value
 return {...value,customFields:values,customFieldVersions:versions,...(Object.keys(sources).length?{customFieldSources:sources}:{})}
}

export function mergeCustomValues(s:Value,d:Value,choices:Value={}){const result:Value={customFields:{...s.customFields},customFieldVersions:{...s.customFieldVersions},customFieldSources:{...s.customFieldSources}};for(const [id,value]of Object.entries(d.customFields??{})){const existing=result.customFields[id];if(existing!==undefined&&JSON.stringify(existing)!==JSON.stringify(value))need(['survivor','duplicate'].includes(choices[id]),'Choose each conflicting client custom value explicitly');if(existing===undefined||choices[id]==='duplicate'){result.customFields[id]=value;result.customFieldVersions[id]=d.customFieldVersions?.[id];if(d.customFieldSources?.[id])result.customFieldSources[id]=d.customFieldSources[id];else delete result.customFieldSources[id]}}return result}
