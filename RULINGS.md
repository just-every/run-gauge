# Gauge rulings

The entries below retain ct's numbers and wording. They change no clause status.

### RL-101 — Payments use the agency merchant account

Date: 2026-10-28 · Ruled by: ct · Governs: `BOUNDARY-002`.

**Question.** May Gauge issue owner-reviewed invoice and refund instructions while the agency processor retains funds and sensitive payer information?

**Proposed/adopted default.** Native owner only exact audited invoice instructions and typed refund authorization; Stripe custody, canonical metadata, explicit readback and disconnected restore.

**Outcome: adopt with rider.** Gauge shall issue only currently authorized exact invoice/refund instructions to the agency’s own merchant account, retain safe processor references and distinguish payment success, available balance and payout reconciliation.

**Why.** Kantata separates financial authority by project, while Harvest uses the business’s Stripe connection. No common norm establishes native owner only review of every processor read; that is an approved interim control, not a completed finance role model.

**Rider.** Keep BOUNDARY-002’s processor custody rule in one seed door rule cited by PAYMENT-001/002/003 and CONNECT-001; finance delegation and client self-service remain due, and sandbox evidence never establishes live onboarding or bank reconciliation.

**Place once.** One payment door rule; each affected clause cites it.

**Incumbent/source behavior.**

