import type { Bindings } from '../auth.server'
import { type Value, type Kind, type Row, need, text, integer, money, date, zone, flag, sum, workDate } from './model'
import { type Actor, Transaction, finance, access, get, all } from './store'
import { resourceGrant,planningPerson } from './resource-manager'
import { saveAgentScope } from './agent-grants'
import { resourceProfile } from './resource-profiles'
import { rateCard } from './rate-cards'
import { normalizePhases, phaseFor } from './budget-phases'
import { latestBudget } from './budget-caps'
import { estimateLineage } from './estimate-attestation'
import { currencies } from './agency'
import { calendarFields, protectCalendar } from './work-calendar'
import { activeClient, claimIdentities, clientDetails } from './clients'
export async function catalog(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | Value | null> {
 let calendarParent:Row|undefined
 if (action === 'grant') {
  need(a.role === 'owner', 'Only the owner assigns access', 403)
  const operatorId = text(input.operatorId, 'Operator')
  need(await env.DB.prepare('SELECT id FROM oa_operators WHERE id=? AND status=\'active\'').bind(operatorId).first(), 'Invite this operator and have them accept first')
  need(['staff','lead','finance','agent','accountant','resource-manager'].includes(input.role), 'Choose staff, lead, finance, agent, accountant or resource manager')
  // An agent grant is no person: it may only prepare proposals for people to decide.
  let personId: string | null = null
  if (input.role !== 'agent') { const person = await get(env, 'people', text(input.personId, 'Person')); tx.observe('people', person); personId = person.id }
  const scope = await resourceGrant(env,a,tx,input)??{...await saveAgentScope(env,a,tx,input),planningPeople:[]}
  tx.sql('INSERT INTO g_grants(operator_id,person_id,role,enabled,purpose,engagement_ids,granted_by,planning_people) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET person_id=excluded.person_id,role=excluded.role,enabled=excluded.enabled,purpose=excluded.purpose,engagement_ids=excluded.engagement_ids,granted_by=excluded.granted_by,planning_people=excluded.planning_people,version=g_grants.version+1', operatorId, personId, input.role, flag(input.enabled) ? 1 : 0, scope.purpose,JSON.stringify(scope.engagementIds),scope.grantedBy,JSON.stringify(scope.planningPeople))
  // GOVERN-001: every grant change is kept with who made it and when.
  tx.sql('INSERT INTO g_grant_audit(operator_id,person_id,role,enabled,actor,at) VALUES(?,?,?,?,?,?)', operatorId, personId, input.role, flag(input.enabled) ? 1 : 0, a.session.operator.id, Date.now())
  tx.audit('grant', 'grants', operatorId, { personId, role: input.role, enabled: flag(input.enabled), ...scope })
  return { granted: true }
 }
 if (action === 'calendar:change') {
  need(finance(a), 'Finance access required', 403)
  const old = await get(env, 'calendars', text(input.id, 'Calendar'))
  need(old.revision === input.revision, 'Calendar changed; reload', 409)
  const from = date(input.from)
  need(from > workDate(Date.now(), old.value.timezone) && from > old.value.from && from <= old.value.to, 'Choose a future effective date inside this calendar', 409)
  const before = new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10)
  await tx.record('calendars', {...old.value, to: before}, old, undefined, action)
  calendarParent=old
  const remaining=(raw:unknown)=>(Array.isArray(raw)?raw:String(raw??'').split(',').map(s=>s.trim()).filter(Boolean)).map(date).filter(d=>d>=from)
  input = {...old.value, ...input, id: undefined, revision: undefined, from, to: old.value.to, personId: old.value.personId, holidays:remaining(input.holidays??old.value.holidays),workdays:remaining(input.workdays??old.value.workdays)}
  action = 'save:calendars'
 }
 if (!action.startsWith('save:')) return null
 const k = action.slice(5) as Kind
 need(['clients','people','engagements','budgets','milestones','rates','calendars','staffing'].includes(k), 'Unsupported editor')
 let previous: Row | undefined
 if (input.id) { previous = await get(env, k, input.id); need(previous.revision === input.revision, 'This record changed; reload before saving', 409) }
 const v: Value = {}
 if (['clients','people','engagements','rates','calendars'].includes(k)) need(finance(a), 'Finance access required', 403)
 if (['clients','people'].includes(k)) {
  v.name = text(input.name, 'Name', 200)
  if (k === 'people') { v.timezone = zone(input.timezone); Object.assign(v,resourceProfile(input,previous?.value)) }
  // FINANCE-002 cash basis (FINANCE-007): payment terms in days (Net N), an approved average days late and a collection probability.
  if (k === 'clients') {
   need(!previous?.value.merge, 'This client was merged into another client; edit the surviving client', 409)
   const days = (key: string, label: string) => input[key] === undefined ? previous?.value[key] ?? null : input[key] === '' || input[key] === null ? null : integer(input[key], label, 0, 365)
   // New clients use USD; legacy clients without a stored choice retain their agency currency.
   v.billingCurrency = input.billingCurrency || previous?.value.billingCurrency || (previous ? a.currency : 'USD')
   need(currencies.includes(v.billingCurrency), 'Choose a supported billing currency')
   v.paymentTermsDays = days('paymentTermsDays', 'Payment terms days'); v.daysLate = days('daysLate', 'Days late')
   v.daysLateApprovedBy = v.daysLate === null ? null : v.daysLate === (previous?.value.daysLate ?? null) ? previous?.value.daysLateApprovedBy ?? a.session.operator.id : a.session.operator.id
   v.collectionPercent = input.collectionPercent === undefined ? previous?.value.collectionPercent ?? 100 : input.collectionPercent === '' ? 100 : integer(input.collectionPercent, 'Collection probability percent', 0, 100)
   // SETUP-002: the client and contact workspace beside those terms.
   Object.assign(v, clientDetails(input, previous?.value)); await claimIdentities(env, tx, v, previous?.id)
  }
 }
 if (k === 'engagements') {
  v.type = input.type ?? previous?.value.type ?? 'client'
  need(['client','internal'].includes(v.type),'Choose client or internal work')
  need(!previous || v.type === (previous.value.type ?? 'client'),'Engagement type cannot change; create a separate engagement')
  v.clientId = null
  let clientCurrency = a.currency
  if (v.type === 'client') { const client = await activeClient(env,input.clientId); tx.observe('clients',client); v.clientId=client.id; clientCurrency=client.value.billingCurrency ?? a.currency }
  else { need(!input.clientId,'Internal work has no client'); need(['admin','sales','training','PTO','other'].includes(input.internalCategory),'Choose an internal category'); v.internalCategory=input.internalCategory }
  const lead = await get(env,'people',text(input.leadId,'Lead')); tx.observe('people',lead)
  v.leadId = lead.id; v.name = text(input.name,'Name',200); v.scope = text(input.scope,'Scope'); v.currency = input.currency || previous?.value.currency || clientCurrency;
  need(currencies.includes(v.currency), 'Choose a supported billing currency')
  if (previous && v.currency !== previous.value.currency) {
   need(!previous.value.estimateId, 'Currency is locked by an accepted commercial estimate', 409)
   for (const kind of ['budgets','retainers','invoices','packets','time','milestones','vendorCommitments','vendorBills'] as const) {
    const rows = (await all(env, kind)).filter(r => r.value.engagementId === previous.id)
    for(const row of rows)tx.observe(kind,row)
    need(!rows.some(r => kind === 'retainers' || kind === 'invoices' || r.value.status === 'approved' || !!r.value.economics), 'Currency is locked by approved commercial work', 409)
    tx.guard(`(SELECT COUNT(*) FROM g_${kind} WHERE json_extract(data,'$.engagementId')=?)=?`, previous.id, rows.length)
   }
  }
  v.timezone = zone(input.timezone)
  v.members = Array.isArray(input.members) ? input.members : String(input.members ?? '').split(',').filter(Boolean)
  for (const id of v.members) tx.observe('people',await get(env,'people',id))
  Object.assign(v,estimateLineage(previous?.value))
  if (previous?.value.opportunityId) v.opportunityId = previous.value.opportunityId
 }
 if (['budgets','milestones','staffing'].includes(k)) {
  const e = await access(env,a,text(input.engagementId,'Engagement'),true); tx.observe('engagements',e); v.engagementId = e.id
  if (previous) need(previous.value.engagementId === e.id, 'Cannot move a record between engagements')
  if (k === 'budgets' || k === 'milestones') {
   need(e.value.type !== 'internal','Internal work has no commercial terms or milestones')
   v.currency = previous?.value.currency ?? e.value.currency
   need(v.currency === e.value.currency, 'Currency differs from engagement; no implicit FX')
  }
 }
 if (k === 'budgets') {
  need(!previous, 'Budget versions are append-only; create a change order')
  need(['hourly','fixed'].includes(input.mode),'Choose hourly or fixed terms')
  const prior=latestBudget(await all(env,'budgets'),v.engagementId);Object.assign(v,estimateLineage(prior?.value));v.notToExceed=input.notToExceed===undefined?prior?.value.notToExceed??false:flag(input.notToExceed);need(!v.notToExceed||input.mode==='hourly','A not-to-exceed cap applies to hourly terms')
  v.mode = input.mode; v.amountMinor = money(input.amountMinor); v.effortSeconds = integer(input.effortSeconds,'Estimated effort seconds'); v.roundingSeconds = integer(input.roundingSeconds,'Billing rounding seconds',1,3600); v.reason = text(input.reason,'Terms / change-order reason'); v.status = 'draft'; v.createdAt = Date.now()
  // FINANCE-006: an optional billable expense budget, billed and costed at the same pass-through amount, with an optional forecast date.
  if (input.expenseBudgetMinor !== undefined && input.expenseBudgetMinor !== '') { v.expenseBudgetMinor = money(input.expenseBudgetMinor); if (input.expenseDate) v.expenseDate = date(input.expenseDate) } else need(!input.expenseDate,'An expense date needs an expense budget')
 }
 if(k==='budgets'){v.phases=normalizePhases(input.phases??latestBudget(await all(env,'budgets'),v.engagementId)?.value.phases,v);need(!v.notToExceed||v.phases.every((p:Value)=>p.mode==='hourly'),'Not-to-exceed engagement caps require hourly phases')}
 if(k==='milestones'||k==='staffing'){const phase=await phaseFor(env,tx,v.engagementId,input.phaseKey??previous?.value.phaseKey,k==='milestones'?'fixed':undefined,input.service);if(phase)v.phaseKey=phase.key}
 if (k === 'milestones') { Object.assign(v,estimateLineage(previous?.value)); if(previous?.value.delivery)v.delivery={...previous.value.delivery,currentDeliveryId:null}; v.name = text(input.name,'Milestone'); v.due = date(input.due); v.amountMinor = money(input.amountMinor); v.status = 'draft'; need(!previous || previous.value.status === 'draft','Approved milestone needs a new milestone') }
 if(k==='milestones'&&previous&&v.due!==previous.value.due){
  const plans=await all(env,'deliveryPlans'),latest=plans.filter(p=>p.value.engagementId===v.engagementId).at(-1)
  if(latest){tx.observe('deliveryPlans',latest);tx.guard('(SELECT COUNT(*) FROM g_deliveryPlans)=?',plans.length)}
  need(!latest?.value.schedule.nodes.some((n:Value)=>n.kind==='milestone'&&n.sourceId===previous.id),'This milestone belongs to the approved delivery baseline; preview schedule changes first',409)
 }
 if (k === 'rates') Object.assign(v, await rateCard(env, a, tx, input, previous))
 if (['calendars','staffing'].includes(k)) {
  const p = await get(env,'people',text(input.personId,'Person')); tx.observe('people',p); v.personId = p.id
  v.from = date(input.from); v.to = date(input.to); need(v.to >= v.from,'End date is before start date'); need((Date.parse(v.to)-Date.parse(v.from))/86400000 <= 366,'Use a period of at most one year')
  if (k === 'calendars') { v.dailySeconds = integer(input.dailySeconds,'Available seconds per working day',0,86400); v.weekdays = text(input.weekdays,'Weekdays (0 Sunday to 6 Saturday)'); need(/^[0-6](,[0-6])*$/.test(v.weekdays),'Use comma-separated weekday numbers'); v.timezone = zone(input.timezone)
   const holidays = input.holidays ?? previous?.value.holidays ?? []
   need(Array.isArray(holidays) || typeof holidays==='string','Use holiday dates')
   v.holidays = [...new Set((Array.isArray(holidays)?holidays:holidays.split(',').map((s:string)=>s.trim()).filter(Boolean)).map(date))].sort()
   need(v.holidays.every((day:string)=>day>=v.from&&day<=v.to),'Holiday dates must be inside the calendar period')
   Object.assign(v, await calendarFields(env, tx, input, v, previous))
   if(calendarParent){v.previousCalendarId=calendarParent.id;v.agencyCalendarId=calendarParent.value.agencyCalendarId??null}
   if (previous) protectCalendar(previous.value, v, previous.value.timezone)
   tx.guard("NOT EXISTS(SELECT 1 FROM g_calendars WHERE person_id=? AND id<>? AND json_extract(data,'$.from')<=? AND json_extract(data,'$.to')>=?)",p.id,previous?.id ?? '',v.to,v.from) }
  if (k === 'staffing') { planningPerson(a,p.id);if(previous)planningPerson(a,previous.value.personId); v.dailySeconds = integer(input.dailySeconds,'Allocation seconds per day',0,86400); need(['tentative','committed'].includes(input.commitment),'Choose tentative or committed'); v.commitment = input.commitment
   need(input.resourceRequestId===undefined,'Request links are created only by approving an open request')
   if(previous?.value.resourceRequestId)v.resourceRequestId=previous.value.resourceRequestId
   const engagement = await get(env,'engagements',v.engagementId)
   v.service = text(input.service ?? previous?.value.service ?? 'Unspecified','Service',200)
   v.billable = input.billable === undefined ? previous?.value.billable ?? engagement.value.type!=='internal' : flag(input.billable)
   need(engagement.value.type!=='internal'||!v.billable,'Internal allocations cannot be billable')
  }
 }
 if(k==='staffing'&&previous&&(v.from!==previous.value.from||v.to!==previous.value.to)){
  const plans=await all(env,'deliveryPlans'),latest=plans.filter(p=>p.value.engagementId===v.engagementId).at(-1)
  if(latest){tx.observe('deliveryPlans',latest);tx.guard('(SELECT COUNT(*) FROM g_deliveryPlans)=?',plans.length)}
  need(!latest?.value.schedule.nodes.some((n:Value)=>n.staffingIds.includes(previous.id)),'This booking belongs to the approved delivery baseline; preview schedule changes first',409)
 }
 if (v.currency !== undefined) need(input.currency === undefined || input.currency === '' || input.currency === v.currency, 'Currency differs from record; no implicit FX')
 return tx.record(k,v,previous)
}
export async function approveTerms(env: Bindings,a: Actor,tx: Transaction, k: 'budgets'|'milestones', input: Value) {
 // Approval binds the revision the person reviewed: the guard observes this exact read, so a concurrent edit makes it fail.
 const row = await get(env,k,text(input.id,'Record')); need(row.revision === input.revision,'Revision changed',409); const e = await access(env,a,row.value.engagementId,true); tx.observe('engagements',e)
 need(row.value.status === 'draft','Already reviewed',409)
 // Older milestones inherit their engagement's currency; saved historical rows are left intact.
 need((row.value.currency ?? (k === 'milestones' ? e.value.currency : undefined)) === e.value.currency, 'Terms currency differs from engagement; no implicit FX', 409)
 need(input.currency === undefined || input.currency === e.value.currency, 'Currency differs from engagement; no implicit FX')
 if(k==='budgets')await assertBudgetTerms(env,tx,e,row.value)
 const approval: Value = { status: 'approved', approvedBy: a.session.operator.id, approvedAt: Date.now() }
 if (k === 'milestones') {
  const budgets = (await all(env,'budgets')).filter(b => b.value.engagementId === e.id && b.value.status === 'approved').sort((x,y) => y.value.approvedAt-x.value.approvedAt)
  const phase=await phaseFor(env,tx,e.id,row.value.phaseKey,'fixed')
  need((phase?.mode??budgets[0]?.value.mode) === 'fixed','Approve fixed-fee terms first'); tx.observe('budgets',budgets[0]); approval.budgetId = budgets[0].id
  need(budgets[0].value.currency === e.value.currency, 'Budget currency differs from engagement; no implicit FX')
  const approved = (await all(env,'milestones')).filter(m => m.value.engagementId === e.id && m.value.status === 'approved'&&(!phase||m.value.phaseKey===phase.key))
  for (const milestone of approved) { need((milestone.value.currency ?? e.value.currency) === e.value.currency, 'Milestone currency differs from engagement; no implicit FX'); tx.observe('milestones',milestone) }
  const charges = (await all(env,'fixedCharges')).filter(c=>c.value.engagementId===e.id&&c.value.status==='approved'&&(!phase||c.value.phaseKey===phase.key))
  for (const charge of charges) tx.observe('fixedCharges',charge)
  const chargedMinor=sum(charges.map(c=>c.value.amountMinor))
  tx.guard("(SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) FROM g_fixedCharges WHERE engagement_id=? AND status='approved' AND (?='' OR json_extract(data,'$.phaseKey')=?))=?",e.id,phase?.key??'',phase?.key??'',chargedMinor)
  const approvedMinor = sum(approved.map(m=>m.value.amountMinor))
  need(sum([approvedMinor,chargedMinor,row.value.amountMinor])<=(phase?.feeBudgetMinor??budgets[0].value.amountMinor),'Milestones exceed the agreed fixed fee')
  tx.guard("(SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) FROM g_milestones WHERE engagement_id=? AND status='approved' AND (?='' OR json_extract(data,'$.phaseKey')=?))=?",e.id,phase?.key??'',phase?.key??'',approvedMinor)
 }
 return tx.record(k,{...row.value,...approval},row,undefined,'approve')
}

