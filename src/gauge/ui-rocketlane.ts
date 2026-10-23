import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import type { Value } from './model'
import { moveInSection } from './ui-scoro'
import { form,input,check,escape as e } from './ui-forms'
export async function rocketlaneSection(env:Bindings,a:Actor,options:Value){
 let html=await moveInSection(env,a,options,'rocketlane');if(a.role!=='owner')return html
 html+='<section id="rocketlane-cutover"><h3>Review an exact source comparison</h3><p class="g-note">Operational cutover is held. The owner can accept source reconciliation only; this performs no native ownership transfer, provider action or deletion.</p>'
 html+=form('import:rocketlane:cutover-preview','Review completed finance comparison',input('jobId','Completed Rocketlane source import job'),undefined,'Preview source comparison')
 const p=options.rocketlaneCutover;if(p)html+=form('import:rocketlane:cutover-approve','Accept source comparison only',`<input type="hidden" name="jobId" value="${e(p.jobId)}"><input type="hidden" name="fingerprint" value="${e(p.fingerprint)}"><p>${e(p.records)} reconciled source records. ${e(p.meaning)}</p>`+input('reason','Source comparison review reason')+check('confirm','Accept this source comparison only; operational cutover stays held.',false,'accept-source-comparison-only'),undefined,'Record owner comparison review')
 const receipts=(await env.DB.prepare('SELECT id,data FROM g_rocketlaneCutovers ORDER BY rowid DESC').all<any>()).results
 for(const row of receipts){const v=JSON.parse(row.data);html+=`<article class="g-card"><h4>Source comparison ${e(v.status)}</h4><p>${e(v.namespace)} · ${e(v.reason)}</p><p>${e(v.meaning)}</p>`;if(v.status==='accepted')html+=form('import:rocketlane:cutover-withdraw','Withdraw comparison acceptance',`<input type="hidden" name="id" value="${e(row.id)}">`+input('reason','Comparison withdrawal reason'),undefined,'Withdraw source comparison');html+='</article>'}
 return html+'</section>'
}
