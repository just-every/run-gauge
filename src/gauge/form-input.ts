// The page forms speak in people's units: dollars, hours, minutes, local wall-clock
// times and weekday checkboxes. This turns a posted form into the command input the
// API takes (currency minor units, seconds, instants with a UTC offset, "1,2,3,4,5"), so stored
// fields and the command API never change. Field names carry their unit: amountDollars
// becomes amountMinor, effortHours becomes effortSeconds, startLocal becomes start.
import { type Value, need, zone } from './model'

const lists = ['members', 'sources', 'completedItems', 'entries', 'handoffSources', 'engagementIds', 'projectIds', 'planningPeople', 'creditAdjustmentIds']
const decimal = (raw: string, label: string) => { need(/^\d+(\.\d+)?$/.test(raw.trim()), `${label}: enter a number such as 7.5`); return Number(raw.trim()) }
const cents = (raw: string) => {
 need(/^\d+(\.\d+)?$/.test(raw.trim()), 'Amount: enter a number such as 7.5')
 const [whole, fraction = ''] = raw.trim().split('.'), minor = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0')) + (Number(fraction[2] ?? 0) >= 5 ? 1n : 0n)
 need(minor <= BigInt(Number.MAX_SAFE_INTEGER), 'Amount is too large')
 return Number(minor)
}

/** The UTC offset ("+10:00") a timezone has at one instant. */
function offsetMinutes(ms: number, timeZone: string) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms).map(p => [p.type, p.value]))
 return Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms) / 60000)
}

