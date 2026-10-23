import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {getPlatformProxy} from 'wrangler'
import {createPortability,readArchive} from '@runeditrun/rer/modules/portability'
import {portabilityPolicy} from '../../scripts/installer/portability-policy.mjs'
export async function sourceRestore(h,provider){
 const portability=await createPortability({db:h.db,policy:portabilityPolicy}),exportId=await portability.exports.create();let proxy,directory
 try{
  while((await portability.exports.advance(exportId,{maxParts:16})).phase==='building'){}
  const archive=[];for await(const line of readArchive(await portability.exports.download(exportId)))archive.push(line)
  const tables=[`g_${provider}Records`,'g_clients','g_people','g_engagements','g_tasks','g_rates','g_time','ik_jobs'],snapshot=async db=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results])))
  const expected=await snapshot(h.db);directory=await mkdtemp(join(tmpdir(),'gauge-source-restore-'))
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--persist-to',directory,'--config','dist/server/wrangler.json'],{stdio:'pipe',env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}})
  proxy=await getPlatformProxy({configPath:resolve('wrangler.jsonc'),persist:{path:join(directory,'v3')},remoteBindings:false})
  const restored=await createPortability({db:proxy.env.DB,policy:portabilityPolicy}),id=await restored.imports.create(archive[0]);for(const part of archive.filter(r=>r.kind==='part'))await restored.imports.uploadPart(id,part.index,part);await restored.imports.finalize(id,archive.at(-1))
  assert.deepEqual(await snapshot(proxy.env.DB),expected,'Source records, custody journals and all adopted native drafts survive a complete archive restore');assert.equal((await proxy.env.DB.prepare('SELECT count(*) n FROM oa_sessions').first()).n,0,'A restored archive carries no authenticated session')
 }finally{await proxy?.dispose();if(directory)await rm(directory,{recursive:true,force:true});await portability.exports.abort(exportId)}
}
