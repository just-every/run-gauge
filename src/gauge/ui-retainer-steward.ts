import type { Bindings } from '../auth.server'
import { type Actor, finance } from './store'
import type { Value } from './model'
import type { Report } from './ui-describe'
import { escape as e } from './ui-forms'
import { hours, money } from './ui-format'
import { retainerReadiness } from './retainer-steward'

export async function retainerStewardPanel(env:Bindings,a:Actor,report:Report,options:Value) {
 if(!finance(a)||!options.edit)return ''
 const periods=report.data.retainerPeriods.filter(p=>p.value.engagementId===options.edit)
 if(!periods.length)return ''
 const selected=options.retainerStewardPeriod
 const preview=selected?await retainerReadiness(env,a,{engagementId:options.edit,periodId:selected,fingerprint:options.retainerStewardFingerprint}):null
 const form=`<form method="get" action="/app/engagements"><input type="hidden" name="edit" value="${e(options.edit)}"><label class="g-field"><span>Readiness period</span><select name="retainerStewardPeriod" aria-label="Readiness period" required>${periods.map(p=>`<option value="${e(p.id)}" ${p.id===selected?'selected':''}>${e(report.data.retainers.find(t=>t.id===p.value.retainerId)?.value.terms.name)} · ${e(p.value.periodStart)}</option>`).join('')}</select></label><button class="g-btn" type="submit">Preview retainer readiness</button></form>`
 let body=''
 if(preview){
  const p=preview,f=p.figures,quantity=(n:number|null)=>p.unit==='hours'?hours(n):money(n,p.currency)
  body=`<div id="retainer-readiness-result"><h3>${e(p.term.name)} · ${e(p.period.from)} → ${e(p.period.to)}</h3><dl class="g-facts"><div><dt>Included allowance</dt><dd>${quantity(f.included)}</dd></div><div><dt>Carry-over</dt><dd>${quantity(f.carryOver)}</dd></div><div><dt>Approved allowance adjustments</dt><dd>${quantity(f.adjustments)}</dd></div><div><dt>Opening allowance after adjustments</dt><dd>${quantity(f.opening)}</dd></div><div><dt>Posted consumption</dt><dd>${quantity(f.postedConsumption)}</dd></div><div><dt>Pending work</dt><dd>${hours(f.pendingSeconds)}</dd></div><div><dt>Posted overage</dt><dd>${money(f.postedOverage,p.currency)}</dd></div><div><dt>Provisional overage</dt><dd>${money(f.provisionalOverage,p.currency)}</dd></div></dl>
   <p>Posted overage is the positive FIFO excess of approved work beyond the opening allowance. Provisional overage runs the same calculation with stopped pending work included. Agreed overage rule: ${e(p.term.rules?.overage??'held')}${p.term.rules?.overage==='bill'?` · ${p.unit==='hours'?money(p.term.rules.overageRate,p.currency)+' per hour':e(p.term.rules.overageRate/100)+'% of excess value'}`:''}.</p><h3>Required human decisions</h3><ul>${p.decisions.map(d=>`<li><a href="${e(d.href)}">${e(d.required)}</a> · ${e(d.status)} · ${e(d.id)}</li>`).join('')}${p.ambiguous.map(d=>`<li><a href="${e(d.href)}">Resolve ambiguous allocation</a> · ${e(d.id)}</li>`).join('')}<li>${e(p.limits[0])}</li></ul>
   ${p.blockers.length?`<h3>Readiness holds</h3><ul>${p.blockers.map(b=>`<li>${e(b)}</li>`).join('')}</ul>`:''}
   ${p.candidate?`<p>Ordinary preparation candidate: ${money(p.candidate.amountMinor,p.currency)}. <a href="${e(p.candidate.href)}">Review ordinary overage preparation</a>. Separate human review and any missing client decision remain required.</p>`:''}
   ${p.reservations.length?`<h3>Existing billing reservations</h3><ul>${p.reservations.map(r=>`<li><a href="${e(r.href)}">Inspect reserved packet</a> · ${e(r.kind)} · ${e(r.source_id)} · revision ${e(r.source_revision)}</li>`).join('')}</ul>`:''}
   <details><summary>Work and commercial review</summary><p><a href="${e(p.termsHref)}">Review saved terms and adjustments</a> · <a href="${e(p.pricingHref)}">Review value and pricing</a></p><ul>${p.work.map(w=>`<li><a href="${e(w.href)}">Review source work</a> · ${e(w.status)} · ${e(w.id)} · revision ${e(w.revision)}</li>`).join('')}</ul></details><p>${e(p.limits[1])} ${e(p.limits[2])}</p><details><summary>Exact source revisions</summary><p>Terms ${e(p.term.revision)} · period ${e(p.period.revision)}</p><ul>${p.sources.map(s=>`<li>${e(s.kind)} · ${e(s.id)} · ${e(s.revision)}</li>`).join('')}</ul></details>
   <form method="get" action="/app/engagements"><input type="hidden" name="edit" value="${e(options.edit)}"><input type="hidden" name="retainerStewardPeriod" value="${e(selected)}"><input type="hidden" name="retainerStewardFingerprint" value="${e(p.fingerprint)}"><button class="g-btn" type="submit">Recheck exact preview</button></form></div>`
 }
 return `<section id="retainer-readiness" class="g-card"><h2>Retainer readiness</h2><p>Inspect a saved period without changing work, terms or billing. Pending work is provisional; missing decisions stay missing.</p>${form}${body}</section>`
}
