import {chromium} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {getPlatformProxy} from 'wrangler'
import {createPortability,readArchive} from '@runeditrun/rer/modules/portability'
import {portabilityPolicy as policy} from '../../scripts/installer/portability-policy.mjs'
import {harness} from '../gauge-harness.mjs'

/** The supported Base archive door preserves money but never payment execution authority. */
export async function stripeArchiveJourney(h) {
 console.log('Stripe archive: snapshot');const before=await h.state(),source=await createPortability({db:h.db,policy}),exportId=await source.exports.create()
 console.log('Stripe archive: export');while((await source.exports.advance(exportId,{maxParts:16})).phase==='building'){}
 console.log('Stripe archive: read');const archive=await new Response(await source.exports.download(exportId)).text(),records=[]
 for await(const record of readArchive(new Response(archive).body))records.push(record)
 for(const value of ['synthetic-gauge-8801','synthetic-gauge-8802'])assert(!archive.includes(value),'Archive excludes Stripe secret '+value)
 for(const name of ['g_provider_credentials','g_stripe_authority','g_stripe_claims'])assert(!records[0].tables.some(t=>t.name===name),'Archive excludes execution table '+name)
 await source.exports.abort(exportId)
 console.log('Stripe archive: destination');const destination=await mkdtemp(join(tmpdir(),'gauge-stripe-restore-'));let proxy,restored
 try{
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--persist-to',destination,'--config','dist/server/wrangler.json'],{stdio:'pipe',maxBuffer:8*1024*1024,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}})
  proxy=await getPlatformProxy({configPath:resolve('dist/server/wrangler.json'),persist:{path:join(destination,'v3')},remoteBindings:false})
  console.log('Stripe archive: import');const service=await createPortability({db:proxy.env.DB,policy}),id=await service.imports.create(records[0])
  for(const part of records.filter(r=>r.kind==='part'))await service.imports.uploadPart(id,part.index,part)
  console.log('Stripe archive: finalize');await service.imports.finalize(id,{contentHash:records.at(-1).contentHash,archiveHash:records.at(-1).archiveHash})
  await proxy.dispose();proxy=undefined
  console.log('Stripe archive: fresh login');restored=await harness({persistenceDirectory:destination})
  const after=await restored.state()
  const page=await(await restored.request('/app/billing',restored.owner)).text();assert(!page.includes('href="https://checkout.stripe.com'),'Restore exposes historical payment addresses without executable links')
  for(const kind of ['invoices','payments','paymentLinks','processorPayments','processorEvents','stripeAccounts']){
   const order=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(order(after.data[kind]),order(before.data[kind]),'Restore preserves Stripe money and history '+kind)
  }
  if(process.env.GAUGE_STRIPE_RESTORE_SCREENS){await mkdir('./artifacts/stripe',{recursive:true});const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});try{const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(restored.owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:restored.origin}}));const page=await context.newPage();for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(restored.origin+'/app/billing');const panel=page.locator('.g-stripe').first();await panel.locator('details').first().evaluate(el=>el.open=true);await panel.screenshot({path:`./artifacts/stripe/restored-${width}.png`});assert.equal(await panel.getByRole('link',{name:'Open Stripe checkout',exact:true}).count(),0)}}finally{await browser.close()}}
  const link=after.data.paymentLinks[0],payment=after.data.processorPayments[0],traffic=restored.providerRequests.length
  await restored.cmd('stripe:reconcile',link,restored.owner,409)
  await restored.cmd('stripe:refund',{...payment,amountMinor:1,reason:'Restored history grants no payment authority',ownerInstruction:`Refund 1 USD for payment ${payment.id}`},restored.owner,409)
  assert.equal(restored.providerRequests.length,traffic,'Restore never contacts Stripe or resumes old instructions')
 }finally{await proxy?.dispose();await restored?.close();await rm(destination,{recursive:true,force:true})}
}
