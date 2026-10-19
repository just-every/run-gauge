import assert from 'node:assert/strict'
import { mkdir,readFile } from 'node:fs/promises'
import { harness } from './gauge-harness.mjs'

// Extends the existing public financial/import journey rather than duplicating it.
// The caller closes the source before passing this verifier to portability().
export async function prepareCurrentPortability(h,{importJob}) {
 const {cmd,state,request,owner}=h,zone='Australia/Brisbane'
 const initial=await state(),engagement=initial.data.engagements.find(r=>!r.value.source&&r.value.type!=='internal')
 const person=await cmd('save:people',{name:'Portability resource specialist',timezone:zone,skills:[{name:'Research',proficiency:4}],team:'Strategy',location:'Brisbane',role:'Researcher',employmentType:'contractor'})
 await cmd('save:calendars',{personId:person.id,from:'2026-10-01',to:'2026-10-31',dailySeconds:28800,weekdays:'1,2,3,4,5',holidays:['2026-10-05'],timezone:zone})
 await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:6500,billMinor:14000})
 const opportunity={name:'Research renewal',clientId:engagement.value.clientId,ownerId:engagement.value.leadId,stage:'qualified',probability:50,from:'2026-11-02',to:'2026-11-30',services:'Research',amountMinor:240000,demandSeconds:72000}
 const deal=await cmd('save:opportunities',opportunity)
 await cmd('save:opportunities',{...deal,...opportunity,stage:'proposal',probability:75})
 const demand={engagementId:engagement.id,role:'Researcher',skill:'Research',minProficiency:4,from:'2026-10-06',to:'2026-10-07',dailySeconds:7200,service:'Research',billable:true}
 const fill=await cmd('save:resourceRequests',demand)
 const candidatesResponse=await request(`/api/gauge/resources/${fill.id}`,owner);assert.equal(candidatesResponse.status,200)
 const candidates=await candidatesResponse.json();assert(candidates.candidates.some(c=>c.personId===person.id))
 await cmd('resource:fill',{...fill,personId:person.id,fingerprint:candidates.fingerprint})
 await cmd('save:resourceRequests',{...demand,from:'2026-10-08',to:'2026-10-09'})
 const internal=await cmd('save:engagements',{type:'internal',internalCategory:'training',name:'Research training',leadId:engagement.value.leadId,members:[person.id],scope:'Declared internal professional development',timezone:zone})
 const task=await cmd('save:tasks',{engagementId:internal.id,name:'Research methods',assigneeId:person.id,priority:'high',status:'in-progress',estimateSeconds:3600,remainingSeconds:3600,from:'2026-10-08',to:'2026-10-09',billable:false,checklist:[{id:'review',label:'Review research methods',done:false}],repeatEveryDays:7,repeatUntil:'2026-10-15'})
 const subtask=await cmd('save:tasks',{engagementId:internal.id,parentId:task.id,name:'Prepare research notes',assigneeId:person.id,priority:'normal',status:'todo',estimateSeconds:900,remainingSeconds:900,from:'2026-10-08',to:'2026-10-08',billable:false,checklist:[{id:'notes',label:'Collect workshop notes',done:false}]})
 const time=await cmd('time:save',{personId:person.id,engagementId:internal.id,taskId:task.id,service:'Research',timezone:zone,notes:'Internal training actual',billable:false,start:'2026-10-08T09:00:00+10:00',end:'2026-10-08T10:00:00+10:00'})
 const submitted=await cmd('time:submit',time);await cmd('time:approve',submitted)
 await cmd('expense:save',{engagementId:internal.id,personId:person.id,taskId:subtask.id,date:'2026-10-08',description:'Research workshop materials',amountMinor:1250,reimbursable:false})
 await cmd('task:progress',{...subtask,status:'done',remainingSeconds:0,completedItems:['notes']})
 await cmd('task:progress',{...task,status:'done',remainingSeconds:0,completedItems:['review']})
 // DELIVERY-002 / BASE-002: immutable dependency baselines travel with their source tasks.
 const delivery=await cmd('delivery:preview',{engagementId:internal.id,operation:'baseline',plan:{calendar:{weekdays:[1,2,3,4,5],holidays:['2026-10-05']},nodes:[{id:subtask.id,kind:'task',sourceId:subtask.id,name:'Prepare research notes',start:'2026-10-08',durationDays:1,predecessors:[],staffingIds:[]}]}})
 await cmd('delivery:approve',{...delivery.input,fingerprint:delivery.fingerprint,reason:'Portability delivery baseline',acceptEffects:true})
 const favoriteUser=await h.invite('portability-timesheet-person');await cmd('grant',{operatorId:favoriteUser.id,personId:person.id,role:'staff',enabled:true})
 const favorite=await cmd('time:favorite',{personId:person.id,taskId:task.id,name:'Research training',service:'Research',timezone:zone,billable:false},favoriteUser.cookie)
 await cmd('time:favorite',{...favorite,personId:person.id,taskId:task.id,name:'Research workshop',service:'Research',timezone:zone,billable:false},favoriteUser.cookie)
 await cmd('time:policy',{lockThrough:'2020-12-31',reason:'Historical migration cutoff; current work remains open'})
 await cmd('save:staffing',{personId:person.id,engagementId:internal.id,from:'2026-10-09',to:'2026-10-09',dailySeconds:3600,commitment:'tentative',service:'Research',billable:false})
 const agent=await h.invite('portability-agent');await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true})
 const proposal=await cmd('proposal:prepare',{kind:'staffing',engagementId:engagement.id,assumptions:'Research capacity reviewed by the lead',evidence:[{source:'Agency planning meeting',summary:'A researcher is needed for the next delivery period'}],plan:{alternatives:[{personId:person.id,from:'2026-10-12',to:'2026-10-12',dailySeconds:3600,rationale:'Qualified researcher with declared availability'}]}},agent.cookie)
 await cmd('proposal:approve',proposal)
 const fixture=new URL('./fixtures/harvest/',import.meta.url),files={}
 for(const name of ['clients.csv','people.csv','projects.csv','time.csv'])files[name]=await readFile(new URL(name,fixture),'utf8')
 const manifest=JSON.parse(await readFile(new URL('manifest.json',fixture),'utf8'));manifest.namespace='portability-historical-document'
 const historicalBytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
 const sourcePackage={manifest,files,archives:[{name:'historical-invoice.pdf',mediaType:'application/pdf',base64:historicalBytes.toString('base64')}]}
 const preview=await cmd('import:preview',{package:sourcePackage})
 let retainedImport=await cmd('import:create',{package:sourcePackage,fingerprint:preview.fingerprint})
 while(['applying','queued'].includes(retainedImport.state))retainedImport=await cmd('import:resume',{id:retainedImport.id})
 assert.equal(retainedImport.state,'completed')
 const before=await state()
 assert(before.data.archives.some(r=>r.value.base64===historicalBytes.toString('base64')),'native historical document is available before export')
 assert.equal(before.data.time.find(r=>r.id===time.id).value.economics.costMinor,6500)
 const completedTask=before.data.tasks.find(r=>r.id===task.id),nextTask=before.data.tasks.find(r=>r.id===completedTask.value.nextOccurrenceId)
 assert(nextTask,'completed recurring work has a durable next occurrence before export')
 assert.equal(nextTask.value.previousOccurrenceId,task.id)
 assert.equal(nextTask.value.status,'todo')
 assert.equal(nextTask.value.remainingSeconds,nextTask.value.estimateSeconds)
 assert(nextTask.value.checklist.every(item=>!item.done),'next occurrence resets checklist progress')
 assert(before.data.tasks.some(r=>r.value.parentId===nextTask.id&&r.value.previousOccurrenceId===subtask.id),'recurrence copies the subtask tree before export')
 assert(before.data.expenses.some(r=>r.value.taskId===subtask.id),'expense task relationship is present before export')
 assert(before.data.resourceRequests.some(r=>r.value.status==='filled'))
 assert(before.data.resourceRequests.some(r=>r.value.status==='open'))
 assert.equal(before.capacity.find(p=>p.personId===person.id).days.find(d=>d.date==='2026-10-05').holiday,true)
 const downloads=[]
 for(const packet of before.data.packets.filter(r=>r.value.status==='approved'))downloads.push(`/api/gauge/packets/${packet.id}`)
 for(const expense of before.data.expenses)for(const file of expense.value.attachmentIds??[])downloads.push(`/api/gauge/files/${file}`)
 for(const archive of before.data.archives)downloads.push(`/api/gauge/archives/${archive.id}`)
 downloads.push(`/api/gauge/imports/${importJob}`,`/api/gauge/imports/${retainedImport.id}`)
 const getBytes=async(app,path)=>{const response=await app.request(path,app.owner);assert.equal(response.status,200,path);return Buffer.from(await response.arrayBuffer())}
 const bytes=await Promise.all(downloads.map(path=>getBytes(h,path)))
 const records=Object.entries(before.data).flatMap(([kind,rows])=>rows.map(row=>`/api/gauge/history/${kind}/${row.id}`))
 const histories=await Promise.all(records.map(path=>getBytes(h,path)))
 // Restore preserves business values, not SQLite insertion order. Compare records
 // by stable identity; derived groups and source sets have no positional meaning.
 const unordered=value=>Array.isArray(value)?value.map(unordered).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unordered(v)])):value
 const stable=report=>({agency:report.agency,data:Object.fromEntries(Object.entries(report.data).map(([kind,rows])=>[kind,[...rows].sort((a,b)=>a.id.localeCompare(b.id))])),...Object.fromEntries(['capacity','economics','pipeline','resourceDemand','utilization','correctionReviews'].map(key=>[key,unordered(report[key])]))})
 return async persistenceDirectory=>{
  const restored=await harness({persistenceDirectory,beforeLogin:async({request,post})=>{
   for(const cookie of [owner,agent.cookie,favoriteUser.cookie]){
    assert.equal((await request('/api/gauge/state',cookie)).status,401,'old session cannot read restored business data')
    assert.equal((await post('/api/gauge/command',{key:'restored-stale-session',action:'save:clients',name:'Unapproved restored write'},cookie)).status,401,'old session cannot write restored business data')
   }
  }})
  try{
   const favoritePage=await restored.request(`/app/time?sheetPerson=${person.id}&sheetFrom=2026-10-05`,restored.owner);assert.equal(favoritePage.status,200);assert((await favoritePage.text()).includes('Research workshop'),'Restored private favorite is available when the owner acts for its person on Time')
   assert.notEqual(restored.vars.SESSION_SECRET,h.vars.SESSION_SECRET,'restore uses fresh private settings')
   assert.deepEqual(stable(await restored.state()),stable(before),'fresh native login sees the same current records, money and capacity')
   const restoredBytes=await Promise.all(downloads.map(path=>getBytes(restored,path)))
   assert.deepEqual(restoredBytes,bytes,'packet artifacts, receipts and retained source originals round-trip byte for byte')
   assert.deepEqual(await Promise.all(records.map(path=>getBytes(restored,path))),histories,'all business revision history survives')
   if(process.env.GAUGE_BASE_SHOTS){
    const {chromium}=await import('@playwright/test')
    await mkdir(process.env.GAUGE_BASE_SHOTS,{recursive:true})
    const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
    try{
     const context=await browser.newContext({ignoreHTTPSErrors:true})
     await context.addCookies(restored.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:restored.origin}}))
     const page=await context.newPage()
     for(const width of [1440,390])for(const screen of ['billing','capacity']){
      await page.setViewportSize({width,height:1000});await page.goto(`${restored.origin}/app/${screen}?from=2026-10-05`)
      await page.evaluate(()=>document.fonts.ready)
      assert.equal(new URL(page.url()).pathname,`/app/${screen}`,'restored screen opens under fresh authority')
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${screen} fits ${width}`)
      await page.screenshot({path:`${process.env.GAUGE_BASE_SHOTS}/restored-${screen}-${width}.png`,fullPage:true})
     }
    }finally{await browser.close()}
   }
  }finally{await restored.dispose()}
 }
}
