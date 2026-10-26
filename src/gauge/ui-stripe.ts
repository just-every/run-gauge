import { type Row, sum } from './model'
import { escape as e, amount, form, input, select, decision, table, check } from './ui-forms'
import { money } from './ui-format'

const stripeConnections = (report: any): Row[] => report.data.providerConnections.filter((r: Row) => r.value.provider === 'stripe' && !r.value.revokedAt)
const methodName = (method: string) => method === 'us_bank_account' ? 'ACH bank payment' : method === 'card' ? 'Card' : method

/** Only a hosted Stripe address is made clickable; stored provider text is escaped. */
function checkoutAddress(value: unknown): string {
 if (typeof value !== 'string' || !value) return '<span>Checkout address not available</span>'
 try {
  const url = new URL(value)
  if (url.protocol === 'https:' && ['checkout.stripe.com', 'buy.stripe.com'].includes(url.hostname) && !url.username && !url.password)
   return `<a class="g-link" href="${e(url.href)}" target="_blank" rel="noopener noreferrer">Open Stripe checkout</a>`
 } catch { /* An invalid provider address must never become a navigation target. */ }
 return '<span>Checkout address requires reconciliation</span>'
}

function processorPayment(payment: Row, currency: string, connected: boolean): string {
 const v = payment.value
 const refundable = v.refundableMinor
 const instruction = `Refund ${refundable} ${currency} for payment ${payment.id}`
 const refund = connected && refundable > 0 ? `<details><summary>Refund payment</summary>${form('stripe:refund', 'Refund through Stripe', amount('amountDollars', `Refund amount (${currency})`, refundable) + input('reason', 'Refund reason') + `<p>For the amount shown, type <code>${e(instruction)}</code> below. For a partial refund, replace ${e(refundable)} with the chosen amount in integer cents.</p>` + input('ownerInstruction', 'Type refund instruction to authorize') + '<p>Stripe executes the refund under your agency merchant agreement. Reconcile its outcome before treating it as complete.</p>', payment, 'Request refund', 'g-bare')}</details>` : ''
 return `<li><strong>${e(v.paymentIntentId)}</strong> · ${e(v.status)}
  <p>Payment ${money(v.amountMinor, currency)} · Pending ${money(v.pendingMinor, currency)} · Settled ${money(v.settledMinor, currency)}</p>
  <p>Refunded ${money(v.refundedMinor, currency)} · Disputed ${money(v.disputedMinor, currency)} · Returned ${money(v.returnedMinor, currency)} · Fees ${money(v.feeMinor, currency)} · Net ${money(v.netMinor, currency)}</p>
  <p>Allocated to invoice ${money(v.allocatedMinor, currency)} · Unapplied ${money(v.unappliedMinor, currency)}</p>
  <p>Payout reference: ${v.payoutId ? e(v.payoutId) : 'Not reported by Stripe'} · ${e(v.payoutStatus)}. Settlement and payout are separate outcomes.</p>${refund}</li>`
}

/** Called only within the native owner's invoice view. All writes bind exact revisions. */
export function stripeInvoiceControls(report: any, invoice: Row, today: string, connected: ReadonlySet<string>): string {
 const d = report.data, v = invoice.value
 const links: Row[] = d.paymentLinks.filter((r: Row) => r.value.invoiceId === invoice.id)
 const payments: Row[] = d.processorPayments.filter((r: Row) => r.value.invoiceId === invoice.id)
 const corrections: Row[] = d.invoiceCorrections.filter((r: Row) => r.value.invoiceId === invoice.id && r.value.status === 'issued')
 const voided = corrections.some(r => r.value.type === 'void')
 const recorded = sum(d.payments.filter((r: Row) => r.value.invoiceId === invoice.id).map((r: Row) => r.value.amountMinor))
 const open = voided ? 0 : Math.max(0, v.totalMinor - recorded - sum(corrections.map(r => r.value.amountMinor)))
 const connections = stripeConnections(report).filter(r => connected.has(r.id) && d.stripeAccounts.some((a: Row) => a.value.connectionId === r.id && (a.value.testMode || (a.value.chargesEnabled && a.value.detailsSubmitted && !a.value.disabledReason))))
 const accounts = connections.map(r => ({ ...r, value: { name: r.value.accountLabel } }))
 const methods: Row[] = [{ id: 'card', revision: '', value: { name: 'Card' } }, { id: 'us_bank_account', revision: '', value: { name: 'ACH bank payment' } }]
 let body = '<p>Pending payments are separate from settled cash. ACH can fail or return after submission; refunds and disputes can reopen an invoice. Reconcile Stripe before creating another link after an uncertain request.</p>'
 if (open > 0 && accounts.length) body += form('stripe:checkout', 'Create Stripe payment link', select('connectionId', 'Agency Stripe account', accounts) + select('method', 'Payment method', methods) + amount('amountDollars', `Amount to collect (${v.currency})`, open) + check('testMode', 'Stripe test mode (no real money)', true), invoice, 'Create payment link', 'g-bare')
 else if (open > 0) body += '<p>Connect and check your agency Stripe account on Access before creating a payment link.</p>'
 if (links.length) body += `<ul>${links.map(link => {
  const p = link.value
  return `<li>${e(methodName(p.method))} · ${money(p.amountMinor, p.currency)} · ${e(p.status)}<p>${connected.has(p.connectionId)&&d.providerConnections.some((c:Row)=>c.id===p.connectionId&&c.value.version===p.credentialVersion)?checkoutAddress(p.url):'Reconnect and review this historical payment instruction'} · Session ${e(p.sessionId)}</p>${p.exceptionClass ? `<p>Reconciliation exception: ${e(p.exceptionClass)}</p>` : ''}${connected.has(p.connectionId)?decision('stripe:reconcile', 'Reconcile Stripe payment', link, false, 'secondary'):''}</li>`
 }).join('')}</ul>`
 else body += '<p>No Stripe payment links for this invoice.</p>'
 if (payments.length) body += `<h4>Processor payments</h4><ul>${payments.map(p => processorPayment(p, v.currency, connected.has(p.value.connectionId))).join('')}</ul>`
 const eventRows: Row[] = d.processorEvents.filter((r: Row) => r.value.invoiceId === invoice.id)
 if (eventRows.length) body += `<details><summary>Processor event trace</summary><ul>${eventRows.map(r => `<li>${e(r.value.eventId)} · ${e(r.value.type)} · ${e(r.value.status)}</li>`).join('')}</ul></details>`
 return `<section class="g-card g-stripe" id="stripe-${e(invoice.id)}"><details><summary>${e(v.number)} · Stripe payments</summary>${body}<p>Invoice currency ${e(v.currency)} · reviewed as of ${e(today)}.</p></details></section>`
}

