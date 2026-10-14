# Gauge product contract

Gauge is for the owner or operations lead of an agency of roughly 5–40 people: design, marketing or software work, with staff, contractors, hourly engagements and fixed-fee projects. Its job is to finish each week knowing what was promised, who can deliver it, what the work cost and what is ready to bill.

**First-release outcome.** Each week the agency approves delivered time against scoped work, reviews capacity and margin, and exports one deduplicated billing packet for its own books. Agents may prepare that work; a person with the right authority decides it.

This document sets required behavior. [ACCEPTANCE.md](ACCEPTANCE.md) records which clauses are proven and by which test. A named test is a target until its result is recorded there.

## Operating rules

- A new installation starts empty. People enter or import real records; nothing is seeded.
- Every read and write goes through a native Base session. Each server handler checks the current session, operator and Gauge grant itself, and every write repeats that check inside the same D1 batch that commits it. Route guards and display names confer nothing.
- Every write carries a request key. Repeating the key with the same content returns the first outcome; reusing it for different work is refused.
- Approval binds an exact record revision. A changed record must be approved again; approved records change only through an audited correction that keeps the prior value, actor and reason.
- Money is integer AUD cents. Durations are whole seconds, kept apart from billing rounding. There is no implicit currency conversion.
- Roles: the **owner** holds finance authority and alone assigns grants; **finance** sees rates, costs, billing and import custody; a **lead** approves work on engagements they lead; **staff** record their own work; an **agent** grant names no person and may only prepare and withdraw proposals.

## First release: seventeen clauses

Each clause says what a person can do and the test that proves it. Flow tests run through HTTP against the built Worker with real local D1 (`tests/gauge.mjs`, `tests/gauge-agent.mjs`, `tests/gauge-forecast.mjs`); the browser journey (`tests/fresh-clone.mjs`) runs the same product at 1440 and 390 pixels from a fresh clone with `rer` verbs.

1. **ENGAGEMENT-001 — Set up agreed work.** Finance creates clients and people (with work timezone and contractor flag), an engagement with its responsible lead, assigned members, agreed scope and work timezone, and its tasks and milestones. *Proof:* `ENGAGEMENT-001 real empty account to scoped engagement`.
2. **BUDGET-001 — Agree terms and change orders.** A lead or finance drafts hourly or fixed-fee terms (budget, effort, billing rounding, reason) and approves the exact version; an approved version cannot change, and a change order is a new version beside it. *Proof:* `BUDGET-001 immutable approved terms and additive change orders`.
3. **RATE-001 — Keep rates by effective date.** Finance adds person/service cost and bill rates as effective-dated, immutable versions; approving time freezes the rate that applied, so adding today's rate never rewrites past work. Rates stay private to finance. *Proof:* `RATE-001 effective-dated private rates`; `TIME-002 return, correction and approval of exact revisions` (later rate leaves approved economics unchanged).
4. **CAPACITY-001 — See next month's capacity.** People maintain dated working calendars (including contractor availability) and leave; leads allocate staff as tentative or committed. Gauge shows daily available, committed, tentative and remaining time, flags conflicts on committed work and treats a missing calendar as unknown, not zero. *Proof:* `CAPACITY-001 working calendar, leave and separate tentative staffing`; Forecast import `tests/gauge-forecast.mjs`.
5. **TIME-001 — Record time.** Staff record manual intervals or run a persistent timer, with engagement, task, service, notes, billable flag and explicit IANA timezone. Overlapping intervals and a second running timer are refused. *Proof:* `TIME-001 persistent timer, exact manual duration, parallel exclusion and idempotence`.
6. **TIME-002 — Approve and correct time.** Staff submit; the lead returns with a reason or approves the exact revision; approved time is reopened only through an audited correction and approved again. *Proof:* `TIME-002 return, correction and approval of exact revisions`.
7. **COST-001 — Record expenses with receipts.** Staff add project expenses with receipt files and a reimbursable flag; the lead returns or approves; receipts are fixed at submission and only their owner or finance can download them. *Proof:* `COST-001 expense receipt custody, exact approval and attachment privacy`.
8. **ECONOMICS-001 — Reconcile the engagement.** Finance sees the latest approved budget against approved actual time and cost, billable value and remaining effort, with the source IDs of entries missing a cost or bill rate. Others see hours without private costs. *Proof:* `ECONOMICS-001 approved actual cost and remaining effort`.
9. **BILLING-001 — Draft a billing packet.** Finance selects approved, unbilled hourly work, approved reimbursable expenses or an approved fixed-fee milestone; the draft reserves those exact source revisions, and a concurrent second reservation of the same source fails. *Proof:* `BILLING-001 concurrent source reservations and fixed-fee eligibility`.
10. **BILLING-002 — Approve and export once.** Finance approves the exact draft, which fixes its lines and CSV artifact with source IDs, revisions, durations, rates and rounding; formula-like text is escaped; repeated downloads return the same bytes; a correction is a linked adjustment packet, never an overwrite. *Proof:* `BILLING-002 exact approval, formula-safe repeated exports and linked correction`.
11. **REVIEW-001 — Review the week's exceptions.** The Review page lists missing time against calendars, overspend, capacity conflicts, approved unbilled work, missing bill rates and decisions due (including agent proposals awaiting this person), each linked to its source record. *Proof:* `REVIEW-001 grounded decisions, missing time and capacity exceptions`.
12. **ACCESS-001 — See only permitted work.** Staff see their own work on assigned engagements, leads approve only engagements they lead, private costs and rates stay with finance, and only the owner grants or revokes access; revocation takes effect on the next request, and unauthenticated or unauthorized direct transport calls are refused. *Proof:* `ACCESS-001 native personas, scoped data and direct transport denials`; `ACCESS-001 revocation and minimal replay acknowledgements`.
13. **MOVE-001 — Move in from Harvest and leave whole.** Finance previews a Harvest export package (dry run, no writes), reconciles independent client/month totals, applies it in bounded journaled batches, rolls back a partial import, re-imports without duplicates and undoes untouched imported records; edited records refuse undo. `rer export` and `rer import` restore the complete dataset into an empty install and refuse corrupt archives or occupied destinations. See [MOVE-IN.md](MOVE-IN.md). *Proof:* `MOVE-001 Harvest preview, partial rollback, native reconciliation, idempotence and untouched undo`; `MOVE-001 complete D1 archive restore, corruption and occupied refusal`; browser journey export → fresh clone → import.
14. **AGENT-001 — Time reconstruction.** An agent drafts a time entry for a person from cited, consented evidence (for example a calendar entry), noting any ambiguous client match; only that person confirms the actual interval and billability, which creates their own draft to submit. *Proof:* `AGENT-001 time reconstruction: the agent drafts, only the person confirms actual time`.
15. **AGENT-002 — Resourcing.** An agent offers up to five tentative staffing alternatives with rationale; the page shows each alternative's effect on the person's remaining capacity and conflicts (and, for finance, estimated cost and billable value); the lead approves one, which becomes a tentative allocation. Agents cannot propose committed staffing. *Proof:* `AGENT-002 resourcing: tentative alternatives only, the lead approves one`.
16. **AGENT-003 — Billing preparation.** An agent proposes the source lines for a packet; Gauge refuses unapproved, already allocated, duplicated or rate-less sources at preparation; finance approves, which drafts the exact packet, then approves the packet as in BILLING-002. The agent never sees amounts. *Proof:* `AGENT-003 billing preparation: eligibility checked, finance approves the exact packet`.
17. **AGENT-004 — Delivery exceptions.** An agent drafts a change-order brief grounded in exceptions; the lead declines it with a reason or approves it, which drafts a change-order version whose terms the lead then approves (BUDGET-001). An agent can withdraw its own open proposal. *Proof:* `AGENT-004 delivery exceptions: change-order briefs are declined or approved by the lead`.

