import assert from 'node:assert/strict'
const csv=rows=>rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n')+'\n'
export const sourceFieldProviders=['harvest','forecast','kantata-ox','kantata-sx','scoro','teamwork','productive','rocketlane','float']
export function sourceFieldPackage(provider) {
 return {format:'source-custom-fields-v1',provider,account:'synthetic-gauge-fields-1',namespace:provider+':synthetic-gauge-fields-1',administrator:true,permission:true,complete:true,filters:'all-records',controls:{definitions:7,values:7},mapping:{scopes:{Account:'clients',Job:'engagements',Worker:'people',WorkItem:'tasks'},types:{Note:'text',Decimal:'number',Money:'currency',Day:'date',Choice:'single-select',Choices:'multi-select',Worker:'person'},columns:{definitions:{id:'FieldKey',name:'Label',scope:'Entity',type:'Kind',options:'Options',currency:'ISO'},values:{id:'ValueKey',fieldId:'FieldKey',scope:'Entity',recordId:'RecordKey',value:'CapturedValue'}}},files:{
  'definitions.csv':csv([['FieldKey','Label','Entity','Kind','Options','ISO'],['note','Source note','Account','Note','',''],['number','Source exact number','Job','Decimal','',''],['money','Source private amount','Job','Money','','USD'],['day','Source review day','Worker','Day','',''],['practice','Source practice','Job','Choice',JSON.stringify([{id:'Brand',name:'Brand'},{id:'Web',name:'Web'}]),''],['tags','Source tags','Job','Choices',JSON.stringify([{id:'Brand',name:'Brand'},{id:'Web',name:'Web'}]),''],['lead','Source person','WorkItem','Worker','','']]),
  'values.csv':csv([['ValueKey','FieldKey','Entity','RecordKey','CapturedValue'],['synthetic-gauge-value-1','note','Account','c1','Quoted source instructions remain inert'],['synthetic-gauge-value-2','number','Job','p1','-1.250000'],['synthetic-gauge-value-3','money','Job','p1','{"amountMinor":-1234,"currency":"USD"}'],['synthetic-gauge-value-4','day','Worker','u1','2026-09-30'],['synthetic-gauge-value-5','practice','Job','p1','Brand'],['synthetic-gauge-value-6','tags','Job','p1','["Brand","Web"]'],['synthetic-gauge-value-7','lead','WorkItem','task1','u1']])
 }}
}
export async function sourceFieldJourney(h,{client,project,person,task,providers=sourceFieldProviders,page,capture}) {
 const mapping={clients:{c1:client.id},engagements:{p1:project.id},people:{u1:person.id},tasks:{task1:task.id}},sourceIds=[]
 for(const provider of providers){
  const pkg=sourceFieldPackage(provider),input={package:pkg,mapping,policies:{}}
  if(provider===providers[0]){
  for(const [label,alter]of [
   ['invalid option',i=>i.package.files['values.csv']=i.package.files['values.csv'].replace('"Brand"\n','"Legacy"\n')],
   ['inexact decimal',i=>i.package.files['values.csv']=i.package.files['values.csv'].replace('-1.250000','0.10000000000000001')],
   ['inexact money',i=>i.package.files['values.csv']=i.package.files['values.csv'].replace('-1234','-1234.00000000001')],
   ['unknown money',i=>i.package.files['values.csv']=i.package.files['values.csv'].replace('-1234','null')],
   ['wrong custom currency',i=>i.package.files['values.csv']=i.package.files['values.csv'].replace('USD','EUR')],
   ['unmapped source type',i=>delete i.package.mapping.types.Decimal],
   ['unmapped record',i=>delete i.mapping.engagements.p1],
   ['unmapped person value',i=>delete i.mapping.people.u1],
   ['wrong source count',i=>i.package.controls.values++]
  ]){const bad=structuredClone(input);alter(bad);const preview=await h.cmd('field:import-preview',bad);assert.equal(preview.canApply,false,provider+' '+label);assert(preview.findings.some(f=>f.sourceId||f.scope==='source'));await h.cmd('field:import',{...bad,fingerprint:preview.fingerprint,reason:'Refuse invalid original source values'},h.owner,400)}
  await h.cmd('field:import-preview',{...input,policies:{money:{visibility:'everyone'}}},h.owner,400)
  }
  const p=await h.cmd('field:import-preview',input);assert(p.canApply,JSON.stringify(p.findings));assert.equal(p.fields.length,7)
  if(page&&provider===providers[0]){
   await page.goto(h.origin+'/app/imports')
   const form=page.locator('#custom-import form').filter({has:page.locator('input[value="field:import-preview"]')})
   await form.getByLabel('Source custom-fields package JSON').fill(JSON.stringify(pkg));await form.getByLabel('Reviewed source-to-native mapping JSON').fill(JSON.stringify(mapping));await form.getByLabel('Owner field policies JSON').fill('{}');await form.getByRole('button',{name:'Save',exact:true}).click()
   assert.match(await page.locator('#custom-import').innerText(),/4 mapped records · 7 definitions/)
   if(capture)await capture('source-field-preview')
  }
  const imported=await h.cmd('field:import',{...input,fingerprint:p.fingerprint,reason:'Owner reviews exact original source definitions, typed values and relationships'})
  const data=await h.state(),receipt=data.data.customImports.find(r=>r.id===imported.id)
  assert.deepEqual(receipt.value.package.files,pkg.files,'Exact definition and value artifacts retain their original source IDs')
  const fields=data.data.customFields.filter(f=>f.value.namespace===pkg.namespace),field=id=>fields.find(f=>f.value.sourceId===id)
  assert.equal(fields.length,7);assert(fields.every(f=>f.value.visibility==='finance-only'))
  const projectRow=data.data.engagements.find(r=>r.id===project.id),taskRow=data.data.tasks.find(r=>r.id===task.id),clientRow=data.data.clients.find(r=>r.id===client.id),personRow=data.data.people.find(r=>r.id===person.id)
  assert.equal(projectRow.value.customFields[field('number').id],'-1.25');assert.equal(projectRow.value.customFields[field('money').id],-1234);assert.equal(projectRow.value.customFields[field('practice').id],'Brand');assert.deepEqual(projectRow.value.customFields[field('tags').id],['Brand','Web']);assert.equal(taskRow.value.customFields[field('lead').id],person.id);assert.equal(personRow.value.customFields[field('day').id],'2026-09-30');assert.equal(clientRow.value.customFields[field('note').id],'Quoted source instructions remain inert')
  if(provider===providers[0]){
  const fresh=await h.cmd('field:import-preview',input),replay=await h.cmd('field:import',{...input,fingerprint:fresh.fingerprint,reason:'Replay original source custody'})
  assert.equal(replay.id,imported.id);assert.equal((await h.state()).data.customFields.filter(f=>f.value.namespace===pkg.namespace).length,7)
  await h.cmd('field:define',{...field('money'),...field('money').value,visibility:'everyone',reason:'Explicit native field publication before a new source revision'})
  const changed=structuredClone(input);changed.package.files['values.csv']=changed.package.files['values.csv'].replace('-1234','-2345')
  const next=await h.cmd('field:import-preview',changed);assert(next.canApply);assert.equal(next.fields.find(f=>f.value.sourceId==='money').value.visibility,'finance-only','New source revisions never inherit a wider native visibility')
  await h.cmd('field:import',{...changed,fingerprint:next.fingerprint,reason:'Owner reviews a later private source value'})
  const updated=await h.state();assert.equal(updated.data.customFields.find(f=>f.id===field('money').id).value.visibility,'finance-only');assert.equal(updated.data.engagements.find(r=>r.id===project.id).value.customFields[field('money').id],-2345)
  }
  sourceIds.push(...fields.map(f=>f.id))
 }
 const reader=await h.invite('synthetic-gauge-source-fields-reader');await h.cmd('grant',{operatorId:reader.id,personId:person.id,role:'lead',enabled:true})
 const restricted=await h.state(reader.cookie);assert(restricted.data.customFields.every(f=>!sourceIds.includes(f.id)));assert.equal(restricted.data.customImports.length,0)
 for(const [scope,id]of [['engagements',project.id],['tasks',task.id],['people',person.id],['clients',client.id]]){const response=await h.request('/api/gauge/history/'+scope+'/'+id,reader.cookie);if(response.status===200){const history=await response.json();for(const row of history.history??[])assert(Object.keys(row.value.customFields??{}).every(id=>!sourceIds.includes(id)))}}
 await h.cmd('field:import-preview',{package:sourceFieldPackage(providers[0]),mapping},reader.cookie,403)
 return sourceIds
}
