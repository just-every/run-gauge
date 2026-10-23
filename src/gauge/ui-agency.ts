import type { Bindings } from '../auth.server'
import { type Actor, finance } from './store'
import { type Row, workDate } from './model'
import { escape as e, input as i, area, form, select, table, weekdayChecks } from './ui-forms'
import { day, money, when } from './ui-format'
import { currencies } from './agency'
import { fiscalYear, monthName } from './agency-profile'
import { consolidate } from './fx-rates'
import { operatorNames } from './audit'
import type { Report } from './ui-describe'

const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${e(value)}">`
const months: Row[] = Array.from({ length: 12 }, (_, n) => ({ id: String(n + 1), revision: '', value: { name: monthName(n + 1) } }))

/** SETUP-001 on Access: the owner's agency profile, workweek, approved exchange rates and the consolidation they gate. */
export async function agencySection(env: Bindings, a: Actor, report: Report) {
 const profile = report.data.agencyProfiles[0] as Row | undefined, v = profile?.value, address = v?.billingAddress
 const calendar = report.data.agencyCalendars.at(-1) as Row | undefined, fy = v ? fiscalYear(workDate(Date.now(), a.timezone), v.fiscalYearStartMonth) : null
 let html = `<h2 class="g-section-title" id="agency">Agency setup</h2>`
 html += form('agency:profile', 'Agency profile',
  `<p class="g-note">${v ? `${e(v.legalBusiness)} · ${e(address.line1)}${address.line2 ? `, ${e(address.line2)}` : ''}, ${e(address.city)} ${e(address.state)} ${e(address.postalCode)} · reporting currency ${e(a.currency)} · work timezone ${e(a.timezone)}${fy ? ` · ${e(fy.label)} runs ${e(day(fy.start))} to ${e(day(fy.end))}` : ''}` : 'No agency profile yet. The owner sets the legal business and US billing address here; the EIN is owner-only and never printed on a document.'}</p>`
  + i('legalBusiness', 'Legal business name', v?.legalBusiness) + i('addressLine1', 'US billing address', address?.line1) + i('addressLine2', 'Address line 2', address?.line2, 'text', false)
  + i('city', 'City', address?.city) + i('state', 'State (two letters)', address?.state) + i('postalCode', 'ZIP code', address?.postalCode)
  + i('einReference', 'EIN (owner-only)', v?.einReference, 'text', false) + select('fiscalYearStartMonth', 'Fiscal year starts in', months, String(v?.fiscalYearStartMonth ?? 1)) + area('reason', 'Reason for the change'),
  profile, 'Save agency profile')
 html += `<section class="g-card"><h2>Workweek and holidays</h2><p class="g-note">${calendar ? `Working weekdays ${e(calendar.value.calendar.weekdays.join(', '))} (0 is Sunday); ${calendar.value.calendar.holidays.length} holiday date${calendar.value.calendar.holidays.length === 1 ? '' : 's'}; saved ${e(when(calendar.value.savedAt, a.timezone))}.` : 'Monday to Friday with no holidays until the owner saves a calendar.'}</p></section>`
 html += form('agency:calendar', 'Agency calendar version', hidden('previousId', calendar?.id ?? '') + hidden('page', 'access') + weekdayChecks(calendar?.value.calendar.weekdays.join(',') ?? '1,2,3,4,5')
  + i('holidays', 'Agency holidays (comma-separated dates)', calendar?.value.calendar.holidays.join(', ') ?? '', 'text', false) + area('reason', 'Calendar change reason'), undefined, 'Save agency calendar')
 const rates = report.data.fxRates as Row[], names = await operatorNames(env)
 html += table('Approved exchange rates', [...rates].reverse(), [
  { label: 'Currency', line: 1, cell: r => e(`${r.value.currency} → ${r.value.to}`) },
  { label: 'Rate', num: true, line: 1, cell: r => e(r.value.rate) },
  { label: 'Effective', line: 2, cell: r => e(day(r.value.effective)) },
  { label: 'Approved by', line: 2, cell: r => e(`${names.get(r.value.approvedBy) ?? r.value.approvedBy} · ${when(r.value.approvedAt, a.timezone)}`) },
  { label: 'Source', wrap: true, line: 3, cell: r => e(r.value.source) },
 ], undefined, 'No exchange rates approved. Amounts in other currencies stay in their own currency.')
 html += form('fx:approve', 'Approve an exchange rate', select('currency', 'Currency to convert', currencies.filter(c => c !== a.currency).map(c => ({ id: c, revision: '', value: { name: `${c} → ${a.currency}` } })))
  + i('rate', `Rate (one unit of that currency in ${a.currency})`, '', 'text') + i('effective', 'Effective from', '', 'date') + i('source', 'Source (accounting provider or a named published rate)') + area('reason', 'Reason for the rate'), undefined, 'Approve rate')
 return html + await consolidationSection(env, a)
}

/** Finance's read of what can be consolidated: each currency, its approved rate and date, and what stays unconverted. */
export async function consolidationSection(env: Bindings, a: Actor) {
 if (!finance(a)) return ''
 const c = await consolidate(env, a, {}), issued = await consolidate(env, a, {basis:'issued-invoices'})
 const summary = c.complete ? (c.buckets.length ? `Consolidated approved value: ${e(money(c.consolidatedMinor, c.reportingCurrency))}, every amount converted at its labelled rate.` : 'No approved time or expenses yet.')
  : `Not consolidated: no approved ${c.missingRates.map(e).join(', ')} rate for ${c.missingRates.length === 1 ? 'its' : 'their'} work dates. Those amounts stay in their own currency, never as zero; the owner approves a rate on Access. Converted so far: ${e(money(c.knownMinor, c.reportingCurrency))}.`
 const invoiceSummary = `<section class="g-card"><h2>Issued invoice currency totals</h2><p>Face values before credits and receipts. ${issued.complete ? `In ${e(issued.reportingCurrency)}: ${e(money(issued.consolidatedMinor, issued.reportingCurrency))}` : 'Incomplete: an issued amount has no approved dated rate.'}</p><ul>${issued.buckets.map(b => `<li>${e(money(b.amountMinor,b.currency))} → ${b.convertedMinor == null ? 'Unconverted' : e(money(b.convertedMinor,issued.reportingCurrency))} · ${b.conversions.map((c:any)=>e(`${c.rate} from ${day(c.effective)} (${c.source})`)).join('; ') || e(b.status)}</li>`).join('')}</ul></section>`
 return invoiceSummary + table('Currency consolidation', c.buckets.map(b => ({ id: `consolidation-${b.currency}`, revision: '', value: b })), [
  { label: 'Currency', cell: r => e(r.value.currency) },
  { label: 'Approved value', num: true, cell: r => e(money(r.value.amountMinor, r.value.currency)) },
  { label: `In ${c.reportingCurrency}`, num: true, cell: r => r.value.convertedMinor == null ? 'Not converted' : e(money(r.value.convertedMinor, c.reportingCurrency)) },
  { label: 'Rate and date', wrap: true, cell: r => r.value.conversions.length ? r.value.conversions.map((x: any) => e(`${x.rate} from ${day(x.effective)} (${x.source})`)).join('<br>') : r.value.currency === c.reportingCurrency ? 'Reporting currency' : 'No approved rate' },
  { label: 'Status', cell: r => e(r.value.status) },
 ], undefined, 'No approved time or expenses yet.').replace('</h2>', `</h2><p class="g-note">${summary}</p>`)
}
