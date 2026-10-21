import { fixedChargesSection } from './ui-fixed-charges'
import { invoicesSection } from './ui-invoices'
import { harvestControls } from './ui-harvest-history'
import type { Bindings } from '../auth.server'
import { type Actor, finance } from './store'
import type { Row, Value } from './model'
import { escape as e, input as i, amount, area, select as s, choices as c, check, form, decision, table, open } from './ui-forms'
import { hours, money, day, chip, nameOf } from './ui-format'
import { type Report, describeSource } from './ui-describe'
import { specialistHandoffSection } from './ui-specialist-handoff'
import { forecastSchedule } from './ui-forecast-import'
import { capacitySection } from './ui-capacity'
import { rateCardsSection } from './ui-rate-cards'
import { apiKeysSection } from './ui-api-keys'
import { approvalPolicySection, packetDecision } from './ui-approvals'

const humanState = (state: string) => state.replace(/_/g, ' ')
export async function operations(env:Bindings,a:Actor,section:string,options:Value,report:Report) {
 const d=report.data,today=options.today,eng=s('engagementId','Engagement',d.engagements);let body=''
 if(section==='expenses'){
  const old=d.expenses.find(r=>r.id===options.edit),v=old?.value??{}
  body='<div class="g-titlebar"><h1>Expenses and receipts</h1></div><p class="g-lede">Keep actual project cost separate from reimbursement. Receipt files remain private and travel with the owned dataset.</p>'
  if(!old||['draft','returned'].includes(v.status))body+=form('expense:save',old?'Correct expense':'Expense',s('engagementId','Engagement',d.engagements,v.engagementId)+s('taskId','Delivery task (optional)',d.tasks,v.taskId,true)+s('personId','Person',finance(a)?d.people:d.people.filter(p=>p.id===a.personId),v.personId??a.personId)+i('date','Expense date',v.date??today,'date')+i('description','Description',v.description)+amount('amountDollars',`Amount (${v.currency??a.currency})`,v.amountMinor??'')+check('reimbursable','Reimbursable',v.reimbursable),old,'Save','g-card--form')
  body+=table('Expenses',d.expenses,[
   {label:'Date',size:'date',line:2,cell:r=>open('expenses',r,day(r.value.date))},
   {label:'Description',wrap: true,line:3,cell:r=>e(r.value.description)+(r.value.taskId?`<span class="g-sub">${e(nameOf(d.tasks,r.value.taskId))}</span>`:'')},
   {label:'Person',size:'name',line:1,cell:r=>e(nameOf(d.people,r.value.personId))},
   {label:'Engagement',line:1,cell:r=>e(nameOf(d.engagements,r.value.engagementId))},
   {label:'Amount',num:true,size:'num',line:2,cell:r=>`${money(r.value.amountMinor,r.value.currency)}${r.value.reimbursable?' <span class="g-tag">reimbursable</span>':''}`},
   {label:'Status',wrap: true,size:'status',line:2,cell:r=>`${chip(r.value.status)}${r.value.reviewNote?`<span class="g-sub">${e(r.value.reviewNote)}</span>`:''}`},
  ],r=>{
   const self=finance(a)||r.value.personId===a.personId,lead=finance(a)||(a.role==='lead'&&d.engagements.some(x=>x.id===r.value.engagementId&&x.value.leadId===a.personId));let out=''
   if(self&&['draft','returned'].includes(r.value.status))out+=`<details class="g-reveal"><summary class="g-btn g-btn--secondary">Add receipt</summary>${form('expense:file','Add receipt',i('file','Receipt file','','file'),r,'Upload receipt','g-bare')}</details>`+decision('expense:submit','Submit expense',r)
   if(lead&&r.value.status==='submitted')out+=decision('expense:approve','Approve expense',r)+decision('expense:return','Return expense',r,true)
   if(self)out+=(r.value.attachmentIds??[]).map((id:string)=>`<a class="g-link" href="/api/gauge/files/${e(id)}">Download receipt</a>`).join(' ')
   return out+`<a class="g-link" href="/api/gauge/history/expenses/${e(r.id)}">Review revision history</a>`
  })
 }
 if(section==='rates')body=await rateCardsSection(env,a,report,options,today)
 if(section==='capacity')body=await capacitySection(env,a,report,options)
 if(section==='billing'){
  // Eligible lines sit under their engagement, so a packet's lines visibly come from the engagement it names.
  const eligible=report.exceptions.filter(x=>x.type==='unbilled approved work'),groups=new Map<string,any[]>()
  for(const x of eligible){const [k,id]=x.source.split(':'),engagementId=(d as any)[k].find((r:Row)=>r.id===id)?.value.engagementId??'';groups.set(engagementId,[...(groups.get(engagementId)??[]),x])}
  body='<div class="g-titlebar"><h1>Billing preparation packets</h1></div><p class="g-lede">Select approved unbilled sources from one engagement. Draft packets reserve sources. Approval fixes the exact downloadable artifact; cancelled drafts release their reservations.</p>'+form('packet:create','Prepare packet',eng+i('title','Packet title')+`<fieldset class="g-checklist"><legend>Eligible source lines</legend>${[...groups].map(([id,lines])=>`<div class="g-check-group" id="unbilled-${e(id)}"><p class="g-check-head">${e(nameOf(d.engagements,id,'Engagement'))}</p>${lines.map(x=>check('sources',describeSource(d,x.source).text,false,x.source)).join('')}</div>`).join('')||'<p class="g-empty">No eligible work yet.</p>'}</fieldset>`,undefined,'Save','g-card--form')
  const titleOf=(id:string)=>d.packets.find(p=>p.id===id)?.value.title??'Earlier packet'
  body+=table('Packets',d.packets,[
   {label:'Packet',wrap: true,line:1,cell:r=>`${e(r.value.title)}${r.value.correctsPacketId?`<span class="g-sub">Adjusts ${e(titleOf(r.value.correctsPacketId))}${r.value.reason?`: ${e(r.value.reason)}`:''}</span>`:''}`},
   {label:'Engagement',line:1,cell:r=>e(nameOf(d.engagements,r.value.engagementId))},
   {label:'Total',num:true,size:'num',line:2,cell:r=>money(r.value.totalMinor,r.value.currency)},
   {label:'Lines',num:true,size:'num',line:2,cell:r=>{const n=(r.value.lines??[]).length;return `${n}<span class="g-brief">&nbsp;${n===1?'line':'lines'}</span>`}},
   {label:'Status',wrap: true,size:'status',line:2,cell:r=>chip(r.value.status)},
  ],r=>{
   if(r.value.status==='draft')return packetDecision(a,d.approvalPolicies,r)
   if(r.value.status!=='approved')return ''
   const review=report.correctionReviews.find(x=>x.packetId===r.id)
   const adjust=review?`<details class="g-reveal"><summary class="g-btn g-btn--quiet">Prepare adjustment</summary>${review.sources.map(line=>form('packet:adjust',`Correct ${line.kind==='time'?'time':line.kind==='expenses'?'expense':'milestone'}: ${line.description}`,`<p class="g-note">Currently ${money(line.currentAmountMinor,r.value.currency)}</p><input type="hidden" name="sourceId" value="${e(line.sourceId)}"><input type="hidden" name="sourceKind" value="${e(line.kind)}">`+amount('correctedAmountDollars',`Correct total amount for this source (${r.value.currency})`,line.currentAmountMinor)+i('reason','Correction reason'),r,'Prepare adjustment','g-bare g-bare--titled')).join('')}</details>`:'<p class="g-note">Continue corrections from the latest reviewed packet in this branch.</p>'
   return `<a class="g-btn g-btn--secondary" href="/api/gauge/packets/${e(r.id)}">Download approved CSV</a>${adjust}`
  })
 }
 if(section==='billing')body+=fixedChargesSection(report,today)
 if(section==='billing')body+=invoicesSection(report,today)
 if(section==='billing')body+=specialistHandoffSection(a,report)
 if(section==='billing')body+='<section class="g-card"><h2>Business audit</h2><p class="g-note">Search every saved change, decision, grant, key event, packet export and import effect; verify the audit chain and export it.</p><div class="g-actions"><a class="g-btn g-btn--secondary" href="/app/audit">Open the business audit</a></div></section>'
 if(section==='imports'){
  body='<div class="g-titlebar"><h1>Harvest move-in</h1></div><p class="g-lede">Preview a Harvest export without changing anything; nothing is applied until you choose to. <a href="/move-in.html">Read the move-in guide</a>.</p>'
  const preview=options.preview
  if(preview){
   const rows=(o:Record<string,unknown>)=>Object.entries(o??{}).map(([k,v])=>`<tr><th scope="row">${e(k)}</th><td class="g-num">${e(typeof v==='number'?v.toLocaleString('en-US'):Array.isArray(v)?v.length:v&&typeof v==='object'?Object.keys(v).length:v)}</td></tr>`).join('')
   const month=(key:string)=>{const [client,m]=key.split('/');return `Client ${client} · ${m?new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'}):''}`}
   const totals=Object.entries(preview.totals??{}).map(([k,t]:[string,any])=>`<tr><th scope="row">${e(month(k))}</th><td class="g-num">${(t.count??0).toLocaleString('en-US')}</td><td class="g-num">${hours(t.seconds)}</td><td class="g-num">${money(t.amountMinor,t.currency??preview.package.manifest.currency)}</td></tr>`).join('')
   const schedule=forecastSchedule(preview.schedule??[])
   const omissions=(preview.omissions??[]).map((o:any)=>`<li>${e(typeof o==='string'?o:o.reason??o.kind??JSON.stringify(o))}</li>`).join('')
   body+=`<section class="g-card"><h2>Reconciled preview</h2><div class="g-pair"><div class="g-table"><table><caption>Records</caption><tbody>${rows(preview.counts)}</tbody></table></div><div class="g-table"><table><caption>Client and month totals</caption><thead><tr><th scope="col">Client · month</th><th scope="col" class="g-num">Entries</th><th scope="col" class="g-num">Hours</th><th scope="col" class="g-num">Billable value</th></tr></thead><tbody>${totals}</tbody></table></div></div>${Object.keys(preview.memberships??{}).length?`<h3>Reviewed project members</h3><ul class="g-lines">${Object.entries(preview.memberships).map(([project,people]:[string,any])=>`<li>Project ${e(project)} · ${(people??[]).length} ${(people??[]).length===1?'person':'people'}</li>`).join('')}</ul>`:''}${harvestControls(preview)}${schedule}${omissions?`<h3>Omissions</h3><ul class="g-lines">${omissions}</ul>`:''}</section>`+form('import:create','Apply reviewed preview',`<p class="g-note">Work arrives as drafts, and imported people get no access.</p><input type="hidden" name="package" value="${e(JSON.stringify(preview.package))}"><input type="hidden" name="fingerprint" value="${e(preview.fingerprint)}">`,undefined,'Apply first bounded batch')
  }
  body+=form('import:preview','Preview source package',i('files','Harvest export files: clients, people and projects CSV; time CSV or XLSX (forecast optional)','','file').replace('type="file"','type="file" multiple')+area('manifest','Manifest, as described in the move-in guide'),undefined,'Preview','g-card--form')
  const jobs=(await env.DB.prepare('SELECT id,state,checkpoint,total,error FROM ik_jobs WHERE principal_id=? ORDER BY rowid DESC').bind(a.session.operator.id).all<any>()).results
  if(jobs.length)body+=`<section class="g-block"><h2>Imports</h2>${jobs.map(j=>{const r={id:j.id,revision:'',value:j};return `<article class="g-card g-job"><header class="g-card-head"><h3>Harvest import</h3>${chip(humanState(j.state))}</header><p class="g-num">${Number(j.checkpoint).toLocaleString('en-US')} of ${Number(j.total).toLocaleString('en-US')} records</p>${j.error?`<p class="g-note">${e(j.error)}</p>`:''}<div class="g-row-actions">${decision('import:resume','Resume bounded work',r,false,'secondary')}${decision('import:rollback','Roll back partial import',r,false,'secondary')}${decision('import:undo','Undo untouched imported records',r,false,'secondary')}<a class="g-link" href="/api/gauge/imports/${e(j.id)}">Download retained originals and manifest</a></div></article>`}).join('')}</section>`
  body+=forecastSchedule(d.archives.filter(r=>r.value.forecast).map(r=>r.value.forecast))
  body+=table('Historical documents',d.archives,[{label:'Document',cell:r=>e(r.value.name??'Historical document')},{label:'Kept as',cell:r=>e(r.value.semantics??'')}],r=>`<a class="g-link" href="/api/gauge/archives/${e(r.id)}">${r.value.mediaType==='application/json'?'Download retained Forecast source':'Download historical PDF'}</a>`)
 }
 if(section==='access'){
  const operators=(await env.DB.prepare('SELECT id,email,display_name,role,status FROM oa_operators ORDER BY display_name').all<any>()).results
  const active=operators.filter(o=>o.status==='active')
  body='<div class="g-titlebar"><h1>People and access</h1></div><p class="g-lede">Invite an operator, let them accept, then connect the operator to a person and a Gauge role. A project lead approves only assigned engagements. An agent grant prepares proposals only and names no person. Revoke access by saving the grant with Enabled cleared.</p>'
  body+=`<div class="g-pair g-pair--wide">${form('invite','Invite operator',i('email','Email','','email')+i('displayName','Display name'))}${form('grant','Assign or revoke Gauge access',s('operatorId','Active operator',active.map(o=>({id:o.id,revision:'',value:{name:active.filter(x=>x.display_name===o.display_name).length>1?`${o.display_name} (${o.email})`:o.display_name}})))+s('personId','Person (none for an agent)',d.people,undefined,true)+c('role','Gauge role',['staff','lead','finance','agent'])+check('enabled','Enabled',true))}</div>`
  const grants=(await env.DB.prepare('SELECT g.operator_id,g.person_id,g.role,g.enabled,o.display_name,o.email FROM g_grants g JOIN oa_operators o ON o.id=g.operator_id ORDER BY o.display_name').all<any>()).results
  const rows:Row[]=grants.map(g=>({id:g.operator_id,revision:'',value:g}))
  body+=table('Current grants',rows,[
   {label:'Active operator',wrap: true, cell:r=>`${e(r.value.display_name)}<span class="g-sub">${e(r.value.email)}</span>`},
   {label:'Person',cell:r=>e(r.value.person_id?nameOf(d.people,r.value.person_id):'—')},
   {label:'Gauge role',cell:r=>e(r.value.role.charAt(0).toUpperCase()+r.value.role.slice(1))},
   {label:'Enabled',cell:r=>r.value.enabled?'Yes':'No'},
  ],undefined,'No grants yet. The owner holds finance authority without one.')
  body+=await approvalPolicySection(env,a,d.people,d.approvalPolicies)
  body+=await apiKeysSection(env,options.createdKey)
 }
 return body
}
