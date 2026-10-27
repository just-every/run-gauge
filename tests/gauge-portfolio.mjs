import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// REPORT-001: disjoint client/lead identities reconcile within the same whole-engagement scope.
export async function portfolioIdentityJourney(h) {
 const {cmd,request,owner}=h,timezone='America/New_York',team='Portfolio identity reconciliation'
 const cohorts=[]
 for(const [index,costMinor,billMinor] of [[0,4000,15000],[1,6000,20000]]){
  // Equal display names are valid; grouping and filtering must use the distinct saved identities.
  const client=await cmd('save:clients',{name:'Northstar Studio',legalName:index?'Northstar Studio West LLC':'Northstar Studio East LLC'})
  const lead=await cmd('save:people',{name:'Alex Morgan',timezone,team})
  const project=await cmd('save:engagements',{name:index?'West fixed campaign':'East hourly strategy',clientId:client.id,leadId:lead.id,members:[lead.id],scope:'Approved regional campaign',timezone})
  await cmd('save:rates',{personId:lead.id,service:'*',effective:'2026-01-01',costMinor,billMinor})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:index?'fixed':'hourly',amountMinor:index?10000:30000,effortSeconds:index?7200:3600,roundingSeconds:60,reason:'Signed regional campaign terms'}))
  if(index)await cmd('milestone:approve',await cmd('save:milestones',{engagementId:project.id,name:'Campaign handover',amountMinor:10000,due:'2026-10-09'}))
  const task=await cmd('save:tasks',{engagementId:project.id,name:'Regional campaign delivery',remainingSeconds:0})
  const entry=await cmd('time:save',{engagementId:project.id,taskId:task.id,personId:lead.id,service:'Regional strategy',timezone,start:'2026-10-09T09:00:00-04:00',end:index?'2026-10-09T11:00:00-04:00':'2026-10-09T10:00:00-04:00',notes:'Approved regional campaign work',billable:true})
  await cmd('time:approve',await cmd('time:submit',entry))
  cohorts.push({client,lead,project,expected:{budgetMinor:index?10000:30000,earnedMinor:index?10000:15000,costMinor:index?12000:4000,marginMinor:index?-2000:11000}})
 }
 const read=async(extra={})=>{
  const query=new URLSearchParams({from:'2026-10-01',to:'2026-10-31',asOf:'2026-10-16',portfolioTeam:team,...extra})
  const response=await request('/api/gauge/state?'+query,owner);assert.equal(response.status,200)
  return (await response.json()).portfolio
 }
 const firm=await read({portfolioGroup:'firm'})
 assert.equal(firm.rows.length,1,'REPORT-001 scoped firm has one USD total')
 assert.deepEqual(new Set(firm.rows[0].projectIds),new Set(cohorts.map(c=>c.project.id)))
 for(const field of Object.keys(cohorts[0].expected))assert.equal(firm.rows[0][field],cohorts.reduce((n,c)=>n+c.expected[field],0),`REPORT-001 firm ${field} reconciles to approved regional work`)
 for(const [group,identity,filter] of [['client','client','portfolioClient'],['lead','lead','portfolioLead']]){
  const grouped=await read({portfolioGroup:group})
  assert.equal(grouped.rows.length,2,`REPORT-001 same-name ${group} identities stay separate`)
  assert.equal(new Set(grouped.rows.map(r=>r.key)).size,2)
  assert.deepEqual(grouped.rows.flatMap(r=>r.projectIds).sort(),cohorts.map(c=>c.project.id).sort(),`REPORT-001 ${group} projects count once`)
  for(const cohort of cohorts){
   const row=grouped.rows.find(r=>r.projectIds.includes(cohort.project.id))
   assert.deepEqual(row.projectIds,[cohort.project.id],`REPORT-001 ${group} owns only its engagement`)
   for(const [field,value] of Object.entries(cohort.expected))assert.equal(row[field],value,`REPORT-001 ${group} ${field} uses its approved sources`)
   const filtered=await read({portfolioGroup:'firm',[filter]:cohort[identity].id})
   assert.deepEqual(filtered.rows[0].projectIds,[cohort.project.id],`REPORT-001 ${filter} selects one saved identity`)
   for(const [field,value] of Object.entries(cohort.expected))assert.equal(filtered.rows[0][field],value,`REPORT-001 ${filter} ${field} matches its group`)
  }
  for(const field of Object.keys(cohorts[0].expected))assert.equal(grouped.rows.reduce((n,r)=>n+r[field],0),firm.rows[0][field],`REPORT-001 ${group} ${field} equals the scoped firm total`)
 }
}

