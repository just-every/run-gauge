import { type Actor, finance } from './store'
import { type Value } from './model'
import type { Report } from './ui-describe'
import { escape as e, form, table } from './ui-forms'
import { money, hours } from './ui-format'

const amount = (minor: number | null, currency: string) => minor === null ? 'Unknown' : money(minor,currency)
const hidden = (name: string, value: unknown) => `<input type="hidden" name="${e(name)}" value="${e(value)}">`
export function outcomePanel(a: Actor, report: Report, options: Value) {
 if (a.session.kind !== 'native' || !finance(a)) return ''
 const result = options.outcomeResult, capture = options.outcomeCapture
 const scenarios = report.data.projectScenarios.filter(p => p.value.status === 'adopted' && !p.value.changeOrder)
 const choose = scenarios.map(row => form('recovery:outcome-capture',row.value.name,`<p>Human adoption recorded. Capture current native inputs against this exact retained comparison.</p>`,row,'Capture observed inputs','g-bare')).join('')
 const compare = capture ? form('recovery:outcome-compare','Compare observed outcome',hidden('basisDigest',capture.basisDigest),capture,'Compare current records','g-bare') : ''
 if (!result) return `<section class="g-card" id="recovery-outcomes"><h2>Observed recovery outcomes</h2><p>Read-only comparison of an adopted native scenario. Provider outcomes remain unobserved; this grants no approval or case completion.</p>${choose || '<p>No adopted native scenarios yet.</p>'}${compare}</section>`
 const rows = result.projects.map((p: Value) => ({ id:p.engagementId,revision:'',value:p }))
 const name = (id: string) => report.data.engagements.find(p=>p.id===id)?.value.name ?? id
 const project = (snapshot: Value, id: string) => snapshot.projects.find((p: Value)=>p.engagementId===id)
 const date = (snapshot: Value, id: string) => snapshot.dates.find((p: Value)=>p.engagementId===id)?.finish ?? 'Unknown'
 const comparisons = table('Before, expected and observed',rows,[
  {label:'Project',line:1,cell:r=>e(name(r.id))},
  ...(['before','expected','observed'] as const).map(key=>({label:key.charAt(0).toUpperCase()+key.slice(1),line:2 as const,cell:(r: typeof rows[number])=>`${e(date(result[key],r.id))}<br>Margin ${amount(project(result[key],r.id).marginMinor,r.value.currency)}`})),
  {label:'Observed variance',line:3,cell:r=>`Margin ${amount(r.value.marginVarianceMinor,r.value.currency)} · cost ${amount(r.value.costVarianceMinor,r.value.currency)} · fees ${amount(r.value.feesVarianceMinor,r.value.currency)}`}
 ])
 const dated = result.projectIds.map((id: string)=>`<details><summary>Delivery dates for ${e(name(id))}</summary>${['before','expected','observed'].map(key=>`<h3>${e(key)}</h3><ul>${result[key].dates.find((p: Value)=>p.engagementId===id).tasks.map((t: Value)=>`<li>Task ${e(t.id)}: ${e(t.from ?? 'Unknown')} through ${e(t.to ?? 'Unknown')}</li>`).join('')}${result[key].dates.find((p: Value)=>p.engagementId===id).milestones.map((m: Value)=>`<li>Milestone ${e(m.id)}: ${e(m.due)}</li>`).join('')}</ul>`).join('')}</details>`).join('')
 const cash = result.months.map((m: Value)=>`<li>${e(m.currency)} · ${e(m.month)}: before ${amount(m.beforeMinor,m.currency)}, expected ${amount(m.expectedMinor,m.currency)}, observed ${amount(m.observedMinor,m.currency)}; variance ${amount(m.varianceMinor,m.currency)}; historical timing variance ${amount(m.historicalVarianceMinor,m.currency)}</li>`).join('')
 const loads = result.loads.map((d: Value)=>`<li>${e(report.data.people.find(p=>p.id===d.personId)?.value.name ?? 'Person')} · ${e(d.date)}: before ${hours(d.beforeSeconds)}, expected ${hours(d.expectedSeconds)}, observed ${hours(d.observedSeconds)}; load variance ${hours(d.varianceSeconds)}; dated available before ${d.beforeAvailableSeconds===null?'Unknown':hours(d.beforeAvailableSeconds)}, expected ${d.expectedAvailableSeconds===null?'Unknown':hours(d.expectedAvailableSeconds)}, observed ${d.observedAvailableSeconds===null?'Unknown':hours(d.observedAvailableSeconds)}</li>`).join('')
 const sources = Object.entries(result.sources).map(([key,list])=>`<details><summary>${e(key)} source revisions</summary><ul>${(list as Value[]).map(s=>`<li>${e(s.kind)} · ${e(s.id)} · ${e(s.revision)}</li>`).join('')}</ul></details>`).join('')
 return `<section class="g-card" id="recovery-outcomes"><h2>Observed recovery outcomes</h2>${choose}${compare}<div id="outcome-results"><p>Fixed forecast as of ${e(result.asOf)} · dated load ${e(result.from)} through ${e(result.to)}. Human adoption ${e(result.adoptedBy)}; ${result.selectedIds.length} selected alternatives.</p>${comparisons}${dated}<h3>Monthly expected cash</h3><ul>${cash}</ul><details open><summary>Dated global team load</summary><ul>${loads || '<li>No committed load in this window.</li>'}</ul></details><h3>Changed inputs since adoption</h3><ul>${result.changedInputs.map((s: Value)=>`<li>${e(s.kind)} · ${e(s.id)} · ${e(s.change)}: ${e(s.expectedRevision ?? 'Absent')} → ${e(s.observedRevision ?? 'Absent')}</li>`).join('') || '<li>No later input changes.</li>'}</ul><h3>Unknowns and boundaries</h3><ul>${[...result.unknowns,...result.boundaries].map((s: string)=>`<li>${e(s)}</li>`).join('')}</ul>${sources}</div></section>`
}
