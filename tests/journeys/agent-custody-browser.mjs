import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from '@playwright/test'

// Real forms and built pages, using only sessions created by this test's native sign-in.
export async function inspectAgentCustody(h,{agent,staff,eng,other,task,timePlan,instruction}) {
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const output=process.env.GAUGE_EVIDENCE_DIR
 if(output)await mkdir(output,{recursive:true})
 try{
  for(const width of [1440,390]){
   const owner=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
   const person=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
   for(const [context,cookie] of [[owner,h.owner],[person,staff.cookie]])await context.addCookies(cookie.split('; ').map(c=>{const at=c.indexOf('=');return {name:c.slice(0,at),value:c.slice(at+1),url:h.origin}}))
   const page=await owner.newPage(),review=await person.newPage()
   const shot=async(p,name)=>{
    await p.evaluate(()=>document.fonts.ready)
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`)
    if(output)await p.screenshot({path:join(output,`agent-${name}-${width}.png`),fullPage:true})
   }
   await page.goto(h.origin+'/app/access')
   const grant=page.locator('section').filter({has:page.getByRole('heading',{name:'Assign or revoke Gauge access',exact:true})}).locator('form')
   await grant.locator('select[name=operatorId]').selectOption(agent.id)
   await grant.locator('select[name=personId]').selectOption('')
   await grant.locator('select[name=role]').selectOption('agent')
   await grant.locator('select[name=purpose]').selectOption('time')
   await grant.locator(`input[name=engagementIds][value="${eng.id}"]`).check()
   assert(!(await grant.locator(`input[name=engagementIds][value="${other.id}"]`).isChecked()))
   await grant.getByRole('checkbox',{name:'Enabled',exact:true}).check()
   await shot(page,'grant')
   await grant.getByRole('button',{name:'Save',exact:true}).click()
   await page.waitForURL('**/app/access?saved=1')
   let sources=(await h.state()).data.tasks.find(r=>r.id===task.id)
   const prep=()=>h.cmd('proposal:prepare',{kind:'time',engagementId:eng.id,assumptions:'Reconstructed from a quoted worklog; the person confirms',evidence:[{source:'Imported worklog',summary:instruction,record:{kind:'tasks',id:task.id,revision:sources.revision}}],plan:{...timePlan,start:`2026-10-${width===1440?'11':'12'}T09:00:00+10:00`,end:`2026-10-${width===1440?'11':'12'}T10:00:00+10:00`}},agent.cookie)
   const literal=await prep()
   await review.goto(h.origin+'/app/review')
   const card=review.locator(`[id="${literal.id}"]`)
   assert((await card.innerText()).includes(instruction))
   assert.equal(await card.locator('script').count(),0)
   await shot(review,'quoted-proposal')
   const updated=await h.cmd('save:tasks',{...sources,...sources.value,remainingSeconds:sources.value.remainingSeconds+3600})
   await review.reload()
   assert((await card.innerText()).includes('Stale inputs; request a fresh proposal'))
   assert.equal(await card.getByRole('button',{name:'Approve exact proposal',exact:true}).count(),0)
   await shot(review,'stale-proposal')
   sources=(await h.state()).data.tasks.find(r=>r.id===updated.id)
   const current=await prep()
   await review.reload()
   await review.locator(`[id="${current.id}"]`).getByRole('button',{name:'Approve exact proposal',exact:true}).click()
   await review.waitForURL('**/app/review?saved=1')
   assert.equal((await h.state()).data.proposals.find(r=>r.id===current.id).value.status,'approved')
   await shot(review,'confirmed')
   const pending=await prep()
   await page.goto(h.origin+'/app/access')
   const row=page.getByRole('row').filter({hasText:'agent@example.test'})
   await row.getByRole('button',{name:'Revoke access',exact:true}).click()
   await page.waitForURL('**/app/access?saved=1')
   await shot(page,'revoked-access')
   await review.goto(h.origin+'/app/review')
   const blocked=review.locator(`[id="${pending.id}"]`)
   assert((await blocked.innerText()).includes('Agent revoked'))
   assert.equal(await blocked.getByRole('button',{name:'Approve exact proposal',exact:true}).count(),0)
   await shot(review,'revoked-proposal')
   assert.equal((await h.request('/api/gauge/state',agent.cookie)).status,403)
   await owner.close();await person.close()
  }
 }finally{await browser.close()}
}
