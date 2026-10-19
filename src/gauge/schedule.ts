import type { Bindings } from '../auth.server'
import { type Value, type Row, need } from './model'
import { type Actor, type Transaction, access, get } from './store'
import { schedulePreview } from './schedule-preview'

export async function scheduleCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null>{
 if(action!=='staffing:apply')return null
 const preview=await schedulePreview(env,a,input,tx)
 need(preview.fingerprint===input.fingerprint,'Schedule inputs changed; preview again before applying',409)
 const previous=await get(env,'staffing',preview.id)
 const engagement=await access(env,a,previous.value.engagementId,true)
 const members=[...new Set([...(engagement.value.members??[]),...preview.parts.map(p=>p.personId)])]
 if(members.length!==(engagement.value.members??[]).length)await tx.record('engagements',{...engagement.value,members},engagement,undefined,'staffing:assign')
 const first=await tx.record('staffing',preview.parts[0],previous,undefined,`staffing:${preview.operation}`)
 for(const part of preview.parts.slice(1))await tx.record('staffing',part,undefined,undefined,'staffing:split')
 return first
}
