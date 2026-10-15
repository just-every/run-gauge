import type { Bindings } from './auth.server'

/** The agency's operators: each person signs in with a Gauge grant, and one agent
 * operator prepares proposals. Fixed IDs; the demo's owner is named like a person. */
export const demoAgentId = 'demo-operator-agent'
const team = [
 { id: 'maya', email: 'maya.chen@studio.example', name: 'Maya Chen', role: 'lead' },
 { id: 'noah', email: 'noah.williams@studio.example', name: 'Noah Williams', role: 'finance' },
 { id: 'ella', email: 'ella.patel@studio.example', name: 'Ella Patel', role: 'lead' },
 { id: 'sam', email: 'sam.brooks@studio.example', name: 'Sam Brooks', role: 'staff' },
]

export function teamStatements(db: Bindings['DB'], ownerId: string, at: number) {
 const operator = db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,?,'member','active',1,?) ON CONFLICT DO NOTHING")
 const grant = db.prepare('INSERT INTO g_grants(operator_id,person_id,role,enabled,version) VALUES(?,?,?,1,1) ON CONFLICT(operator_id) DO NOTHING')
 return [
  db.prepare("UPDATE oa_operators SET display_name='Jordan Avery' WHERE id=? AND display_name='Owner'").bind(ownerId),
  ...team.flatMap((p, i) => [operator.bind(`demo-operator-${p.id}`, p.email, p.name, at - (40 - i) * 86400000), grant.bind(`demo-operator-${p.id}`, `demo-${p.id}`, p.role)]),
  operator.bind(demoAgentId, 'assistant@studio.example', 'Delivery assistant (agent)', at - 14 * 86400000),
  grant.bind(demoAgentId, null, 'agent'),
 ]
}
