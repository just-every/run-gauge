import { Lineage } from './report-lineage-shared'

export function portfolioLineage(c:Lineage) {
 const p=c.report.portfolio;if(!p)return
 const append=(period:string,rows:any[])=>{
  for(const row of rows)for(const field of ['budgetMinor','costMinor','earnedMinor','marginMinor','eacFeesMinor','eacCostMinor','forecastMarginMinor']){
   const e=c.evidence(),forecast=field.startsWith('eac')||field==='forecastMarginMinor'
   for(const project of row.projects){
    for(const [kind,ids]of Object.entries(project.sources as Record<string,string[]>))for(const id of ids){const source=c.row(e,kind,id);if(kind==='time'&&source)c.timeEvidence(e,source)}
    if(forecast){for(const [kind,ids]of Object.entries(project.forecastSources as Record<string,string[]>))for(const id of ids)c.row(e,kind,id);e.unknown.push(...project.forecastUnknown)}
    else if(field==='budgetMinor'){if(project.budgetMinor===null)e.unknown.push(`engagements:${project.engagementId}: no approved project budget`)}
    else e.unknown.push(...project.unknown.filter((u:string)=>field==='costMinor'?u.includes('cost'):field==='earnedMinor'?!u.includes('cost'):true))
   }
   const labels:Record<string,string>={budgetMinor:'Whole-project budget',costMinor:'Approved burn',earnedMinor:'Earned operational value',marginMinor:'Operational margin',eacFeesMinor:'Whole-project EAC fees',eacCostMinor:'Whole-project EAC cost',forecastMarginMinor:'Whole-project forecast margin'}
   const known=field==='costMinor'?row.knownCostMinor:field==='earnedMinor'?row.knownEarnedMinor:field==='marginMinor'?row.knownMarginMinor:undefined
   c.add(`portfolio:${period}:${encodeURIComponent(row.key)}:${field}`,`${row.label} · ${period} · ${labels[field]}`,row[field],'minor',`Portfolio ${p.group} whole-engagement cohort, ${period==='window'?`${p.from} through ${p.to}`:period}, through as-of ${p.asOf}. Approved labor uses frozen economics; expenses use approval amounts; fixed fees use approved milestone due dates; opened retainer fees accrue cumulatively on saved working days, rounded half up to cents. Operational margin = earned value − approved cost, not accounting profit. Budget and EAC cover the whole project. Team/service cohorts overlap and must not be summed. Missing amounts remain null; currencies never mix.`,e,row.currency,known)
  }
 }
 for(const row of p.labor.rows)for(const field of ['seconds','costMinor','laborCostMinor','expenseCostMinor','hourlyBillableMinor']){const e=c.evidence();for(const source of row.sources){const r=c.row(e,source.kind,source.id);if(source.kind==='time'&&r)c.timeEvidence(e,r)}e.unknown.push(...(field==='hourlyBillableMinor'?row.billUnknown:field==='seconds'?[]:row.unknown.filter((u:string)=>field==='laborCostMinor'?u.startsWith('time:'):field==='expenseCostMinor'?u.startsWith('expenses:'):true)));const known=field==='hourlyBillableMinor'?row.knownHourlyBillableMinor:field==='laborCostMinor'?row.knownLaborCostMinor:row.knownCostMinor;c.add(`portfolioLabor:${encodeURIComponent(row.key)}:${field}`,`${row.team} · ${row.service} · ${field}`,row[field],field==='seconds'?'seconds':'minor','Each approved time/expense source counts once in the report window through as-of; team is the worker’s current team, service is recorded time service or explicitly unassigned for expenses. Hours and labor cost use frozen approvals; hourly billable value counts hourly engagements only, not fixed or retainer time. Commercial fees stay unattributed, with no team/service margin claimed.',e,field==='seconds'?null:row.currency,known)}
 for(const row of p.unattributedFees){const e=c.evidence();for(const p of row.projects){for(const [kind,ids]of Object.entries(p.sources as Record<string,string[]>))for(const id of ids){const r=c.row(e,kind,id);if(kind==='time'&&r)c.timeEvidence(e,r)}e.unknown.push(...p.unknown.filter((u:string)=>!u.includes('cost')))}c.add(`portfolioFees:${row.currency}`,'Unattributed fixed and retainer fees',row.minor,'minor','Approved fixed milestone fees due in the report window plus retainer fees earned ratably on the contractual version’s working-day basis and realised overage; reimbursable expense pass-through excluded. No team/service allocation is invented.',e,row.currency,row.knownMinor)}
 append('window',p.rows)
 for(const month of p.trends)append(month.month,month.rows)
}