/** Setup belongs beside the existing provider connection form, with no banking fields. */
export function stripeSetupSection(report: any, origin: string): string {
 const connections = stripeConnections(report)
 let body = '<p>Use your agency’s own Stripe merchant account and merchant agreement. Stripe handles collection, settlement, refunds and all card and bank details; Gauge holds no money.</p><ol><li>Complete onboarding in the Stripe Dashboard and confirm that your business is eligible under Stripe’s restricted-business requirements before collecting payments.</li><li>Configure the Stripe webhook endpoint at this installation’s HTTPS origin followed by <code>/api/gauge/stripe/webhook</code>.</li><li>In the existing Connect provider form, choose Stripe and enter compact JSON with <code>secretKey</code> and <code>webhookSecret</code> in the password field labeled Provider credential. Enter secrets only in that field; never in account labels, notes or invoice references.</li><li>Check the connected account below before creating an invoice payment link. Card and ACH availability depend on that account’s Stripe capabilities.</li></ol>'
 body += form('stripe:payout', 'Trace a Stripe payout', select('connectionId', 'Agency Stripe account', connections.map(r=>({...r,value:{name:r.value.accountLabel}}))) + input('payoutId', 'Stripe automatic payout reference'), undefined, 'Reconcile payout', 'g-bare')
 body += table('Agency Stripe accounts', connections, [
  { label: 'Account', wrap: true, line: 1, cell: r => e(r.value.accountLabel) + `<span class="g-sub">Webhook: <code>${e(origin)}/api/gauge/stripe/webhook?connectionId=${e(r.id)}</code></span>` },
  { label: 'Stripe readiness', wrap: true, line: 2, cell: r => {
   const account = report.data.stripeAccounts.find((a: Row) => a.value.connectionId === r.id)?.value
   return account ? `${e(account.status)}<span class="g-sub">Charges ${account.chargesEnabled ? 'enabled' : 'disabled'} · Payouts ${account.payoutsEnabled ? 'enabled' : 'disabled'} · Details ${account.detailsSubmitted ? 'submitted' : 'incomplete'}</span>` : 'Account check required'
  } },
  { label: 'Requirements', wrap: true, line: 3, cell: r => {
   const account = report.data.stripeAccounts.find((a: Row) => a.value.connectionId === r.id)?.value
   if (!account) return 'Check the account to read Stripe requirements.'
   return `${account.disabledReason ? e(account.disabledReason) + '<br>' : ''}Currently due: ${e(account.currentlyDue.join(', ') || 'None reported')}<span class="g-sub">Past due: ${e(account.pastDue.join(', ') || 'None reported')} · Pending verification: ${e(account.pendingVerification.join(', ') || 'None reported')}</span><a class="g-link" href="https://dashboard.stripe.com/account/status" target="_blank" rel="noopener noreferrer">Complete Stripe onboarding</a>`
  } },
 ], r => decision('stripe:account', 'Check Stripe account', r, false, 'secondary'), 'No agency Stripe account connected.')
 body += table('Stripe payout reconciliation', report.data.processorEvents.filter((r:Row)=>r.value.type==='payout'), [{label:'Payout',wrap:true,line:1,cell:r=>e(r.value.payoutId)},{label:'Outcome',wrap:true,line:2,cell:r=>e(r.value.status)+(r.value.reconciled?' · Reconciled':' · Difference requires review')},{label:'Amount',wrap:true,line:3,cell:r=>money(r.value.amountMinor,r.value.currency)+' · Fees '+money(r.value.feeMinor,r.value.currency)+' · Difference '+money(r.value.differenceMinor,r.value.currency)}])
 return `<section class="g-block g-stripe" id="stripe-setup"><h2>Stripe payment setup</h2>${body}</section>`
}