/** Shared native budget safeguards also bind an accepted scope adoption. */
export async function assertBudgetTerms(env:Bindings,tx:Transaction,e:Row,value:Value) {
 const row={value}
 {const prior=latestBudget(await all(env,'budgets'),e.id);if(prior?.value.phases?.length){for(const phase of prior.value.phases){const next=row.value.phases?.find((p:Value)=>p.key===phase.key);need(next&&next.mode===phase.mode&&next.service===phase.service,'Retain each approved phase identity, service and billing basis; transfer allowances with a new version',409)}}}
 if(row.value.phases?.length){const keys=new Set(row.value.phases.map((p:Value)=>p.key));need(!(await all(env,'retainers')).some(r=>r.value.engagementId===e.id),'Retainer and phase commercial bases must be separate engagements');for(const kind of ['time','expenses','staffing','milestones'] as const){const rows=(await all(env,kind)).filter(r=>r.value.engagementId===e.id);for(const r of rows){if(kind==='time'&&r.value.economics)need(row.value.phases.find((p:Value)=>p.key===r.value.phaseKey)?.mode===r.value.economics.mode,'Keep the frozen billing basis of approved phase time',409);need(keys.has(r.value.phaseKey),'Assign every existing work source to a retained phase before approving phase budgets',409);tx.observe(kind,r)}tx.guard(`(SELECT COUNT(*) FROM g_${kind} WHERE engagement_id=?)=?`,e.id,rows.length)}}
 {const prior=latestBudget(await all(env,'budgets'),e.id);need(!prior?.value.notToExceed||row.value.notToExceed,'A change order must preserve the not-to-exceed policy');if(row.value.notToExceed){const reserved=await env.DB.prepare("SELECT COALESCE(SUM(json_extract(s.data,'$.amountMinor')),0) AS total FROM g_timeSlices s JOIN g_billing_sources b ON b.kind='timeSlices' AND b.source_id=s.id WHERE json_extract(s.data,'$.engagementId')=?").bind(e.id).first<{total:number}>();need(row.value.amountMinor>=(reserved?.total??0),'The cap cannot fall below its reserved billing portions',409);tx.guard("(SELECT COALESCE(SUM(json_extract(s.data,'$.amountMinor')),0) FROM g_timeSlices s JOIN g_billing_sources b ON b.kind='timeSlices' AND b.source_id=s.id WHERE json_extract(s.data,'$.engagementId')=?)<=?",e.id,row.value.amountMinor)}if(row.value.notToExceed)need(!await env.DB.prepare("SELECT 1 FROM g_billing_sources b JOIN g_time t ON b.kind='time' AND b.source_id=t.id WHERE t.engagement_id=?").bind(e.id).first(),'Resolve existing whole-entry billing before introducing a cap',409)}
 for(const phase of row.value.phases??[]){if(phase.mode!=='fixed')continue;const charged=await env.DB.prepare("SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) AS total FROM (SELECT data FROM g_milestones WHERE engagement_id=? AND status='approved' UNION ALL SELECT data FROM g_fixedCharges WHERE engagement_id=? AND status='approved') WHERE json_extract(data,'$.phaseKey')=?").bind(e.id,e.id,phase.key).first<{total:number}>();need((charged?.total??0)<=phase.feeBudgetMinor,'Phase allowance cannot fall below its approved fixed billing sources',409);tx.guard("(SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) FROM (SELECT data FROM g_milestones WHERE engagement_id=? AND status='approved' UNION ALL SELECT data FROM g_fixedCharges WHERE engagement_id=? AND status='approved') WHERE json_extract(data,'$.phaseKey')=?)<=?",e.id,e.id,phase.key,phase.feeBudgetMinor)}
}
