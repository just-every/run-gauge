// 09 "A returned payment, collected by card.": invoice 1039's payment ledger (date, event, amount, balance) with the
// claret ACH return, the copy on the right, and the balance and QuickBooks Online rows under it.
import { dot, nw, check, done, flag, head } from './parts'

const ledger: [string, string, string, string, string?][] = [
 ['Thu Oct 8', `ACH initiated${dot}pending, not settled`, '$14,250.00<small>pending</small>', '$14,250.00'],
 ['Mon Oct 12', `ACH returned${dot}insufficient_funds${dot}invoice reopened`, '—', '$14,250.00<small>open</small>', 'return'],
 ['Mon Oct 12, 9:14 am', `Agent drafted a note to Ben Halvorsen with a fresh pay link${dot}Jess sent it ${nw('9:20 am')}`, '—', '$14,250.00', 'agent'],
 ['Wed Oct 14, 2:31 pm', `Paid by card${dot}Stripe fee ${nw('$413.55')} shown separately`, '−$14,250.00', '$0.00', 'paid'],
]
const mark = (kind?: string) => kind === 'return' ? `<span class="lg-mark lg-mark--return">${flag()}</span>` : kind === 'paid' ? `<span class="lg-mark lg-mark--paid">${done()}</span>` : kind === 'agent' ? '<span class="lg-mark lg-mark--agent"></span>' : '<span class="lg-mark lg-mark--pending"></span>'
const ledgerCard = '<div class="card lg"><h3 class="card-title card-title--big">Invoice 1039&nbsp;· Pacific Trail Outfitters</h3>'
 + `<p class="card-sub">August site support${dot}95.0 hrs × $150 = ${nw('$14,250.00')}${dot}issued in Harvest ${nw('Tue Sep 8')}${dot}Net 30</p>`
 + '<div class="lg-scroll" role="region" aria-label="Payment ledger for invoice 1039" tabindex="0"><table class="lg-table"><thead><tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">Amount</th><th scope="col">Balance</th></tr></thead><tbody>'
 + ledger.map(([date, what, amount, balance, kind]) => `<tr class="${kind ? `is-${kind}` : 'is-pending'}"><td><span class="lg-date">${mark(kind)}<span>${date}</span></span></td><td>${what}</td><td class="num">${amount}</td><td class="num"><b>${balance}</b></td></tr>`).join('')
 + '</tbody></table></div></div>'

const balance = `<div class="card bal"><h3 class="card-title">Balance&nbsp;· invoice 1039</h3><dl><div><dt>Paid</dt><dd>$14,250.00</dd></div><div><dt>Credited</dt><dd>$0.00</dd></div><div class="bal-owed"><dt>Owed</dt><dd>$0.00</dd></div></dl><p class="paid-pill">Paid ${check()}</p></div>`
const books = `<div class="card qbo"><h3 class="card-title">QuickBooks Online</h3><ul role="list"><li><span class="ring-sm" aria-hidden="true"></span><p><b>${nw('Thu Oct 8')}</b>${dot}ACH pending${dot}not posted</p></li>`
 + `<li>${done()}<p><b>${nw('Wed Oct 14')}</b>${dot}card payment and fee posted ${check()}<br><span class="quiet">${nw('2:32 pm')}</span></p></li></ul></div>`

export function cashSection() {
 return `<section class="band band--pale" aria-labelledby="cash-title"><div class="wrap cash-grid">${ledgerCard}<div class="cash-side"><div class="cash-copy">${head('cash-title', 'Cash&nbsp;· Pacific Trail&nbsp;· Thu Oct 8 – Wed Oct 14', 'A returned payment, collected by card.', 'Pending ACH never counts as cash. When the bank returns it, the invoice reopens and a fresh pay link goes out the same morning.')}</div>`
  + `<div class="cash-cards">${balance}${books}</div></div></div></section>`
}
