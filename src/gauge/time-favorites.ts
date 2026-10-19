import type { Bindings } from '../auth.server'
import { type Row, type Value, need, text, zone, flag } from './model'
import { type Actor, Transaction, access, get } from './store'

export async function favoriteCommand(env:Bindings,a:Actor,tx:Transaction,action:string,input:Value):Promise<Row|null> {
 if(action!=='time:favorite')return null
 const personId=text(input.personId??a.personId,'Person')
 need(a.personId===personId||a.role==='owner','Favorites are private to their person; only the owner may act as them on Time',403)
 const person=await get(env,'people',personId);tx.observe('people',person)
 const old=input.id?await get(env,'timeFavorites',text(input.id,'Favorite')):undefined
 if(old){need(old.revision===input.revision,'Favorite changed; reload',409);need(old.value.personId===personId,'Cannot move a favorite between people',403)}
 const task=await get(env,'tasks',text(input.taskId,'Task')),engagement=await access(env,a,task.value.engagementId)
 tx.observe('tasks',task);tx.observe('engagements',engagement)
 need(personId===engagement.value.leadId||engagement.value.members?.includes(personId),'Favorite task must be assigned to this person’s engagement')
 const billable=flag(input.billable);need(task.value.billable!==false||!billable,'This task is nonbillable');need(engagement.value.type!=='internal'||!billable,'Internal work is nonbillable')
 return tx.record('timeFavorites',{personId,engagementId:engagement.id,taskId:task.id,service:text(input.service,'Service'),timezone:zone(input.timezone),billable,enabled:input.enabled===undefined?true:flag(input.enabled),name:text(input.name??task.value.name,'Favorite name',200)},old,undefined,action)
}
