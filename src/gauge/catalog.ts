import type { Bindings } from '../auth.server'
import { type Value, type Kind, type Row, need, text, integer, money, date, zone, flag, sum } from './model'
import { type Actor, Transaction, finance, access, get, all } from './store'
import { saveAgentScope } from './agent-grants'
import { resourceProfile } from './resource-profiles'
import { rateCard } from './rate-cards'
import { activeClient, claimIdentities, clientDetails } from './clients'
export async function catalog(env: Bindings, a: Actor, tx: Transaction, action: string, input: Value): Promise<Row | Value | null> {
 if (action === 'grant') {
  need(a.role === 'owner', 'Only the owner assigns access', 403)
  const operatorId = text(input.operatorId, 'Operator')
  need(await env.DB.prepare('SELECT id FROM oa_operators WHERE id=? AND status=\'active\'').bind(operatorId).first(), 'Invite this operator and have them accept first')
  need(['staff','lead','finance','agent'].includes(input.role), 'Choose staff, lead, finance or agent')
  // An agent grant is no person: it may only prepare proposals for people to decide.
  let personId: string | null = null
  if (input.role !== 'agent') { const person = await get(env, 'people', text(input.personId, 'Person')); tx.observe('people', person); personId = person.id }
  const scope = await saveAgentScope(env,a,tx,input)
  tx.sql('INSERT INTO g_grants(operator_id,person_id,role,enabled,purpose,engagement_ids,granted_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET person_id=excluded.person_id,role=excluded.role,enabled=excluded.enabled,purpose=excluded.purpose,engagement_ids=excluded.engagement_ids,granted_by=excluded.granted_by,version=g_grants.version+1', operatorId, personId, input.role, flag(input.enabled) ? 1 : 0, scope.purpose,JSON.stringify(scope.engagementIds),scope.grantedBy)
  // GOVERN-001: every grant change is kept with who made it and when.
  tx.sql('INSERT INTO g_grant_audit(operator_id,person_id,role,enabled,actor,at) VALUES(?,?,?,?,?,?)', operatorId, personId, input.role, flag(input.enabled) ? 1 : 0, a.session.operator.id, Date.now())
  tx.audit('grant', 'grants', operatorId, { personId, role: input.role, enabled: flag(input.enabled), ...scope })
  return { granted: true }
 }
 if (!action.startsWith('save:')) return null
 const k = action.slice(5) as Kind
 need(['clients','people','engagements','budgets','milestones','rates','calendars','leave','staffing'].includes(k), 'Unsupported editor')
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
  if (v.type === 'client') { const client = await activeClient(env,input.clientId); tx.observe('clients',client); v.clientId=client.id }
  else { need(!input.clientId,'Internal work has no client'); need(['admin','sales','training','PTO','other'].includes(input.internalCategory),'Choose an internal category'); v.internalCategory=input.internalCategory }
  const lead = await get(env,'people',text(input.leadId,'Lead')); tx.observe('people',lead)
  v.leadId = lead.id; v.name = text(input.name,'Name',200); v.scope = text(input.scope,'Scope'); v.currency = previous ? previous.value.currency : a.currency; v.timezone = zone(input.timezone)
  v.members = Array.isArray(input.members) ? input.members : String(input.members ?? '').split(',').filter(Boolean)
  for (const id of v.members) tx.observe('people',await get(env,'people',id))
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
  v.mode = input.mode; v.amountMinor = money(input.amountMinor); v.effortSeconds = integer(input.effortSeconds,'Estimated effort seconds'); v.roundingSeconds = integer(input.roundingSeconds,'Billing rounding seconds',1,3600); v.reason = text(input.reason,'Terms / change-order reason'); v.status = 'draft'; v.createdAt = Date.now()
  // FINANCE-006: an optional billable expense budget, billed and costed at the same pass-through amount, with an optional forecast date.
  if (input.expenseBudgetMinor !== undefined && input.expenseBudgetMinor !== '') { v.expenseBudgetMinor = money(input.expenseBudgetMinor); if (input.expenseDate) v.expenseDate = date(input.expenseDate) } else need(!input.expenseDate,'An expense date needs an expense budget')
 }
 if (k === 'milestones') { if(previous?.value.delivery)v.delivery={...previous.value.delivery,currentDeliveryId:null}; v.name = text(input.name,'Milestone'); v.due = date(input.due); v.amountMinor = money(input.amountMinor); v.status = 'draft'; need(!previous || previous.value.status === 'draft','Approved milestone needs a new milestone') }
 if(k==='milestones'&&previous&&v.due!==previous.value.due){
  const plans=await all(env,'deliveryPlans'),latest=plans.filter(p=>p.value.engagementId===v.engagementId).at(-1)
  if(latest){tx.observe('deliveryPlans',latest);tx.guard('(SELECT COUNT(*) FROM g_deliveryPlans)=?',plans.length)}
  need(!latest?.value.schedule.nodes.some((n:Value)=>n.kind==='milestone'&&n.sourceId===previous.id),'This milestone belongs to the approved delivery baseline; preview schedule changes first',409)
 }
 if (k === 'rates') Object.assign(v, await rateCard(env, a, tx, input, previous))
 if (['calendars','leave','staffing'].includes(k)) {
  const p = await get(env,'people',text(input.personId,'Person')); tx.observe('people',p); v.personId = p.id
  if (k === 'leave') {need(finance(a) || a.personId === p.id,'Only your own leave may be changed',403);if(previous)need(finance(a)||previous.value.personId===a.personId,'Only your own leave may be changed',403)}
  v.from = date(input.from); v.to = date(input.to); need(v.to >= v.from,'End date is before start date'); need((Date.parse(v.to)-Date.parse(v.from))/86400000 <= 366,'Use a period of at most one year')
  if (k === 'calendars') { v.dailySeconds = integer(input.dailySeconds,'Available seconds per working day',0,86400); v.weekdays = text(input.weekdays,'Weekdays (0 Sunday to 6 Saturday)'); need(/^[0-6](,[0-6])*$/.test(v.weekdays),'Use comma-separated weekday numbers'); v.timezone = zone(input.timezone)
   const holidays = input.holidays ?? previous?.value.holidays ?? []
   need(Array.isArray(holidays) || typeof holidays==='string','Use holiday dates')
   v.holidays = [...new Set((Array.isArray(holidays)?holidays:holidays.split(',').map((s:string)=>s.trim()).filter(Boolean)).map(date))].sort()
   need(v.holidays.every((day:string)=>day>=v.from&&day<=v.to),'Holiday dates must be inside the calendar period')
   tx.guard("NOT EXISTS(SELECT 1 FROM g_calendars WHERE person_id=? AND id<>? AND json_extract(data,'$.from')<=? AND json_extract(data,'$.to')>=?)",p.id,previous?.id ?? '',v.to,v.from) }
  if (k === 'leave') { v.dailySeconds = integer(input.dailySeconds,'Leave seconds per day',0,86400); v.note = text(input.note,'Leave reason') }
  if (k === 'staffing') { v.dailySeconds = integer(input.dailySeconds,'Allocation seconds per day',0,86400); need(['tentative','committed'].includes(input.commitment),'Choose tentative or committed'); v.commitment = input.commitment
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
 if (v.currency !== undefined) need(input.currency === undefined || input.currency === v.currency, 'Currency differs from record; no implicit FX')
 return tx.record(k,v,previous)
}
export async function approveTerms(env: Bindings,a: Actor,tx: Transaction, k: 'budgets'|'milestones', input: Value) {
 // Approval binds the revision the person reviewed: the guard observes this exact read, so a concurrent edit makes it fail.
 const row = await get(env,k,text(input.id,'Record')); need(row.revision === input.revision,'Revision changed',409); const e = await access(env,a,row.value.engagementId,true); tx.observe('engagements',e)
 need(row.value.status === 'draft','Already reviewed',409)
 // Older milestones inherit their engagement's currency; saved historical rows are left intact.
 need((row.value.currency ?? (k === 'milestones' ? e.value.currency : undefined)) === e.value.currency, 'Terms currency differs from engagement; no implicit FX')
 need(input.currency === undefined || input.currency === e.value.currency, 'Currency differs from engagement; no implicit FX')
 const approval: Value = { status: 'approved', approvedBy: a.session.operator.id, approvedAt: Date.now() }
 if (k === 'milestones') {
  const budgets = (await all(env,'budgets')).filter(b => b.value.engagementId === e.id && b.value.status === 'approved').sort((x,y) => y.value.approvedAt-x.value.approvedAt)
  need(budgets[0]?.value.mode === 'fixed','Approve fixed-fee terms first'); tx.observe('budgets',budgets[0]); approval.budgetId = budgets[0].id
  need(budgets[0].value.currency === e.value.currency, 'Budget currency differs from engagement; no implicit FX')
  const approved = (await all(env,'milestones')).filter(m => m.value.engagementId === e.id && m.value.status === 'approved')
  for (const milestone of approved) { need((milestone.value.currency ?? e.value.currency) === e.value.currency, 'Milestone currency differs from engagement; no implicit FX'); tx.observe('milestones',milestone) }
  const charges = (await all(env,'fixedCharges')).filter(c=>c.value.engagementId===e.id&&c.value.status==='approved')
  for (const charge of charges) tx.observe('fixedCharges',charge)
  const chargedMinor=sum(charges.map(c=>c.value.amountMinor))
  tx.guard("(SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) FROM g_fixedCharges WHERE engagement_id=? AND status='approved')=?",e.id,chargedMinor)
  const approvedMinor = sum(approved.map(m=>m.value.amountMinor))
  need(sum([approvedMinor,chargedMinor,row.value.amountMinor])<=budgets[0].value.amountMinor,'Milestones exceed the agreed fixed fee')
  tx.guard("(SELECT COALESCE(SUM(json_extract(data,'$.amountMinor')),0) FROM g_milestones WHERE engagement_id=? AND status='approved')=?",e.id,approvedMinor)
 }
 return tx.record(k,{...row.value,...approval},row,undefined,'approve')
}
