import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from '@playwright/test'

export async function inspectForecast(h,pack) {
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const evidence=process.env.GAUGE_EVIDENCE_DIR
  if(evidence)await mkdir(evidence,{recursive:true})
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
   await context.addCookies(h.owner.split('; ').map(cookie=>{const split=cookie.indexOf('=');return {name:cookie.slice(0,split),value:cookie.slice(split+1),url:h.origin}}))
   const page=await context.newPage()
   await page.goto(h.origin+'/app/imports')
   assert.equal(await page.getByRole('heading',{name:'Forecast source periods'}).count(),1)
   await page.locator('input[name=files]').setInputFiles(Object.entries(pack.files).map(([name,content])=>({name,mimeType:name.endsWith('.json')?'application/json':'text/csv',buffer:Buffer.from(content)})))
   await page.locator('textarea[name=manifest]').fill(JSON.stringify(pack.manifest))
   await page.getByRole('button',{name:'Preview',exact:true}).click()
   await page.getByRole('heading',{name:'Reconciled preview'}).waitFor()
   assert(await page.getByText('Unfilled designer (placeholder)',{exact:true}).count()>0)
   assert(await page.getByText('Captured date allocations',{exact:true}).count()>0)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Import preview fits ${width}`)
   if(evidence)await page.screenshot({path:join(evidence,`forecast-preview-${width}.png`),fullPage:true})
   await page.getByRole('button',{name:'Apply first bounded batch'}).click()
   await page.getByRole('heading',{name:'Harvest move-in'}).waitFor()
   assert(await page.getByRole('link',{name:'Download retained Forecast source'}).count()>0)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Import end state fits ${width}`)
   if(evidence)await page.screenshot({path:join(evidence,`forecast-imported-${width}.png`),fullPage:true})
   // Follow the affected schedule into the ordinary user-facing capacity view.
   await page.goto(h.origin+'/app/capacity?from=2026-11-02')
   await page.getByRole('heading',{name:'Staffing',exact:true}).first().waitFor()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Staffing fits ${width}`)
   if(evidence)await page.screenshot({path:join(evidence,`forecast-staffing-${width}.png`),fullPage:true})
   await context.close()
  }
 }finally{await browser.close()}
}
