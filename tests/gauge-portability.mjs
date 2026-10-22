import assert from 'node:assert/strict'
import {getPlatformProxy} from 'wrangler'
import {mkdtemp,rm} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {createPortability,readArchive} from '@runeditrun/rer/modules/portability'
import {portabilityPolicy as policy} from '../scripts/installer/portability-policy.mjs'
export async function portability(source,{verifyRestored}={}){
 const proxy=await getPlatformProxy({configPath:resolve('wrangler.jsonc'),persist:{path:join(source,'v3')},remoteBindings:false});let archive,expected
 try{
  const service=await createPortability({db:proxy.env.DB,policy}),id=await service.exports.create();while((await service.exports.advance(id,{maxParts:16})).phase==='building'){}
  archive=await new Response(await service.exports.download(id)).text();expected=[];for await(const r of readArchive(new Response(archive).body))expected.push(r)
  for(const credential of ['synthetic-gauge-3001','synthetic-gauge-3002','synthetic-gauge-3003','synthetic-gauge-3007','https://hooks.zapier.com/hooks/catch/synthetic-gauge-3005/synthetic-gauge-3006/']){assert(!archive.includes(credential),'Provider credential never appears in the portable archive');assert(!JSON.stringify(expected).includes(credential))}
  for(const name of ['g_provider_installation_key','g_provider_credentials','g_provider_receipts','g_provider_job_authority','g_provider_sync_authority'])assert(!expected[0].tables.some(t=>t.name===name),'Provider authority stays out of archive')
  assert(expected[0].tables.some(t=>t.name==='g_files'&&t.count>0));assert(expected[0].tables.some(t=>t.name==='ik_jobs'&&t.count>0));assert(!expected[0].tables.some(t=>t.name==='oa_sessions'))
  assert((await proxy.env.DB.prepare('SELECT COUNT(*) n FROM g_api_keys').first()).n>0);assert(!expected[0].tables.some(t=>t.name==='g_api_keys'),'utilization keys never leave');assert(expected[0].tables.some(t=>t.name==='g_api_key_audit'&&t.count>0),'key audit history travels')
  await service.exports.abort(id)
  const occupied=await service.imports.create(expected[0]);for(const part of expected.filter(r=>r.kind==='part'))await service.imports.uploadPart(occupied,part.index,part);await assert.rejects(()=>service.imports.finalize(occupied,{contentHash:expected.at(-1).contentHash,archiveHash:expected.at(-1).archiveHash}),/destination|empty|occupied/);await service.imports.abort(occupied)
 }finally{await proxy.dispose()}
 const destination=await mkdtemp(join(tmpdir(),'gauge-restored-'));let restored
 try{
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--persist-to',destination,'--config','wrangler.jsonc'],{stdio:'pipe',env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}})
  restored=await getPlatformProxy({configPath:resolve('wrangler.jsonc'),persist:{path:join(destination,'v3')},remoteBindings:false});const service=await createPortability({db:restored.env.DB,policy}),manifest=expected[0],id=await service.imports.create(manifest)
  for(const part of expected.filter(r=>r.kind==='part'))await service.imports.uploadPart(id,part.index,part)
  await assert.rejects(()=>service.imports.finalize(id,{contentHash:'0'.repeat(64),archiveHash:expected.at(-1).archiveHash}));assert.equal((await restored.env.DB.prepare('SELECT COUNT(*) n FROM g_time').first()).n,0)
  await service.imports.finalize(id,{contentHash:expected.at(-1).contentHash,archiveHash:expected.at(-1).archiveHash})
  for(const table of manifest.tables){const actual=await restored.env.DB.prepare(`SELECT COUNT(*) n FROM "${table.name}"`).first();assert.equal(actual.n,table.count,table.name)}
  assert.equal((await restored.env.DB.prepare('SELECT COUNT(*) n FROM g_api_keys').first()).n,0,'a restored installation holds no utilization key')
  // COST-001's receipt, chosen by its bytes: later journeys add other receipts and row order is not part of restore.
  const file=await restored.env.DB.prepare("SELECT id,expense_id,bytes FROM g_files WHERE CAST(bytes AS TEXT)='private receipt bytes'").first();assert(file,'the COST-001 receipt is restored');assert.equal(Buffer.from(file.bytes).toString(),'private receipt bytes')
  const expense=await restored.env.DB.prepare('SELECT data FROM g_expenses WHERE id=?').bind(file.expense_id).first();assert.equal(JSON.parse(expense.data).status,'approved');assert(JSON.parse(expense.data).attachmentIds.includes(file.id),'restored approved expense retains its receipt link')
  const packets=(await restored.env.DB.prepare("SELECT data FROM g_packets WHERE status='approved'").all()).results;assert(packets.some(p=>JSON.parse(p.data).artifact.includes("'=SUM(1,2)")))
  const exportId=await service.exports.create();while((await service.exports.advance(exportId,{maxParts:16})).phase==='building'){}const after=[];for await(const r of readArchive(await service.exports.download(exportId)))after.push(r)
  const values=records=>records.filter(r=>r.kind==='part').flatMap(r=>r.items)
  // Restore turns provider sign-in off and advances the auth generation, so no pre-restore session survives; every other value round-trips.
  const restoredAuth=item=>item.table==='oa_auth_settings'?{...item,row:{...item.row,idp_sign_in:0,first_setup:0,generation:item.row.generation+1}}:item
  assert.deepEqual(values(after),values(expected).map(restoredAuth));await service.exports.abort(exportId)
  await restored.dispose();restored=undefined
  if(verifyRestored)await verifyRestored(destination)
 }finally{await restored?.dispose();await rm(destination,{recursive:true,force:true})}
}