- [Kantata invoice API access requires the participant’s project financial permission.](https://developer.kantata.com/kantata/specification)
- [Harvest connects the business’s Stripe account; ACH remains pending until a later processor outcome and available funds are distinct.](https://support.getharvest.com/hc/en-us/articles/360048181232-Picking-an-online-payment-integration)

**Engineering/proof distinction.** Card settlement, ACH capability and payout composition are provider/proof work; this ruling grants no merchant login, paid account or launch authorization.

Main reference: `CONTRACT.md:343` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-102 — GitHub

Date: 2026-10-28 · Ruled by: ct · Governs: `CONNECT-007`.

**Question.** May the initial GitHub evidence door remain owner-only without granting source evidence financial or client authority?

**Proposed/adopted default.** Owner connects a sealed GitHub App for installed repositories, reads safe issue/PR metadata, approves exact milestone effects and once-only issue follow-ups.

**Outcome: adopt with rider.** Approve the bounded owner-operated GitHub App door, with exact repository/project bindings, current authorization at read and execution, no billability from a commit or merge and no automatic retry after an uncertain issue write.

**Why.** Kantata’s project model permits scoped staff capabilities, not an inherent permanent owner monopoly. The narrow currently built door is safe while delegated visibility is completed; its project role limits are product work.

**Rider.** Lead/staff project-authorized evidence visibility, scheduled/webhook ingestion and the scoped token alternative remain acceptance obligations; neither GitHub evidence nor owner review substitutes for client acceptance or finance approval.

**Place once.** CONNECT-007 owns one acceptance point for delegated visibility and effect separation.

**Incumbent/source behavior.**

- [Kantata grants project-scoped task and financial capabilities and restricts external client participants.](https://knowledge.kantata.com/hc/en-us/articles/115002779293-Project-Permissions)

Main reference: `CONTRACT.md:232` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-103 — Zapier and Crank automation

Date: 2026-10-28 · Ruled by: ct · Governs: `CONNECT-016`.

**Question.** May explicit owner release govern the current signed automation carrier while unattended subscriptions and callbacks remain unfinished?

**Proposed/adopted default.** Exact owner-reviewed source release, sealed signed hooks, version-bound durable jobs and one authenticated reviewed nonbillable follow-up; unattended dispatch disabled.

**Outcome: adopt with rider.** Approve explicit owner release for current events and exact permitted callbacks, binding source revision, destination, event identity and resulting action, with current authority and durable duplicate suppression.

**Why.** Kantata authorizes by participant/project capability, and Zapier publishes configured workflows for automatic execution. No common norm requires a human release of every future event: the present prohibition is an interim boundary, not fulfillment of automation.

**Rider.** Keep the release/standing authorization rule once in the automation door rule: a future reviewed subscription can authorize its bounded events, while authority loss stops new effects; build unattended subscriptions and reconcile unknown remote outcomes before reuse.

**Place once.** One automation door rule cited by CONNECT-016; retain unattended acceptance.

**Incumbent/source behavior.**

- [Kantata grants project-scoped task and financial capabilities and restricts external client participants.](https://knowledge.kantata.com/hc/en-us/articles/115002779293-Project-Permissions)
- [Zapier Copilot outlines, configures and tests workflows; publishing turns the Zap on, with restricted enterprise publishing subject to approval.](https://help.zapier.com/hc/en-us/articles/15703650952077-Use-the-power-of-AI-to-generate-Zaps)
- [Stripe describes signature verification, unique event identities, duplicate delivery and out-of-order outcomes requiring safe processing.](https://stripe.dev/blog/building-resilient-webhook-handlers-aws-dlqs-stripe-events)

**Engineering/proof distinction.** Crank trigger credentials cannot read whole-run outcomes; a missing least-privilege status endpoint is sibling engineering, not a pending ct policy.

Main reference: `CONTRACT.md:250` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-104 — Connector health and reconciliation

Date: 2026-10-28 · Ruled by: ct · Governs: `CONNECT-019`.

**Question.** May the current reconciliation door read only exact existing Gauge sources without discovering new mailboxes or audiences?

**Proposed/adopted default.** Native owner only read-only reconciliation against existing Gauge source bindings, with sealed credentials and checkpoints.

**Outcome: adopt with rider.** Approve explicit read-only reconciliation of existing source bindings; show source scope, last success, cursor, lag and unresolved differences without expanding access or advancing a failed page.

**Why.** Kantata’s scoped project access supports least-privilege inspection. No common incumbent norm for the seed’s exact retained manifest design was established; preventing new discovery or disclosure is the chosen safe interim default.

**Rider.** The current bounded manifest does not satisfy provider-wide backfill, general pagination, periodic execution or dead-letter recovery; current rights must be rechecked on resumed work and restored history grants no provider access.

**Place once.** CONNECT-019 owns the single reconciliation acceptance point and cites provider custody.

**Incumbent/source behavior.**

- [Kantata grants project-scoped task and financial capabilities and restricts external client participants.](https://knowledge.kantata.com/hc/en-us/articles/115002779293-Project-Permissions)
- [Rocketlane exports the current report view; export size limits and filters can bound the records supplied.](https://help.rocketlane.com/support/solutions/articles/67000729056-guide-to-setting-up-and-managing-custom-reports)

**Engineering/proof distinction.** Crank run-status availability and broader connector paging/recovery are engineering gaps.

Main reference: `CONTRACT.md:256` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-105 — Branded invoice delivery

Date: 2026-10-28 · Ruled by: ct · Governs: `INVOICE-003`.

**Question.** May the owner dispatch an exact issued invoice under separate audited mail consent while hosted access remains independently revocable?

**Proposed/adopted default.** Separate owner-only queue and dispatch for an exact issued invoice/recipient/sender/PDF, 1–30 day hosted access, immediate revocation and no restored authority.

**Outcome: adopt with rider.** Approve exact-recipient invoice email following separate explicit dispatch consent, preserving issued artifact bytes and provenance, distinguishing provider admission, delivery, bounce and hosted view, and withholding automatic resend on uncertainty.

**Why.** Kantata assigns invoice operations to financial participants and Harvest invoices can be sent under invoice rights. Neither establishes the exact owner-only thirty-day convention as a category norm; it is a safe interim choice.

**Rider.** Revoking hosted access stops subsequent hosted reads but cannot recall an already delivered attachment; delegated finance sending and client delivery obligations remain due under their clauses, and consent does not prove delivery.

**Place once.** INVOICE-003 owns one delivery acceptance point; cite existing exact-document access rule rather than repeat it.

**Incumbent/source behavior.**

- [Kantata invoice API access requires the participant’s project financial permission.](https://developer.kantata.com/kantata/specification)
- [Harvest permits invoice operations to administrators and managers with invoice rights, with currency and payment state explicit.](https://help.getharvest.com/api-v2/invoices-api/invoices/invoices/)

Main reference: `CONTRACT.md:177` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-106 — Rocketlane move-in

Date: 2026-10-28 · Ruled by: ct · Governs: `MIGRATE-008`.

**Question.** May an owner record an exact-source migration comparison without authorizing operational cutover or financial ownership transfer?

**Proposed/adopted default.** Explicit audited owner comparison receipt only; no automatic provider action, deletion, financial transfer or payment authority.

**Outcome: adopt with rider.** Approve an attributed comparison receipt bound to the exact Rocketlane captures, maps and reconciliation totals; it acknowledges reviewed differences and grants no cutover, deletion, billing or collection authority.

**Why.** Rocketlane report exports can be bounded current views; Kantata distinguishes project financial authority. No common norm lets an import receipt act as cutover consent, so the safest default separates them.

**Rider.** MIGRATE-008’s comparison acceptance must name omitted records and unresolved totals; actual cutover stays an explicit owner-reserved decision under MIGRATE-010 and may not be inferred from comparison or restored metadata.

**Place once.** MIGRATE-008 owns comparison; reference MIGRATE-010 for cutover once.

**Incumbent/source behavior.**

- [Rocketlane exports the current report view; export size limits and filters can bound the records supplied.](https://help.rocketlane.com/support/solutions/articles/67000729056-guide-to-setting-up-and-managing-custom-reports)
- [Kantata invoice API access requires the participant’s project financial permission.](https://developer.kantata.com/kantata/specification)

**Engineering/proof distinction.** Operational ownership workflow and full retirement/parallel-run proof remain unfinished; owner-reserved cutover is separate from the ct-resolvable receipt semantics.

Main reference: `CONTRACT.md:290` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-107 — Stripe card and ACH payment links

Date: 2026-10-28 · Ruled by: ct · Governs: `PAYMENT-001`.

**Question.** May the current card/ACH instruction door require exact native owner release and canonical test/live mode checks?

**Proposed/adopted default.** Only the native owner releases an exact invoice instruction, with canonical Stripe mode, no raw payer credentials, automatic collection or new recipient access.

**Outcome: adopt with rider.** Approve the current exact invoice instruction door with agency merchant custody, explicit amount/currency/mode and source revision, while leaving payer authorization to the hosted processor and ACH pending until its authoritative outcome.

**Why.** Harvest’s card/ACH integration supports business Stripe accounts and explicitly pending ACH. Owner review of every instruction is the seed’s narrower interim default, not a claim that competitors prohibit delegation or automatic recurring payment.

**Rider.** Retain card and ACH completion/settlement acceptance, finance delegation and separate recurring authorization; a test payment or saved instruction never authorizes live collection.

**Place once.** PAYMENT-001 cites the shared payment door rule established by Gauge RL-101.

**Incumbent/source behavior.**

- [Harvest connects the business’s Stripe account; ACH remains pending until a later processor outcome and available funds are distinct.](https://support.getharvest.com/hc/en-us/articles/360048181232-Picking-an-online-payment-integration)
- [Kantata invoice API access requires the participant’s project financial permission.](https://developer.kantata.com/kantata/specification)

**Engineering/proof distinction.** Enabled US ACH test merchant access is an external account/capability dependency; no approval is invented and no settlement is inferred.

Main reference: `CONTRACT.md:189` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-108 — Reconcile processor outcomes

Date: 2026-10-28 · Ruled by: ct · Governs: `PAYMENT-002`.

**Question.** May signed callbacks remain evidence-only while exact audited human instructions control refunds and canonical readback controls allocations?

**Proposed/adopted default.** Verified callbacks record canonical metadata only; typed exact owner refunds and explicit readback change balances.

**Outcome: adopt with rider.** Approve verified callbacks as safe durable evidence and exact currently authorized refunds; derive allocation changes from canonical current processor state with stable identities so duplicates, disorder, returns and retries cannot double-count cash.

**Why.** Stripe documents duplicate and out-of-order events; Harvest automatically records authoritative payment outcomes. No common norm requires manual readback forever, so it remains a safe interim execution boundary.

**Rider.** Implement required periodic readback and all dispute/fee/payout/ACH-return states without dropping signed event evidence, and retain append-only linked corrections; this approval does not waive unattended reconciliation.

**Place once.** PAYMENT-002 owns reconciliation acceptance and cites Gauge RL-101’s shared custody rule.

**Incumbent/source behavior.**

- [Stripe describes signature verification, unique event identities, duplicate delivery and out-of-order outcomes requiring safe processing.](https://stripe.dev/blog/building-resilient-webhook-handlers-aws-dlqs-stripe-events)
- [Harvest supports invoice card and ACH payments and automatic recording of processor payments.](https://www.getharvest.com/integrations/stripe)

Main reference: `CONTRACT.md:191` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

### RL-109 — US agency setup

Date: 2026-10-28 · Ruled by: ct · Governs: `SETUP-001`.

**Question.** May the stored EIN remain owner-only and absent from routine invoice, export and audit views?

**Proposed/adopted default.** Owner-only EIN; finance can read business/address but not EIN; public documents omit it; approved rates retain their existing ruling.

**Outcome: adopt with rider.** Adopt the privacy default that the EIN is restricted to the native owner and excluded from routine documents, staff state/history and general exports/audits; business identity and address remain available to permitted financial users.

**Why.** No common norm established for EIN disclosure: Kantata documents granular financial rights and Harvest exposes business identity and configurable invoice fields. Neither establishes a requirement to print or broadly disclose an EIN; minimum routine disclosure is the chosen safe default.

**Rider.** Preserve owner-controlled access to the retained EIN through the authorized complete-data custody path; do not delete it from the owner’s portable business records merely because general exports omit it.

**Place once.** SETUP-001 owns the EIN visibility point; portable records cite the applicable Base custody duty.

**Incumbent/source behavior.**

- [Kantata separates account administration, project leadership and financial privileges.](https://knowledge.kantata.com/hc/en-us/articles/203041364-Account-Permissions)
- [Harvest permits invoice operations to administrators and managers with invoice rights, with currency and payment state explicit.](https://help.getharvest.com/api-v2/invoices-api/invoices/invoices/)

Main reference: `CONTRACT.md:71` at `28d35e67441b58375e1ff081c2a3f42c441431d8`; current Status Gap was read in full. Route: `round`.

## Historical rulings moved from the legacy contract

### RL-1 — Explicit merge terms choice

Date: 2026-10-20T23:45:00Z · Ruled by: ct · Governs: `SETUP-002`, `SETUP-007`, `SETUP-008`.

A merge keeps the surviving client’s payment terms; a terms conflict is an explicit finance choice, never silent.

### RL-2 — Rate approval authority

Date: 2026-10-23 · Ruled by: ct · Governs: `SETUP-003`.

Owner-only rate approval is attributed to its approver.

### RL-3 — Offline acceptance carrier

Date: 2026-10-22 · Ruled by: ct · Governs: `SALES-002`, `SALES-007`.

Only the owner records reported external acceptance; client identity remains unverified, with SALES-003 becoming primary for released proposals.

### RL-4 — Native confirmed-email client carrier

Date: 2026-10-22 · Ruled by: brief · Governs: `SALES-003`, `SALES-008`, `SALES-009`, `SALES-010`.

The owner prepares, explicitly sends or revokes complete immutable proposals; an invited confirmed-email recipient supplies deliberate exact-version decisions.

### RL-5 — Native won conversion

Date: 2026-10-19T16:47:00Z · Ruled by: ct · Governs: `SALES-004`, `SALES-011`.

Finance or owner converts a won native opportunity into one linked engagement, draft fixed terms and open role requests, with unplaced seconds visible.

### RL-6 — Independent internal reviewer

Date: 2026-10-25 · Ruled by: ct · Governs: `SALES-005`, `SALES-012`.

A different owner or finance person reviews; one person cannot self-review through another role/account, and internal approval grants no client acceptance or business-effect authority.

### RL-7 — Retainer setup authority

Date: 2026-10-19T04:33:00Z · Ruled by: ct · Governs: `RETAINER-001`, `RETAINER-006`, `RETAINER-007`.

Lead/finance setup rights and manager-visible terms are preserved; the legacy agent restriction is exercised under a company policy holding money/commitment writes and sensitive amount reads, not a shipped disposition.

### RL-8 — Finance-only period fee

Date: 2026-10-21T00:30:00Z · Ruled by: ct · Governs: `RETAINER-001`, `RETAINER-006`, `RETAINER-007`.

Fees are immutable integer-cent amounts per full commercial period, separate from allowance and finance-only.

### RL-9 — Working-day service fee earning

Date: 2026-10-21 · Ruled by: scope54 · Governs: `RETAINER-001`, `RETAINER-006`, `RETAINER-007`.

Service fees prorate on saved working days, earn through inclusive as-of day and reconcile via cumulative month slices.

### RL-10 — Staff statement privacy

Date: 2026-10-19T05:52:00Z · Ruled by: ct · Governs: `RETAINER-003`, `RETAINER-009`.

Assigned staff receive hour-unit statements and their own source work, without commercial monetary values/rates.

### RL-11 — Exact-family allocation

Date: 2026-10-19T06:03:00Z · Ruled by: ct · Governs: `RETAINER-003`, `RETAINER-009`.

Lead/finance resolves ambiguous approved work with an audited reason and exact revision; reserved or approved billing sources cannot move.

### RL-12 — Correction review value

Date: 2026-10-19T20:50:00Z · Ruled by: ct · Governs: `RETAINER-004`, `RETAINER-010`, `RETAINER-011`, `RETAINER-012`.

GOVERN-001 applies to the greater of absolute cash and priced allowance change; unpriced changes require an independent approver whenever a limit exists.

### RL-13 — Native automatic issue consent

Date: 2026-10-22 · Ruled by: ct · Governs: `RETAINER-005`, `RETAINER-013`, `RETAINER-014`.

Finance/owner enables one bounded schedule revision; batches recheck live authority and issue only valid exception-free native invoices.

### RL-14 — Leave privacy and decision riders

Date: 2026-10-23 · Ruled by: ct · Governs: `RESOURCE-003`, `RESOURCE-007`.

Owner-only revision-bound audited decisions; private fixed categories, scoped in-app lead alerts, reviewed native/compatibility requests and redacted audit exports.
