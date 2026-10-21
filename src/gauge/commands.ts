import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Value, need, text } from './model'
import { type Actor, Transaction, fence, get } from './store'
import { catalog, approveTerms } from './catalog'
import { specialistHandoffCommand } from './specialist-handoff'
import { timeCommand } from './time'
import { expenseCommand } from './expenses'
import { billingCommand } from './billing'
import { importCommand } from './imports'
import { proposalCommand } from './proposals'
import { opportunityCommand } from './pipeline'
import { resourceCommand } from './resources'
import { scheduleCommand } from './schedule'
import { delegationCommand } from './time-review'
import { timePolicyCommand } from './time-policy'
import { timesheetCommand } from './timesheets'
import { favoriteCommand } from './time-favorites'
import { taskCommand } from './tasks'
import { retainerPreview, retainerCommand } from './retainers'
import { deliveryPreview, deliveryCommand } from './delivery-schedule'
import { schedulePreview } from './schedule-preview'
import { templateCommand } from './delivery-templates'
import { rateCommand } from './rate-cards'
import { conversionCommand } from './sales-conversion'
import { targetCommand } from './billability'
import { approvalCommand } from './approval-policy'
import { projectScenarioCommand, projectScenarioPreview } from './project-scenarios'
import { demandScenarioCommand } from './demand-scenarios'
import { seal } from './audit'
import { milestoneDeliveryCommand } from './milestone-delivery'
import { invoiceCommand } from './invoices'
import { clientCommand } from './clients'
export async function command(env:Bindings,a:Actor,action:string,input:Value) {
 await fence(env,a)
 // An agent grant prepares and withdraws proposals; every other effect needs a person.
 need(a.role!=='agent'||['proposal:prepare','proposal:withdraw'].includes(action),'Agents prepare proposals; a person approves them',403)
 // GOVERN-005: earlier commands' audit rows join the chain before this one writes.
 await seal(env,action.startsWith('import:'))
 if(action==='projectScenario:preview')return projectScenarioPreview(env,a,input)
 if(action==='retainer:preview')return retainerPreview(env,a,input)
 if(action==='delivery:preview')return deliveryPreview(env,a,input)
 if(action==='staffing:preview')return schedulePreview(env,a,input)
 if(action.startsWith('import:')){const result=await importCommand(env,a,action,input);await seal(env,true);return result}
 const key=text(input.key,'Unique request key',200),digest=sha256(canonicalJson({...input,file:input.file instanceof File?{name:input.file.name,size:input.file.size,hash:sha256(new Uint8Array(await input.file.arrayBuffer()))}:null,action})),previous=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>()
 if(previous){need(previous.actor===a.session.operator.id && previous.digest===digest,'Request key already used for different work',409);await fence(env,a);return JSON.parse(previous.result)}
 const tx=new Transaction(env,a)
 tx.key=key;tx.action=action
 let result:Value|null=await retainerCommand(env,a,tx,action,input)
 if(!result)result=await milestoneDeliveryCommand(env,a,tx,action,input)
 if(!result)result=await deliveryCommand(env,a,tx,action,input)
 if(!result)result=await templateCommand(env,a,tx,action,input)
 if(!result)result=await scheduleCommand(env,a,tx,action,input)
 if(!result)result=await resourceCommand(env,a,tx,action,input)
 if(!result)result=await opportunityCommand(env,a,tx,action,input)
 if(!result)result=await conversionCommand(env,a,tx,action,input)
 if(!result)result=await specialistHandoffCommand(env,a,tx,action,input)
 if(!result)result=await delegationCommand(env,a,tx,action,input)
 if(!result)result=await timePolicyCommand(env,a,tx,action,input)
 if(!result)result=await timesheetCommand(env,a,tx,action,input)
 if(!result)result=await favoriteCommand(env,a,tx,action,input)
 if(!result)result=await taskCommand(env,a,tx,action,input)
 if(!result)result=await rateCommand(env,a,tx,action,input)
 if(!result)result=await targetCommand(env,a,tx,action,input)
 if(!result)result=await approvalCommand(env,a,tx,action,input)
 if(!result)result=await projectScenarioCommand(env,a,tx,action,input)
 if(!result)result=await demandScenarioCommand(env,a,tx,action,input)
 if(!result)result=await invoiceCommand(env,a,tx,action,input)
 if(!result)result=await clientCommand(env,a,tx,action,input)
 if(!result)result=await catalog(env,a,tx,action,input)
 if(!result&&['budget:approve','milestone:approve'].includes(action))result=await approveTerms(env,a,tx,action==='budget:approve'?'budgets':'milestones',input)
 if(!result)result=await timeCommand(env,a,tx,action,input)
 if(!result)result=await expenseCommand(env,a,tx,action,input)
 if(!result)result=await billingCommand(env,a,tx,action,input)
 if(!result)result=await proposalCommand(env,a,tx,action,input)
 need(result,'Unknown action')
 const acknowledgement={id:result.id??null,revision:result.revision??null,saved:true};
 tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)',key,a.session.operator.id,digest,JSON.stringify(acknowledgement))
 try {await tx.commit()}catch(error){const retry=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>();if(retry?.actor===a.session.operator.id&&retry.digest===digest){await fence(env,a);return JSON.parse(retry.result)}throw error}
 // Mutations acknowledge identifiers only: private rate snapshots never leak through staff receipts.
 return acknowledgement
}
export function publicResult(value:any):any {if(value?.value){const v={...value.value};delete v.economics;return {...value,value:v}}return value}
