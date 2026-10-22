import type { Bindings } from '../auth.server'
import { type Actor, all, fence } from './store'
import { need } from './model'
import { escape as e, form, decision, table } from './ui-forms'
import { money } from './ui-format'
const when=(at:number|null)=>at?new Date(at).toISOString().slice(0,16).replace('T',' ')+' UTC':'Never'
const totals=(buckets:Record<string,number>)=>Object.entries(buckets).map(([currency,amount])=>money(amount,currency)).join(' · ')||'No sources reconciled'

export async function providerHealthSection(env:Bindings,a:Actor):Promise<string>{
 need(a.role==='owner'&&a.session.kind==='native','Only the native owner inspects connector health',403);await fence(env,a)
 const connections=await all(env,'providerConnections'),syncs=await all(env,'providerSyncs'),jobs=await all(env,'providerJobs')
 let body='<div id="provider-health" class="g-titlebar"><h2>Connector health and reconciliation</h2></div><p>Gauge keeps commercial terms; Resend is the source for submission and delivery state. Read one saved source per page, resume the cursor after reauthorization, and compare message counts and proposal values. These values are not invoices or payments. Inkwell pages the owner-bound original and signed artifacts. Crank trigger keys cannot read downstream completion.</p>'
 body+=table('Connector health',connections,[
  {label:'Connection',wrap:true,line:1,cell:r=>e(r.value.accountLabel)},
  {label:'Scopes and mapping',wrap:true,line:3,cell:r=>`${e(r.value.scopes.join(', '))}<span class="g-sub">${e(r.value.provider==='resend'?'Gauge proposals → Resend messages':r.value.provider==='inkwell'?'Owner-reviewed proposal PDF → Inkwell signed artifacts':r.value.provider==='receipt'?'Signed workflow request → native owner approval':r.value.provider==='crank'?'Exact owner-released source → Crank admission only':'Exact owner-released source → signed hook admission only')}</span>`},
  {label:'Last successful sync',wrap:true,line:2,cell:r=>e(when(syncs.filter(s=>s.value.connectionId===r.id&&s.value.status==='completed').sort((a,b)=>a.value.completedAt-b.value.completedAt).at(-1)?.value.completedAt))},
  {label:'Unresolved',wrap:true,line:3,cell:r=>e(jobs.filter(j=>j.value.connectionId===r.id&&['queued','retry-wait','dispatching','held','exception'].includes(j.value.status)).length+' jobs · '+syncs.filter(s=>s.value.connectionId===r.id&&s.value.status==='exception').length+' readback exceptions')},
 ],undefined,'No connections yet.')
 for(const connection of connections.filter(c=>['resend','inkwell'].includes(c.value.provider)&&!c.value.revokedAt))body+=form('providerSync:start','Reconcile '+connection.value.accountLabel,`<input type="hidden" name="connectionId" value="${e(connection.id)}"><p class="g-note">Capture the current native proposal delivery or signature sources. A separate read-only page advances each source once. New sends require a new snapshot.</p>`,undefined,'Capture reconciliation sources')
 body+=table('Reconciliation checkpoints',syncs,[
  {label:'Account',wrap:true,line:1,cell:r=>e(connections.find(c=>c.id===r.value.connectionId)?.value.accountLabel??'Disconnected account')},
  {label:'Cursor and count',wrap:true,line:2,cell:r=>`${e(r.value.cursor)} / ${e(r.value.sourceCount)} sources<span class="g-sub">${e(r.value.status)}${r.value.exceptionClass?' · '+e(r.value.exceptionClass):''}</span>`},
  {label:'Proposal value controls',wrap:true,line:3,cell:r=>`Source ${e(totals(r.value.sourceTotals))}<span class="g-sub">Reconciled ${e(totals(r.value.reconciledTotals))} · not paid or invoiced</span>`},
  {label:'Freshness',wrap:true,line:2,cell:r=>`${e(when(r.value.updatedAt))}<span class="g-sub">${Math.max(0,Math.floor((Date.now()-r.value.updatedAt)/60000))} minutes since checkpoint</span>`},
 ],r=>r.value.status==='completed'?'':decision('providerSync:advance','Read next source',r), 'No reconciliation snapshots yet.')
 await fence(env,a);return body
}
