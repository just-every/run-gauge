A billing packet is one clean list of approved work for your bookkeeper. Gauge makes sure each hour, expense or milestone is billed once.

## Prepare a packet

On **Billing**, **Prepare packet** takes an engagement, a **Packet title** and the **Eligible source lines** to include: approved, unbilled hourly time, approved reimbursable expenses and approved fixed-fee milestones. A draft packet reserves its exact sources, so the same source cannot go into a second packet at the same time. Every source must match the engagement currency. The packet, its adjustments and the downloaded CSV retain that currency; Gauge refuses mixed currencies and performs no conversion.

## Approve and download

**Approve exact packet** fixes the packet's lines and its CSV: each source with its revision, duration, rate and rounding. **Download approved CSV** returns the same bytes every time, so the file you send your bookkeeper never changes underneath you. Text that a spreadsheet could read as a formula is escaped. **Cancel draft** releases a draft's reservations.

## Corrections

An approved packet never changes. If an amount was wrong, **Prepare adjustment** on the latest packet in that line drafts a linked adjustment packet with the difference, which you approve and download like any other.

## Credit or void an issued invoice

An issued invoice never changes either. On its card, **Credit, discount or write off** issues a numbered credit note against one of its lines, with a reason; a line can never be credited beyond what it billed. **Void and reissue** cancels an invoice that has no receipts or credits and issues a new numbered invoice for the lines you keep: lower or zero a line to leave that amount written down. Credited, voided and written-down work never returns to billing. When the owner has set a review limit, a larger correction waits until another owner or finance person issues it.

Gauge does not send invoices, calculate tax or take payments.


## Stripe payment instructions

The native owner connects the agency Stripe merchant account on Access, checks its requirements, then opens an issued invoice's Stripe payments panel on Billing. Choose card or eligible ACH, enter the exact amount, and create the hosted link. The test-mode choice must match Stripe's reported mode. Payment details are entered at Stripe, and Gauge holds no funds.

Use Reconcile Stripe payment to read current outcomes. Pending money is separate from settled cash; fees, refunds, returns, disputes and unapplied amounts remain explicit. Refunding requires the exact typed owner instruction shown in the payment panel. Access also traces automatic payout membership. Stripe confirmation does not substitute for independent bank reconciliation.

ACH sandbox proof requires an enabled US bank account merchant; the held Australian test account is not enabled. The owner-only authorization and callback policy remain subject to ct approval, so these clauses stay partial.
