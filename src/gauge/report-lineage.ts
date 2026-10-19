import { capacityLineage } from './report-lineage-capacity'
import { economicLineage } from './report-lineage-economics'
import { exceptionLineage } from './report-lineage-exceptions'
import { correctionLineage, pipelineLineage } from './report-lineage-pipeline'
import { Lineage, type ReportLineageInput } from './report-lineage-shared'
import { utilizationLineage } from './report-lineage-utilization'

export type { LineageFigure, LineageSource, ReportLineageInput } from './report-lineage-shared'

/** Pure lineage over the exact authorized report snapshot; no clocks or DB reads. */
export function buildLineage(report: ReportLineageInput) {
 const c = new Lineage(report)
 economicLineage(c)
 capacityLineage(c)
 utilizationLineage(c)
 for(const balance of report.retainerBalances??[]){
  const period=c.rows('retainerPeriods').find(r=>r.id===balance.periodId)!
  for(const field of ['allowance','consumed','remaining']){
   const e=c.evidence();c.row(e,'retainerPeriods',period.id);c.row(e,'retainers',balance.retainerId)
   if(field!=='allowance')for(const id of balance.sources){const row=c.rows('time').find(r=>r.id===id)!;c.timeEvidence(e,row)}
   if(field!=='allowance')for(const id of balance.unknownSources)e.unknown.push(`time:${id}: approved bill value unknown or restricted`)
   c.add(`retainer:${period.id}:${field}`,`Retainer ${field}`,balance[field],balance.unit==='hours'?'seconds':'minor',field==='allowance'?'Versioned allowance × active days / full period days; half up to cents or whole minutes.':field==='consumed'?'Eligible approved work by start work date, service and all/billable/nonbillable policy; actual seconds or frozen approved bill value.':'Immutable period entitlement minus eligible approved consumption.',e,balance.unit==='value'?balance.currency:null,field==='consumed'?balance.knownConsumed:undefined)
  }
 }
 for(const row of report.resourceDemand??[]){
  for(const field of ['unfilledSeconds','staffingSeconds','totalSeconds']){
   const e=c.evidence();c.row(e,'engagements',row.engagementId)
   if(field!=='staffingSeconds')for(const id of row.requestSources)c.row(e,'resourceRequests',id)
   if(field!=='unfilledSeconds')for(const id of row.staffingSources)c.row(e,'staffing',id)
   c.add(`resourceDemand:${row.engagementId}:${field}`,field,row[field],'seconds',`${field}: daily requested/allocation seconds × covered report dates. Only open requests count as unfilled; filled requests count through their one named staffing allocation.`,e)
  }
 }
 pipelineLineage(c)
 exceptionLineage(c)
 correctionLineage(c)
 return c.figures
}
