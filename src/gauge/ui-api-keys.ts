import type { Bindings } from '../auth.server'
import type { Row } from './model'
import { escape as e, input as i, form, decision, table, select, checks } from './ui-forms'
import { chip } from './ui-format'
import { apiKeyRegister } from './api-keys'

const appScopeName=(scope:string)=>scope==='projects:read time:write'?'Read projects and save draft time':'Read assigned projects'
const when = (ms: number | null) => ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'
const period = (detail: string) => { const d = JSON.parse(detail); return d.from ? `${d.from} to ${d.to}` : d.scope ?? '' }

/** CONNECT-020 utilization keys on the owner's Access page: create, show once, revoke, audit. */
export async function apiKeysSection(env: Bindings, created?: { id: string; label: string; token: string }) {
 const { keys, activity } = await apiKeyRegister(env)
 let body = '<div class="g-titlebar" id="api-keys"><h2>Utilization API keys</h2></div><p class="g-lede">A key reads one thing: <code>GET /api/gauge/state?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</code> with <code>Authorization: Bearer</code>, answering the agency\'s participant count, available seconds and approved billable seconds for those dates. It cannot write, names no person and carries no rates, costs or pay. Gauge keeps only its SHA-256 fingerprint, records every use, and an export never carries it.</p>'
 if (created?.token) body += `<section class="g-card" role="status" aria-live="polite"><h2>Copy key “${e(created.label)}” now</h2><p class="g-note">This is the only time Gauge shows it. Store it in the authorized app.</p><label class="g-field g-field--wide"><span>${created.token.startsWith('gauge_app_')?'New app credential':'New utilization key'}</span><input name="createdKey" type="text" readonly value="${e(created.token)}"></label></section>`
 body += form('apikey:create', 'Create read-only utilization key', i('label', 'Key label (where it is used)'), undefined, 'Create key', 'g-card--form')
 const operators=(await env.DB.prepare("SELECT o.id,o.display_name FROM oa_operators o JOIN g_grants g ON g.operator_id=o.id WHERE o.status='active' AND o.role='member' AND g.enabled=1 AND g.role='staff' AND g.person_id IS NOT NULL ORDER BY o.display_name").all<any>()).results.map(o=>({id:o.id,revision:'',value:{name:o.display_name}}))
 body += '<div class="g-titlebar" id="app-keys"><h2>App credentials</h2></div><p class="g-lede">Read assigned projects and optionally save that staff member’s draft time. Native membership and field visibility apply on every request. Choose exact assigned projects and a finite expiry of 1 to 365 days. Later assignments never widen this credential. Changing the staff grant invalidates it. No approval or outbound sending is allowed.</p>'
 body += form('appkey:create','Create scoped app credential',i('label','App label')+select('operatorId','Staff operator',operators)+i('expiryDays','Expires after days',30,'number')+checks('engagementIds','Exact permitted projects',(await env.DB.prepare('SELECT id,revision,data FROM g_engagements').all<any>()).results.map(r=>({id:r.id,revision:r.revision,value:JSON.parse(r.data)})))+select('scope','App permissions',['projects:read','projects:read time:write'].map(scope=>({id:scope,revision:'',value:{name:appScopeName(scope)}}))),undefined,'Create app credential','g-card--form')
 const appKeys=(await env.DB.prepare(`SELECT k.*,o.display_name AS principal,owner.display_name AS issuer,
 CASE WHEN k.revoked_at IS NOT NULL THEN 'revoked' WHEN k.expires_at<=CAST(unixepoch('subsec')*1000 AS INTEGER) THEN 'expired'
 WHEN o.id IS NULL OR o.status!='active' OR o.role!='member' OR o.version!=k.operator_version OR COALESCE(g.enabled,0)!=1 OR g.role!='staff' OR g.version!=k.grant_version OR g.person_id IS NOT k.person_id OR COALESCE(json_extract(p.data,'$.privacyErased'),1)=1 THEN 'principal or grant changed'
 WHEN owner.status!='active' OR owner.role!='owner' OR owner.id IS NULL THEN 'issuing owner stopped' ELSE 'active' END AS lifecycle
 FROM g_app_keys k LEFT JOIN oa_operators o ON o.id=k.operator_id LEFT JOIN g_grants g ON g.operator_id=k.operator_id LEFT JOIN g_people p ON p.id=k.person_id LEFT JOIN oa_operators owner ON owner.id=k.created_by ORDER BY k.created_at DESC`).all<any>()).results.map(k=>({id:k.id,revision:'',value:k}))
 const projects=new Map((await env.DB.prepare('SELECT id,data FROM g_engagements').all<any>()).results.map(r=>[r.id,JSON.parse(r.data).name]))
 body += table('App credentials',appKeys,[
  {label:'Label and principal',wrap:true,line:1,cell:r=>`${e(r.value.label)}<span class="g-sub">${e(r.value.principal)} · person ${e(r.value.person_id)}</span><span class="g-sub">Issued by ${e(r.value.issuer)} · ${e(when(r.value.created_at))}</span>`},
  {label:'Captured authority',wrap:true,line:3,cell:r=>`${e(appScopeName(r.value.scope))}<span class="g-sub">${JSON.parse(r.value.engagement_ids).map((id:string)=>e(projects.get(id)??'Unavailable project')+' · '+e(id)).join('<br>')}</span><span class="g-sub">Credential version ${e(r.value.credential_version)} · operator ${e(r.value.operator_version)} · grant ${e(r.value.grant_version)}</span>`},
  {label:'Lifecycle',wrap:true,line:3,cell:r=>`Expires ${e(when(r.value.expires_at))}<span class="g-sub">Last used ${e(when(r.value.last_used_at))}</span>${r.value.revoked_at?`<span class="g-sub">Revoked ${e(when(r.value.revoked_at))}</span>`:''}`},
  {label:'Status',wrap:true,line:2,cell:r=>chip(r.value.lifecycle)},
 ],r=>r.value.revoked_at?'':decision('appkey:revoke','Revoke app credential',r,false,'secondary'),'No app credentials yet.')
 const appActivity=(await env.DB.prepare("SELECT at,actor,action,record_id,data FROM g_audit WHERE kind='appKeys' ORDER BY seq DESC LIMIT 50").all<any>()).results.map((r,index)=>({id:'app-activity-'+index,revision:'',value:r}))
 body+=table('App credential activity',appActivity,[{label:'When',wrap:true,line:2,cell:r=>e(when(r.value.at))},{label:'Credential',wrap:true,line:1,cell:r=>e(JSON.parse(r.value.data).label)},{label:'Activity',wrap:true,line:3,cell:r=>{const d=JSON.parse(r.value.data);return `${e(r.value.action)} · ${e(r.value.actor)}${d.method?' · '+e(d.method)+' '+e(d.path):''}`}}],undefined,'No app credential activity yet.')
 const rows: Row[] = keys.map((k: any) => ({ id: k.id, revision: '', value: k }))
 body += table('Utilization keys', rows, [
  { label: 'Label', wrap: true, line: 1, cell: r => `${e(r.value.label)}<span class="g-sub">${e(r.value.scope)}</span>` },
  { label: 'Created', wrap: true, line: 3, cell: r => `<span class="g-brief">Created&nbsp;</span>${e(when(r.value.created_at))}<span class="g-sub">by ${e(r.value.created_by ?? 'the owner')}</span>` },
  { label: 'Last used', wrap: true, line: 3, cell: r => `<span class="g-brief">Last used&nbsp;</span>${r.value.last_used_at ? e(when(r.value.last_used_at)) : 'never'}` },
  { label: 'Status', size: 'status', line: 2, cell: r => chip(r.value.revoked_at ? 'revoked' : 'active') },
 ], r => r.value.revoked_at ? '' : decision('apikey:revoke', 'Revoke key', r, false, 'secondary'), 'No utilization keys yet.')
 const events: Row[] = activity.map((x: any) => ({ id: `key-event-${x.id}`, revision: '', value: x }))
 body += table('Key activity', events, [
  { label: 'When', size: 'date', line: 2, cell: r => e(when(r.value.at)) },
  { label: 'Key', wrap: true, line: 1, cell: r => e(r.value.label) },
  { label: 'Action', size: 'status', line: 1, cell: r => e(r.value.action === 'read' ? 'Read utilization' : r.value.action === 'create' ? 'Created' : 'Revoked') },
  { label: 'By', wrap: true, line: 2, cell: r => e(r.value.actor) },
  { label: 'Detail', wrap: true, line: 3, cell: r => e(period(r.value.detail)) },
 ], undefined, 'No key activity yet.')
 return body
}
