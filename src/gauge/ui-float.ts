import type { Bindings } from '../auth.server'
import { type Actor, all } from './store'
import type { Value } from './model'
import { moveInSection } from './ui-scoro'
import { form, area, input, check, escape as e } from './ui-forms'
export async function floatSection(env: Bindings, a: Actor, options: Value) {
 let html=await moveInSection(env,a,options,'float')
 if(a.role!=='owner')return html
 html+='<section id="float-native"><h2>Float native adoption</h2><p>Review exact source calendars, tentative daily allocations and daily leave. Actual time and financial history stay source evidence. Cutover is unavailable.</p>'
 html+=form('floatAdopt:preview','Review native effects',input('namespace','Float source account')+area('config','Reviewed project leads and members JSON','{"projectLeads":{},"projectMembers":{}}'),undefined,'Preview Float native adoption')
 const p=options.floatAdoptionPreview
 if(p) {
  html+=`<section id="float-native-preview" class="g-card"><h3>Native adoption consequences</h3><p>${e(p.meaning)}</p><ul>${Object.entries(p.counts).map(([kind,n])=>`<li>${e(kind)}: ${e(n)}</li>`).join('')}${p.findings.map((s:string)=>`<li>${e(s)}</li>`).join('')}</ul><details><summary>Exact native effects</summary><ul style="overflow-wrap:anywhere">${p.effects.map((item:Value)=>`<li>${e(item.kind)} · ${e(item.value.source.externalId)} · ${e(item.value.name??'')} ${e(item.value.from??'')} ${e(item.value.to??'')} ${e(item.value.dailySeconds??'')} ${item.value.weekdaySeconds?e(JSON.stringify(item.value.weekdaySeconds)):''}</li>`).join('')}</ul></details></section>`
  if(p.canApply)html+=form('floatAdopt:create','Confirm exact native effects',`<input type="hidden" name="namespace" value="${e(p.namespace)}"><input type="hidden" name="config" value="${e(JSON.stringify(p.config))}"><input type="hidden" name="fingerprint" value="${e(p.fingerprint)}">`+check('confirm','Adopt these calendars, tentative allocations and owner-reviewed leave.',false,'adopt-reviewed-float')+input('reason','Float native review reason'),undefined,'Create Float adoption journal')
 }
 for(const job of await all(env,'floatAdoptions')) {
  html+=`<article class="g-card"><h3>Float native adoption · ${e(job.value.status)}</h3><p>${e(job.value.namespace)} · ${e(job.value.effects.length)} native effects</p>`
  if(job.value.status==='adopting')html+=form('floatAdopt:advance','Continue bounded native adoption',input('reason','Float batch review reason'),job,'Continue Float native batch')
  if(job.value.status==='completed')html+=form('floatAdopt:deletion-preview','Review deletion continuation',area('package','Float deletion comparison package JSON'),job,'Preview linked Float deletions')
  if(job.value.status==='continuing')html+=form('floatAdopt:deletion-advance','Continue reviewed deletions',input('reason','Deletion batch review reason'),job,'Continue Float deletion batch')
  html+='</article>'
 }
 const d=options.floatDeletionPreview
 if(d){html+=`<section id="float-deletion-preview" class="g-card"><h3>Linked native deletion consequences</h3><p>${e(d.effects.length)} untouched native effects. Originals and audit remain. No provider action or cutover is authorized.</p><ul style="overflow-wrap:anywhere">${d.effects.map((effect:Value)=>`<li>${e(effect.kind)} · ${e(effect.review.externalId)} · ${e(effect.review.from)} · ${e(effect.review.dailySeconds)} seconds · ${e(effect.id)}</li>`).join('')}</ul></section>`;html+=form('floatAdopt:deletion-start','Confirm linked native deletion',`<input type="hidden" name="id" value="${e(d.id)}"><input type="hidden" name="package" value="${e(JSON.stringify(d.package))}"><input type="hidden" name="fingerprint" value="${e(d.fingerprint)}">`+check('confirm','Delete only these linked untouched native effects; retain original evidence.',false,'delete-linked-untouched-float')+input('reason','Deletion continuation review reason'),undefined,'Create Float deletion continuation')}
 return html+'</section>'
}
