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
   c.add(`portfolio:${period}:${encodeURIComponent(row.key)}:${field}`,`${row.label} · ${period} · ${labels[field]}`,row[field],'minor',`Portfolio ${p.group} whole-engagement cohort, ${period==='window'?`${p.from} through ${p.to}`:period}, through as-of ${p.asOf}. Approved labor uses frozen economics; expenses use approval amounts; fixed fees use approved milestone due dates; opened retainer fees accrue cumulatively on saved proration days, rounded half up to cents. Operational margin = earned value − approved cost, not accounting profit. Budget and EAC cover the whole project. Team/service cohorts overlap and must not be summed. Missing amounts remain null; currencies never mix.`,e,row.currency,known)
  }
 }
 for(const row of p.labor.rows){const e=c.evidence();for(const source of row.sources){const r=c.row(e,source.kind,source.id);if(source.kind==='time'&&r)c.timeEvidence(e,r)}e.unknown.push(...row.unknown);c.add(`portfolioLabor:${encodeURIComponent(row.key)}:costMinor`,`${row.team} · ${row.service} · additive approved cost`,row.costMinor,'minor','Each approved time/expense source counts once in the inclusive report window through as-of; team is the worker’s current team and service is recorded time service, or explicitly unassigned for expenses. Frozen approved costs; no allocation of project fixed or retainer fees, no team/service margin claimed.',e,row.currency,row.knownCostMinor)}
 append('window',p.rows)
 for(const month of p.trends)append(month.month,month.rows)
}
