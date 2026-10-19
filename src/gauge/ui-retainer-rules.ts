import { money, hours } from './ui-format'
import type { Value } from './model'
import { input as i, amount, duration, check, escape as e } from './ui-forms'

export function retainerRuleFields(terms:Value,currency:string) {
 const r=terms.rules??{}
 return `<fieldset class="g-field g-field--wide"><legend>Rollover and overages</legend><p>Allowance expires after the selected number of successor periods. Oldest allowance is used first. The cap limits total incoming carry; zero disables rollover. Deficits and billed overages are mutually exclusive.</p>${duration('carryCapHours','Hour carry-over cap',terms.unit==='hours'?r.carryCap??0:0,3600,'any')}${amount('carryCapDollars',`Value carry-over cap (${currency})`,terms.unit==='value'?r.carryCap??0:0)}${i('carryPeriods','Carry expiry (successor periods)',r.carryPeriods??0,'number')}${check('deficit','Carry deficits into the next period',r.deficit)}<label class="g-field"><span>Overage policy</span><select name="overage" aria-label="Overage policy"><option value="held">Hold; do not bill</option><option value="bill" ${r.overage==='bill'?'selected':''}>Bill at agreed rate</option></select></label>${amount('overageRateDollars',`Hour overage rate (${currency}/h)`,terms.unit==='hours'?r.overageRate??0:0)}${i('overagePercent','Value overage rate (%)',terms.unit==='value'?(r.overageRate??10000)/100:100,'number')}</fieldset>`
}
export function describeRetainerRules(t:Value) {
 const r=t.rules??{carryCap:0,carryPeriods:0,deficit:false,overage:'held',overageRate:0}
 return `Carry cap ${e(t.unit==='hours'?hours(r.carryCap):money(r.carryCap,t.currency))} · expires after ${r.carryPeriods} successor periods · deficits ${r.deficit?'carry':'do not carry'} · ${r.overage==='bill'?`overages billed at ${e(t.unit==='hours'?money(r.overageRate,t.currency)+'/h':r.overageRate/100+'%')}`:'overages held from billing'}`
}
