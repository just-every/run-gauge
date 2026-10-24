import assert from 'node:assert/strict'
import { floatDeletionFixture } from './float.mjs'
import { harness } from '../gauge-harness.mjs'
export async function floatDeletionJourney({h,adoption,page,capture,person}) {
 const pkg=floatDeletionFixture(),input={id:adoption.id,package:pkg}
 const staff=await h.invite('float-deletion-staff');await h.cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true})
 await h.cmd('floatAdopt:deletion-preview',input,staff.cookie,403)
 const bad=structuredClone(pkg);bad.manifest.deletionCoverage.complete=false
 await h.cmd('floatAdopt:deletion-preview',{...input,package:bad},h.owner,409)
 bad.manifest.deletionCoverage.complete=true;bad.manifest.deletionCoverage.toSequence=4
 await h.cmd('floatAdopt:deletion-preview',{...input,package:bad},h.owner,409)
 const missed=structuredClone(pkg);missed.manifest.deletionCoverage.missed=true;missed.manifest.deletionCoverage.missedAt='2026-03-07T12:00:00Z'
 await h.cmd('floatAdopt:deletion-preview',{...input,package:missed},h.owner,409)
 missed.manifest.deletionCoverage.fullComparison={complete:true,asOf:'2026-03-08T12:00:00Z',artifacts:Object.keys(missed.files)}
 assert((await h.cmd('floatAdopt:deletion-preview',{...input,package:missed})).canApply)
 missed.manifest.deletionCoverage.fullComparison.asOf='2026-03-06T12:00:00Z'
 await h.cmd('floatAdopt:deletion-preview',{...input,package:missed},h.owner,409)
 const p=await h.cmd('floatAdopt:deletion-preview',input)
 assert.equal(p.effects.length,3,'Two captured daily allocations and one daily leave effect are linked exactly once')
 await h.cmd('floatAdopt:deletion-start',{...input,fingerprint:'stale',confirm:'delete-linked-untouched-float',reason:'Review linked source cancellations'},h.owner,409)
 await h.cmd('floatAdopt:deletion-start',{...input,fingerprint:p.fingerprint,reason:'Review linked source cancellations'},h.owner,400)
 await page.goto(h.origin+'/app/imports')
 const form=page.locator('form').filter({has:page.locator('[name=action][value="floatAdopt:deletion-preview"]')})
 await form.getByLabel('Float deletion comparison package JSON').fill(JSON.stringify(pkg))
 await form.getByRole('button',{name:'Preview linked Float deletions'}).click()
 assert.match(await page.locator('#float-deletion-preview').innerText(),/3 untouched native effects/)
 await capture('deletion-preview','#float-native')
 const confirm=page.locator('form').filter({has:page.locator('[name=action][value="floatAdopt:deletion-start"]')})
 await confirm.getByLabel('Delete only these linked untouched native effects; retain original evidence.').check()
 await confirm.getByLabel('Deletion continuation review reason').fill('Owner reviewed only linked untouched cancellations')
 await confirm.getByRole('button',{name:'Create Float deletion continuation'}).click()
 let job=(await h.state()).data.floatAdoptions.find(r=>r.id===adoption.id)
 assert.equal(job.value.status,'continuing')
 const cleanup=h.dispose;await h.close()
 const restarted=await harness({currency:'USD',timezone:'America/New_York',persistenceDirectory:h.directory})
 Object.assign(h,restarted,{dispose:async()=>{await restarted.close();await cleanup()}})
 assert.deepEqual((await h.state()).data.floatAdoptions.find(r=>r.id===job.id),job,'Deletion journal survives a real Worker restart')
 await h.cmd('floatAdopt:deletion-advance',{id:job.id,revision:job.revision,reason:'Apply reviewed linked source deletions'})
 job=(await h.state()).data.floatAdoptions.find(r=>r.id===job.id)
 assert.equal(job.value.status,'completed');assert.equal(job.value.deletionSequence,3)
 assert.equal(job.value.effects.filter(e=>e.deleted).length,3)
 assert.deepEqual(job.value.deletionReceipts[0].originalPackage,pkg,'Retain exact original captured deletion comparison')
 const state=await(await h.request('/api/gauge/state?from=2026-03-02&to=2026-03-03',h.owner)).json(),c=state.capacity.find(r=>r.personId===person.id)
 assert.equal(c.availableSeconds,43200);assert.equal(c.tentativeSeconds,0)
 const left=state.data.staffing.filter(r=>r.value.source?.namespace===adoption.value.namespace)
 assert.equal(left.length,2,'Other source windows remain untouched')
 const replay=await h.cmd('floatAdopt:deletion-preview',input)
 assert(replay.replay)
 await h.cmd('floatAdopt:deletion-start',{...input,fingerprint:replay.fingerprint,confirm:'delete-linked-untouched-float',reason:'Replay exact captured deletion comparison'})
 assert.equal((await h.state()).data.floatAdoptions.find(r=>r.id===job.id).value.deletionReceipts.length,1)
 const later=structuredClone(pkg)
 const event='"delete4","allocations","a1","4","2026-03-07T12:00:00Z"\n'
 later.files['deletions.csv']+=event;later.files['deletions-repeat.csv']+=event
 later.manifest.deletionCoverage.toSequence=4;later.manifest.controls.counts.deletions=4
 later.manifest.controls.financial[['p1', '2025-03', 'USD'].join('/')].scheduledSeconds=0
 const next=await h.cmd('floatAdopt:deletion-preview',{id:job.id,package:later})
 assert.equal(next.effects.length,2)
 const edited=left[0]
 await h.cmd('save:staffing',{...edited.value,id:edited.id,revision:edited.revision,commitment:'committed'})
 await h.cmd('floatAdopt:deletion-start',{id:job.id,package:later,fingerprint:next.fingerprint,confirm:'delete-linked-untouched-float',reason:'Stale review cannot erase approved staffing'},h.owner,409)
 await h.cmd('floatAdopt:deletion-preview',{id:job.id,package:later},h.owner,409)
 assert.equal((await h.state()).data.staffing.length,state.data.staffing.length,'Later native edits and commitment hold all linked deletions')
 const audit=await(await h.request('/api/gauge/audit',h.owner)).json()
 assert(audit.entries.some(e=>e.action==='floatAdopt:deletion-advance'),'Deletion continuation is attributed in the native audit')
 await page.context().clearCookies();await page.context().addCookies(h.owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
 await page.goto(h.origin+'/app/imports');await capture('deletion-completed','#float-native')
}
