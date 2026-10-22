import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir,mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { getPlatformProxy } from 'wrangler'
import { createPortability,readArchive } from '@runeditrun/rer/modules/portability'
import { portabilityPolicy } from '../scripts/installer/portability-policy.mjs'
import { harness } from './gauge-harness.mjs'

export async function privacyJourney(){
 const h=await harness({currency:'USD',timezone:'America/New_York'}),{cmd,request,owner}=h
 let browser
 try{
  const person=await cmd('save:people',{name:'synthetic-gauge-4101',timezone:'America/New_York'}),lead=await cmd('save:people',{name:'Retained project lead',timezone:'America/New_York'}),client=await cmd('save:clients',{name:'Retained lawful client'})
  const project=await cmd('save:engagements',{name:'Retained historical billed work',leadId:lead.id,clientId:client.id,members:[person.id],scope:'Historical work',timezone:'America/New_York'})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:36000,roundingSeconds:1,reason:'Lawful billing'}))
  await cmd('save:rates',{personId:person.id,service:'*',effective:'2020-01-01',costMinor:9000,billMinor:15000})
  const task=await cmd('save:tasks',{engagementId:project.id,name:'Historical work',remainingSeconds:0})
  const time=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:'Design',timezone:'America/New_York',billable:true,notes:'Retained financial description',start:'2020-10-05T09:00:00-04:00',end:'2020-10-05T11:00:00-04:00'})))
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Retained lawful bill',sources:['time:'+time.id]}))
  let expense=await cmd('expense:save',{personId:person.id,engagementId:project.id,date:'2020-10-05',description:'Retained lawful expense',amountMinor:2500,reimbursable:true})
  const file=new FormData();for(const [key,value]of Object.entries({action:'expense:file',key:randomUUID(),...expense}))file.set(key,String(value));file.set('file',new File(['synthetic-gauge-4102 private receipt'], 'receipt.txt',{type:'text/plain'}))
  let upload=await request('/api/gauge/command',owner,{method:'POST',headers:{origin:h.origin},body:file});assert.equal(upload.status,200,await upload.clone().text());expense=await upload.json();await cmd('expense:approve',await cmd('expense:submit',expense))
  const receiptId=(await h.state()).data.expenses.find(r=>r.id===expense.id).value.attachmentIds[0]
  await cmd('save:leave',{personId:person.id,from:'2020-10-06',to:'2020-10-06',dailySeconds:3600,note:'synthetic-gauge-4103 private leave',timezone:'America/New_York'})
  const staff=await h.invite('retention-staff'),finance=await h.invite('retention-finance')
  await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true});await cmd('grant',{operatorId:finance.id,personId:lead.id,role:'finance',enabled:true})
  for(const cookie of [staff.cookie,finance.cookie]){await cmd('privacy:policy',{personalDays:0,fileDays:0,evidenceDays:0,reason:'Denied'},cookie,403);await cmd('privacy:preview',{personId:person.id},cookie,403);assert.equal((await request('/api/gauge/privacy/journal',cookie)).status,403)}
  let policy=await cmd('privacy:policy',{personalDays:36500,fileDays:36500,evidenceDays:36500,reason:'Explicit owner retention'})
  await cmd('privacy:policy',{...policy,revision:'stale',personalDays:0,fileDays:0,evidenceDays:0,reason:'Stale'},owner,409)
  await cmd('privacy:exit',{personId:person.id,date:'2020-10-31',reason:'Exited worker'})
  let preview=await cmd('privacy:preview',{personId:person.id});assert.equal(preview.blockers.length,4,'Personal, files, evidence and active access all hold erasure');assert.equal(preview.remove.receiptFiles,1)
  await cmd('privacy:erase',{personId:person.id,fingerprint:preview.fingerprint,reason:'Premature',confirm:'erase-reviewed-native-scope',lawfulReceiptRemoval:'authorized'},owner,409)
  const policyInput={...policy,personalDays:0,fileDays:0,evidenceDays:0,reason:'Owner reviewed retention and lawful receipt removal'}
  policy=await cmd('privacy:policy',policyInput);await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:false})
  preview=await cmd('privacy:preview',{personId:person.id});assert.deepEqual(preview.blockers,[])
  // The preview is read-only and binds exact policy, person, leave and file sets.
  const counts=await h.db.prepare('SELECT COUNT(*) n FROM g_privacyErasures').first();assert.equal(counts.n,0)
  const changed=await cmd('privacy:policy',{...policy,personalDays:0,fileDays:0,evidenceDays:0,reason:'Fresh exact policy version'})
  await cmd('privacy:erase',{personId:person.id,fingerprint:preview.fingerprint,reason:'Old preview',confirm:'erase-reviewed-native-scope',lawfulReceiptRemoval:'authorized'},owner,409)
  const service=await createPortability({db:h.db,policy:portabilityPolicy})
  const exportText=async()=>{const id=await service.exports.create();while((await service.exports.advance(id,{maxParts:16})).phase==='building'){}return new Response(await service.exports.download(id)).text()}
  const oldArchive=await exportText(),before=await h.state(),oldPacket=await(await request('/api/gauge/packets/'+packet.id,owner)).text()
  assert(oldArchive.includes(Buffer.from('synthetic-gauge-4102 private receipt').toString('base64')))
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  const shots=process.env.GAUGE_PRIVACY_SHOTS;if(shots)await mkdir(shots,{recursive:true})
  const capture=async name=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Retention screen fits '+width);if(shots)await page.locator('#retention').screenshot({path:join(shots,`${name}-${width}.png`)})}}
  await page.goto(h.origin+'/app/access');await capture('policy')
  const form=page.locator('form').filter({has:page.locator('[name=action][value="privacy:preview"]')});await form.getByLabel('Worker to review').selectOption(person.id);await form.getByRole('button',{name:'Preview consequences'}).click();await capture('preview')
  assert.match(await page.locator('#erasure-preview').innerText(),/Retain 1 time records, 1 expense records/)
  // The browser performs the same explicit bounded destructive confirmation.
  const erase=page.locator('form').filter({has:page.locator('[name=action][value="privacy:erase"]')});await erase.locator('[name=confirm]').check();await erase.locator('[name=lawfulReceiptRemoval]').check();await erase.getByLabel('Erasure authorization reason').fill('Owner authorizes only the displayed native scope');await erase.getByRole('button',{name:'Erase reviewed scope'}).click();await capture('completion')
  const after=await h.state();assert.equal(after.data.privacyErasures.length,1);assert.equal(after.data.privacyErasures[0].value.status,'native-scope-complete');assert.match(after.data.privacyErasures[0].value.meaning,/Not a certificate/)
  assert.equal(after.data.people.find(p=>p.id===person.id).value.name,'Erased worker');assert(after.data.people.find(p=>p.id===person.id).value.privacyErased)
  assert.equal((await request('/api/gauge/files/'+receiptId,owner)).status,404)
  assert(!JSON.stringify(after.data.leave).includes('synthetic-gauge-4103'))
  assert.deepEqual(after.data.time,before.data.time,'Frozen approved time and economics are retained byte for byte')
  assert.deepEqual(after.data.expenses,before.data.expenses,'Financial expense record is retained byte for byte; missing attachment is disclosed')
  assert.equal(await(await request('/api/gauge/packets/'+packet.id,owner)).text(),oldPacket,'Immutable billed money and artifact are retained')
  await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true},owner,410)
  const audit=await(await request('/api/gauge/audit/verify',owner)).json();assert.equal(audit.intact,true,'Erasure never rewrites the lawful immutable audit')
  const journal=await(await request('/api/gauge/privacy/journal',owner)).json();assert(journal.epoch>0);assert(journal.journal.length>0)
  const newArchive=await exportText();assert(!newArchive.includes(Buffer.from('synthetic-gauge-4102 private receipt').toString('base64')),'Post-erasure archive has no erased receipt bytes')
  const dir=await mkdtemp(join(tmpdir(),'gauge-privacy-restore-'));let proxy
  try{
   execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--persist-to',dir,'--config','dist/server/wrangler.json'],{stdio:'pipe',env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}})
   proxy=await getPlatformProxy({configPath:resolve('wrangler.jsonc'),persist:{path:join(dir,'v3')},remoteBindings:false});const restore=await createPortability({db:proxy.env.DB,policy:portabilityPolicy})
   const read=async text=>{const rows=[];for await(const row of readArchive(new Response(text).body))rows.push(row);return rows}
   const old=await read(oldArchive),id=await restore.imports.create(old[0]);for(const p of old.filter(r=>r.kind==='part'))await restore.imports.uploadPart(id,p.index,p)
   await assert.rejects(()=>restore.imports.finalize(id,{...old.at(-1),laterJournal:journal}),/erasure_epoch/)
   assert.equal((await proxy.env.DB.prepare('SELECT COUNT(*) n FROM g_people').first()).n,0,'An old archive publishes no rows behind the later erasure fence');await restore.imports.abort(id)
   const current=await read(newArchive),fresh=await restore.imports.create(current[0]);for(const p of current.filter(r=>r.kind==='part'))await restore.imports.uploadPart(fresh,p.index,p);await restore.imports.finalize(fresh,current.at(-1))
   assert.equal((await proxy.env.DB.prepare('SELECT COUNT(*) n FROM g_files WHERE id=?').bind(receiptId).first()).n,0);assert.equal(JSON.parse((await proxy.env.DB.prepare('SELECT data FROM g_people WHERE id=?').bind(person.id).first()).data).name,'Erased worker')
  }finally{await proxy?.dispose();await rm(dir,{recursive:true,force:true})}
  await context.close();console.log('PASS GOVERN-006 bounded native retention/erasure, lawful money hold, exact preview, owner authority and trusted later restore fence (PARTIAL)')
 }finally{await browser?.close();await h.dispose()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await privacyJourney()
