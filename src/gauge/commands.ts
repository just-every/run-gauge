import { changeReviewCommand } from './scope-review'
import { intakeCommand } from './intake'
import { clientPortalCommand } from './client-portal'
import { stripeCommand } from './stripe'
import { milestoneReviewCommand } from './milestone-review'
import { scopeChangePreview, scopeChangeCommand } from './scope-changes'
import { floatDeletionPreview, floatDeletionCommand } from './float-deletions'
import { floatAdoptionPreview, floatAdoptionCommand } from './float-native'
import { resourceActions } from './resource-manager'
import { revenueCommand } from './revenue-schedules'
import { invoiceMailCommand, dispatchInvoice } from './invoice-delivery'
import { readInvoiceDelivery } from './invoice-delivery-readback'
import { invoiceAccessCommand } from './invoice-access'
import { invoiceSettingsCommand } from './invoice-presentation'
import { nativeAdoptionPreview,nativeAdoptionCommand } from './kantata-native'
import { kantataCommand,kantataReport } from './kantata'
import { caseCommand,caseClosePreview } from './operational-cases'
import { privacyCommand,privacyPreview } from './privacy'
import { verifyProviderFollowup,applyProviderFollowup } from './provider-followups'
import { syncCommand, advanceProviderSync } from './provider-health'
import { readCommercialDelivery, readCommercialSignature } from './commercial-readback'
import { jobCommand, dispatchProviderJob } from './provider-jobs'
import { providerRequest } from './provider-request'
import { githubCommand } from './github'
import { commercialCommand } from './commercial-proposals'
import { sendCommercial,dispatchCommercial } from './commercial-delivery'
import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { type Value, need, text } from './model'
import { type Actor, Transaction, fence, get } from './store'
import { scheduleCommand as retainerScheduleCommand } from './retainer-schedule'
import { phaseCommand, observeBudgetAlerts, recordBudgetAlerts } from './budget-phases'
import { capCommand } from './budget-caps'
import { periodCommand,periodPreview } from './period-close'
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
import { invoiceCorrectionCommand } from './invoice-corrections'
import { receiptCommand } from './receipts'
import { fixedChargeCommand } from './fixed-charges'
import { estimateCommand,estimateCompare } from './estimates'
import { customCommand,customPreview } from './custom-fields'
import { clientCommand } from './clients'
import { leaveCommand } from './leave-approvals'
import { agencyProfileCommand } from './agency-profile'
import { fxCommand, consolidate } from './fx-rates'
export async function command(env:Bindings,a:Actor,action:string,input:Value) {
 await fence(env,a)
 need(!a.clientChange||action==='change:respond','Client change review permits only its exact response',403)
 need(!a.clientPortal||action==='intake:submit'||(!!a.clientChange&&action==='change:respond'),'Project recipients may only submit requested intake',403)
 need(!a.clientMilestone||action==='milestone:respond','Client review authorizes only an exact delivery response',403)
 need(a.role!=='resource-manager'||resourceActions.includes(action),'Resource managers plan permitted staffing only',403)
 need(a.role!=='accountant','Accountants have read-only access',403)
 // An agent grant prepares and withdraws proposals; every other effect needs a person.
 need(a.role!=='agent'||['proposal:prepare','proposal:withdraw'].includes(action),'Agents prepare proposals; a person approves them',403)
 // GOVERN-005: earlier commands' audit rows join the chain before this one writes.
 await seal(env,action.startsWith('import:'))
 if(action.startsWith('stripe:'))return stripeCommand(env,a,action,input)
 if(action.startsWith('provider:'))return providerRequest(env,a,action,input)
 if(action==='providerJob:dispatch'){need(a.role==='owner','Only the owner dispatches provider jobs',403);const job=await get(env,'providerJobs',text(input.id,'Provider job'));return job.value.operation==='email:send'?(job.value.source.kind==='invoiceAccess'?dispatchInvoice(env,a,input):dispatchCommercial(env,a,input)):dispatchProviderJob(env,a,input)}
 if(action==='providerSync:advance')return advanceProviderSync(env,a,input)
 if(action.startsWith('github:'))return githubCommand(env,a,action,input)
 if(action==='invoice:delivery-readback')return readInvoiceDelivery(env,a,input)
 if(action==='commercial:delivery-readback')return readCommercialDelivery(env,a,input)
 if(action==='commercial:signature-readback')return readCommercialSignature(env,a,input)
 if(action==='commercial:send')return sendCommercial(env,a,input)
 if(action==='estimate:compare')return estimateCompare(env,a,input)
 if(action==='fx:consolidate')return consolidate(env,a,input)
 if(action==='floatAdopt:deletion-preview')return floatDeletionPreview(env,a,input)
 if(action==='floatAdopt:preview')return floatAdoptionPreview(env,a,input)
 if(action==='kantataAdopt:preview')return nativeAdoptionPreview(env,a,input)
 if(action==='kantata:report')return kantataReport(env,a,input)
 if(action.startsWith('kantata:')){const result=await kantataCommand(env,a,action,input);await seal(env,true);return result}
 if(action==='case:preview-close')return caseClosePreview(env,a,input)
 if(action==='privacy:preview'){const {snapshot,...preview}=await privacyPreview(env,a,input);return preview}
 if(action==='field:import-preview')return customPreview(env,a,input)
 if(action==='period:preview')return periodPreview(env,a,input)
 if(action==='change:preview')return scopeChangePreview(env,a,input)
 if(action==='projectScenario:preview')return projectScenarioPreview(env,a,input)
 if(action==='retainer:preview')return retainerPreview(env,a,input)
 if(action==='delivery:preview')return deliveryPreview(env,a,input)
 if(action==='staffing:preview')return schedulePreview(env,a,input)
 if(action.startsWith('import:')){const result=await importCommand(env,a,action,input);await seal(env,true);return result}
 const followupProof=action==='providerJob:apply-followup'?await verifyProviderFollowup(env,a,input):null
 const digestInput=followupProof?{...input,signature:'verified-workflow-proof'}:input
 const key=text(input.key,'Unique request key',200),digest=sha256(canonicalJson({...digestInput,file:input.file instanceof File?{name:input.file.name,size:input.file.size,hash:sha256(new Uint8Array(await input.file.arrayBuffer()))}:null,action})),previous=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>()
 if(previous){need(previous.actor===a.session.operator.id && previous.digest===digest,'Request key already used for different work',409);await fence(env,a);return JSON.parse(previous.result)}
 const tx=followupProof?.tx??new Transaction(env,a)
 tx.key=key;tx.action=action
 if(['save:clients','save:people','save:engagements','save:tasks'].includes(action))tx.customWrite={scope:action.slice(5),id:input.id,values:input.customFields}
 if(action==='opportunity:convert')tx.customWrite={scope:'engagements',values:input.customFields}
 const alertInputs=await observeBudgetAlerts(env,tx,action)
 let result:Value|null=action.startsWith('privacy:')?await privacyCommand(env,a,tx,action,input):followupProof?await applyProviderFollowup(env,a,tx,input,followupProof):await retainerCommand(env,a,tx,action,input)
 if(!result)result=await floatDeletionCommand(env,a,tx,action,input)
 if(!result)result=await floatAdoptionCommand(env,a,tx,action,input)
 if(!result)result=await nativeAdoptionCommand(env,a,tx,action,input)
 if(!result)result=await caseCommand(env,a,tx,action,input)
 if(!result)result=await retainerScheduleCommand(env,a,tx,action,input)
 if(!result)result=await intakeCommand(env,a,tx,action,input)
 if(!result)result=await clientPortalCommand(env,a,tx,action,input)
 if(!result)result=await milestoneReviewCommand(env,a,tx,action,input)
 if(!result)result=await milestoneDeliveryCommand(env,a,tx,action,input)
 if(!result)result=await deliveryCommand(env,a,tx,action,input)
 if(!result)result=await templateCommand(env,a,tx,action,input)
 if(!result)result=await scheduleCommand(env,a,tx,action,input)
 if(!result)result=await resourceCommand(env,a,tx,action,input)
 if(!result)result=await opportunityCommand(env,a,tx,action,input)
 if(!result)result=await conversionCommand(env,a,tx,action,input)
 if(!result)result=await revenueCommand(env,a,tx,action,input)
 if(!result)result=await specialistHandoffCommand(env,a,tx,action,input)
 if(!result)result=await delegationCommand(env,a,tx,action,input)
 if(!result)result=await timePolicyCommand(env,a,tx,action,input)
 if(!result)result=await timesheetCommand(env,a,tx,action,input)
 if(!result)result=await favoriteCommand(env,a,tx,action,input)
 if(!result)result=await taskCommand(env,a,tx,action,input)
 if(!result)result=await rateCommand(env,a,tx,action,input)
 if(!result)result=await targetCommand(env,a,tx,action,input)
 if(!result)result=await approvalCommand(env,a,tx,action,input)
 if(!result)result=await leaveCommand(env,a,tx,action,input)
 if(!result)result=await agencyProfileCommand(env,a,tx,action,input)
 if(!result)result=await fxCommand(env,a,tx,action,input)
 if(!result)result=await changeReviewCommand(env,a,tx,action,input)
 if(!result)result=await scopeChangeCommand(env,a,tx,action,input)
 if(!result)result=await projectScenarioCommand(env,a,tx,action,input)
 if(!result)result=await demandScenarioCommand(env,a,tx,action,input)
 if(!result)result=await invoiceMailCommand(env,a,tx,action,input)
 if(!result)result=await invoiceAccessCommand(env,a,tx,action,input)
 if(!result)result=await invoiceSettingsCommand(env,a,tx,action,input)
 if(!result)result=await invoiceCommand(env,a,tx,action,input)
 if(!result)result=await invoiceCorrectionCommand(env,a,tx,action,input)
 if(!result)result=await receiptCommand(env,a,tx,action,input)
 if(!result)result=await fixedChargeCommand(env,a,tx,action,input)
 if(!result)result=await clientCommand(env,a,tx,action,input)
 if(!result)result=await periodCommand(env,a,tx,action,input)
 if(!result)result=await phaseCommand(env,a,tx,action,input)
 if(!result)result=await capCommand(env,a,tx,action,input)
 if(!result)result=await syncCommand(env,a,tx,action,input)
 if(!result)result=await jobCommand(env,a,tx,action,input)
 if(!result)result=await commercialCommand(env,a,tx,action,input)
 if(!result)result=await estimateCommand(env,a,tx,action,input)
 if(!result)result=await customCommand(env,a,tx,action,input)
 if(!result)result=await catalog(env,a,tx,action,input)
 if(!result&&['budget:approve','milestone:approve'].includes(action))result=await approveTerms(env,a,tx,action==='budget:approve'?'budgets':'milestones',input)
 if(!result)result=await timeCommand(env,a,tx,action,input)
 if(!result)result=await expenseCommand(env,a,tx,action,input)
 if(!result)result=await billingCommand(env,a,tx,action,input)
 if(!result)result=await proposalCommand(env,a,tx,action,input)
 need(result,'Unknown action')
 await recordBudgetAlerts(tx,alertInputs,action,result)
 const acknowledgement={id:result.id??null,revision:result.revision??null,saved:true};
 tx.sql('INSERT INTO g_receipts(key,actor,digest,result) VALUES(?,?,?,?)',key,a.session.operator.id,digest,JSON.stringify(acknowledgement))
 try {await tx.commit()}catch(error){const retry=await env.DB.prepare('SELECT actor,digest,result FROM g_receipts WHERE key=?').bind(key).first<{actor:string;digest:string;result:string}>();if(retry?.actor===a.session.operator.id&&retry.digest===digest){await fence(env,a);return JSON.parse(retry.result)}throw error}
 // Mutations acknowledge identifiers only: private rate snapshots never leak through staff receipts.
 return {...acknowledgement,...(result.shownOnceToken?{token:result.shownOnceToken}:{})}
}
export function publicResult(value:any):any {if(value?.value){const v={...value.value};delete v.economics;return {...value,value:v}}return value}
