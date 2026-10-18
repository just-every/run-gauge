// 08 "Invoiced from the accepted milestone.": invoice 1047 as a document (Northbound's own logo is a copper "N" tile,
// never a diamond, so it cannot read as Gauge's mark), with Treasure Valley's cap and Cascade's fee beside it.
import { dot, to, nw, swatch, head } from './parts'

const status = [['Draft ready', '8:30 am'], ['Jess approved', '8:58 am'], ['Sent', '9:02 am'], ['QuickBooks Online', '9:03 am'], ['Viewed by Lena', '11:40 am']]
const invoice = '<div class="card inv"><div class="inv-top"><div class="inv-from"><span class="nb-logo" aria-hidden="true">N</span><div><p class="inv-studio">Northbound Studio</p><p class="quiet">Portland, OR 97214</p></div></div><p class="inv-number">Invoice 1047</p></div>'
 + '<div class="inv-bill"><p class="inv-label">Bill to</p><p class="inv-client">Cascade Cider Co.</p><p>attn. Lena Ortiz</p><p>Hood River, OR 97031</p></div>'
 + `<p class="inv-terms">Issued ${nw('Mon Oct 5, 2026')}${dot}Net 30${dot}Due ${nw('Wed Nov 4')}</p>`
 + '<table class="inv-lines"><thead><tr><th scope="col">Description</th><th scope="col">Amount</th></tr></thead><tbody>'
 + `<tr><td><p class="inv-item">Site &amp; brand rebuild${dot}Milestone 2 of 3</p><p class="quiet">Design system and page templates</p><p class="quiet">Accepted by Lena Ortiz${dot}${nw('Fri Oct 2')}</p></td><td>$28,800.00</td></tr></tbody>`
 + '<tfoot><tr><th scope="row">Sales tax</th><td>$0.00</td></tr><tr class="inv-total"><th scope="row">Total</th><td>$28,800.00</td></tr></tfoot></table>'
 + `<p class="inv-billed">Billed to date <b>${nw('$57,600.00')}</b> of <b>${nw('$86,400.00')}</b>${dot}milestone 3 at launch ${nw('Fri Nov 13')}</p>`
 + '<p class="inv-pay"><span class="button-look button-look--wide">Pay by card or ACH</span></p>'
 + `<ol class="inv-status" role="list">${status.map(([what, when]) => `<li><span class="hc-dot" aria-hidden="true"></span><p>${what === 'QuickBooks Online' ? nw(`${what} <span class="ok">✓</span>`) : what}<br><span class="quiet">${when}</span></p></li>`).join('')}</ol></div>`

const cap = `<div class="card side"><div class="side-head">${swatch('treasure')}<p><b class="card-title">Treasure Valley Clinics</b>${dot}Boise, ID</p></div><p class="side-sub">Hourly $150${dot}not-to-exceed ${nw('$10,000')}</p>`
 + `<span class="capbar" role="img" aria-label="$9,450 of $10,000 billed"><i></i></span><p>${nw('$9,450')} billed${dot}${nw('$550')} left</p><div class="side-rule"></div><p class="quiet-ink">October${dot}4.5 approved hrs</p>`
 + `<p>${nw('3 hrs 40 min')}${to}${nw('$550.00')} billed${dot}invoice 1061${dot}${nw('Mon Nov 2')}</p><p class="held">${nw('50 min')}${dot}${nw('$125.00')} held over cap, not billed</p></div>`
const fee = `<div class="card side side--short"><div class="side-head">${swatch('cascade')}<p><b class="card-title">Cascade Cider</b></p></div><p class="side-sub">${nw('$86,400')} fixed fee${dot}forecast margin 31%</p></div>`

export function invoiceSection() {
 return `<section class="band band--white" aria-labelledby="invoice-title"><div class="wrap inv-grid"><div class="inv-copy">${head('invoice-title', 'Invoice&nbsp;· Cascade Cider&nbsp;· Mon Oct 5', 'Invoiced from the accepted milestone.', 'Lena accepts milestone 2 on Friday. On Monday the invoice is drafted, approved and sent with a card and ACH link, and it lands in QuickBooks.')}`
  + `${cap}${fee}</div>${invoice}</div></section>`
}
