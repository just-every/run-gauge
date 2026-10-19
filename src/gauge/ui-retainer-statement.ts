import type { Report } from './ui-describe'
import { escape as e, table } from './ui-forms'
import { hours, nameOf } from './ui-format'

export function retainerEvidence(report:Report,engagementId:string) {
 const suggestions=report.data.proposals.filter(p=>p.value.kind==='time'&&p.value.engagementId===engagementId&&p.value.status==='proposed')
 return suggestions.length?`<h3>Unconfirmed evidence</h3><p>These suggestions are provisional and excluded from posted consumption and the pending-time projection until the person confirms actual work.</p><ul>${suggestions.map(p=>`<li><a href="/app/review#${e(p.id)}">Review time suggestion</a> · ${e(p.value.assumptions)}</li>`).join('')}</ul>`:''
}

export function retainerStatementSection(report:Report,engagementId:string) {
 const periods=report.data.retainerPeriods.filter(p=>p.value.engagementId===engagementId)
 if(!periods.length)return ''
 return `<section id="retainers" class="g-card"><h2>Retainer hour statements</h2><p>Approved work is posted consumption. Stopped draft, returned and submitted time is provisional and affects only the projection. Running timers are not projected. You can open your own source work; other work contributes to the statement without exposing its details.</p>${table('Saved retainer periods',periods,[
  {label:'Retainer',line:1,cell:r=>e(report.data.retainers.find(t=>t.id===r.value.retainerId)?.value.terms.name)},
  {label:'Period',size:'date',line:2,cell:r=>e(`${r.value.periodStart} → ${r.value.periodEnd}`)},
  {label:'Opening allowance',line:3,cell:r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `Included ${hours(b.allowance)} · rollover ${hours(b.rollover)} · deficit ${hours(b.deficitOpening)} · opening ${hours(b.opening)}`}},
  {label:'Posted consumption',line:3,cell:r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `Approved ${hours(b.consumed)} · remaining ${hours(b.remaining)} · adjustments ${hours(b.adjustments)}`}},
  {label:'Provisional projection',line:3,cell:r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `Pending ${hours(b.pendingSeconds)} · projected remaining ${hours(b.projectedRemaining)} · unallocated ${hours(b.unallocatedSeconds)}${b.restrictedSources?' · Supporting work restricted':''}`}},
 ],r=>{const b=report.retainerBalances.find(b=>b.periodId===r.id)!;return `<a href="/app/engagements?edit=${e(engagementId)}&calculation=${e(encodeURIComponent(`retainer:${r.id}:remaining`))}#report-evidence">Calculation and sources</a><ul>${[...b.sources,...b.pendingSources,...b.unallocatedSources].map((id:string)=>{const time=report.data.time.find(t=>t.id===id)!;return `<li><a href="/app/time?edit=${e(id)}">${e(nameOf(report.data.tasks,time.value.taskId))} · ${e(time.value.workDate)} · ${e(hours(time.value.durationSeconds))} · ${e(time.value.status)}</a></li>`}).join('')}</ul>`})}${retainerEvidence(report,engagementId)}</section>`
}