### Agent rules (clauses 14–17)

The agent is any program the owner runs (for example their own coding agent) signed in as an operator with an **agent** grant. It uses the same HTTP API as the app ([API.md](API.md)). It reads engagements, tasks, people, calendars, staffing and approved work without private costs or rates. It may prepare and withdraw proposals and nothing else: every other command answers 403. Each proposal keeps its assumptions, cited evidence and plan. The person who decides must hold the authority the effect needs (the person themselves for time, the lead or finance for staffing and change orders, finance for billing); the agent and the preparer can never decide. Approval writes the effect through the ordinary command in the same D1 batch, records who decided and when, and links the created record. Evidence and imported notes are inert text: no instruction inside them grants authority.

## Decided defaults

These are decided for the first release:

- **Buyer and scope:** agency services, not solo freelancing or enterprise Salesforce replacement. Hourly and fixed-fee engagements; retainers come after a balance and carry-over contract is agreed.
- **Jurisdiction:** Australian agency pilot, AUD reporting currency, explicit IANA work timezone per person and engagement (default `Australia/Brisbane` in forms), no tax engine.
- **Books:** billing preparation only; the agency's existing accounting tool issues invoices and posts to the ledger.
- **Order of work:** time approvals, then billing reconciliation, then capacity, then agent preparation, then accounting writes (later).
- **First move-in:** Harvest (with Forecast schedule CSV), changed only by a pilot agency's actual export.
- **Agents:** no model account, calendar connection or mail is needed; the owner's own agent prepares through the API, and people decide.
- **Evidence before switching:** keep the incumbent until a consenting agency reconciles one real billing period, restore and continued owner work in Gauge.

## Out of the first release

Payroll, statutory accounting or general-ledger posting, tax determination, invoice issuance, payment collection or money movement, revenue-recognition certification, retainers, external client portals, pervasive screen or activity monitoring, a universal project-management suite, regulated legal or clinical billing, and contractor marketplaces. Also out: integrated model providers, calendar reads, outbound email, accounting writes, multi-currency, and a hosted deployment. Margin is an operational calculation from declared inputs, not audited profit. "Gauge" is a working name, not a cleared trademark.

## Platform

Gauge runs on Base `79f61faef682f9d6cdb64e843cfbd3cf02887982` in package mode with the published `@runeditrun/rer` 0.2.4: TanStack Start and Hono on one Cloudflare Worker with D1, Base native sessions, the Lobby at `/`, owner claim at `/setup`, sign-in at `/signin` and the app at `/app`. `/health` is public; unknown routes return 404. The shared command contract is [SEED-COMMAND-CONTRACT.md](SEED-COMMAND-CONTRACT.md).
