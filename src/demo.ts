import type { Bindings } from './auth.server'
import { demoRecords } from './demo-data'
import { demoAgentId, teamStatements } from './demo-team'

/** Real native records in throwaway demo state only; fixed IDs make repeats safe. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
 const owner = await env.DB.prepare("SELECT id FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(ownerEmail).first<{ id: string }>()
 if (!owner) throw new Error('Demo owner is not ready')
 const records = demoRecords(now, owner.id, demoAgentId)
 const receipt = new TextEncoder().encode('Workshop materials\nAUD 86.50\nSample receipt for Gauge Demo\n')
 await env.DB.batch([
  ...teamStatements(env.DB, owner.id, now.getTime()),
  ...records.map(({ kind, id, value }) => env.DB.prepare(`INSERT INTO g_${kind}(id,revision,data) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id, `${id}-v1`, JSON.stringify(value))),
  env.DB.prepare("INSERT INTO g_billing_sources(kind,source_id,packet_id,source_revision) VALUES('time','demo-time-0','demo-packet-harbour','demo-time-0-v1') ON CONFLICT DO NOTHING"),
  env.DB.prepare('INSERT INTO g_files(id,expense_id,name,media_type,bytes,size,actor) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind('demo-receipt', 'demo-expense-0', 'workshop-receipt.txt', 'text/plain', receipt, receipt.byteLength, owner.id),
  env.DB.prepare('INSERT INTO oa_first_run(singleton,completed_by,completed_at) VALUES(1,?,?) ON CONFLICT(singleton) DO NOTHING').bind(owner.id, now.getTime()),
 ])
}
