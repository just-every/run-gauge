import { Lineage } from './report-lineage-shared'

export function retainerLineage(c:Lineage) {
 for(const balance of c.report.retainerBalances??[]){
  const period=c.rows('retainerPeriods').find(r=>r.id===balance.periodId)!
  const formulas:Record<string,string>={allowance:'Versioned allowance × active days / full period days; half up to cents or whole minutes.',rollover:'Oldest unused lots first, original successor-period expiry; total incoming carry limited by the current version cap.',deficitOpening:'Prior period deficit carried only under its approved version; never both carried and billed.',opening:'Period entitlement + incoming rollover − carried deficit.',expired:'Unused lots whose original successor-period expiry precedes this period.',forfeited:'Unexpired incoming lots above the current version carry cap; oldest lots retained first.',consumed:'Eligible approved work by start work date, service and all/billable/nonbillable policy; actual seconds or frozen approved bill value.',remaining:'Opening entitlement + rollover − carried deficit − eligible approved consumption.',overage:'MAX(0, −remaining), after FIFO consumption of oldest allowance.',overageMinor:'Allowed overage × agreed cents/hour ÷ 3600, or value cents × agreed basis points ÷ 10000; half up to cents.'}
  for(const [field,formula] of Object.entries(formulas)){
   const e=c.evidence();c.row(e,'retainerPeriods',period.id);c.row(e,'retainers',balance.retainerId)
   if(field!=='allowance'){
    for(const id of [period.id,...balance.priorPeriodIds]){
     const p=c.row(e,'retainerPeriods',id);if(!p)continue
     const term=c.row(e,'retainers',p.value.retainerId)
     for(const row of c.rows('time').filter(t=>t.value.engagementId===p.value.engagementId&&t.value.status==='approved'&&t.value.workDate>=p.value.activeStart&&t.value.workDate<=p.value.activeEnd))c.timeEvidence(e,row)
    }
    for(const id of balance.unknownSources)e.unknown.push(`time:${id}: approved bill value unknown or restricted`)
    if(balance.priorUnknown)e.unknown.push('Prior-period allowance is incomplete')
   }
   c.add(`retainer:${period.id}:${field}`,`Retainer ${field}`,balance[field],field==='overageMinor'||balance.unit==='value'?'minor':'seconds',formula,e,field==='overageMinor'||balance.unit==='value'?balance.currency:null,field==='consumed'?balance.knownConsumed:undefined)
  }
 }
}
