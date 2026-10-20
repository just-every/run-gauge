import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {harness} from './gauge-harness.mjs'

// GOVERN-005 searchable business audit, through the built Worker's HTTP doors: a corrected time entry traced through
// approval, billing adjustment and export; import effects with their source identity; scoped search; a complete export
// whose SHA-256 chain this test recomputes independently; edits and deletions detected; no secret in the export.
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
const sha=s=>createHash('sha256').update(s).digest('hex')
const hashed=x=>({seq:x.seq,at:x.at,actor:x.actor,role:x.role,personId:x.personId,requestKey:x.requestKey,action:x.action,kind:x.kind,recordId:x.recordId,previousRevision:x.previousRevision,revision:x.revision,data:x.data,reference:x.reference})
const h=await harness({currency:'USD',timezone:'America/New_York'}),{cmd,request,owner,db}=h
try{
 const staffP=await cmd('save:people',{name:'Riley Staff',timezone:'America/New_York'}),leadP=await cmd('save:people',{name:'Morgan Lead',timezone:'America/New_York'})
 const client=await cmd('save:clients',{name:'Audit client'})
 const eng=await cmd('save:engagements',{name:'Audited delivery',clientId:client.id,leadId:leadP.id,members:[staffP.id],scope:'Audited scope',timezone:'America/New_York'})
 const staff=await h.invite('staff'),lead=await h.invite('lead'),fin=await h.invite('finance')
 for(const [u,personId,role] of [[staff,staffP.id,'staff'],[lead,leadP.id,'lead'],[fin,leadP.id,'finance']])await cmd('grant',{operatorId:u.id,personId,role,enabled:true})
 const terms=await cmd('save:budgets',{engagementId:eng.id,mode:'hourly',amountMinor:500000,effortSeconds:72000,roundingSeconds:60,reason:'Agreed terms'});await cmd('budget:approve',terms,lead.cookie)
 await cmd('save:rates',{personId:staffP.id,service:'*',effective:'2026-01-01',costMinor:9000,billMinor:15000},fin.cookie)
 const task=await cmd('save:tasks',{engagementId:eng.id,name:'Design',assigneeId:staffP.id,remainingSeconds:36000})
 await cmd('time:favorite',{personId:staffP.id,name:'Private design favorite',taskId:task.id,service:'Design',billable:true,timezone:'America/New_York',enabled:true},staff.cookie)

 // A time entry approved, reopened through an audited correction, changed and approved again.
 const args={personId:staffP.id,engagementId:eng.id,taskId:task.id,service:'Design',timezone:'America/New_York',notes:'Audit trail',billable:true,start:'2026-10-05T09:00:00-04:00',end:'2026-10-05T11:00:00-04:00'}
 let t=await cmd('time:save',args,staff.cookie)
 t=await cmd('time:submit',t,staff.cookie); t=await cmd('time:approve',t,lead.cookie)
 t=await cmd('time:correct',{...t,reason:'Client asked for the split'},lead.cookie)
 t=await cmd('time:save',{...t,...args,end:'2026-10-05T10:30:00-04:00'},staff.cookie)
 t=await cmd('time:submit',t,staff.cookie); t=await cmd('time:approve',t,lead.cookie)
 // Its billing: an approved packet, its export, and a finance credit adjustment approved in turn.
 const draft=await cmd('packet:create',{engagementId:eng.id,title:'October work',sources:[`time:${t.id}`]},fin.cookie); await cmd('packet:approve',draft,fin.cookie)
 const packet=(await h.state(owner)).data.packets.find(p=>p.id===draft.id)
 assert.equal((await request(`/api/gauge/packets/${packet.id}`,fin.cookie)).status,200)
 const credit=await cmd('packet:adjust',{id:packet.id,revision:packet.revision,sourceKind:'time',sourceId:t.id,correctedAmountMinor:15000,reason:'Courtesy credit'},fin.cookie); await cmd('packet:approve',credit,fin.cookie)
 // External references: a Harvest move-in, and an owner key whose create and keyed read are audited without the key.
 const root=new URL('./fixtures/harvest/',import.meta.url),files={};for(const name of ['clients.csv','people.csv','projects.csv','time.csv'])files[name]=await readFile(new URL(name,root),'utf8')
 const pack={manifest:{...JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),currency:'USD'},files},preview=await cmd('import:preview',{package:pack},fin.cookie)
 let job=await cmd('import:create',{package:pack,fingerprint:preview.fingerprint},fin.cookie);while(job.state==='applying')job=await cmd('import:resume',{id:job.id},fin.cookie)
 const key=await cmd('apikey:create',{label:'Audit reader'}); assert.match(key.token,/^gauge_util_/)
 assert.equal((await request('/api/gauge/state?from=2026-10-01&to=2026-10-31','',{headers:{authorization:`Bearer ${key.token}`}})).status,200)

 const search=async(params,cookie=fin.cookie)=>{const r=await request('/api/gauge/audit?'+new URLSearchParams(params),cookie);assert.equal(r.status,200,`audit ${JSON.stringify(params)}`);return r.json()}
 // GOVERN-005: the corrected entry's whole trail, oldest first, with actor, previous and resulting values and the approval.
 const trail=(await search({kind:'time',recordId:t.id})).entries.reverse(),actions=trail.map(x=>x.action)
 assert.deepEqual(actions.filter(a=>a.startsWith('time:')),['time:save','time:submit','time:approve','time:correct','time:save','time:submit','time:approve'],'every step of the corrected entry')
 const [created,,firstApproval,reopened,changed,,finalApproval]=trail.filter(x=>x.action.startsWith('time:'))
 assert.equal(created.previous,null); assert.equal(created.actor.id,staff.id); assert.equal(created.actor.role,'staff'); assert.equal(created.result.status,'draft')
 for(const x of [firstApproval,finalApproval]){assert.equal(x.actor.id,lead.id);assert.equal(x.previous.status,'submitted');assert.equal(x.result.status,'approved');assert.equal(x.approval.by,lead.id);assert.equal(x.decision,true);assert(x.changes.includes('status'))}
 assert.equal(reopened.decision,true); assert.equal(reopened.previous.status,'approved'); assert.notEqual(reopened.result.status,'approved'); assert(JSON.stringify(reopened.result).includes('Client asked for the split'),'the correction keeps its reason')
 assert.equal(changed.previous.durationSeconds,7200); assert.equal(changed.result.durationSeconds,5400); assert(changed.changes.includes('durationSeconds'))
 assert.equal(firstApproval.result.economics.billMinor,30000); assert.equal(finalApproval.result.economics.billMinor,22500); assert.equal(finalApproval.result.economics.costMinor,13500)
 for(const x of trail){assert.ok(x.requestKey,'each change keeps its request key');assert.match(x.hash,/^[0-9a-f]{64}$/);assert.equal(x.history,`/api/gauge/history/time/${t.id}`)}
 // The billing adjustment, approvals and the packet export, with the credit linked to the packet it corrects.
 const billing=(await search({kind:'packets'})).entries
 assert(billing.some(x=>x.action==='packet:approve'&&x.recordId===packet.id&&x.approval?.by===fin.id))
 assert(billing.some(x=>x.action==='packet:export'&&x.recordId===packet.id&&x.actor.id===fin.id))
 const creditApproval=billing.find(x=>x.recordId===credit.id&&x.action==='packet:approve')
 assert.equal(creditApproval.references.correctsPacketId,packet.id); assert.equal(creditApproval.result.status,'approved'); assert.equal(creditApproval.approval.by,fin.id); assert.equal(creditApproval.result.totalMinor,-7500)
 // Import effects carry the job, source identity and the importer; the imported time keeps its Harvest source id.
 const imported=(await search({action:'import:apply',kind:'time'})).entries; assert(imported.length>0,'import effects are audited')
 for(const x of imported){assert.equal(x.actor.id,fin.id);assert.equal(x.automated,true);assert.equal(x.result.job,job.id);assert.match(x.result.sourceIdentity,/^[0-9a-f]{64}$/);assert.ok(x.references.importEffect)}
 const importedTime=(await h.state(owner)).data.time.find(r=>r.id===imported[0].recordId); assert.ok(importedTime.value.source.externalId,'the imported record keeps its source id')
 const keys=(await search({kind:'apiKeys'})).entries; assert.deepEqual(keys.map(x=>x.action).sort(),['apikey:create','apikey:read']); assert.equal(keys.find(x=>x.action==='apikey:read').actor.id,'key:Audit reader')
 assert(trail.every(x=>!x.automated)&&imported.every(x=>x.automated),'people and automated work are told apart')
 // Search by text, person and agency-calendar dates; favorites stay private to their person.
 assert((await search({text:'Courtesy credit'})).entries.some(x=>x.recordId===credit.id))
 assert((await search({actor:lead.id})).entries.every(x=>x.actor.id===lead.id))
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(Date.now())
 assert((await search({from:today,to:today})).entries.length>0); assert.equal((await search({to:'2000-01-01'})).entries.length,0)
 assert.equal((await search({kind:'timeFavorites'})).entries.length,0); assert(!JSON.stringify(await search({})).includes('Private design favorite'))
 // Only finance and the owner reach the audit, on every door.
 for(const path of ['/api/gauge/audit','/api/gauge/audit/export','/api/gauge/audit/verify','/app/audit']){for(const user of [staff,lead])assert.equal((await request(path,user.cookie)).status,403,`${path} refused`);assert.equal((await request(path)).status,path.startsWith('/app')?303:401)}
 assert.equal((await search({},owner)).entries.length,(await search({})).entries.length)

 // The complete export: every entry in sequence; this test recomputes the chain itself; no secret travels.
 const exported=await request('/api/gauge/audit/export',fin.cookie); assert.equal(exported.status,200); assert.match(exported.headers.get('content-disposition'),/gauge-audit\.json/)
 const text=await exported.text(),file=JSON.parse(text)
 assert.deepEqual(file.entries.map(x=>x.seq),file.entries.map((_,i)=>i+1),'no sequence gaps')
 let previous='gauge-audit-v1'
 for(const x of file.entries){if(x.withheld){assert.equal(x.kind,'timeFavorites');assert(!('data' in x));previous=x.hash;continue}assert.equal(sha(canonical({previous,entry:hashed(x)})),x.hash,`entry ${x.seq} recomputes`);previous=x.hash}
 assert.equal(previous,file.head.hash); assert.equal(file.verification.intact,true); assert(file.entries.some(x=>x.withheld)); assert(!text.includes('Private design favorite'))
 for(const x of trail)assert.equal(file.entries.find(e=>e.seq===x.seq).hash,x.hash,'search and export agree')
 for(const secret of [key.token,sha(key.token),h.vars.SESSION_SECRET,h.vars.SETUP_TOKEN,h.vars.MAIL_API_KEY,...[staff,lead,fin].flatMap(u=>u.cookie.split('; ').map(c=>c.slice(c.indexOf('=')+1)))])assert(!text.includes(secret),'no secret in the audit export')

 // Tamper evidence: an edited row is named and fails the earlier export's checkpoint; a deleted row leaves a gap.
 const verify=async(q={})=>{const r=await request('/api/gauge/audit/verify?'+new URLSearchParams(q),fin.cookie);assert.equal(r.status,200);return r.json()}
 const checkpoint={seq:String(file.head.seq),hash:file.head.hash}
 assert.equal((await verify(checkpoint)).checkpoint.matches,true)
 const target=await db.prepare('SELECT * FROM g_audit WHERE seq=?').bind(finalApproval.seq).first()
 await db.prepare("UPDATE g_audit SET data=json_set(data,'$.durationSeconds',7200) WHERE seq=?").bind(target.seq).run()
 let check=await verify(checkpoint); assert.equal(check.intact,false); assert.deepEqual(check.mismatches,[target.seq]); assert.equal(check.checkpoint.matches,false)
 await db.prepare('UPDATE g_audit SET data=? WHERE seq=?').bind(target.data,target.seq).run(); assert.equal((await verify(checkpoint)).intact,true)
 await db.prepare('DELETE FROM g_audit WHERE seq=?').bind(target.seq).run()
 check=await verify(checkpoint); assert.equal(check.intact,false); assert.deepEqual(check.gaps,[{after:target.seq-1,before:target.seq+1}]); assert.equal(check.checkpoint.matches,false)
 const columns=Object.keys(target); await db.prepare(`INSERT INTO g_audit(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...columns.map(c=>target[c])).run()
 assert.equal((await verify(checkpoint)).intact,true)

 // The page finance opens from Billing: integrity, the search form and the entries.
 assert((await (await request('/app/billing',fin.cookie)).text()).includes('href="/app/audit"'))
 const page=await (await request(`/app/audit?${new URLSearchParams({kind:'time',recordId:t.id,checkSeq:checkpoint.seq,checkHash:checkpoint.hash})}`,fin.cookie)).text()
 for(const fragment of ['Business audit','Chain intact',`Checkpoint ${checkpoint.seq} matches`,'time:correct','Approved by lead'])assert(page.includes(fragment),fragment)
 console.log('PASS GOVERN-005 corrected time traced through approval, billing adjustment, import and export with a verified chain')
}finally{await h.dispose()}
