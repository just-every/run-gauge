import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getPlatformProxy } from 'wrangler'
import { createPortability, readArchive } from '@runeditrun/rer/modules/portability'
import { portabilityPolicy } from '../../scripts/installer/portability-policy.mjs'
import { harness } from '../gauge-harness.mjs'

// Exercise the complete-installation transport used by rer export and import.
export async function restoreAnalyst(h, verify) {
 const source = await createPortability({ db: h.db, policy: portabilityPolicy })
 const job = await source.exports.create()
 while ((await source.exports.advance(job, { maxParts: 16 })).phase === 'building') {}
 const records = []
 for await (const record of readArchive(await source.exports.download(job))) records.push(record)
 await source.exports.abort(job)
 await h.close()
 const directory = await mkdtemp(join(tmpdir(), 'gauge-analyst-restored-'))
 let proxy, restored
 try {
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', directory, '--config', 'wrangler.jsonc'], { stdio: 'pipe', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } })
  proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: join(directory, 'v3') }, remoteBindings: false })
  const target = await createPortability({ db: proxy.env.DB, policy: portabilityPolicy })
  const imported = await target.imports.create(records[0])
  for (const part of records.filter(r => r.kind === 'part')) await target.imports.uploadPart(imported, part.index, part)
  await target.imports.finalize(imported, { contentHash: records.at(-1).contentHash, archiveHash: records.at(-1).archiveHash })
  await proxy.dispose(); proxy = undefined
  restored = await harness({ persistenceDirectory: directory })
  await verify(restored)
  assert.equal(restored.providerRequests.length, 1, 'Restore only sends the fresh native sign-in; retained snapshots execute nothing')
 } finally {
  await restored?.close(); await proxy?.dispose(); await rm(directory, { recursive: true, force: true })
 }
}