/** "2026-10-06T09:00" in Australia/Brisbane → "2026-10-06T09:00:00+10:00". */
export function zonedInstant(local: string, timeZone: string) {
 need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local), 'Choose a date and time')
 const wall = Date.parse(`${local}:00Z`), first = wall - offsetMinutes(wall, timeZone) * 60000, offset = offsetMinutes(first, timeZone)
 const sign = offset < 0 ? '-' : '+', abs = Math.abs(offset)
 return `${local}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/** An instant as a datetime-local value in its work timezone. */
export function localValue(ms: number | string | null | undefined, timeZone: string) {
 if (ms == null || ms === '') return ''
 const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]))
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

function readCustomForm(form:FormData,input:Value,prefix:string,destination:string){
 if(Object.keys(input).some(k=>k.startsWith(prefix+'custom-type:'))){input[destination]={};for(const k of Object.keys(input).filter(k=>k.startsWith(prefix+'custom-type:'))){const id=k.slice(prefix.length+12),type=input[k],name=prefix+'custom:'+id;if(type==='currency'){const raw=String(input[name]??'').trim(),digits=Number(input[prefix+'custom-digits:'+id]);need(Number.isInteger(digits)&&digits>=0&&digits<=4,'Currency minor-unit precision unavailable');if(!raw)input[destination][id]='';else{need(/^-?\d+(?:\.\d+)?$/.test(raw),'Use a decimal currency amount');const [whole,fraction='']=raw.replace('-','').split('.');need(fraction.length<=digits,'Amount has too many decimal places for its ISO currency');const minor=(BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0')||'0'))*(raw.startsWith('-')?-1n:1n);need(minor<=BigInt(Number.MAX_SAFE_INTEGER)&&minor>=BigInt(Number.MIN_SAFE_INTEGER),'Amount exceeds exact range');input[destination][id]=Number(minor)}delete input[prefix+'custom-digits:'+id]}else input[destination][id]=type==='multi-select'?form.getAll(name):input[name]??'';delete input[k];delete input[name];delete input[name+'Minor']}}
}

export function formInput(form: FormData): Value {
 const input: Value = Object.fromEntries(form)
 if(form.has('recoveryInput')){Object.assign(input,JSON.parse(String(form.get('recoveryInput'))));for(const n of [0,1])input[`scopeSeconds${n}`]=Math.round(decimal(String(form.get(`scopeHours${n}`)),'Remaining scope hours')*3600)}
 if(form.has('recoveryDeclarations')){
  const previous=JSON.parse(String(form.get('recoveryDeclarations')));input.declarations={}
  for(const option of previous){
   input.declarations[option.id]={commercialChanges:[],capacityCosts:[]}
   for(const r of option.requirements??[])if(form.has(`nameCommercial:${option.id}:${r.key}`))input.declarations[option.id].commercialChanges.push({key:r.key,amountMinor:cents(String(form.get(`changeAmount:${option.id}:${r.key}`))),reason:String(form.get(`changeReason:${option.id}:${r.key}`)??'')})
   for(const c of option.capacityCosts??[])if(form.has(`nameCapacity:${option.id}:${c.key}`))input.declarations[option.id].capacityCosts.push({key:c.key,seconds:c.seconds,currency:c.currency,amountMinor:c.amountMinor})
  }
 }

 if(input.action==='template:save'&&form.has('intakeTitle'))input.intakeForms=String(input.intakeTitle).trim()?[{title:input.intakeTitle,questions:input.intakeQuestions,fileLabel:input.intakeFileLabel,offsetDays:input.intakeOffsetDays,everyDays:input.intakeEveryDays,chestUrl:input.intakeChestUrl,blotterUrl:input.intakeBlotterUrl}]:[];if(input.action==='template:save'&&form.has('intakeExtraForms'))input.intakeForms=[...input.intakeForms,...JSON.parse(String(form.get('intakeExtraForms')))]
 if(['kantataAdopt:','floatAdopt:'].some(prefix=>String(input.action).startsWith(prefix))&&typeof input.config==='string')input.config=JSON.parse(input.config||'{}')
 if(form.has('closeInput'))Object.assign(input,JSON.parse(String(form.get('closeInput'))))
 if(input.action==='period:preview')input.retainerExceptions=Object.fromEntries(String(input.retainerExceptionLines??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const at=line.indexOf('|');need(at>0,'Use family ID | exception reason');return [line.slice(0,at).trim(),line.slice(at+1).trim()]}))
 if(input.action==='period:preview'){const entries=[...form.entries()].filter(([key,value])=>key.startsWith('retainerException:')&&String(value).trim());if(entries.length)input.retainerExceptions=Object.fromEntries(entries.map(([key,value])=>[key.slice('retainerException:'.length),String(value).trim()]))}
 if(['time:save','timer:start'].includes(String(input.action)))input.billable=form.has('billable')
 if(input.action==='expense:save'){input.clientBillable=form.has('clientBillable');input.reimbursable=form.has('reimbursable')}
 if(input.action==='save:clients')input.poRequired=form.has('poRequired')
 if(form.has('retainerInput'))Object.assign(input,JSON.parse(String(form.get('retainerInput'))))
 if(form.has('deliveryInput'))Object.assign(input,JSON.parse(String(form.get('deliveryInput'))))
 if(input.action==='delivery:preview'&&input.operation==='baseline') {
  input.previousId=input.previousId||null
  input.plan={calendar:{weekdays:form.getAll('weekdays').map(Number),holidays:String(form.get('deliveryHolidays')??'').split(',').map(s=>s.trim()).filter(Boolean)},nodes:form.getAll('nodeId').map(String).filter(id=>form.has(`include:${id}`)).map(id=>({id,kind:form.get(`nodeKind:${id}`),sourceId:form.get(`nodeSource:${id}`)||null,name:form.get(`nodeName:${id}`),start:form.get(`start:${id}`),durationDays:Number(form.get(`duration:${id}`)),predecessors:form.getAll(`predecessors:${id}`).map(String),staffingIds:form.getAll(`staffing:${id}`).map(String)}))}
 }

 if(input.action==='template:save'&&form.has('itemLines')){
  // One item per line: key | kind | name | offset days | duration days | after keys | owner | effort hours | fee.
  input.items=String(form.get('itemLines')).split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{const [key,kind,name,offsetDays,durationDays,after='',owner='',effort='',fee='',phaseKey='']=line.split('|').map(s=>s.trim());return {...(phaseKey?{phaseKey}:{}),key,kind,name,offsetDays,durationDays,predecessors:after.split(',').map(s=>s.trim()).filter(Boolean),owner:owner||null,effortSeconds:effort===''?0:Math.round(decimal(effort,'Effort hours')*3600),amountMinor:fee===''?(kind==='milestone'?'':null):cents(fee)}})
  delete input.itemLines;input.previousId=input.previousId||null
 }
 if(input.action==='fixed:prepare'&&form.has('cumulativePercent')){
  const raw=String(input.cumulativePercent).trim();need(/^\d+(\.\d{1,2})?$/.test(raw),'Cumulative percentage: enter up to two decimal places')
  input.cumulativeBasisPoints=cents(raw);delete input.cumulativePercent
 }
 if(input.gridDate){input.startLocal=`${input.gridDate}T${input.startClock}`;input.endLocal=`${input.gridDate}T${input.endClock}`;delete input.startClock;delete input.endClock;delete input.gridDate}
 if(form.get('action')==='task:progress')input.completedItems=form.getAll('completedItems')
 for (const name of lists) if (form.getAll(name).length) input[name] = form.getAll(name)
 if (form.has('weekdays')) input.weekdays = form.getAll('weekdays').join(',')
 for (const key of Object.keys(input)) {
  const raw = input[key]; if (typeof raw !== 'string') continue
  const base = key.replace(/(Dollars|Hours|Minutes|Local)$/, '')
  if (key.endsWith('Dollars')) input[`${base}Minor`] = raw.trim() === '' ? '' : cents(raw)
  else if (key.endsWith('Hours')) input[`${base}Seconds`] = raw.trim() === '' ? '' : Math.round(decimal(raw, 'Hours') * 3600)
  else if (key.endsWith('Minutes')) input[`${base}Seconds`] = Math.round(decimal(raw, 'Minutes') * 60)
  else if (key.endsWith('Local')) { if (raw === '') continue; input[base] = zonedInstant(raw, zone(input.timezone)) }
  else continue
  delete input[key]
 }
 if (['save:calendars','calendar:change'].includes(input.action) && input.weekday0Seconds !== undefined) { input.weekdaySeconds = [0,1,2,3,4,5,6].map(n => input['weekday'+n+'Seconds']); input.weekdays = input.weekdaySeconds.map((v:number,n:number)=>v>0?String(n):'').filter(Boolean).join(',') || '1' }
 if(input.action==='commercial:prepare'){
  input.deliverables=String(input.deliverables??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  input.exclusions=String(input.exclusions??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  need(['true','false'].includes(input.signatureRequired),'Choose whether a provider signature is required');input.signatureRequired=input.signatureRequired==='true'
  input.paymentSchedule=[]
  for(let i=0;i<30;i++){const prefix='proposalPayment'+i,name=input[prefix+'Name'],due=input[prefix+'Due'],amountMinor=input[prefix+'AmountMinor'];if(name||due||amountMinor!==undefined&&amountMinor!=='')input.paymentSchedule.push({name,due,amountMinor})}
 }
 if(input.action==='time:policy'&&form.has('dueWeekday')){
  const serviceBillability=Object.fromEntries(String(input.serviceDefaults??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const [service,value,...extra]=line.split('|').map(s=>s.trim());need(service&&!extra.length&&['billable','nonbillable'].includes(value),'Use Service | billable or nonbillable');return [service,value==='billable']}))
  input.review={dueWeekday:input.dueWeekday,dueTime:input.dueTime,minimumNotes:input.minimumNotes,maxEntrySeconds:input.maxEntrySeconds,maxDaySeconds:input.maxDaySeconds,reviewLevels:input.reviewLevels,separation:input.separation==='on',serviceBillability}
 }
 if(input.action==='retainer:preview'&&input.operation==='terms'){input.terms={...(input.feeMinor===undefined?{}:{feeMinor:input.feeMinor}),name:input.name,frequency:input.frequency,unit:input.unit,allowance:input.unit==='value'?input.allowanceMinor:input.allowanceSeconds,services:String(input.services??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),consumes:input.consumes,proration:input.proration,start:input.start,end:input.end||null,renewal:input.renewal,noticeDays:input.noticeDays,rules:{carryCap:input.unit==='value'?input.carryCapMinor:input.carryCapSeconds,carryPeriods:input.carryPeriods,deficit:input.deficit==='on',overage:input.overage,overageRate:input.unit==='value'?Math.round(decimal(String(input.overagePercent),'Overage percent')*100):input.overageRateMinor}}}
 if(['save:budgets','template:save'].includes(input.action)&&Object.keys(input).some(k=>/^phase\d+Name$/.test(k))){
  const phases=Object.keys(input).filter(k=>/^phase\d+Name$/.test(k)&&String(input[k]).trim()).map(k=>{const prefix=k.slice(0,-4);return {key:input[prefix+'Key'],name:input[k],service:input[prefix+'Service'],mode:input[prefix+'Mode'],hourBudgetSeconds:input[prefix+'Seconds'],feeBudgetMinor:input[prefix+'FeeMinor'],expenseBudgetMinor:input[prefix+'ExpenseMinor']||0,marginBasisPoints:input[prefix+'MarginPercent']===''?0:cents(String(input[prefix+'MarginPercent']))}})
  if(input.action==='save:budgets')input.phases=phases
  else if(input.templateBudget==='on')input.budget={mode:input.templateMode,amountMinor:input.templateAmountMinor,effortSeconds:input.templateEffortSeconds,expenseBudgetMinor:input.templateExpenseBudgetMinor||0,roundingSeconds:input.templateRoundingSeconds,phases}
 }
 if(input.action==='budget:transfer')input.amount=input.metric==='hourBudgetSeconds'?input.transferSeconds:input.transferMinor
 readCustomForm(form,input,'','customFields');readCustomForm(form,input,'task-','taskCustomFieldsDefault')
 if(input.action==='template:save'&&input.customFields&&input.applyTemplateDefaults==='on')input.items=input.items.map((item:Value)=>item.kind==='task'?{...item,customFields:{...item.customFields,...Object.fromEntries(Object.entries(input.customFields).filter(([,v])=>v!==''))}}:item)
 if(input.action==='field:define'){input.required=form.has('required');input.retired=form.has('retired');if(input.fieldOptions!==undefined&&String(input.fieldOptions).trim())input.options=String(input.fieldOptions).split(/\r?\n/).map(line=>{const [id,name,retired,...extra]=line.split('|').map(s=>s.trim());need(id&&name&&!extra.length&&(!retired||retired==='retired'),'Use stable ID | label | retired');return {id,name,retired:retired==='retired'}})}
 if(input.action.startsWith('field:import'))for(const name of ['mapping','policies'])if(typeof input[name]==='string')input[name]=JSON.parse(input[name])
 if(input.action==='client:merge')input.customFieldChoices=Object.fromEntries(Object.keys(input).filter(k=>k.startsWith('merge-field:')).map(k=>[k.slice(12),input[k]]))
 if(input.action==='save:resourceRequests')input.nativeFilters=Object.fromEntries(Object.keys(input).filter(k=>k.startsWith('filter:')&&String(input[k]).trim()).map(k=>[k.slice(7),input[k]]))
 if(input.action==='saved:save'){input.nativeFilters=Object.fromEntries(Object.keys(input).filter(k=>k.startsWith('filter:')&&String(input[k]).trim()).map(k=>[k.slice(7),input[k]]));input.measures=JSON.parse(input.measures??'[]')}
 if(input.action==='estimate:save'){
  for(const name of ['contingency','discount']){const raw=String(input[name+'Percent']??'0').trim();need(/^\d+(?:\.\d{1,2})?$/.test(raw),'Use a percentage with at most two decimal places');input[name+'BasisPoints']=cents(raw)}
  input.phases=Object.keys(input).filter(k=>/^estimatePhase\d+Name$/.test(k)&&String(input[k]).trim()).map(k=>{const pre=k.slice(0,-4);return {key:input[pre+'Key'],name:input[k],service:input[pre+'Service'],mode:input[pre+'Mode'],from:input[pre+'From'],to:input[pre+'To']}})
  input.lines=Object.keys(input).filter(k=>/^estimateLine\d+Name$/.test(k)&&String(input[k]).trim()).map(k=>{const pre=k.slice(0,-4),v:Value={key:input[pre+'Key'],name:input[k],phaseKey:input[pre+'Phase'],kind:input[pre+'Kind'],role:input[pre+'Role'],personId:input[pre+'Person']||null,effortSeconds:input[pre+'EffortSeconds'],billRateMinor:input[pre+'BillRateMinor'],quantity:input[pre+'Quantity'],unitBillMinor:input[pre+'UnitBillMinor']};if(input[pre+'CostRateMinor']!==undefined&&input[pre+'CostRateMinor']!=='')v.costRateMinor=input[pre+'CostRateMinor'];if(input[pre+'CostMinor']!==undefined&&input[pre+'CostMinor']!=='')v.costMinor=input[pre+'CostMinor'];if(v.costRateMinor!==undefined||v.costMinor!==undefined)v.costReference=input[pre+'CostReference'];return v})
 }
 return input
}
