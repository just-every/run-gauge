import { vendorCosts } from './vendor-commitments'
import { learningLineage } from './report-lineage-learning'
import { customLineage } from './report-lineage-custom'
import { capacityLineage } from './report-lineage-capacity'
import { economicLineage } from './report-lineage-economics'
import { exceptionLineage } from './report-lineage-exceptions'
import { correctionLineage, pipelineLineage } from './report-lineage-pipeline'
import { Lineage, type ReportLineageInput } from './report-lineage-shared'
import { retainerLineage } from './report-lineage-retainers'
import { utilizationLineage } from './report-lineage-utilization'
import { performanceLineage } from './report-lineage-performance'
import { forecastLineage } from './report-lineage-forecast'
import { marginLineage } from './report-lineage-margin'
import { portfolioLineage } from './report-lineage-portfolio'
import { cashLineage } from './report-lineage-cash'
import { revenueLineage } from './report-lineage-revenue'
import { demandLineage } from './report-lineage-demand'

export type { LineageFigure, LineageSource, ReportLineageInput } from './report-lineage-shared'

/** Pure lineage over the exact authorized report snapshot; no clocks or DB reads. */
export function buildLineage(report: ReportLineageInput) {
 const c = new Lineage(report)
 for(const v of vendorCosts(report.data,report.forecast?.asOf)){
  for(const [field,label,value,formula] of [['actualMinor','Vendor actual',v.actualMinor,'SUM(current approved user-recorded bills, each matched once)'],['remainingMinor','Vendor remaining',v.remainingMinor,'approved commitment minus current approved matched bills'],['totalMinor','Vendor forecast',v.actualMinor+v.remainingMinor,'current approved user-recorded bills plus unbilled commitment remainder']] as const){
   const e=c.evidence();c.row(e,'vendorCommitments',v.commitment.id);for(const b of v.bills)c.row(e,'vendorBills',b.id)
   c.add(`vendor:${v.commitment.id}:${field}`,label,value,'minor',formula,e,v.commitment.value.currency)
  }
 }
 learningLineage(c)
 customLineage(c)
 economicLineage(c)
 capacityLineage(c)
 utilizationLineage(c)
 performanceLineage(c)
 retainerLineage(c)
 forecastLineage(c)
 marginLineage(c)
 cashLineage(c)
 revenueLineage(c)
 portfolioLineage(c)
 for(const row of report.resourceDemand??[]){
  for(const field of ['unfilledSeconds','staffingSeconds','totalSeconds']){
   const e=c.evidence();c.row(e,'engagements',row.engagementId)
   if(field!=='staffingSeconds')for(const id of row.requestSources)c.row(e,'resourceRequests',id)
   if(field!=='unfilledSeconds')for(const id of row.staffingSources)c.row(e,'staffing',id)
   c.add(`resourceDemand:${row.engagementId}:${field}`,field,row[field],'seconds',`${field}: daily requested/allocation seconds × covered report dates. Only open requests count as unfilled; filled requests count through their one named staffing allocation.`,e)
  }
 }
 demandLineage(c)
 pipelineLineage(c)
 exceptionLineage(c)
 correctionLineage(c)
 return c.figures
}
