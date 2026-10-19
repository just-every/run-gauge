import type { Bindings } from '../auth.server'
import { type Value, need } from './model'
import { type Actor, Transaction } from './store'
import { timeCommand } from './time'

export async function timesheetCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Value|null> {
 if(action!=='time:bulk-submit')return null
 const selected=typeof input.entries==='string'?[input.entries]:input.entries
 need(Array.isArray(selected)&&selected.length>0&&selected.length<=50,'Select 1–50 exact time revisions')
 const entries=selected.map(item=>typeof item==='string'?JSON.parse(item):item)
 need(new Set(entries.map(item=>item.id)).size===entries.length,'Select each time entry once')
 const submitted=[]
 for(const item of entries){need(item&&typeof item.id==='string'&&typeof item.revision==='string','Select exact time revisions');const row=await timeCommand(env,a,tx,'time:submit',item);need(row,'Time submission failed');submitted.push(row.id)}
 return {submitted}
}
