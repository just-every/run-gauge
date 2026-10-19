import type { Bindings } from '../auth.server'
import { type Value, type Row, need, text, integer, date, flag } from './model'
import { type Actor, Transaction, finance, access, get, all } from './store'

export const taskStates = ['todo','in-progress','blocked','done']
const shift = (day: string, days: number) => new Date(Date.parse(day)+days*86400000).toISOString().slice(0,10)
function checklist(input: unknown, old: Value[] = []) {
 const items = typeof input === 'string' ? input.split('\n').map(s=>s.trim()).filter(Boolean).map((label,index)=>({id:old[index]?.id ?? crypto.randomUUID(),label,done:old[index]?.done ?? false})) : input
 need(Array.isArray(items) && items.length<=30,'Use at most 30 checklist items')
 const result = items.map(item=>({id:text(item.id ?? crypto.randomUUID(),'Checklist ID',100),label:text(item.label,'Checklist item',300),done:flag(item.done)}))
 need(new Set(result.map(i=>i.id)).size===result.length,'Checklist IDs must be unique')
 return result
}
// Completion and its next occurrence commit together under the same exact-revision receipt.
async function save(env: Bindings, tx: Transaction, value: Value, old: Row | undefined, tasks: Row[]) {
 const result = await tx.record('tasks',value,old,undefined,old?'update':'create')
 if(value.status!=='done' || old?.value.status==='done' || !value.repeatEveryDays || value.nextOccurrenceId)return result
 const nextFrom=shift(value.from,value.repeatEveryDays)
 if(nextFrom>value.repeatUntil)return result
 const tree: Row[]=[result]
 for(let i=0;i<tree.length;i++) {
  const children=tasks.filter(t=>t.value.parentId===tree[i].id)
  tree.push(...children); need(tree.length<=50,'Recurring work supports at most 50 tasks in one tree')
 }
 const ids=new Map(tree.map(t=>[t.id,crypto.randomUUID()]))
 for(const row of tree) {
  if(row.id!==result.id)tx.observe('tasks',row)
  const v:Value={...row.value,status:'todo',remainingSeconds:row.value.estimateSeconds ?? row.value.remainingSeconds,
   checklist:(row.value.checklist??[]).map((item:Value)=>({...item,done:false})),
   from:row.value.from?shift(row.value.from,value.repeatEveryDays):null,to:row.value.to?shift(row.value.to,value.repeatEveryDays):null,
   parentId:ids.get(row.value.parentId) ?? row.value.parentId ?? null,previousOccurrenceId:row.id}
  delete v.nextOccurrenceId
  await tx.record('tasks',v,undefined,ids.get(row.id))
 }
 result.value.nextOccurrenceId=ids.get(result.id)
 // The row is still being created in this batch; update without a second stale observation.
 tx.sql('UPDATE g_tasks SET data=? WHERE id=? AND revision=?',JSON.stringify(result.value),result.id,result.revision)
 return result
}
export async function taskCommand(env: Bindings,a: Actor,tx: Transaction,action: string,input: Value): Promise<Row|null> {
 if(!['save:tasks','task:progress'].includes(action))return null
 const old=input.id?await get(env,'tasks',text(input.id,'Task')):undefined
 if(old)need(old.revision===input.revision,'Task changed; reload',409)
 const progress=action==='task:progress'; need(!progress || old,'Task required')
 const engagementId=progress?old!.value.engagementId:text(input.engagementId,'Engagement')
 const engagement=await access(env,a,engagementId,!progress);tx.observe('engagements',engagement)
 if(old)need(old.value.engagementId===engagement.id,'Cannot move tasks between engagements')
 if(progress)need(finance(a)||(a.role==='lead'&&engagement.value.leadId===a.personId)||old!.value.assigneeId===a.personId,'Only the assignee or project manager may update progress',403)
 const tasks=await all(env,'tasks');for(const row of tasks)tx.observe('tasks',row)
 tx.guard('(SELECT COUNT(*) FROM g_tasks)=?',tasks.length)
 const v:Value=progress?{...old!.value}:{name:text(input.name,'Task'),engagementId:engagement.id,
  remainingSeconds:integer(input.remainingSeconds,'Remaining effort seconds'),estimateSeconds:integer(input.estimateSeconds??old?.value.estimateSeconds??input.remainingSeconds,'Estimated effort seconds'),
  assigneeId:input.assigneeId ?? old?.value.assigneeId ?? null,parentId:input.parentId ?? old?.value.parentId ?? null,
  priority:input.priority ?? old?.value.priority ?? 'normal',
  from:input.from?date(input.from):null,to:input.to?date(input.to):null,
  billable:input.billable===undefined?old?.value.billable??engagement.value.type!=='internal':flag(input.billable),
  checklist:checklist(input.checklist??old?.value.checklist??[],old?.value.checklist),
  repeatEveryDays:integer(input.repeatEveryDays??old?.value.repeatEveryDays??0,'Repeat interval days',0,366),
  repeatUntil:input.repeatUntil?date(input.repeatUntil):null,
  ...(old?.value.previousOccurrenceId?{previousOccurrenceId:old.value.previousOccurrenceId}:{}),
  ...(old?.value.nextOccurrenceId?{nextOccurrenceId:old.value.nextOccurrenceId}:{})}
 v.status=input.status??old?.value.status??'todo';need(taskStates.includes(v.status),'Choose a task status')
 if(progress) {
  v.remainingSeconds=integer(input.remainingSeconds??v.remainingSeconds,'Remaining effort seconds')
  const completed=input.completedItems??[];need(Array.isArray(completed),'Choose completed checklist items')
  need(completed.every(id=>v.checklist?.some((item:Value)=>item.id===id)),'Unknown checklist item')
  v.checklist=(v.checklist??[]).map((item:Value)=>({...item,done:completed.includes(item.id)}))
 }
 if(old&&!progress&&(v.from!==old.value.from||v.to!==old.value.to)) {
  const plans=await all(env,'deliveryPlans'),latest=plans.filter(p=>p.value.engagementId===engagement.id).at(-1)
  if(latest){tx.observe('deliveryPlans',latest);tx.guard('(SELECT COUNT(*) FROM g_deliveryPlans)=?',plans.length)}
  need(!latest?.value.schedule.nodes.some((n:Value)=>n.kind==='task'&&n.sourceId===old.id),'This task belongs to the approved delivery baseline; preview schedule changes first',409)
 }
 need(['low','normal','high','urgent'].includes(v.priority),'Choose task priority')
 need(!v.from||!v.to||v.to>=v.from,'Task end is before start')
 need(engagement.value.type!=='internal'||!v.billable,'Internal tasks cannot be billable')
 if(v.assigneeId){const person=await get(env,'people',v.assigneeId);tx.observe('people',person);need(person.id===engagement.value.leadId||engagement.value.members?.includes(person.id),'Assign a person on this engagement')}
 if(v.parentId){let parent=tasks.find(t=>t.id===v.parentId),depth=0;need(parent?.value.engagementId===engagement.id,'Parent task must belong to this engagement');while(parent){need(parent.id!==old?.id&&++depth<=10,'Task hierarchy cannot cycle or exceed 10 levels');parent=tasks.find(t=>t.id===parent!.value.parentId)}}
 if(v.repeatEveryDays) {need(!v.parentId,'Set recurrence on a root task');need(v.from&&v.to&&v.repeatUntil&&v.repeatUntil>=v.from,'Recurring tasks need start, end and last start dates')}
 if(old?.value.nextOccurrenceId)need(v.status==='done','A recurring occurrence with a successor stays completed')
 if(v.status==='done')v.remainingSeconds=0
 return save(env,tx,v,old,tasks)
}
