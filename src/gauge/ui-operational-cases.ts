import type { Actor } from './store'
import type { Value, Row } from './model'
import type { Report } from './ui-describe'
import { form,input as i,select as s,choices as c,area,escape as e,check } from './ui-forms'
import { nameOf,when,chip } from './ui-format'
export function casesSection(a:Actor,report:Report,options:Value){
 if(a.role!=='owner')return ''
 const d=report.data,people=d.people.filter(p=>!p.value.privacyErased&&!d.privacyExits.some(x=>x.value.personId===p.id)),sources:Row[]=[]
 for(const kind of ['opportunities','engagements','milestones','resourceRequests','budgetAlerts','packets'] as const)for(const r of d[kind])sources.push({id:`${kind}:${r.id}@${r.revision}`,revision:'',value:{name:`${kind}: ${r.value.name??r.value.title??r.id}`}})
 const due=new Date(Date.now()+86400000).toISOString(),fields=(r:Row)=>s('ownerId','Responsible person',people,r.value.ownerId)+area('nextAction','Next action',r.value.nextAction)+i('dueAt','Due time (ISO with UTC offset)',new Date(r.value.dueAt).toISOString())+i('reason','Decision reason')
 let html='<section id="operational-cases"><h2>Owned operational cases</h2><p class="g-note">Owner-managed cases keep responsibility, next actions and the full attempt and reply trail. A submitted request never closes a case. Current closure requires exact client-link acceptance reflected in a changed native forecast.</p>'
 html+=form('case:open','Open operational case',c('type','Case type',['scope-risk','blocked-input','staffing-gap','billing-exception','client-decision'])+i('title','Case title')+s('sourceRef','Exact current source',sources)+s('ownerId','Responsible person',people)+area('nextAction','Next action')+i('dueAt','Due time (ISO with UTC offset)',due)+i('reason','Opening reason'),undefined,'Open case')
 for(const r of d.operationalCases){const v=r.value,events=d.caseEvents.filter(x=>x.value.caseId===r.id)
  html+=`<section class="g-card" id="case-${e(r.id)}"><h3>${e(v.title)} ${chip(v.status)}</h3><p>${e(nameOf(d.people,v.ownerId))} · due ${e(when(v.dueAt,a.timezone))}</p><p>${e(v.nextAction)}</p><p class="g-note">Reply: ${e(v.replyState)}${v.snoozeUntil?` · snoozed until ${e(when(v.snoozeUntil,a.timezone))}`:''}</p><details><summary>Case history (${events.length})</summary><ol>${events.map(x=>`<li>${e(x.value.type)} · ${e(when(x.value.at,a.timezone))}: ${e(x.value.reason)}${x.value.quotedReply?`<blockquote>${e(x.value.quotedReply)}</blockquote>`:''}${x.value.externalReference?`<span class="g-sub">Reference: ${e(x.value.externalReference)}</span>`:''}${x.value.meaning?`<span class="g-sub">${e(x.value.meaning)}</span>`:''}</li>`).join('')}</ol></details>`
  if(v.status==='closed')html+=`<p class="g-note">Verified acceptance ${e(v.completion.acceptanceId)}; updated forecast ${e(v.completion.economicHash)}.</p>`
  else{
   html+=`<details><summary>Update, reassign or escalate</summary>${form('case:edit','Update next action',area('nextAction','Next action',v.nextAction)+i('dueAt','Due time (ISO with UTC offset)',new Date(v.dueAt).toISOString())+i('reason','Decision reason'),r,'Update action')}${form('case:reassign','Reassign case',fields(r),r,'Reassign')}${form('case:escalate','Escalate case',fields(r),r,'Escalate')}${form('case:snooze','Snooze case',i('until','Snooze until (ISO with UTC offset)',due)+i('reason','Snooze reason'),r,'Snooze')}</details>`
   html+=`<details><summary>Record request or reply</summary>${form('case:attempt','Link approved request attempt',s('jobId','Actually attempted proposal email',d.providerJobs.filter(j=>j.value.operation==='email:send'&&j.value.attempts>0).map(j=>({...j,value:{name:`${j.value.status} · ${j.value.providerMessageId??j.id}`}})))+i('reason','Request attempt reason'),r,'Record attempt')}${form('case:reply','Record external reply',c('replyState','Reply state',['ambiguous','answered','unverified'])+area('quotedReply','Quoted reply')+i('externalReference','External reply reference')+i('reason','Reply interpretation reason'),r,'Record reply')}</details>`
   html+=form('case:preview-close','Review verified closure','<p class="g-note">An ambiguous reply or successful provider invocation is insufficient.</p>',r,'Review closure forecast')
   const proof=options.caseClosePreview
   if(proof?.id===r.id){html+=`<p class="g-note">${proof.changed?'Native forecast changed from the opening baseline.':'Native forecast has not changed: closure is held.'}</p>`;if(proof.changed)html+=form('case:close','Confirm verified closure',`<input type="hidden" name="fingerprint" value="${e(proof.fingerprint)}">`+s('acceptanceId','Exact client acceptance',d.commercialEvents.filter(x=>x.value.type==='accepted').map(x=>({...x,value:{name:`${x.value.name} · ${x.value.proposalId}`}})))+check('confirm','Close only with verified acceptance and this exact forecast.',false,'close-verified-case')+i('reason','Closure reason'),r,'Close verified case')}
  }
  html+=`<p><a href="/api/gauge/history/operationalCases/${e(r.id)}">Review record revisions</a></p></section>`
 }
 return html+'</section>'
}
