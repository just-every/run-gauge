import type { Row, Value } from './model'
import type { Report } from './ui-describe'
import { escape as e, form, input, amount, choices } from './ui-forms'
import { money } from './ui-format'

export function lateFeeTermsFields(terms?: Value | null) {
 return `<details class="g-field--wide"><summary>Agreed late-fee terms</summary><p>Record an existing agreement for future invoices. Missing terms grant no fee entitlement. Issued invoices keep their frozen terms.</p>`
  + choices('lateFeeMode', 'Late-fee agreement', ['none', 'monthly-percentage'], terms?.mode ?? 'none')
  + input('lateFeeRateBasisPoints', 'Monthly rate (150 means 1.5%)', terms?.rateBasisPoints ?? '', 'number', false)
  + amount('lateFeeCapDollars', 'Agreed total fee cap in client currency', terms?.capMinor ?? '', false)
  + input('lateFeeAgreedOn', 'Agreement date', terms?.agreedOn ?? '', 'date', false)
  + input('lateFeeReference', 'Agreed terms reference', terms?.reference ?? '', 'text', false) + '</details>'
}

/** Extend the existing invoice card with the ordinary preview and decision forms. */
export function lateFeeControls(d: Report['data'], invoice: Row, today: string, preview?: Value) {
 const terms = invoice.value.lateFeeTerms, drafts = d.lateFeeDrafts.filter(r => r.value.invoiceId === invoice.id)
 const history = drafts.map(r => `<li id="late-fee-${e(r.id)}">${money(r.value.amountMinor, r.value.currency)} · Awaiting finance approval · ${e(r.value.periodStart)} to ${e(r.value.periodEnd)} · principal ${money(r.value.principalMinor, r.value.currency)} · ${e(r.value.reason)} · <a href="/api/gauge/history/lateFeeDrafts/${e(r.id)}">Draft record history</a></li>`).join('')
 const current = preview?.invoiceId === invoice.id ? preview : undefined
 const proposal = current ? form('invoice:late-fee-draft', 'Review late-fee preview', `<p>${money(current.principalMinor, current.currency)} unpaid principal × ${e(current.terms.rateBasisPoints / 100)}% = ${money(current.amountMinor, current.currency)} after cent rounding and the agreed ${money(current.terms.capMinor, current.currency)} cap.</p><p>${e(current.periodStart)} to ${e(current.periodEnd)} · ${e(current.notice)}</p><input type="hidden" name="asOf" value="${e(current.asOf)}"><input type="hidden" name="fingerprint" value="${e(current.fingerprint)}">` + input('reason', 'Draft reason'), invoice, 'Create late-fee draft', 'g-bare') : ''
 const prepare = terms && !drafts.length ? `<details><summary>Preview a late-fee draft</summary>${form('invoice:late-fee-preview', 'Late-fee preview', input('asOf', 'Preview as of', today, 'date'), invoice, 'Preview late fee', 'g-bare')}</details>` : ''
 return `<section class="g-block"><h4>Late-fee drafts</h4><p>${terms ? `Frozen agreement: ${e(terms.rateBasisPoints / 100)}% monthly · cap ${money(terms.capMinor, terms.currency)} · ${e(terms.agreedOn)} · ${e(terms.reference)}` : 'No agreed late-fee terms were frozen with this invoice.'}</p>${proposal}${prepare}${history ? `<ul>${history}</ul><p>Drafts change no invoice, receivable, cash or payment. Fee approval and issuance are unavailable.</p>` : ''}</section>`
}
