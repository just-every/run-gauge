import type { Report } from './ui-describe'
import { escape as e, form, input as i } from './ui-forms'
import { nameOf, hours } from './ui-format'
import { retainerCandidates } from './retainer-sources'

export function retainerAllocationForms(report:Report,engagementId:string) {
 const sources=report.data.time.filter(t=>t.value.engagementId===engagementId&&t.value.durationSeconds>0)
 const forms=sources.map(time=>{
  const candidates=retainerCandidates(report.data,time.value)
  if(candidates.length<2&&!time.value.retainerRootId)return ''
  const choices=candidates.map(p=>{const t=report.data.retainers.find(t=>t.id===p.value.retainerId)!;return `<option value="${e(p.value.rootId)}" ${p.value.rootId===time.value.retainerRootId?'selected':''}>${e(t.value.terms.name)}</option>`}).join('')
  return form('retainer:allocate',`${nameOf(report.data.people,time.value.personId)} · ${time.value.workDate} · ${hours(time.value.durationSeconds)}`,`<input type="hidden" name="engagementId" value="${e(engagementId)}"><label class="g-field"><span>Retainer family</span><select name="retainerRootId" aria-label="Retainer family" required><option value="">Choose one retainer</option>${choices}</select></label>${i('reason','Allocation reason')}`,time,'Assign exact time revision')
 }).join('')
 return forms?`<details><summary>Resolve retainer source allocation</summary><p>Work matching multiple retainers remains unallocated until the engagement lead or finance chooses one eligible family. A saved choice is audited; reserved or approved overage work cannot move.</p>${forms}</details>`:''
}
