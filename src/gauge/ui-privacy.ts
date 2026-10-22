import type { Actor } from './store'
import type { Value } from './model'
import type { Report } from './ui-describe'
import { form,input as i,select as s,escape as e,check,table } from './ui-forms'
export function privacySection(a:Actor,report:Report,options:Value){
 if(a.role!=='owner')return ''
 const d=report.data,policy=d.retentionPolicies[0],v=policy?.value??{},people=d.people.filter(p=>!p.value.privacyErased)
 let html='<section id="retention"><h2>Retention and erasure</h2><p class="g-note">Manual owner review only. Financial work and immutable audit stay on legal hold. This bounded scope removes a worker profile, private leave notes, favorites and authorized receipt files; source originals, connected copies and other free text remain.</p>'
 html+=form('privacy:policy','Retention policy',i('personalDays','Personal data: days after exit',v.personalDays??365,'number')+i('fileDays','Files: days after expense date',v.fileDays??2555,'number')+i('evidenceDays','Evidence: days after leave ends',v.evidenceDays??365,'number')+i('reason','Policy reason'),policy,'Save retention policy')
 html+=form('privacy:exit','Record worker exit',s('personId','Worker',people)+i('date','Exit date','','date')+i('reason','Exit reason'),undefined,'Record exit')
 html+=form('privacy:preview','Preview native erasure',s('personId','Worker to review',people),undefined,'Preview consequences')
 const p=options.privacyPreview
 if(p){html+=`<section class="g-card" id="erasure-preview"><h2>Erasure consequences</h2><p>Remove profile, ${e(p.remove.receiptFiles)} receipt files (${e(p.remove.receiptBytes)} bytes), ${e(p.remove.favorites)} favorites and ${e(p.remove.leaveNotes)} private leave notes.</p><p>Invalidate ${e(p.remove.transferJobs)} current archive export/restore jobs and their cached snapshots. Older archives require the trusted later journal and will be refused.</p><p class="g-note">${e(p.retain.meaning)}</p><p>Retain ${e(p.retain.time)} time records, ${e(p.retain.expenses)} expense records and ${e(p.retain.rates)} rate records with their lawful financial totals.</p>${p.blockers.length?`<ul>${p.blockers.map((x:string)=>`<li>${e(x)}</li>`).join('')}</ul>`:''}</section>`
 if(!p.blockers.length)html+=form('privacy:erase','Confirm bounded native erasure',`<input type="hidden" name="personId" value="${e(p.personId)}"><input type="hidden" name="fingerprint" value="${e(p.fingerprint)}">`+check('confirm','Erase only the reviewed native scope; I understand the retained legal holds.',false,'erase-reviewed-native-scope')+check('lawfulReceiptRemoval','I am authorized to remove these receipts while retaining financial records.',false,'authorized')+i('reason','Erasure authorization reason'),undefined,'Erase reviewed scope')}
 html+=table('Native erasure completion records',d.privacyErasures,[{label:'Status',line:1,cell:r=>e(r.value.status)},{label:'Scope',wrap:true,line:3,cell:r=>e(r.value.meaning)},{label:'Receipt files removed',num:true,line:2,cell:r=>e(r.value.removed.receiptFiles)}])
 return html+'<p><a href="/api/gauge/privacy/journal">Download trusted later erasure journal</a>. Keep the journal with backups. An older archive is refused when its later journal is supplied; it is never silently restored with erased content.</p></section>'
}
