import type { Bindings } from '../auth.server'
import type { Transaction } from './store'
import { type Kind,type Value,need } from './model'

const activeClose="SELECT 1 FROM g_periodCloses c WHERE json_extract(c.data,'$.from')<=? AND json_extract(c.data,'$.to')>=? AND NOT EXISTS(SELECT 1 FROM g_periodReopens r WHERE r.close_id=c.id)"
/** Financial facts cannot move into or out of an agency period after close.
 * Current-period linked invoices/credits may still reference older immutable sources. */
export async function assertPeriodWritable(env:Bindings,tx:Transaction,kind:Kind,value:Value,previous?:Value){
 const dated=(v:Value)=>kind==='time'?v.workDate:kind==='vendorCommitments'||kind==='vendorBills'||kind==='revenueRecognitions'||kind==='expenses'||kind==='payments'||kind==='invoiceCorrections'||kind==='clientReceipts'||kind==='retainerCharges'||kind==='fixedCharges'?v.date:kind==='invoices'?v.issueDate:kind==='retainerPeriods'?v.activeStart:kind==='invoiceDisputes'?(tx.action==='invoice:dispute-resolve'?v.resolvedDate:v.openedDate):kind==='periodMatches'?v.month+'-01':kind==='milestones'&&['save:milestones','milestone:approve'].includes(tx.action??'')?v.due:null
 for(const day of new Set([dated(value),previous?dated(previous):null].filter(Boolean))){
  need(!await env.DB.prepare(activeClose).bind(day,day).first(),'This agency period is closed; finance must authorize a reopen before changing its dated financial facts',409)
  tx.guard(`NOT EXISTS(${activeClose})`,day,day)
 }
}
export async function holdClosedTimePeriods(env:Bindings,tx:Transaction,lockThrough:string|null){
 const sql="SELECT 1 FROM g_periodCloses c WHERE json_extract(c.data,'$.to')>? AND c.id<>? AND NOT EXISTS(SELECT 1 FROM g_periodReopens r WHERE r.close_id=c.id)"
 need(!await env.DB.prepare(sql).bind(lockThrough??'',tx.reopeningCloseId??'').first(),'An active agency close holds the time cutoff; authorize its reopen first',409)
 tx.guard(`NOT EXISTS(${sql})`,lockThrough??'',tx.reopeningCloseId??'')
}