// REPORT-001: public HTTP and native forms compare operational profit with a loss, not accounting revenue.
export async function portfolioJourney(h,browser) {
 const {cmd,request,owner}=h,zone='America/New_York'
 const person=await cmd('save:people',{name:'Sam Rivera',timezone:zone,team:'Portfolio Creative'})
 const other=await cmd('save:people',{name:'Jordan Miles',timezone:zone,team:'Portfolio Engineering'})
 const feeCalendar=await cmd('agency:calendar',{weekdays:[1,2,3,4,5],holidays:[],reason:'Contractual working-day service fee basis'})
 const client=await cmd('save:clients',{name:'Orchard portfolio client'})
 const project=async(name,lead=person)=>cmd('save:engagements',{name,clientId:client.id,leadId:lead.id,members:[lead.id],scope:'Approved portfolio comparison',timezone:zone})
 const retainer=await project('Profitable brand partnership'),fixed=await project('Loss-making fixed launch'),unrelated=await project('Engineering cohort',other)
 await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:10000,billMinor:20000})
 const approveTime=async(eng,start,end)=>{
  const task=await cmd('save:tasks',{engagementId:eng.id,name:'Portfolio design work',remainingSeconds:0})
  const t=await cmd('time:save',{engagementId:eng.id,taskId:task.id,personId:person.id,service:'Portfolio Design',timezone:zone,start,end,notes:'Approved design source for portfolio comparison',billable:true})
  await cmd('time:approve',await cmd('time:submit',t));return t
 }
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:fixed.id,mode:'fixed',amountMinor:5000,effortSeconds:7200,roundingSeconds:60,reason:'Signed fixed launch fee'}))
 await cmd('milestone:approve',await cmd('save:milestones',{engagementId:fixed.id,name:'Launch handover',amountMinor:5000,due:'2026-10-05'}))
 const fixedTime=await approveTime(fixed,'2026-10-05T09:00:00-04:00','2026-10-05T11:00:00-04:00')
 const expense=await cmd('expense:save',{engagementId:fixed.id,personId:person.id,date:'2026-10-05',description:'Launch production supplies',amountMinor:5000,reimbursable:false})
 await cmd('expense:approve',await cmd('expense:submit',expense))
 const terms={name:'Brand partnership',frequency:'monthly',unit:'hours',allowance:36000,services:['Portfolio Design'],consumes:'billable',proration:'calendar',start:'2026-10-01',end:null,renewal:'automatic',noticeDays:0,feeMinor:310000}
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:retainer.id,mode:'hourly',amountMinor:620000,effortSeconds:36000,roundingSeconds:60,reason:'Retained service budget'}))
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 const capture=async(name,target=page.locator('#portfolio-profitability .g-card--table'))=>{if(!process.env.GAUGE_REPORT_SHOTS)return;await mkdir(process.env.GAUGE_REPORT_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`REPORT-001 ${name} fits ${width}`);await target.scrollIntoViewIfNeeded();if(width===1440&&name==='unknown-cost')assert(await target.locator('.g-table').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'REPORT-001 desktop unknown-cost table remains fully visible');await target.screenshot({path:`${process.env.GAUGE_REPORT_SHOTS}/portfolio-${name}-section-${width}.png`});await page.screenshot({path:`${process.env.GAUGE_REPORT_SHOTS}/portfolio-${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_REPORT_SHOTS}/portfolio-${name}-viewport-${width}.png`})}}
 const read=async(extra={})=>{const q=new URLSearchParams({from:'2026-10-01',to:'2026-11-30',asOf:'2026-10-16',portfolioClient:client.id,...extra});const r=await request('/api/gauge/state?'+q,owner);assert.equal(r.status,200);return r.json()}
 try{
  await login(owner)
  // Save a fee through the native preview/approval door, then open the second period through HTTP.
  await page.goto(h.origin+`/app/engagements?edit=${retainer.id}`);await page.getByText('Set up a retainer',{exact:true}).click()
  const form=page.locator('form').filter({has:page.locator('[name=action][value="retainer:preview"]')}).filter({has:page.locator('[name=operation][value=terms]')})
  await form.getByLabel('Retainer name',{exact:true}).fill(terms.name);await form.getByLabel('Allowance type',{exact:true}).selectOption('hours');await form.getByLabel('Included hours',{exact:true}).fill('10');await form.getByLabel('Period fee (USD, optional)',{exact:true}).fill('3100.00');await form.getByLabel('Eligible services (one per line)',{exact:true}).fill('Portfolio Design');await form.getByLabel('Retainer start date',{exact:true}).fill('2026-10-01')
  await form.scrollIntoViewIfNeeded();await capture('fee-editor',form);await form.getByRole('button',{name:'Preview retainer',exact:true}).click()
  assert((await page.locator('#retainers').innerText()).includes('$3,100.00'));await page.locator('#retainers').scrollIntoViewIfNeeded();await capture('fee-preview',page.locator('#retainers'))
  const save=page.locator('form').filter({has:page.locator('[name=action][value="retainer:approve"]')});await save.getByLabel('Commercial approval reason',{exact:true}).fill('Agreed monthly fee, separate from hours allowance');await save.getByRole('button',{name:'Save retainer',exact:true}).click();await capture('fee-saved',page.locator('#retainers'))
  let state=await read(),version=state.data.retainers.find(r=>r.value.engagementId===retainer.id)
  assert.equal(version.value.terms.feeBasis,'working')
  const more=await cmd('retainer:preview',{engagementId:retainer.id,operation:'periods',retainerId:version.id,from:'2026-11-01',to:'2026-11-30'});await cmd('retainer:approve',{...more.input,fingerprint:more.fingerprint,reason:'Open November service period'})
  const retainedTime=await approveTime(retainer,'2026-10-06T09:00:00-04:00','2026-10-06T10:00:00-04:00')
  state=await read();const p=state.portfolio,profit=p.projects.find(r=>r.engagementId===retainer.id),loss=p.projects.find(r=>r.engagementId===fixed.id)
  assert.equal(profit.earnedMinor,169091,'REPORT-001 $3100 × 12/22 working days earned, not all at period start');assert.equal(profit.costMinor,10000);assert.equal(profit.marginMinor,159091)
  assert.equal(p.labor.totals.find(r=>r.currency==='USD').knownCostMinor,35000);assert.equal(p.labor.seconds,10800);assert.equal(p.labor.rows.find(r=>r.service==='Portfolio Design').costMinor,30000);assert.equal(p.labor.rows.find(r=>r.service==='Unassigned expense service').costMinor,5000);assert.equal(p.labor.rows.reduce((n,r)=>n+r.costMinor,0),35000)
  assert.equal(loss.earnedMinor,5000);assert.equal(loss.costMinor,25000);assert.equal(loss.marginMinor,-20000)
  const f=state.forecast.engagements.find(r=>r.engagementId===retainer.id),m=state.margin.find(r=>r.engagementId===retainer.id)
  assert.equal(f.actualFeesMinor,169091);assert.equal(f.eacFeesMinor,620000);assert.equal(f.etcFeesMinor,450909);assert.equal(m.earnedValueMinor,169091);assert.equal(m.actualMarginMinor,159091)
  const cash=state.cash.engagements.find(r=>r.engagementId===retainer.id)
  assert.deepEqual(cash.items.map(r=>[r.invoiceDate,r.receiptDate,r.amountMinor]),[['2026-10-01','2026-10-31',310000],['2026-11-01','2026-12-01',310000]],'REPORT-001 period fees appear once on the assumed in-advance cash schedule')
  assert(cash.items.every(r=>r.assumption.includes('Assumed')&&r.assumption.includes('not issued')))
  const figure=state.lineage.find(r=>r.id.startsWith('portfolio:window:')&&r.label.startsWith(profit.name)&&r.id.endsWith(':marginMinor'))
  assert.equal(figure.value,159091);assert(figure.sources.some(r=>r.id===retainedTime.id));assert(figure.sources.some(r=>r.id===version.id&&r.value.terms.feeMinor===310000));assert(figure.sources.find(r=>r.id===retainedTime.id).value.economics.costMinor===10000)
  const lossFigure=state.lineage.find(r=>r.id.startsWith('portfolio:window:')&&r.label.startsWith(loss.name)&&r.id.endsWith(':marginMinor'));assert(lossFigure.sources.some(r=>r.id===fixedTime.id));assert(lossFigure.sources.some(r=>r.id===expense.id))
  const trend=p.trends.find(r=>r.month==='2026-10').rows.find(r=>r.projectIds.includes(retainer.id));assert.equal(trend.marginMinor,159091)
  const day=await read({from:'2026-10-02',to:'2026-10-16'});assert.equal(day.portfolio.projects.find(r=>r.engagementId===retainer.id).earnedMinor,155000,'REPORT-001 inclusive date window excludes the first day fee')
  const team=await read({portfolioTeam:'Portfolio Creative'});assert.deepEqual(new Set(team.portfolio.projects.map(r=>r.engagementId)),new Set([retainer.id,fixed.id]))
  for(const group of ['firm','client','project','team','service','lead','person']){const grouped=await read({portfolioGroup:group,portfolioTeam:'Portfolio Creative'});assert.equal(grouped.portfolio.group,group);assert(grouped.portfolio.rows.length);assert(grouped.portfolio.rows.every(r=>!r.projectIds.includes(unrelated.id)));assert.equal(grouped.portfolio.rows.reduce((n,r)=>n+r.marginMinor,0),139091);assert.equal(grouped.portfolio.rows.reduce((n,r)=>n+r.costMinor,0),35000);assert.equal(grouped.portfolio.rows.reduce((n,r)=>n+r.earnedMinor,0),174091);assert.equal(grouped.portfolio.rows.reduce((n,r)=>n+r.budgetMinor,0),625000)}
  const service=await read({portfolioService:'Portfolio Design'});assert.equal(service.portfolio.projects.length,2)
  const csvQuery=new URLSearchParams({from:state.from,to:state.to,asOf:p.asOf,portfolioClient:client.id,fingerprint:state.fingerprint})
  const csv=await request('/api/gauge/report.csv?'+csvQuery,owner);assert.equal(csv.status,200);assert((await csv.text()).includes(figure.id))
  const url=h.origin+'/app/review?'+new URLSearchParams({from:state.from,to:state.to,asOf:p.asOf,portfolioClient:client.id})
  await page.goto(url);await page.locator('#portfolio-profitability').scrollIntoViewIfNeeded();await capture('comparison')
  const portfolio=page.locator('#portfolio-profitability');assert((await portfolio.innerText()).includes('Profitable brand partnership'));assert((await portfolio.innerText()).includes('Loss-making fixed launch'))
  await portfolio.getByLabel('Portfolio team',{exact:true}).selectOption('Portfolio Creative');await portfolio.getByRole('button',{name:'Show portfolio',exact:true}).click();await page.locator('#portfolio-profitability').scrollIntoViewIfNeeded();assert(!(await page.locator('#portfolio-profitability .g-card--table tbody').innerText()).includes('Engineering cohort'));await capture('team-filter')
  const profitRow=page.locator('#portfolio-profitability tbody tr').filter({has:page.getByText('Profitable brand partnership · USD',{exact:false})}).first()
  await profitRow.locator('a').filter({hasText:'$1,590.91'}).first().click();await page.locator('#report-evidence details').first().click();await page.locator('#report-evidence').scrollIntoViewIfNeeded();assert((await page.locator('#report-evidence').innerText()).includes('Sam Rivera'));await capture('source-drill',page.locator('#report-evidence'))
  await page.goto(url);await page.getByText('Monthly profitability trends',{exact:true}).click();await page.getByText('Monthly profitability trends',{exact:true}).scrollIntoViewIfNeeded();await capture('trends',page.locator('#portfolio-profitability > details').first());await page.getByText('Additive labor and expense costs by team and service',{exact:true}).click();await capture('additive-costs',page.locator('#portfolio-labor'))
  // Fee privacy extends the existing finance boundary to preview, state, history, pages and CSV sources.
  const lead=await h.invite('portfolio-lead'),staff=await h.invite('portfolio-worker'),agent=await h.invite('portfolio-agent')
  await cmd('grant',{operatorId:lead.id,personId:person.id,role:'lead',enabled:true});await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true});await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'billing',engagementIds:[retainer.id,fixed.id]})
  for(const actor of [lead,staff,agent]){const r=await request('/api/gauge/state?from=2026-10-01&to=2026-11-30',actor.cookie),s=await r.json();assert.equal(s.portfolio,null);assert.equal((await request('/api/gauge/audit',actor.cookie)).status,403);assert.equal((await request('/api/gauge/audit/export',actor.cookie)).status,403);assert(s.data.retainers.every(t=>t.value.terms.feeMinor===undefined));assert(!(await(await request('/app/review',actor.cookie)).text()).includes('Portfolio profitability'))}
  const denied=await cmd('retainer:preview',{engagementId:retainer.id,operation:'terms',previousId:version.id,terms:{...terms,start:'2026-12-01'}},lead.cookie,403);assert(denied.error)
  const leadPreview=await cmd('retainer:preview',{engagementId:retainer.id,operation:'periods',retainerId:version.id,from:'2026-12-01',to:'2026-12-31'},lead.cookie);assert.equal(leadPreview.terms.feeMinor,undefined)
  await cmd('retainer:approve',{...leadPreview.input,fingerprint:leadPreview.fingerprint,reason:'Lead opens period without reading fee'},lead.cookie)
  await cmd('retainer:preview',{engagementId:retainer.id,operation:'terms',previousId:version.id,terms:{...terms,start:'2026-11-01'}},owner,409)
  const {feeMinor:privateFee,...leadTerms}=terms
  const leadVersion=await cmd('retainer:preview',{engagementId:retainer.id,operation:'terms',previousId:version.id,terms:{...leadTerms,start:'2027-01-01'}},lead.cookie);assert.equal(leadVersion.terms.feeMinor,undefined);assert.equal(leadVersion.input.terms.feeMinor,undefined)
  const inherited=await cmd('retainer:approve',{...leadVersion.input,fingerprint:leadVersion.fingerprint,reason:'Lead revises allowance with unchanged hidden fee'},lead.cookie)
  assert.equal((await read()).data.retainers.find(r=>r.id===inherited.id).value.terms.feeMinor,310000)
  const revised=await cmd('retainer:preview',{engagementId:retainer.id,operation:'terms',previousId:inherited.id,terms:{...terms,start:'2027-02-01',feeMinor:620000}});await cmd('retainer:approve',{...revised.input,fingerprint:revised.fingerprint,reason:'Future price version'})
  assert.equal((await read()).data.retainers.find(r=>r.id===version.id).value.terms.feeMinor,310000,'REPORT-001 later versions never reprice opened periods')
  const leadCsvState=await(await request('/api/gauge/state?from=2026-10-01&to=2026-11-30',lead.cookie)).json()
  const leadCsv=await request('/api/gauge/report.csv?'+new URLSearchParams({from:leadCsvState.from,to:leadCsvState.to,fingerprint:leadCsvState.fingerprint}),lead.cookie);assert.equal(leadCsv.status,200);assert(!(await leadCsv.text()).includes('feeMinor'))
  const leadPage=await(await request('/app/engagements?edit='+retainer.id,lead.cookie)).text();assert(!leadPage.includes('Period fee ('))
  const hist=await(await request(`/api/gauge/history/retainers/${version.id}`,lead.cookie)).json();assert(hist.history.every(r=>r.value.terms.feeMinor===undefined))
  assert.equal((await request('/api/gauge/report.csv?'+csvQuery,owner)).status,409,'REPORT-001 stale report export refused after changed commercial inputs')
  // Missing costs stay unknown through the same public report, with a source drill rather than a zero.
  const unknown=await cmd('save:people',{name:'Unpriced portfolio contributor',timezone:zone})
  const task=await cmd('save:tasks',{engagementId:fixed.id,name:'Unpriced launch help',remainingSeconds:0})
  const t=await cmd('time:save',{engagementId:fixed.id,taskId:task.id,personId:unknown.id,service:'Portfolio Design',timezone:zone,start:'2026-10-07T09:00:00-04:00',end:'2026-10-07T10:00:00-04:00',notes:'Cost not yet known',billable:true});await cmd('time:approve',await cmd('time:submit',t))
  const incomplete=(await read()).portfolio.projects.find(r=>r.engagementId===fixed.id);assert.equal(incomplete.marginMinor,null);assert.equal(incomplete.knownMarginMinor,-20000);assert(incomplete.unknown.some(s=>s.includes(t.id)))
  await page.goto(url);await page.locator('#portfolio-profitability').scrollIntoViewIfNeeded();await capture('unknown-cost')
  // A project belonging to two teams remains one project in Firm, while cohorts are explicitly non-additive.
  const fixedRow=(await read()).data.engagements.find(r=>r.id===fixed.id)
  await cmd('save:engagements',{...fixedRow.value,id:fixedRow.id,revision:fixedRow.revision,members:[person.id,other.id]})
  const overlapping=(await read({portfolioGroup:'team'})).portfolio
  assert(overlapping.rows.find(r=>r.subject==='Portfolio Creative').projectIds.includes(fixed.id));assert(overlapping.rows.find(r=>r.subject==='Portfolio Engineering').projectIds.includes(fixed.id))
  const firm=(await read({portfolioGroup:'firm'})).portfolio.rows[0];assert.equal(firm.projectIds.length,3);assert.equal(new Set(firm.projectIds).size,3);assert.equal(firm.earnedMinor,174091);assert(overlapping.rows.find(r=>r.subject==='Unassigned').projectIds.includes(fixed.id));assert.equal(overlapping.rows.reduce((n,r)=>n+r.earnedMinor,0),184091,'REPORT-001 overlapping cohort amounts are never the firm total')
  assert.equal(overlapping.labor.totals.find(r=>r.currency==='USD').knownCostMinor,35000,'REPORT-001 additive source costs still count each source once')
  await page.goto(url+'&portfolioGroup=team');await capture('overlapping-cohorts')
  // A saved working-day basis is immutable even when the agency later changes its holidays.
  const working=await project('Working-day retained service');const calendar=await cmd('agency:calendar',{previousId:feeCalendar.id,weekdays:[1,2,3,4,5],holidays:[],reason:'Portfolio fee proration workweek'})
  const workingPreview=await cmd('retainer:preview',{engagementId:working.id,operation:'terms',terms:{...terms,start:'2026-10-16',feeMinor:220000,proration:'working'}});await cmd('retainer:approve',{...workingPreview.input,fingerprint:workingPreview.fingerprint,reason:'Working-day period fee'})
  let workingState=await read(),workingForecast=workingState.forecast.engagements.find(r=>r.engagementId===working.id);assert.equal(workingForecast.actualFeesMinor,10000);assert.equal(workingForecast.eacFeesMinor,110000)
  await cmd('agency:calendar',{previousId:calendar.id,weekdays:[1,2,3,4,5],holidays:['2026-10-16'],reason:'Later holiday cannot alter approved fee basis'})
  workingForecast=(await read()).forecast.engagements.find(r=>r.engagementId===working.id);assert.equal(workingForecast.actualFeesMinor,10000);assert.equal(workingForecast.eacFeesMinor,110000)
  const hourly=await project('Hourly portfolio service');await cmd('budget:approve',await cmd('save:budgets',{engagementId:hourly.id,mode:'hourly',amountMinor:100000,effortSeconds:7200,roundingSeconds:60,reason:'Hourly portfolio statement'}));const hourlyTime=await approveTime(hourly,'2026-10-08T09:00:00-04:00','2026-10-08T10:00:00-04:00')
  const final=await read(),labor=final.portfolio.labor.rows.find(r=>r.service==='Portfolio Design')
  assert.equal(labor.laborCostMinor,40000);assert.equal(labor.hourlyBillableMinor,20000,'REPORT-001 hourly billable value excludes fixed and retained hours');assert.equal(final.portfolio.unattributedFees.find(r=>r.currency==='USD').minor,184091,'REPORT-001 fixed and ratable retained fees stay on one unattributed line')
  const hourlyFigure=final.lineage.find(r=>r.id===`portfolioLabor:${encodeURIComponent(labor.key)}:hourlyBillableMinor`);assert.equal(hourlyFigure.value,20000);assert(hourlyFigure.sources.some(r=>r.id===hourlyTime.id&&r.value.economics.billMinor===20000));assert.equal(final.lineage.find(r=>r.id==='portfolioFees:USD').value,184091)
  await page.goto(url);await page.getByText('Additive labor and expense costs by team and service',{exact:true}).click();await capture('additive-costs',page.locator('#portfolio-labor'))
  for(const href of await page.locator('#portfolio-labor a').evaluateAll(els=>els.map(el=>el.href))){const calculation=new URL(href).searchParams.get('calculation');assert(final.lineage.some(f=>f.id===calculation),'REPORT-001 every labor/fee cell has a current source drill')}
  await portfolioIdentityJourney(h)
  const currentCalendar=(await read()).data.agencyCalendars.at(-1);await cmd('agency:calendar',{previousId:currentCalendar.id,weekdays:[1],holidays:['2026-11-02','2026-11-09','2026-11-16','2026-11-23','2026-11-30'],reason:'No working days in November'})
  const versionsBefore=(await read()).data.retainers.length
  await cmd('retainer:preview',{engagementId:hourly.id,operation:'terms',terms:{...terms,start:'2026-11-01',proration:'calendar'}},owner,400)
  assert.equal((await read()).data.retainers.length,versionsBefore,'REPORT-001 a fee period without working days is refused before saving')
  console.log('PASS REPORT-001: profitable retainer vs fixed loss, day-earned fee, date/team/service/client/project/lead cohorts, monthly trends, frozen source drills/CSV, incomplete costs, immutable finance-only fees and assumed once-only cash schedule')
 }finally{await context.close()}
}
