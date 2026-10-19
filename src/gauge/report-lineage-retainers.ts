import { retainerMatches } from './retainer-rules'
import { Lineage } from './report-lineage-shared'

export function retainerLineage(c:Lineage) {
 for(const balance of c.report.retainerBalances??[]){
  const period=c.rows('retainerPeriods').find(r=>r.id===balance.periodId)!
  const formulas:Record<string,string>={unallocatedSeconds:'Exact approved or stopped pending seconds matching multiple retainers without a manager allocation; not posted to any allowance and held from billing.',pending:'Stopped draft, submitted and returned work; provisional, not posted. Hours use exact seconds; unapproved value stays unknown.',pendingSeconds:'SUM(actual seconds of eligible stopped pending work); provisional, separate from approved consumption.',projectedRemaining:'The same FIFO/rule calculation with eligible stopped pending work included provisionally; prior pending periods also affect projected carry.',adjustments:'Posted allowance adjustments; no period-adjustment capability exists yet (RETAINER-004 inherits before shipping).',allowance:'Versioned allowance × active days / full period days; half up to cents or whole minutes.',rollover:'Oldest unused lots first, original successor-period expiry; total incoming carry limited by the current version cap.',deficitOpening:'Prior period deficit carried only under its approved version; never both carried and billed.',opening:'Period entitlement + incoming rollover − carried deficit.',expired:'Unused lots whose original successor-period expiry precedes this period.',forfeited:'Unexpired incoming lots above the current version carry cap; oldest lots retained first.',consumed:'Eligible approved work by start work date, service and all/billable/nonbillable policy; actual seconds or frozen approved bill value.',remaining:'Opening entitlement + rollover − carried deficit − eligible approved consumption.',overage:'MAX(0, −remaining), after FIFO consumption of oldest allowance.',overageMinor:'Allowed overage × agreed cents/hour ÷ 3600, or value cents × agreed basis points ÷ 10000; half up to cents.'}
  for(const [field,formula] of Object.entries(formulas)){
   if(!(field in balance))continue
   const e=c.evidence();c.row(e,'retainerPeriods',period.id);c.row(e,'retainers',balance.retainerId)
   if(field!=='allowance'){
    for(const id of [period.id,...balance.priorPeriodIds]){
     const p=c.row(e,'retainerPeriods',id);if(!p)continue
     const term=c.row(e,'retainers',p.value.retainerId)
     for(const row of c.rows('time').filter(t=>t.value.engagementId===p.value.engagementId&&(t.value.status==='approved'||['pending','pendingSeconds','projectedRemaining'].includes(field))&&t.value.workDate>=p.value.activeStart&&t.value.workDate<=p.value.activeEnd&&term&&retainerMatches(term.value.terms,t.value)))c.timeEvidence(e,row)
    }
    for(const id of balance.unknownSources)e.unknown.push(`time:${id}: approved bill value unknown or restricted`)
    if(balance.restrictedEconomics)e.unknown.push('Frozen bill-rate details are restricted to finance; the manager statement shows aggregate consumption')
    if(balance.restrictedSources)e.unknown.push('Supporting source work is restricted; only your own source details are available')
    if(balance.priorUnknown)e.unknown.push('Prior-period allowance is incomplete')
   }
   c.add(`retainer:${period.id}:${field}`,`Retainer ${field}`,balance[field],field==='overageMinor'||balance.unit==='value'&&!['pendingSeconds','unallocatedSeconds'].includes(field)?'minor':'seconds',formula,e,field==='overageMinor'||(balance.unit==='value'&&!['pendingSeconds','unallocatedSeconds'].includes(field))?balance.currency:null,field==='consumed'?balance.knownConsumed:(balance.restrictedSources||balance.restrictedEconomics)?balance[field]:undefined)
  }
 }
}
