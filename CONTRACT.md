# Gauge target product contract

Gauge is a US agency professional services automation product for the owner or operations lead of a 5–40 person design, marketing, software agency or consultancy. It connects estimates and retainers, staffing, time and expenses, delivery evidence and invoicing to a live margin, utilization and cash forecast. A buyer can replace Kantata, Harvest + Forecast, Scoro or Teamwork.com, or choose Gauge over Productive, Rocketlane or Float, without maintaining a separate spreadsheet for the core agency job.

## Product target

| | |
| --- | --- |
| Category | Professional services automation (PSA) / agency management software |
| Incumbents a buyer switches from | Kantata, Harvest + Forecast, Scoro, Teamwork.com |
| Up-and-comers it must also beat | Productive, Rocketlane, Float |
| First buyer | Owner or operations lead of a 5–40 person US agency or consultancy, USD, W-2 staff and 1099 contractors, IANA work timezones |

The primary journey: Move in the agency record, agree scope and retainers, staff and deliver the work, approve time and expenses, issue and collect invoices, and reconcile margin, capacity and cash.

## How to read this contract

- This follows the RER contract standard.
- Core, Agent surface and Later remain visible and count separately.
- Done means the acceptance outcomes are shown through public-door journeys on the judged commit.
- Field proof records real-world work the repository cannot produce.
- ACCEPTANCE.md and docs/CLAIMS.md are generated from this file.

## Door rules

- **D-1.** Processor custody. Authorized exact invoice and refund instructions go only to the agency’s own merchant account under RL-101. The processor retains funds and raw payer credentials; Gauge keeps safe references. Payment success, available balance and payout reconciliation stay distinct. A sandbox payment or saved instruction grants no live collection authority.

- **D-2.** Automation authority. Under RL-103 an exact release or an explicitly authorized bounded subscription binds source revision, destination, event identity and permitted resulting action. Loss of authority stops new effects; uncertain remote outcomes are reconciled before reuse. An agent’s external, standard or commitment call takes the company’s policy decision for those classes.

- **D-3.** Commercial versions. A commercial approval binds the exact version, recipients and computed effects. Changed inputs need renewed approval; agreed versions, frozen rates and issued artifacts retain their history and corrections append linked records with actor and reason. Where an agent performs the corresponding act, money or commitment carries the company’s policy decision.

- **D-4.** Honest unknowns. Missing calendars, costs or dated rates, stale sources, pending ACH and unconfirmed evidence remain explicitly unknown, incomplete or pending with their sources; they never become zero or a fabricated successful outcome.

- **D-5.** Native command identity. Each native Gauge business command binds a request key: the same key and content returns its original outcome, and changed content is refused. External commands also bind stable source/action identity and reconcile an uncertain outcome before another attempt.

## Shared duties (Base)

| Base duty | Duty | Delta clauses | Base journey |
| --- | --- | --- | --- |
| BASE-ACCESS-001 | Sign-in | none | not run |
| BASE-ACCESS-002 | Sessions | ACCESS-001 | not run |
| BASE-ACCESS-003 | Public endpoints | none | not run |
| BASE-ACCESS-004 | Server-side authorisation | none | not run |
| BASE-INPUT-001 | Validation | none | not run |
| BASE-INPUT-002 | HTML | BILLING-002, INVOICE-019 | not run |
| BASE-INPUT-003 | Uploads | COST-001, DELIVERY-010, DELIVERY-006 | not run |
| BASE-SECRET-001 | No leakage | PAYMENT-001, PAYMENT-004, PAYMENT-005, CONNECT-007, CONNECT-021, CONNECT-019, CONNECT-023, GOVERN-008 | not run |
| BASE-SECRET-002 | Startup | GOVERN-008, BASE-003 | not run |
| BASE-DATA-001 | Export and import | MOVE-001, SETUP-001, SETUP-008, SETUP-004, PAYMENT-004, PAYMENT-005, BASE-002 | not run |
| BASE-DATA-002 | Retention | none | not run |
| BASE-DATA-003 | Erasure | GOVERN-012 | not run |
| BASE-DATA-004 | Outbound flows | none | not run |
| BASE-DATA-005 | Independence | none | not run |
| BASE-PUBLIC-001 | Privacy | none | not run |
| BASE-PUBLIC-002 | Origins | none | not run |
| BASE-PUBLIC-003 | Accessibility | none | not run |
| BASE-OPS-001 | Health | BASE-001 | not run |
| BASE-OPS-002 | Migrations | BASE-003, BASE-004 | not run |
| BASE-OPS-003 | Idempotency | RESOURCE-006, DELIVERY-007, INVOICE-012, PAYMENT-002, CONNECT-016, CONNECT-022, CONNECT-023, FOLLOWUP-004 | not run |
| BASE-OPS-004 | Failure is visible | CONNECT-023, FOLLOWUP-004, BASE-004 | not run |
| BASE-OPS-005 | Audit | none | not run |
| BASE-ROLE-001 | Roles through every door | RATE-001, COST-001, ECONOMICS-001, ACCESS-001, AGENT-002, SETUP-001, SETUP-002, SETUP-003, SETUP-009, SALES-006, SALES-002, SALES-003, RETAINER-007, RETAINER-003, RETAINER-004, RESOURCE-001, RESOURCE-007, DELIVERY-001, DELIVERY-008, DELIVERY-004, DELIVERY-010, DELIVERY-006, TIME-008, INVOICE-003, REPORT-004, CLIENT-001, CLIENT-004, CONNECT-007, CONNECT-021, CONNECT-019, CONNECT-023, CONNECT-020, GOVERN-001, GOVERN-002, GOVERN-003, GOVERN-009, GOVERN-010, RECOVER-008 | not run |
| BASE-AUDIT-001 | Searchable, durable audit | TIME-002, INVOICE-003, INVOICE-012, PAYMENT-002, CONNECT-030, GOVERN-005, GOVERN-011 | not run |
| BASE-BACKUP-001 | Independent backup, restore and rollback | BASE-004 | not run |
| BASE-DATA-006 | Erasure respects retention and legal hold | CONNECT-032, GOVERN-006, GOVERN-012, GOVERN-013 | not run |
| BASE-SIGNIN-001 | Standards-based SSO and lifecycle | GOVERN-004 | not run |
| BASE-SIGNIN-002 | Native multi-factor authentication | GOVERN-004 | not run |
| BASE-INSTALL-001 | Free self-host and removal | BASE-001 | not run |
| BASE-MAIL-001 | Truthful mail outcomes | SALES-008, DELIVERY-004, INVOICE-012, INVOICE-007, REPORT-004, CLIENT-004, CLIENT-009, CONNECT-017, FOLLOWUP-001 | not run |
| BASE-ACCESSIBILITY-001 | One accessibility bar | MOBILE-001 | not run |
| BASE-DOCS-001 | On-site docs from one contract | CONNECT-020 | not run |
| BASE-AGENT-001 | One MCP door per seed | SURFACE-001 | not run |
| BASE-AGENT-002 | The seed's jobs are tools, through the UI's own actions | REVIEW-001, AGENT-001, AGENT-002, AGENT-003, AGENT-004, SETUP-001, RETAINER-001, RETAINER-009, RETAINER-011, RETAINER-013, TIME-007, TIME-005, CONNECT-007, CONNECT-016, CONNECT-022, CONNECT-027, CONNECT-028, CONNECT-031, FOLLOWUP-001, FOLLOWUP-003, FOLLOWUP-004, GOVERN-001, GOVERN-005, GOVERN-007, GOVERN-008, BOUNDARY-002, RECOVER-001, RECOVER-002, RECOVER-004, RECOVER-005, RECOVER-006, RECOVER-007, RECOVER-008, RECOVER-009, SURFACE-001, SURFACE-007 | not run |
| BASE-AGENT-003 | Records are resources | SURFACE-005 | not run |
| BASE-AGENT-004 | Business identity and short-lived, audience-bound tokens | none | not run |
| BASE-AGENT-005 | An agent acts as a person in a role, never more | AGENT-003, SETUP-001, RETAINER-001, RETAINER-009, RETAINER-011, RETAINER-013, TIME-005, GOVERN-007, SURFACE-005, SURFACE-006 | not run |
| BASE-AGENT-006 | Every action declares its risk class | PAYMENT-001, SURFACE-001, SURFACE-002, SURFACE-003, SURFACE-004 | not run |
| BASE-AGENT-007 | The company's policy decides, at one chokepoint | REVIEW-001, AGENT-001, AGENT-002, AGENT-003, AGENT-004, SETUP-001, RETAINER-001, RETAINER-009, RETAINER-011, RETAINER-013, TIME-007, TIME-005, PAYMENT-001, CONNECT-007, CONNECT-021, CONNECT-016, CONNECT-022, CONNECT-027, CONNECT-028, CONNECT-031, FOLLOWUP-001, FOLLOWUP-003, FOLLOWUP-004, GOVERN-001, GOVERN-005, GOVERN-007, GOVERN-008, BOUNDARY-002, RECOVER-001, RECOVER-002, RECOVER-004, RECOVER-005, RECOVER-006, RECOVER-007, RECOVER-008, RECOVER-009, SURFACE-007, SURFACE-008 | not run |
| BASE-AGENT-008 | Truthful attribution | AGENT-001, PAYMENT-001, GOVERN-001, SURFACE-004, SURFACE-007 | not run |
| BASE-AGENT-009 | Every agent action is audited with its class and decision | GOVERN-005, GOVERN-007 | not run |
| BASE-AGENT-010 | Agents can follow changes | SURFACE-006 | not run |
| BASE-AGENT-011 | Limits are policy, and Pause stops everything | FOLLOWUP-003 | not run |
| BASE-AGENT-012 | Writes are idempotent and conflict-safe | none | not run |
| BASE-AGENT-013 | Manifest, docs and the conformance journey | SURFACE-001, SURFACE-008 | not run |

## Published clauses

- `ENGAGEMENT-001`: *Tier:* Core · *Rules:* D-5
- `BUDGET-001`: *Tier:* Core · *Rules:* D-3, D-5
- `RATE-001`: *Tier:* Core · *Cites:* BASE-ROLE-001 · *Rules:* D-4
- `CAPACITY-001`: *Tier:* Core · *Rules:* D-4
- `TIME-001`: *Tier:* Core · *Rules:* D-5
- `TIME-002`: *Tier:* Core · *Cites:* BASE-AUDIT-001 · *Rules:* D-5
- `COST-001`: *Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-5
- `ECONOMICS-001`: *Tier:* Core · *Cites:* BASE-ROLE-001 · *Rules:* D-4
- `BILLING-001`: *Tier:* Core · *Rules:* D-3, D-5
- `BILLING-002`: *Tier:* Core · *Cites:* BASE-INPUT-002 · *Rules:* D-3, D-5
- `REVIEW-001`: *Tier:* Core · *Cites:* BASE-AGENT-007, BASE-AGENT-002
- `ACCESS-001`: *Tier:* Core · *Cites:* BASE-ACCESS-002, BASE-ROLE-001
- `MOVE-001`: *Tier:* Core · *Cites:* BASE-DATA-001 · *Rules:* D-5
- `AGENT-001`: *Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008
- `AGENT-002`: *Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-002, BASE-AGENT-007
- `AGENT-003`: *Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007
- `AGENT-004`: *Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

### Published operating core

#### ENGAGEMENT-001 — Set up agreed work

**Requirement.** Finance sets up the agency’s agreed client work.

**Acceptance.**
1. Create clients and people with their work timezone and contractor flag.
2. Create an engagement with its responsible lead, assigned members, agreed scope and work timezone, and add its tasks and milestones.

#### BUDGET-001 — Agree terms and change orders

**Requirement.** Leads and finance agree hourly or fixed-fee terms and additive change orders.

**Acceptance.**
1. Draft terms with budget, effort, billing rounding and a reason, then approve the exact version.
2. An approved version stays immutable; a change order is a new version beside it.

#### RATE-001 — Keep rates by effective date

**Requirement.** Finance keeps effective-dated person and service cost and bill rates.

**Acceptance.**
1. Add immutable rate versions; time approval freezes the applicable rate.
2. A later rate leaves approved historical work and its economics unchanged.
3. Only finance sees the private rates.

#### CAPACITY-001 — See next month's capacity

**Requirement.** Leads see daily capacity for the coming month, including contractor availability.

**Acceptance.**
1. People maintain dated working calendars and leave; leads allocate staff separately as tentative or committed.
2. Show daily available, committed, tentative and remaining time and flag conflicts on committed work.
3. A missing calendar shows unknown availability, never zero.

#### TIME-001 — Record time

**Requirement.** Staff record exact time manually or with a persistent timer.

**Acceptance.**
1. Keep the engagement, task, service, notes, billable flag and explicit IANA timezone with each interval.
2. Refuse overlapping intervals and a second running timer without creating duplicate work.

#### TIME-002 — Approve and correct time

**Requirement.** Staff and leads submit, return, approve and correct time without rewriting approved history.

**Acceptance.**
1. Staff submit and the lead either returns with a reason or approves the exact revision.
2. Reopen approved time only through an audited correction and require fresh approval.

#### COST-001 — Record expenses with receipts

**Requirement.** Staff record project expenses with private receipts and a reimbursable flag.

**Acceptance.**
1. Attach a receipt and submit the expense; the lead returns or approves the exact submitted work.
2. Receipts stay fixed at submission, and only their owner or finance downloads them.

#### ECONOMICS-001 — Reconcile the engagement

**Requirement.** Finance reconciles the engagement’s approved budget and actual economics.

**Acceptance.**
1. Show the latest approved budget against approved actual time and cost, billable value and remaining effort.
2. Identify every entry missing a cost or bill rate by its source id; other roles see hours without private costs.

#### BILLING-001 — Draft a billing packet

**Requirement.** Finance prepares billing from eligible approved work without reserving a source twice.

**Acceptance.**
1. Select approved unbilled hourly work, approved reimbursable expenses or an approved fixed-fee milestone.
2. Reserve those exact source revisions; a concurrent reservation of the same source fails.

#### BILLING-002 — Approve and export once

**Requirement.** Finance approves immutable billing packets and linked corrections.

**Acceptance.**
1. Approval freezes the exact draft, lines and CSV artifact with source ids, revisions, durations, rates and rounding.
2. Formula-like text is escaped and repeated downloads return identical bytes.
3. A correction appends a linked adjustment packet and leaves the original unchanged.

#### REVIEW-001 — Review the week's exceptions

**Requirement.** The weekly Review page links each operational exception to its source. Agent decisions follow the company’s policy for their standard, commitment or money class.

**Acceptance.**
1. List missing time against calendars, overspend, capacity conflicts, approved unbilled work and missing bill rates.
2. List decisions due to this person, including agent proposals that the company’s held policy makes await this person, with source links.

#### ACCESS-001 — See only permitted work

**Requirement.** Gauge’s engagement rights distinguish staff, leads, finance and the owner.

**Acceptance.**
1. Staff see their own work on assigned engagements; leads approve only engagements they lead.
2. Private costs and rates stay with finance; only the owner grants or revokes access.

#### MOVE-001 — Process supplied Harvest exports and leave whole

**Requirement.** Finance moves supplied Harvest exports into Gauge with independent reconciliation and reversible native adoption. Whole-installation custody is BASE-002. [Mechanism](docs/contract/mechanism-move.md#move-001).

**Acceptance.**
1. Preview a Harvest export package without writes, and reconcile independent client and month totals.
2. Apply in bounded journaled batches, roll back a partial import and re-import without duplicates.
3. Undo untouched imported records; refuse undo where later native edits exist.

#### AGENT-001 — Time reconstruction

**Requirement.** Time reconstruction drafts from cited, consented evidence. Drafting carries standard; confirmation as an agent is classified from its resulting work and attribution, and the company’s policy decides the call.

**Acceptance.**
1. Draft a person’s time entry from cited evidence such as a calendar entry and identify an ambiguous client match.
2. Under the held company policy, that person confirms the actual interval and billability, creating their own draft to submit; the recorded person confirmation comes from their session.

#### AGENT-002 — Resourcing

**Requirement.** The resourcing specialist offers costed staffing alternatives. Alternatives and tentative allocations carry standard, and commitments carry commitment; the company’s policy decides their disposition.

**Acceptance.**
1. Offer up to five tentative alternatives with rationale, each for one person over an inclusive date window.
2. Show open hours and conflict dates before and after as if committed; under the held company policy the lead chooses one and it becomes tentative, with committed staffing outside that held run.
3. Finance also sees estimated cost and billable value. Price each day like a FINANCE-006 allocation day in the engagement currency, using RATE-002 / RATE-003 precedence, excluding withdrawn cards, applying overtime premium then write-down after other bookings and rounding half up per day.
4. Internal work reads “Not billable: internal work”; absent or wrong-currency bill rates read “Unknown” with their reason, never zero.
5. Leads and agents without a finance scope see neither cost nor billable value.

#### AGENT-003 — Billing preparation

**Requirement.** The billing specialist proposes eligible packet sources. Preparing a draft carries standard and authorizing charges carries money; the company’s policy decides each call. BILLING-002 governs packet approval.

**Acceptance.**
1. Refuse unapproved, allocated, duplicated or rate-less sources at preparation.
2. Under the held company policy, finance approves the exact proposed source lines to create a draft packet and then approves that packet.
3. The proposal-purpose grant exposes no amounts.

#### AGENT-004 — Delivery exceptions

**Requirement.** The delivery specialist drafts change-order briefs from exceptions. Drafting carries standard and agreeing terms carries commitment; the company’s policy decides each call. BUDGET-001 governs terms approval.

**Acceptance.**
1. A brief cites the delivery exceptions that ground it.
2. Under the held company policy, the lead declines with a reason or approves a brief to draft a change-order version, then approves its terms separately.
3. An agent can withdraw its own open proposal.

## Target clauses

### Agency setup and sales to delivery

#### SETUP-001 — US agency profile

*Tier:* Core · *From:* SETUP-001 · *Cites:* BASE-ROLE-001, BASE-AGENT-005, BASE-AGENT-007, BASE-DATA-001, BASE-AGENT-002

**Requirement.** The owner configures the legal business, US billing address, USD reporting currency, EIN reference, fiscal-year start month, workweek and IANA timezones. SETUP-003 owns approved exchange rates; SETUP-005 owns client billing currencies.

**Acceptance.**
1. Start empty and configure a New York agency through first-run setup or Access. USD is the new-install default; every money amount retains its explicit ISO currency and exact minor units.
2. Only the owner saves the profile; each change retains its reason and revision history. The owner and finance see the legal business and US address.
3. Quote USD work spanning the 8 March 2026 spring-forward and issue one USD invoice equal to the quote; timezone handling preserves the agreed work and amounts.
4. Under RL-109, only the native owner sees the EIN. Routine documents, staff history/state, general exports and general audit views omit it; finance can read business identity/address. Complete-data export and restore under owner custody retain the EIN under BASE-DATA-001. Agent profile access follows the company sensitive policy within the sponsoring role.

#### SETUP-006 — Keep imported source currencies

*Tier:* Core · *From:* SETUP-001

**Requirement.** Imported legacy money retains its original currency. Consolidation uses SETUP-003 approved dated rates rather than import-time conversion. [Mechanism](docs/contract/mechanism-setup.md#setup-006).

**Acceptance.**
1. Import an old AUD record only after explicitly choosing to keep source currency; the record stays AUD and conversion is not offered as an import option.
2. Consolidate each approved time or expense amount at the approved rate effective on its own date, with rate and date beside totals. A missing rate leaves its amount unconverted and withholds the total, never substituting zero.

#### SETUP-002 — Client billing records

*Tier:* Core · *From:* SETUP-002 · *Cites:* BASE-ROLE-001

**Requirement.** Finance or the owner maintains legal clients and their billing workspace. SETUP-004 supplies client custom fields; INVOICE-005 owns taxability, provider tax calculation and exemption workflow, and INVOICE-001 carries bill-to details onto issued invoices. [Mechanism](docs/contract/mechanism-setup.md#setup-002). The recorded outcome is RL-1.

**Acceptance.**
1. Save legal name; billing/project contacts with name and optional email/phone; billing/legal/project addresses with line 1, optional line 2, city, optional state/postal code and two-letter ISO country defaulting to US.
2. Save tax-ID and exemption-certificate references, PO requirement and numbers, tags and external identities. References do not imply tax calculation or exemption approval.
3. Save Net N terms from 0–365 days. FINANCE-002 uses saved terms and shows “Net 30 assumed” only when unset. Omitted fields retain their values; changes create revisions, history and GOVERN-005 audit entries.
4. Other roles see the client name, with no access to this workspace or payment terms. An external identity, including an import source namespace/ID, belongs to one active client; a duplicate claim is refused.

#### SETUP-007 — Find clients and their work

*Tier:* Core · *From:* SETUP-002

**Requirement.** Finance searches current clients by billing references and identity, with linked engagements beside each result. SETUP-004 client fields participate in client search before they ship. [Mechanism](docs/contract/mechanism-setup.md#setup-007). The recorded outcome is RL-1.

**Acceptance.**
1. On Engagements and the client search API, PO numbers, tags and external IDs, including bare IDs, match whole values case-insensitively; names, legal names and contact names/emails match contained text.
2. Create similarly named clients and distinguish them by PO and external ID. Each result lists its linked engagements; merged duplicates never appear.

#### SETUP-008 — Merge duplicate clients

*Tier:* Core · *From:* SETUP-002 · *Cites:* BASE-DATA-001

**Requirement.** Finance merges duplicates against both exact revisions and a reason, preserving identity and work without repricing approved economics. [Mechanism](docs/contract/mechanism-setup.md#setup-008). The recorded outcome is RL-1.

**Acceptance.**
1. Move every duplicate engagement and opportunity to the survivor as a new revision. Approved economics stay frozen; later pricing uses survivor cards. Refuse a duplicate with active client rate cards until finance withdraws them under RATE-002.
2. Payment terms, approved days late and collection probability travel together. If sets differ, finance explicitly chooses either complete set; differing terms never resolve silently.
3. Keep survivor legal name, tax-ID reference and PO requirement, filling only empty ones; add duplicate contacts, addresses, exemption references, POs, tags and every recorded/import external identity. Searching those identities finds the survivor.
4. Retain the duplicate as merged, naming survivor, reason, terms choice, operator and time. It accepts no engagement, opportunity, rate card, edit or second merge and leaves all pickers.
5. Merge two similarly named clients and reconcile every linked project and chosen terms. Export/restore retains both records and their merge relationship; SETUP-004 fields inherit merge preservation.

#### SETUP-003 — Approved dated exchange rates

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Finance maintains an owner-approved currency-to-USD reporting rate table. Realized settled-payment FX gains/losses remain with the accounting provider under BOUNDARY-001; SETUP-005 owns end-to-end client currencies and report conversion. The recorded outcome is RL-2.

**Acceptance.**
1. Only the owner approves rates. Record rate, effective date, accounting-provider or named published source, reason, approver and approval time; Access names who approved each rate and when. Finance and staff cannot approve.
2. Convert at the latest approved rate effective on or before the amount date; later approval wins a same-day correction. CAD 10,000.00 in October at 0.7300 effective 1 October reads USD 7,300.00 with that rate/date.
3. A GBP amount preceding any approved GBP rate stays unconverted and withholds the total, never appearing as zero.
4. An approved 0.7400 effective 1 November leaves October conversion and issued CAD documents unchanged. New effective dates cannot precede the latest approved currency rate or fall on/before any currently closed agency period end; an authorized FINANCE-004 / FINANCE-015 reopen lifts that period protection.

#### SETUP-004 — Versioned custom field definitions

*Tier:* Core · *From:* SETUP-004 · *Cites:* BASE-DATA-001

**Requirement.** The owner defines custom fields on clients, engagements, people and tasks, with versioned definitions and GOVERN-005 value history.

**Acceptance.**
1. Create text, number, currency with ISO currency, date, single-select, multi-select and person fields. Add or retire options without rewriting stored values.
2. Require Practice on engagement creation: direct creation, SALES-004 conversion and DELIVERY-003 template instantiation refuse missing required values, including template tasks. Adding a requirement leaves legacy records intact.
3. Import source definitions/values and their source IDs through MIGRATE-001/MIGRATE-004. A value outside its type/options appears in preview rather than being dropped; an undefined Legacy option prevents apply.
4. Restore exported client, engagement, person and task field definitions, values and history, retaining source identities and retired-option stored values.

#### SETUP-009 — Custom field visibility

*Tier:* Core · *From:* SETUP-004 · *Cites:* BASE-ROLE-001

**Requirement.** Each custom field is visible to all record viewers, leads and finance, or finance only. Versioned visibility applies through every field-carrying door, including future REPORT-004 / REPORT-009 and CLIENT-001 doors.

**Acceptance.**
1. For non-finance reads, both current definition and the value’s original definition version must permit access. Explicitly saving under the current version is an audited publication.
2. Make Contract value finance-only: leads cannot read it through pages, CONNECT-020 API, CSV/XLSX/PDF exports, saved/scheduled reports, BI feeds or CLIENT-001 portal. Finance can read it.
3. Visibility remains effective for state and history, including imported or previously saved values after a definition changes.

#### SETUP-010 — Custom field reporting and resource filters

*Tier:* Core · *From:* SETUP-004

**Requirement.** Every custom field filters and groups REPORT-001, REPORT-002 and REPORT-004 and filters RESOURCE-002 search; numeric and currency fields are report measures.

**Acceptance.**
1. Import Kantata OX Practice (Brand, Web) on projects and Office (NYC, Austin) on people. Grouped utilization/profitability by Practice and Office reconcile to independent source reports from that package.
2. Filter resource search to Office = Austin and return Austin people only. Finance sums Contract value by Practice.
3. Client/task/project fields use whole-engagement cohorts; utilization uses distinct-person capacity per cohort. Shared and multi-select cohorts overlap, currencies stay separate, and unset values stay unknown.

#### SETUP-005 — Billing currency from client to payment

*Tier:* Core · *From:* SETUP-005

**Requirement.** Clients default to USD ISO 4217 billing currency unless set otherwise; engagements may override it only before their first approved commercial version.

**Acceptance.**
1. A Toronto client defaults to CAD when set and a New York client to USD. A new client still defaults to USD when the agency selected another currency; an approved commercial version locks the engagement override.
2. Carry billing currency through RATE-002 cards, SALES-002/003 estimates/proposals, RETAINER-001 retainers, INVOICE-001/004 invoices/credits, CONNECT-001/002 QBO/Xero documents and PAYMENT-001 Stripe links. One document never mixes currencies.
3. Issue October CAD 10,000.00 and USD 5,000.00 invoices and sync both to a QBO multicurrency sandbox in their own currencies. A November rate correction leaves the issued CAD invoice and QBO copy unchanged.

#### SETUP-011 — Converted portfolio and forecast economics

*Tier:* Core · *From:* SETUP-005

**Requirement.** Portfolio, FINANCE-006 forecasts and REPORT-001/003 figures use SETUP-003 approved rates on each component’s own transaction date, with rate/date labels and source drills.

**Acceptance.**
1. At CAD→USD 0.7300 effective 1 October, October CAD 10,000.00 plus USD 5,000.00 reads USD 12,300.00, labelled 0.7300 and 1 October. A later 0.7400 effective 1 November leaves closed October unchanged.
2. Window earned value converts approved time on work date, reimbursable expenses on expense date, milestones on due date, retainer fees day by day as accrued, and overages on period end. Labels include each rate, date and source.
3. Approved burn converts frozen time costs on work date and expenses on expense date in their own currencies; operational margin is converted earned value less converted burn. A CAD 200.00 October cost becomes USD 146.00 at 0.7300.
4. Missing-rate amounts remain unconverted; unknown components keep the affected total and margin unknown. Portfolio budget/EAC, forecast and REPORT-003 conversions retain dated source drills and CSV reconciliation.

#### SETUP-012 — Converted expected cash

*Tier:* Core · *From:* SETUP-005

**Requirement.** FINANCE-002 / FINANCE-009/007 monthly cash converts each expected receipt using the approved rate on its expected day, or the as-of day when past due.

**Acceptance.**
1. CAD expected on 8 November reads USD 7,300.00 at 0.7300 and USD 7,400.00 when 0.7400 effective 1 November is approved; a GBP amount with no approved rate stays unconverted.
2. Every converted total names its rate/date; a month incomplete in any currency remains incomplete. Committed-revenue and historical-timing cash figures retain source drills and CSVs.

#### SALES-001 — Opportunity pipeline

*Tier:* Core · *From:* SALES-001 · *Rules:* D-3

**Requirement.** Leads track opportunity stages, probability, owner, proposed dates, services, expected value and staffing demand, retaining won/lost history.

**Acceptance.**
1. Create opportunities with different probabilities, win one and show open weighted pipeline separately from won booked value. Tentative capacity stays distinct from signed work.
2. Per currency, booked value counts each engagement’s latest approved terms, else its linked won opportunity, plus unlinked wins once each. Revised approved terms replace prior terms without also counting the opportunity.
3. Every booked amount is labelled “before billing”; leads see booked value without invoice amounts.

#### SALES-006 — Billed value and booked backlog

*Tier:* Core · *From:* SALES-001 · *Cites:* BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Finance reconciles booked backlog to native invoice sources under REPORT-005; INVOICE-004 / INVOICE-014 credits net billed amounts once issued.

**Acceptance.**
1. Per currency and report as-of day, billed is pre-tax native issued invoices dated on/before that day for engagements carrying booked value. Exclude receipts, other-currency invoices and billing packets.
2. Backlog is booked minus billed in exact minor units: it equals booked before any issue and can be negative when billed exceeds booked. Issued credit notes net billed value once, without altering booked value.
3. Only finance reads billed/backlog; each figure links its booked and invoice sources. Leads’ booked figures reveal no invoice amounts.

#### SALES-002 — Costed estimate versions

*Tier:* Core · *From:* SALES-002 · *Cites:* BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Leads model hourly, fixed and mixed estimates with service, role, hours, subcontractor and expense lines, rate assumptions, contingency, discounts and margin. SALES-004 owns conversion into scoped work. The recorded outcome is RL-3.

**Acceptance.**
1. Estimate design and engineering with a contractor and discount, compare projected margin and feasible dates between versions; non-finance recipients receive no private costs.
2. Each version freezes phase-start rate assumptions and calendar-only named-person feasibility. Unknown cost/capacity remains unknown and prevents acceptance recording.
3. Allocate fee contingency and customer discount cumulatively in exact cents, keeping expense allowances separate. Conversion prepares draft terms/milestones, tasks and unfilled role requests without committing staffing or issuing invoices.

#### SALES-007 — Reported offline estimate acceptance

*Tier:* Core · *From:* SALES-002 · *Rules:* D-3

**Requirement.** The owner records reported external acceptance of the exact latest estimate version for offline work. SALES-003 client-link or signed acceptance is the primary carrier for released proposals. The recorded outcome is RL-3.

**Acceptance.**
1. Record reported acceptor name/contact, acceptance date, signed-document/email/PO/verbal channel and evidence reference. Label the estimate, engagement, budget, milestones, history and exports “recorded by agency, client identity unverified”; never present this as verified client acceptance or a signature.
2. The owner may withdraw before conversion with an audit row; after conversion use change orders. Finance or owner converts with fresh source assumptions and required SETUP-004 values.
3. Accept a fixed estimate and convert twice: one engagement’s budgets and milestones reconcile to that estimate.

#### SALES-003 — Exact-version client proposals

*Tier:* Core · *From:* SALES-003 · *Cites:* BASE-ROLE-001 · *Rules:* D-3

**Requirement.** The owner prepares and releases branded immutable proposal versions containing scope, deliverables, exclusions, dates, payment schedule and expiry. Track viewing, questions, acceptance and rejection; client-link acceptance is primary for released proposals and owner attestation remains offline. [Mechanism](docs/contract/mechanism-sales.md#sales-003). The recorded outcome is RL-4.

**Acceptance.**
1. An invited recipient confirms their email in a native operator account without internal Gauge staff access. Every client request rechecks exact recipient, active releasing owner and installation release authority; possession of a link alone grants nothing.
2. A deliberate client decision binds the complete customer document and latest estimate/proposal versions. Superseded, expired or revoked proposals cannot receive decisions; questions and decisions retain history.
3. Send two versions to a controlled inbox and accept only the latest. A changed price requires a new proposal and fresh acceptance.
4. Restore preserves documents, decisions and delivery history but removes recipient release authority; the new owner explicitly authorizes access again without resending.

#### SALES-008 — Proposal delivery reconciliation

*Tier:* Core · *From:* SALES-003 · *Cites:* BASE-MAIL-001 · *Rules:* D-3

**Requirement.** Owner-triggered proposal sends use the GOVERN-008 sealed Resend connection and Base mail transport. CONNECT-019 and FOLLOWUP-004 inherit delivery readback/recovery before provider expansion or scheduling. [Mechanism](docs/contract/mechanism-sales.md#sales-008). The recorded outcome is RL-4.

**Acceptance.**
1. One durable version-bound send is submitted. Provider submission remains distinct from mailbox delivery; uncertain submission never automatically retries.
2. Read back a known message, or an owner-supplied message whose content proves the exact delivery reference and recipient, without sending again. Keep delivered, bounced and unconfirmed distinct and resume after credential rotation.
3. Readback neither follows redirects nor retains arbitrary provider bodies; documents and delivery history remain available after restore.

#### SALES-009 — Signature originals and evidence custody

*Tier:* Core · *From:* SALES-003 · *Rules:* D-3

**Requirement.** Signature-required proposals generate complete immutable original PDFs tied to the customer document and retain verified signed evidence from Docusign or Inkwell. CONNECT-018 inherits the evidence/custody boundary and broader provider handoffs. [Mechanism](docs/contract/mechanism-sales.md#sales-009). The recorded outcome is RL-4.

**Acceptance.**
1. Before release, only the native owner downloads the original and binds that exact original to Inkwell. A substituted PDF is refused even with owner attestation.
2. Read the Inkwell original, signed PDF and certificate; verify native completion, the exact recipient signing event and all artifact digests. Retain signed PDF/certificate. A mismatched original leaves acceptance unavailable.
3. An envelope at one Inkwell origin cannot bind a different proposal version, including through another connection. No owner-attested original/proposal mapping substitutes for native original matching.

#### SALES-010 — Signed proposal client decision

*Tier:* Core · *From:* SALES-003 · *Rules:* D-3

**Requirement.** Verified provider evidence unlocks a signature-required proposal’s deliberate confirmed-recipient decision; provider evidence alone never records client acceptance. The recorded outcome is RL-4.

**Acceptance.**
1. A signature-required proposal cannot complete acceptance before verified exact-version evidence exists. Evidence intake does not accept automatically.
2. After valid signed artifacts arrive, the confirmed recipient deliberately accepts the exact proposal, linking that decision to its signed evidence. Mismatched original, recipient or version leaves acceptance unavailable.

#### SALES-004 — Convert won opportunities

*Tier:* Core · *From:* SALES-004 · *Rules:* D-3

**Requirement.** Finance or the owner converts native SALES-001 won opportunities into one scoped client engagement, preserving deal and commercial links. SALES-002 accepted estimates, CONNECT-011 CRM deals, SETUP-004 fields and RETAINER-005/INVOICE-002 schedules inherit conversion before shipping. [Mechanism](docs/contract/mechanism-sales.md#sales-004). The recorded outcome is RL-5.

**Acceptance.**
1. Create one engagement with opportunity name/client, opportunity owner as lead, agency currency/timezone and no members, linked both ways to the source opportunity.
2. Create draft fixed-fee terms equal to won value and effort equal to won demand; BUDGET-001 approval remains separate and no milestone is invented. Move booked value to the engagement without counting it twice.
3. Create one open role request per listed service over inclusive won dates. Divide demand evenly by service and then date, rounding down to whole seconds and displaying the remainder as unplaced seconds.
4. Convert twice or replay and return the same engagement; an already-linked opportunity returns its engagement. Required custom fields must be supplied or mapped before conversion.

#### SALES-011 — Convert accepted scoped work

*Tier:* Core · *From:* SALES-004 · *Rules:* D-3

**Requirement.** Accepted estimates and won CRM deals convert to scoped work with phase budgets, tasks, milestones, staffing requests and invoice schedules, retaining stable links to the deal and accepted terms. The recorded outcome is RL-5.

**Acceptance.**
1. Convert an accepted fixed-fee estimate twice and obtain one engagement whose phases, budget, tasks and milestones reconcile to the accepted version.
2. Required SETUP-004 values supplied or mapped from the deal survive conversion. Invoice schedules and staffing requests remain linked to accepted terms without duplicate demand or duplicate schedule sources.

#### SALES-005 — Internal scope-change review

*Tier:* Core · *From:* SALES-005 · *Rules:* D-3

**Requirement.** Track scope requests, differences from baseline, schedule/margin impact and independent internal review. Pending changes consume no approved client budget and authorize no billing. The recorded outcome is RL-6.

**Acceptance.**
1. A native owner or finance person prepares a change; a different owner or finance person reviews it. Self-review fails even after role changes or through another account tied to the same person.
2. Keep immutable comparisons, revision chains and stale-input fences. Label approval as internal in state, history, audit views and exports; it grants no client acceptance or business-effect authority.
3. Decline extra work and revise it without altering approved budget, billing or forecast.

#### SALES-012 — Client acceptance and adoption of change

*Tier:* Core · *From:* SALES-005 · *Rules:* D-3

**Requirement.** Client change decisions bind the exact disclosed change version and signed evidence beside prior terms. Only an accepted increment may change the forecast or approved client budget. [Mechanism](docs/contract/mechanism-sales.md#sales-012). The recorded outcome is RL-6.

**Acceptance.**
1. Release one exact internally approved version to a confirmed non-staff recipient for 1–30 days. Its shown-once access key is revocable immediately; access rechecks live owner/recipient authority and baseline/supersession fences.
2. Display complete exact client commercial terms in recipient forms at 1440 and 390. Preserve exact acceptance/rejection reasons, recipient and document fingerprint with audited request keys/revisions.
3. Decline, revise, then accept as the client; retain signed change evidence and adopt only the accepted increment once. Unsigned direct responses alone do not change forecast or grant business-effect authority.

#### RATE-002 — Rate-card precedence and currency

*Tier:* Core · *From:* RATE-002 · *Rules:* D-4

**Requirement.** Finance versions effective-dated client, service, role and person rate cards, negotiated overrides, overtime and write-down rules. SETUP-005 supplies client billing currency; SETUP-003 controls any cross-currency cost consolidation.

**Acceptance.**
1. Explain bill-rate precedence: finance entry override with reason, project, client-role, client, role, person, then service. Cost precedence is person, role, service only; client/project cards carry bill rates.
2. At each level, an entry-specific service beats All services, then the latest effective date on/before work date wins. Identical services for two clients can price differently across an effective-date boundary.
3. Client bill cards use client billing currency; pre-SETUP-005 agency currency and pre-RATE-002 / RATE-003 legacy card currencies remain intact. Declared costs are USD/hour, labelled W-2 loaded or 1099 contract by employment type; no payroll calculation is implied.
4. Different-currency costs remain separate without approved FX conversion. Approval freezes chosen cards, full precedence trace, overtime, write-down and declared cost; historical approvals do not reprice.

#### RATE-003 — Overtime, write-down and loaded cost arithmetic

*Tier:* Core · *From:* RATE-002 · *Rules:* D-4

**Requirement.** Approved billing and cost preserve the frozen rate-card arithmetic in exact minor units.

**Acceptance.**
1. Billing seconds past the card’s daily threshold include that person’s already-approved time for the work date. Overtime rate is round-half-up(rate × multiplier ÷ 10,000).
2. Subtract round-half-up(standard billed value × write-down basis points ÷ 10,000). Declared cost is round-half-up(actual seconds × declared cost ÷ 3,600) without overtime premium.
3. Trace billed value and declared loaded cost for identical services across clients/effective dates, reconciling every frozen rate and deduction without changing historical approvals.

#### BUDGET-002 — Balanced phase and service allowances

*Tier:* Core · *From:* BUDGET-002 · *Rules:* D-3

**Requirement.** Split engagements into immutable phase/service budgets for hours, fees, expenses and margin, preserving identities, services and distinct hourly/fixed billing bases. DELIVERY-003 templates create phase budgets on instantiation.

**Acceptance.**
1. Split a $60,000 project across discovery and delivery and reconcile phase roll-ups to approved engagement totals.
2. Allowance transfers prepare a new budget for exact approval; fixed allowances cannot fall below approved charges. Approve a transfer and reconcile both phase and project totals.
3. Every FINANCE-001 cost, earned value, billed, credit, remaining effort, ETC/EAC and margin figure is available per phase before phases ship. Mixed-basis portfolio/forecast figures retain source currency, unknown-input flags and native drills/CSV.

#### BUDGET-003 — Budget threshold warnings

*Tier:* Core · *From:* BUDGET-002 · *Rules:* D-3

**Requirement.** The owner sets engagement/phase hour, fee and expense threshold percentages, defaulting to 75% and 90%; FOLLOWUP-003 carries lead/finance notifications and external delivery obligations.

**Acceptance.**
1. Count approved plus submitted actuals. At least one threshold stays below the cap; overspend warning occurs strictly above 100%.
2. For a 100-hour phase, 76 approved hours raises one 75% alert; 15 more raises one 90% alert; corrected reapproval creates no duplicate.
3. Keep one durable in-app alert per engagement/phase, metric and percentage for responsible lead and finance, with source revisions attached. External delivery remains FOLLOWUP-003’s obligation.

#### BUDGET-004 — Hourly not-to-exceed billing

*Tier:* Core · *From:* BUDGET-002 · *Rules:* D-3

**Requirement.** Hourly caps admit work-date-ordered approved source portions only up to the cap, retaining frozen pricing and cumulative rounding. RATE-002 / RATE-003/INVOICE-004 write-downs and accepted BUDGET-001/SALES-005 changes resolve over-cap work. [Mechanism](docs/contract/mechanism-budget.md#budget-004).

**Acceptance.**
1. At $150/hour, 70 approved hours against a $10,000 cap drafts $10,000.00 for 66 h 40 min and holds 3 h 20 min/$500.00 plus all later work as over-cap, without changing source time.
2. An accepted $1,000 change order releases the $500 to the next draft. A reviewed write-down instead removes that quantity permanently from billing without reducing approved time.
3. Preserve exact source portions and original frozen pricing; cancelled reservations are reusable while reviewed write-downs remain permanent. No held over-cap portion is billed before an eligible resolution.

### Retainers and recurring commercial promises

#### RETAINER-001 — Recurring allowance terms and periods

*Tier:* Core · *From:* RETAINER-001 · *Cites:* BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-002 · *Rules:* D-3

**Requirement.** Set monthly, quarterly or annual retainers with included hours or value, services, start/end and renewal terms; SETUP-005 carries billing currency. Allowances and commercial periods remain separate from ad hoc budgets. The recorded outcome is RL-7. The recorded outcome is RL-8.

**Acceptance.**
1. Terms choose all, billable or nonbillable approved work. Calendar periods begin on month, quarter or year boundaries. Immutable commercial versions start after every saved period; saving/opening exact periods is replay-safe.
2. Automatic renewal authorizes subsequent periods; manual renewal only the initial period, showing the next boundary as a decision date. Inclusive end dates stop later renewal.
3. Owner-versioned working weekdays/holidays are retained on each commercial version. Lead or finance reviews/saves manager-visible terms/periods. Agent writes and amount reads use the company money, commitment and sensitive policy within the sponsoring role.
4. Eligible approved time consumes actual seconds for hours or frozen approved bill value for value, by start work date/service/billability. Unpriced approved work keeps value unknown. No ad hoc budget changes; covered work stays out of ordinary hourly billing until eligible RETAINER-002/005 release.

#### RETAINER-006 — Prorated retainer entitlement

*Tier:* Core · *From:* RETAINER-001 · *Rules:* D-3

**Requirement.** Mid-period starts/ends prorate allowance by calendar days unless terms select agency working days; value rounds half up to cents and hours to the nearest whole minute. The recorded outcome is RL-7. The recorded outcome is RL-8.

**Acceptance.**
1. A $10,000 monthly retainer beginning 16 October receives $5,161.29 for 16/31 calendar days and renews 1 November.
2. The same start with Monday–Friday working days and no October holidays receives $5,000.00 for 11/22 days.
3. A 40-hour October–December retainer beginning 16 October receives 33 h 29 min for 77/92 days and renews 1 January. Preview and saved entitlement reconcile to the retained calendar/version.

#### RETAINER-007 — Retainer service fee and earned revenue

*Tier:* Core · *From:* RETAINER-001 · *Cites:* BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Optional finance-only service fees are integer cents per full commercial period on immutable versions, separate from allowance. FINANCE-001 / FINANCE-008/006 use earned fees; FINANCE-007’s advance-start assumption is replaced by RETAINER-005 contractual scheduling without double billing. The recorded outcome is RL-7. The recorded outcome is RL-8.

**Acceptance.**
1. Prorate fees by the version’s saved working weekdays/holidays independently of allowance proration. Earn ratably through inclusive as-of day only for opened periods; cumulative half-up cent rounding and differences of cumulative monthly amounts reconcile exactly.
2. Other roles cannot set/read fees through preview, records, history, pages, CSV or audit. A lead’s later version preserves its hidden fee unless finance changes it.
3. Until contractual scheduling applies, cash assumes one unissued fee in advance on active-period start; scheduling changes no historical earned amount and bills no fee twice.

#### RETAINER-002 — Aged FIFO carry and deficits

*Tier:* Core · *From:* RETAINER-002 · *Rules:* D-3

**Requirement.** Retainer commercial versions set unused carry-over, cap, expiry and deficit carry-forward without changing unit, calendar frequency or earlier period rules. RETAINER-004 preserves closed FIFO statements.

**Acceptance.**
1. Keep each incoming lot’s origin and expire it after configured successor calendar periods. Apply current incoming carry cap oldest-first and show expired/forfeited quantities; open all intervening periods.
2. Consume eligible approved work oldest allowance first, ordered by work date, start and ID. Carry 8 unused hours from 40 into a capped next period and consume them before expiry.
3. Only configured deficits reduce next opening allowance and the same deficit cannot also be billed. New rules never rewrite prior or closed statements and their rule/source versions.

#### RETAINER-008 — Eligible retainer overage billing

*Tier:* Core · *From:* RETAINER-002 · *Rules:* D-3

**Requirement.** Commercial versions specify agreed overage rates; finance prepares and approves one reserved whole-period overage source. RETAINER-005 / RETAINER-013 and INVOICE-001 carry its exact quantities/rates and unique reservations into scheduled/issued invoices.

**Acceptance.**
1. Hours use agreed cents/hour; value overages use agreed percentage rounded half up once to cents. Exceed allowance by three hours and reconcile the charge at the agreed rate.
2. Unknown consumption, ambiguous multi-retainer work or changed inputs prevent billing; changed inputs need a fresh draft. Included time remains held and no quantity is reserved or billed twice.
3. Approved overages preserve exact source quantities/rates through preparation packets, scheduling and issuance; deficit-carried quantities cannot also be billed.

#### RETAINER-003 — Retainer balance and provisional projection

*Tier:* Core · *From:* RETAINER-003 · *Cites:* BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Staff, leads and permitted clients see allowance, rollover, confirmed consumption, pending time, linked adjustments and remaining units with source/rule lineage. CLIENT-001/003 inherit permitted-client parity. The recorded outcome is RL-10. The recorded outcome is RL-11.

**Acceptance.**
1. Posted balance starts with immutable allowance plus FIFO rollover minus carried deficit and eligible approved consumption. Trace a consumed hour to approved time.
2. Stopped drafts, returned and submitted time affect only a separately labelled projection under the same FIFO rules, including projected prior carry. Running timers and unconfirmed evidence suggestions are excluded; pending value remains explicitly unknown.
3. Linked RETAINER-004 adjustments show source/rule versions and posted/projected effects. Finance/leads see aggregate hours/value but private costs/rates remain finance-only.
4. Assigned staff see hour statements and only their own source work; other supporting work is restricted. Value statements and commercial monetary rates never enter staff pages, state, history or exports.

#### RETAINER-009 — Resolve ambiguous retainer allocation

*Tier:* Core · *From:* RETAINER-003 · *Cites:* BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-002 · *Rules:* D-3

**Requirement.** Work matching multiple retainer families by service/date remains unallocated until engagement lead or finance assigns one eligible family against the exact time revision and reason. The recorded outcome is RL-10. The recorded outcome is RL-11.

**Acceptance.**
1. Ambiguous work consumes none of the families and holds overage billing for every matching period. Assign an approved hour to one family and only that statement consumes it.
2. Refuse stale revisions and staff assignment. Reserved/approved billing-packet work or work feeding reserved/approved retainer overage cannot be reallocated or corrected.
3. Agent assignment follows the company money policy within sponsor authority; under a company policy holding money for approval, no allocation changes before that policy’s exact-action decision.

#### RETAINER-004 — Close retainer periods permanently

*Tier:* Core · *From:* RETAINER-004 · *Cites:* BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Finance or owner closes each retainer period once after its calendar end in saved agency timezone, earliest periods first and with a reason; closed retainer periods never reopen. The recorded outcome is RL-12.

**Acceptance.**
1. Preserve the immutable statement, allowance, consumption, overage amounts, outgoing FIFO lots/expiry, source revisions and period/commercial/rule/calendar versions. Later commercial rules never rewrite it.
2. Captured work cannot be edited or reallocated. Uncaptured late work can be assigned to its exact family after original closed overage reservation/approval without rewriting that artifact.
3. Close October and read the original statement after late November intake and later rule changes; its FIFO lots and rule/source versions remain unchanged.
4. New close/correction details are hours-only for leads/staff, with staff links limited to own work; existing lead commercial setup rights remain.

#### RETAINER-010 — Post late work to an open period

*Tier:* Core · *From:* RETAINER-004 · *Rules:* D-3

**Requirement.** Finance prepares a linked closed-to-earliest-later-open adjustment in the same retainer family and approves the exact prepared source, destination and preview. The recorded outcome is RL-12.

**Acceptance.**
1. Preparation affects projections only. Changed inputs require cancellation and fresh preparation.
2. Late approved work omitted at close is linked once and consumes the next open period FIFO using actual seconds or frozen approved value; unknown value stays held.
3. Late October work arriving in November retains the October statement, consumes only once and appears as a linked adjustment with source/rule versions and posted/projected effects in RETAINER-003.

#### RETAINER-011 — Retainer waivers and declared refunds

*Tier:* Core · *From:* RETAINER-004 · *Cites:* BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-002 · *Rules:* D-3

**Requirement.** Finance reviews retainer overage waivers and externally declared refunds as linked adjustments. GOVERN-001 review applies to adjustment value; these records do not execute payments or change invoices. The recorded outcome is RL-12.

**Acceptance.**
1. A waiver cannot exceed original unwaived billable overage; credit its original agreed price without changing allowance. Credit equals rounded charge for cumulative approved waived quantity including this waiver minus charge for prior waived quantity, so splitting cannot increase credit.
2. A refund records declared external credit without claiming settlement. Preview shows remaining balance, next base allowance and signed external cash effect; waiver cash is computed from original overage rate.
3. Review value is the greater of absolute cash effect and allowance change priced at original overage rate; value allowance changes use cents. When a limit exists, unpriced allowance changes require independent approval; above-limit changes require another active finance/owner.
4. Leads cannot prepare or decide corrections. Agent preparation/decision follows company money and commitment policy within sponsor authority; a company policy holding those classes exercises the legacy independent-review journey.

#### RETAINER-012 — Retainer pause, cancellation and renewal

*Tier:* Core · *From:* RETAINER-004 · *Rules:* D-3

**Requirement.** Reviewed lifecycle adjustments change later base allowance while retaining existing FIFO carry and closed statements. Finance previews next-period allowance, balance and declared cash before approval. The recorded outcome is RL-12.

**Acceptance.**
1. Pause removes next open period base allowance and holds overage billing. Cancellation also zeroes already-open later base allowances and prevents new periods until approved renewal.
2. Renewal sets next open base allowance to the reviewed quantity and lifts cancellation; existing carry retains original FIFO policy.
3. Finance explicitly declares refund/pause/renewal/cancellation cash effect because these adjustments execute no payment or recurring invoice. Apply the GOVERN-001 greater-of-cash-and-priced-allowance review rule, independently approving unpriced changes when a limit exists.
4. RETAINER-003 shows linked adjustment versions and posted/projected effects; approved lifecycle changes never rewrite prior statements.

#### RETAINER-005 — Contractual recurring drafts

*Tier:* Core · *From:* RETAINER-005 · *Rules:* D-3

**Requirement.** Create the next recurring budget and invoice draft on configured advance/arrears schedule, with one allowance/fee source and no duplicate on restart. INVOICE clauses and FOLLOWUP-004 own sending, bounded retries and owned exceptions. [Mechanism](docs/contract/mechanism-retainer.md#retainer-005). The recorded outcome is RL-13.

**Acceptance.**
1. Advance is active-period start; arrears is the day after active end. Schedule and issue the immutable REPORT-001 fee once, replacing FINANCE-007’s advance assumption without changing historical earning.
2. Hourly preparation uses installation-only revocable finance consent. Each period receipt binds allowance, immutable fee, reserved draft and exceptions; restore retains schedules without consent.
3. Advance over month-end twice and restart: obtain one new period and one correct draft. Hold disputed overages; reconcile RETAINER-002 / RETAINER-008 three-hour overage at exact agreed rate, excluding included work and duplicate reservations.

#### RETAINER-013 — Bounded native recurring invoice issue

*Tier:* Core · *From:* RETAINER-005 · *Cites:* BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-002 · *Rules:* D-3

**Requirement.** Finance or owner may enable automatic native issue for one schedule revision, with an audited reason, source-currency per-invoice cap no higher than GOVERN-001 review limit and an explicit overage choice. The recorded outcome is RL-13.

**Acceptance.**
1. Every batch rechecks live consenting authority. Disabling or losing that authority stops the next batch. Changed terms newer than consent, held/disputed periods, lifecycle exceptions or any exception leave a named exception draft.
2. Issue only within cap, for an active client with saved terms, bill-to/remit-to and a matching saved PO when required, outside active TIME-003/FINANCE-004 locks. Schedule stores bill-to/remit-to/reference; issue rechecks current client terms/PO.
3. Packet approval, INV number, contractual date, terms-derived due date and run receipt commit together. Invoice identifies schedule revision and consenting operator, period, terms version, allowance used and overage hours × agreed rate.
4. Issue is pre-tax native ledger, without sending or scheduled external business writes. Agent issue actions follow the company money and commitment policy within sponsor authority; schedule consent never substitutes for company policy.

#### RETAINER-014 — Apply selected retainer credits once

*Tier:* Core · *From:* RETAINER-005 · *Rules:* D-3

**Requirement.** External RETAINER-004 adjustments remain external unless finance explicitly selects exact approved negative adjustments in the schedule revision with audited confirmation that cash has not already been executed externally. The recorded outcome is RL-13.

**Acceptance.**
1. Reserve each selected credit once against a due native invoice in the same retainer family/currency. Subtract its exact approved negative cents once; leave unselected adjustments as external records.
2. No credit sends a refund. A nonpositive invoice total remains a named exception draft; restarts never duplicate credit or overage sources.

### Staffing and resource planning

#### RESOURCE-001 — Skills and unfilled role requests

*Tier:* Core · *Cites:* BASE-ROLE-001 · *Rules:* D-4

**Requirement.** Keep skills, proficiency, teams, employment type, location and role needs, finding feasible people through dated availability, permissions and finance-visible effective cost.

**Acceptance.**
1. Request a 20-hour UX specialist and find qualified available employees and a contractor without exposing private costs beyond finance.
2. A placeholder retains unfilled demand until exact lead approval atomically replaces it with one named committed allocation, preserving competing work.
3. After fill no duplicate demand remains; stale or duplicate fills are refused.

#### RESOURCE-002 — Portfolio resource calendar

*Tier:* Core · *Rules:* D-4

**Requirement.** Leads plan daily/weekly allocations across projects, search by current person name, role, skill and SETUP-004 person fields, and inspect tentative/committed demand and unfilled roles.

**Acceptance.**
1. Preview booking moves against agency-wide committed demand, holidays and leave, keeping tentative demand separate. Show overbooking and unknown capacity before commitment; a lead explicitly applies the exact preview even with warnings.
2. Moves preserve inclusive-date count and daily seconds. Splits partition those dates between two people with no lost or duplicated demand.
3. Move across a holiday and another project, then split between staff; reconcile conflicts and unallocated demand. Person custom-field search is available before SETUP-004 person fields ship.

#### RESOURCE-003 — Dated working calendars

*Tier:* Core · *From:* RESOURCE-003 · *Rules:* D-4

**Requirement.** Maintain per-person part-time weekday schedules, US federal/agency holidays and regional exceptions, with effective-dated changes that preserve historical capacity. RESOURCE-006 owns HR time-off sync. The recorded outcome is RL-14.

**Acceptance.**
1. Set different weekday hours for a part-time person, change from a future date and verify earlier capacity is unchanged.
2. Apply federal/agency holidays with one regional exception; each person’s capacity follows their own calendar. Override one holiday for an agreed contractor workday.

#### RESOURCE-007 — Private leave requests and decisions

*Tier:* Core · *From:* RESOURCE-003 · *Cites:* BASE-ROLE-001 · *Rules:* D-4

**Requirement.** Requested leave changes no capacity until owner approval; owner decisions are audited and bound to exact request revisions, with private categories visible only to the person. The recorded outcome is RL-14.

**Acceptance.**
1. Native and compatibility submissions create reviewed requests. Permit only Personal time, Vacation or Prefer not to say categories; refuse medical/legal free text and store fixed administrative decision text.
2. Approve leave on a staffed date: immediately reduce capacity, recalculate conflicts and raise an in-app alert scoped to responsible lead, without outbound delivery. Other people never see the private category/reason.
3. Historical declared absences retain capacity effect and use owner cancellation. Audit exports withhold others’ raw leave payloads and show redacted decisions.

#### RESOURCE-004 — Scheduled and actual utilization

*Tier:* Core · *Rules:* D-4

**Requirement.** Compare scheduled, recorded, submitted and approved hours by person, service and project, exposing billable and total utilization with net workable hours and explicit numerators/denominators.

**Acceptance.**
1. Schedule 30 billable hours in a 32-hour available week, approve 24 and record 4 pending; reconcile each category, denominator and scoped source drill.
2. Distinguish billable/capacity from billable/scheduled ratios, label tentative inclusion and explain holidays, leave and missing calendars.
3. Internal admin, sales, training, PTO and other internal engagements are a distinct client-free type. Logging two training hours raises total utilization only, never billable utilization.

#### RESOURCE-005 — Monthly resource demand forecast

*Tier:* Core · *From:* RESOURCE-005 · *Rules:* D-4

**Requirement.** Finance sees committed backlog and separately labelled tentative/probability-weighted pipeline by calendar month, as of FINANCE-006 / FINANCE-018 and counting only later days. FINANCE-006 / FINANCE-018 supplies committed fees/cost/margin and separately labelled pipeline fees.

**Acceptance.**
1. Committed whole-second demand comprises committed allocation days, open unfilled requests and unconverted won opportunities spread evenly across inclusive dates, with leftover seconds on earliest days. Unnamed roles’ cost is missing, never zero.
2. SALES-004 conversion moves won demand to open roles once. Tentative allocations and open-opportunity demand × probability, rounded half up, remain separate additions.
3. Capacity follows each person’s dated calendar, split by employee/contractor profile type and naming missing calendar days. Show committed fees, cost and margin in agency currency from as-of month onward.

#### RESOURCE-008 — Approved capacity scenarios

*Tier:* Core · *From:* RESOURCE-005 · *Rules:* D-4

**Requirement.** Finance prepares hire, contractor or delayed-start scenarios for one open opportunity; owner approves the exact immutable revision for monthly comparison without changing the baseline.

**Acceptance.**
1. Choose whole-day delay, optional hire/contractor with fixed seconds on each Monday–Friday of dated availability, and hourly work cost. Add the deal as won: whole demand on shifted days and whole value evenly over shifted months in cents.
2. An open-ended hire runs through as-of + 366 days and costs every added capacity hour. Contractor/existing-team scenarios cost deal hours only; monthly cost rounds half up to cents.
3. Show monthly capacity, demand, gap, fees, cost and margin and differences from baseline. Preparation, approval and comparison never change baseline.
4. Compare hire, contractor and delay, then win the opportunity: stop comparing that scenario and count demand committed once. Lost opportunities also stop comparison. Planned hires remain scenario-only until person creation; other-currency scenarios depend on SETUP-005.

#### RESOURCE-006 — HR-system approved time-off sync

*Tier:* Core · *Cites:* BASE-OPS-003 · *Rules:* D-4

**Requirement.** Sync approved BambooHR, Gusto or Rippling time off into leave using stable source IDs, and withdraw it on source cancellation.

**Acceptance.**
1. Sync the same approved BambooHR absence twice and find one leave record with the stable source identity.
2. Cancel at source and read withdrawn leave and restored capacity.

### Project delivery and client collaboration

#### DELIVERY-001 — Execute assigned tasks

*Tier:* Core · *From:* DELIVERY-001 · *Cites:* BASE-ROLE-001

**Requirement.** Teams manage assigned tasks and subtasks, with shared project and personal views and links to actual work.

**Acceptance.**
1. The lead or finance assigns and edits tasks only within their engagement grants; the assignee updates progress. Tasks retain status, priority, dates, service estimates, billability and checklists.
2. Whole-second estimates and remaining effort describe each task’s own work; subtask effort adds to the parent’s own effort.
3. Create a task tree, move it through a board, and filter list, board and personal-work views by client and project; each view shows the same current status and totals.
4. Link time and expenses to the delivery task; a nonbillable task refuses billable time.

#### DELIVERY-007 — Repeat a task tree

*Tier:* Core · *From:* DELIVERY-001 · *Cites:* BASE-OPS-003

**Requirement.** Completing recurring work creates its next occurrence with the same task structure and fresh progress.

**Acceptance.**
1. Recurrence uses an integer number of calendar days; completing a recurring root creates exactly one next task tree in the same transaction.
2. The next occurrence shifts dates, resets status and checklists and restores each task’s estimate as remaining effort; it stops after the inclusive last recurring start date.
3. Replaying the same completion creates no additional occurrence; history and whole-installation export retain the recurring records.

#### DELIVERY-002 — Preview dependent schedules

*Tier:* Core · *From:* DELIVERY-002

**Requirement.** Plan phases, tasks and milestones on an explicit project business calendar; DELIVERY-005 owns client acceptance and commercial authorization.

**Acceptance.**
1. Build a dependency plan of 1–100 phase, task or milestone nodes within three years and inspect it as a Gantt schedule.
2. Durations and delays count business days on the declared working week and holiday list; dates are inclusive and finish-to-start successors start on the next working day.
3. Delay an upstream task two business days across a declared Thanksgiving holiday; dependent dates and critical-path slack against project finish update consistently.
4. Before commitment, preview every changed task and client-milestone date and every linked booking move against global capacity, showing unknown calendars and tentative demand.
5. Linked bookings keep their duration and move by their schedule item’s calendar-date offset; milestone price and commercial approval stay unchanged.

#### DELIVERY-008 — Approve immutable schedule baselines

*Tier:* Core · *From:* DELIVERY-002 · *Cites:* BASE-ROLE-001

**Requirement.** The engagement’s authorized approver adopts an exact schedule preview as a new baseline.

**Acceptance.**
1. Approval binds the exact preview and its displayed capacity and client-date effects; stale or unauthorized approval writes nothing.
2. Each approved baseline retains its predecessor and reason and cannot change; later rescheduling preserves earlier baselines and commercial terms.
3. The schedule and linked booking effects commit together.

#### DELIVERY-003 — Version delivery templates

*Tier:* Core · *From:* DELIVERY-003

**Requirement.** Owner or finance saves reusable project and client-onboarding templates; each saved version remains immutable.

**Acceptance.**
1. A template carries phases, task dependencies, effort and owners, priced milestone billing and the required phase budgets, intake forms and SETUP-004 custom fields.
2. A task owner is the engagement lead or one named person; that person must belong to the engagement when the template is applied.
3. A revision names the latest saved version; a stale revision is refused. Updating a template leaves already started projects unchanged.
4. Fees and template contents are visible only to owner, finance and leads.

#### DELIVERY-009 — Start a project from a template

*Tier:* Core · *From:* DELIVERY-003

**Requirement.** The engagement lead or finance applies an exact template version to an engagement without a delivery baseline. BUDGET-002, DELIVERY-006 and SETUP-004 supply phase budgets, forms and required fields before those capabilities ship.

**Acceptance.**
1. Dates count business days using the latest owner-saved agency working week and holidays; before one is saved, use Monday–Friday with no holidays. A non-working start moves to the next working day and dates are inclusive.
2. Applying creates owned tasks, draft milestones in the engagement currency and the first DELIVERY-002 baseline retaining template version and start; an engagement with an existing baseline is refused.
3. Draft milestones still require approved terms and milestone approval before billing.
4. Apply one client-onboarding version to two start dates; evolve the template and verify both earlier projects retain their original dates and plans.

#### DELIVERY-004 — Discuss project work

*Tier:* Core · *From:* DELIVERY-004 · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** People comment, mention and subscribe on scoped projects and tasks, attach links and search only permitted content.

**Acceptance.**
1. Comments and subscriptions remain tied to the project or task; recorded decisions and deliverable approvals remain distinct from conversation.
2. Mentions, assignments and approval requests reach the person’s in-app inbox and, when selected, a daily or weekly email digest; Slack and Teams delivery belongs to CONNECT-009 and CONNECT-010.
3. Mention a teammate on a deliverable; the same reference appears in the inbox and next selected digest.

#### DELIVERY-010 — Version and proof deliverables

*Tier:* Core · *From:* DELIVERY-004 · *Cites:* BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Project files retain versions, visibility and version-specific proofing rather than overwriting earlier review evidence.

**Acceptance.**
1. Files support private, project and client visibility; search and download enforce that visibility.
2. Upload two revisions, annotate a region on revision 1 and approve revision 2 as client-visible; the annotation stays attached to revision 1.
3. Reviewer requests and external approval decisions identify the exact deliverable version; a client and unrelated employee cannot fetch private revisions.

#### DELIVERY-011 — Reference external project files

*Tier:* Core · *From:* DELIVERY-004

**Requirement.** Projects link Google Drive, Box and Dropbox folders or files by reference while each provider retains its access controls.

**Acceptance.**
1. Gauge stores the reference without copying provider content.
2. Opening a linked Google Drive folder as someone without Drive rights reaches the provider’s permission prompt and grants no access through Gauge.

#### DELIVERY-005 — Track milestone delivery decisions

*Tier:* Core · *From:* DELIVERY-005 · *Rules:* D-3

**Requirement.** Leads maintain delivery health, issues, risk owner, mitigation and dated client dependencies; client acceptance binds an exact delivered snapshot. CLIENT-001 / CLIENT-007 supplies direct portal confirmation and CLIENT-004 supplies recipient accounts and notifications.

**Acceptance.**
1. The lead or finance may record a client acceptance or rejection with named client contact, date and reason; all views label it “recorded by <person>, not confirmed by the client”.
2. Changing health, issues, dependencies or draft commercial terms requires a new delivery and decision; rejection, issue resolution and later acceptance preserve prior snapshots and revision history.
3. Reject a milestone for missing work, resolve the owned issue and accept a new delivery; neither delivery nor acceptance alone prepares a packet or issues an invoice.
4. Finance separately authorizes the exact accepted delivery and prepares and approves billing; the recorder cannot authorize it unless the owner acts alone with explicit one-person approval.
5. Existing milestones also require current recorded acceptance before new billing preparation.

#### DELIVERY-012 — Release exact milestone reviews

*Tier:* Core · *From:* DELIVERY-005 · *Rules:* D-3

**Requirement.** The native owner releases one exact delivery for bounded direct review without sending a notification or transferring finance authority. [Mechanism](docs/contract/mechanism-delivery.md#delivery-012).

**Acceptance.**
1. A release names one confirmed non-staff recipient and lasts one to 30 days; the access token is shown once, can be revoked immediately and becomes invalid when delivery changes.
2. Only the customer description is exposed; every access attempt is visible in the owner audit.
3. Release sends nothing and does not replace finance authorization; restore imports no recipient authority.

#### DELIVERY-006 — Request client onboarding inputs

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-003

**Requirement.** Clients complete project-scoped forms, upload requested inputs and see due actions; leads follow blocked inputs. DELIVERY-003 templates carry each form and relative business-day due date and create a requested intake record when applied.

**Acceptance.**
1. The engagement lead or native finance requests a dated form and file, schedules an in-app reminder interval and escalates blocked inputs to the project lead.
2. Only a currently invited CLIENT-001 recipient submits; the committing transaction rechecks current client, project, invitation and session authority.
3. Request brand assets, receive an incomplete submission and return it with a reason; incomplete submissions cannot be accepted.
4. Each resubmission preserves its answers and file as a separate immutable version; review binds the latest revision.
5. Due actions and reminders remain outstanding through submission and rejection and close only after explicit acceptance.
6. Only the submitting recipient while invited, assigned lead and native finance download the file. Files are bounded to 512 KiB, served as opaque attachments and never executed.
7. No outbound notification is sent by native intake. Optional Chest and Blotter links make no server request and preserve their separate permission boundaries.

### Time capture and expense operations

#### TIME-003 — Complete day and week timesheets

*Tier:* Core · *From:* TIME-003

**Requirement.** Workers enter clock intervals in day/week grids, reuse private task defaults and submit exact selected revisions together.

**Acceptance.**
1. Grid intervals use an explicit IANA work timezone; recent tasks and favorites copy only task, service, billability and timezone defaults, never actual time or approval.
2. Favorites belong to their person; an owner acts for them only through finance time entry, and leads receive no other person’s favorites in state, history or report exports. Whole-installation archives retain favorites.
3. Missing daily hours are max(0, net calendar availability minus stopped actual seconds); missing calendars remain unknown and approval status is shown separately.
4. Bulk submission commits every selected exact revision or none.
5. Fill a week using a favorite and manual interval, return a day, correct it and resubmit; original approver, exact duration and later billing rounding remain traceable.

#### TIME-007 — Lock and reopen work periods

*Tier:* Core · *From:* TIME-003 · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Finance sets an inclusive locked-through work date and records a reason before reopening a historical period.

**Acceptance.**
1. The interval’s start date in its work timezone determines its period.
2. Locked periods refuse writes and removals through native, import and agent-confirmation doors without any role bypass; agent actions follow company policy for their standard or money classes.
3. Finance cannot lock a date affected by a running timer.
4. Reopening is audited before correction; history retains original approval and duration before billing rounding.

#### TIME-004 — Apply timesheet policies

*Tier:* Core · *From:* TIME-004

**Requirement.** Owner or finance versions weekly deadlines, note/hour requirements, billability defaults and one- or two-level review policy.

**Acceptance.**
1. The Monday–Sunday work week is due on the configured weekday and time in the following week, in the agency IANA timezone.
2. Trimmed minimum note length and whole-second per-entry and per-work-date limits flag drafts and block both submission and approval; the day limit includes all the worker’s stopped entries across projects and statuses.
3. Optional service billability defaults apply only when omitted; an explicit billability choice overrides them.
4. Submit short-note and excessive-hour work, observe visible flags, correct and resubmit.
5. Review shows due dates, overdue work, note/hour failures and agency-calendar days since submission, zero on submission day; already approved entries retain their history.

#### TIME-008 — Delegate exact independent time review

*Tier:* Core · *From:* TIME-004 · *Cites:* BASE-ROLE-001

**Requirement.** A lead delegates review of their own engagements to an active lead or finance person for audited inclusive dates; this grants only time review.

**Acceptance.**
1. Delegation must cover both work date and review day; revocation or reassignment affects the next request and grants no other delivery, staffing or finance rights.
2. A two-level policy requires the lead or delegate first and a different finance person second; economics and billing eligibility freeze only at final approval.
3. Where separation is required, the worker cannot self-approve through another operator identity or privileged grant; no role bypass exists.
4. Both levels bind exact revisions and current policy; changing policy requires return and resubmission.
5. Delegate review during leave, then revoke it and verify the worker cannot bypass the policy; archives preserve policies, delegations and review history without operator authority.

#### TIME-005 — Review consented evidence

*Tier:* Core · *Cites:* BASE-AGENT-005, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Workers connect selected permitted calendars and delivery projects and resolve source-cited suggestions before recording actual work.

**Acceptance.**
1. Review suggested intervals, source links and ambiguous client matches; confirm actual duration and billability.
2. Connect a calendar and issue project, resolve a meeting matching two clients and reject a PR-only suggestion.
3. Revoking consent stops collection; meetings and activity never become approved time merely by occurring.
4. Agent collection and proposed actions follow company policy for standard and external classes without treating source text as authority.

#### TIME-006 — Recover continuous timers

*Tier:* Core

**Requirement.** One durable worker timer follows web, desktop, mobile and extension and preserves exact work through reconnects and duplicate stops.

**Acceptance.**
1. Start on desktop, inspect on mobile, disconnect, reconnect and stop twice; one exact interval remains.
2. Worker-controlled idle and forgotten-timer prompts let the worker split or discard intervals without passive surveillance.
3. Recover an overnight timer using the worker’s chosen actual interval.

#### COST-002 — Review expense economics

*Tier:* Core · *From:* COST-002

**Requirement.** Expense policy records categories, vendor, incurred currency, approved FX evidence, receipt tax, markup, reimbursement and client recovery separately; BOUNDARY-001 owns specialist-input reconciliation and INVOICE-005 owns provider sales tax.

**Acceptance.**
1. Receipt subtotal plus separately recorded receipt tax is incurred cost; owner-approved rates effective on the incurred date convert gross cost, rounded half up to billing-currency cents, retaining both dated rate snapshots.
2. Mileage per mile and per diem per day use quantities with up to three decimals and immutable finance-approved effective-dated unit rates. Approve 120 miles, change tomorrow’s rate and preserve the approved amount.
3. Finance or owner reviews receipt-backed policy exceptions, unit claims, FX, tax and markup with a reason against the exact submitted revision; private commercial economics stay private.
4. An input edit before approval creates a new revision needing fresh review; approved inputs cannot be overwritten.
5. Client recovery is approved gross cost plus allowed markup, independent of employee reimbursement; it is expense economics rather than provider-calculated invoice sales tax.

#### COST-004 — Reconcile reimbursement handoffs

*Tier:* Core · *From:* COST-002

**Requirement.** Finance prepares a separate immutable reimbursement handoff using BOUNDARY-001’s exact specialist-input and receiver-result controls; COST-003 owns accounting bills.

**Acceptance.**
1. Each approved expense is reserved once; artifact and receiver result bind source revisions, currency, amount, quantity and unit, with separate totals by category, unit and currency.
2. Receiver outcomes are labelled user-recorded and not independently verified; rejected inputs remain unresolved.
3. After reconciliation, each source may have one successor signed adjustment; current reimbursement entitlement stays between zero and the original approved amount.
4. Adjustments retain every earlier artifact and history and never change client invoices.
5. Submit a travel receipt with a policy exception, approve it, hand it off for reimbursement and invoice the allowed markup once; reimbursement never doubles client recovery.
6. The native handoff makes no payment, filing, automatic send or provider posting.

#### COST-003 — Track purchase commitments and actual costs

*Tier:* Core

**Requirement.** Track subcontractor scope, purchase orders, expected vendor costs, received invoices and approval; CONNECT-001 and CONNECT-002 supply accounting bill readback.

**Acceptance.**
1. Commit $8,000 to a subcontractor and receive two bills; forecasts include remaining committed unbilled cost and count matched actual costs once.
2. Read QBO bills and purchases coded on each line to a mapped customer/project, and Xero expenses or bills coded through project tracking categories, as actual project costs with stable external IDs.
3. A $3,000 QBO sandbox bill coded to the project appears once against the $8,000 commitment; resync adds nothing. A coded bill with no mapped project is listed as unmatched.
4. Export W-9 and 1099 classification references to the accounting provider without filing tax forms.

### Economics, forecasts and financial control

#### FINANCE-001 — Explain actual and forecast margin

*Tier:* Core · *From:* FINANCE-001 · *Rules:* D-4

**Requirement.** Finance sees project and phase costs, operational value, remaining effort, ETC, EAC and margin on the FINANCE-006 basis; BUDGET-002 inherits phase figures before phase budgets ship, and REPORT-005 supplies lineage.

**Acceptance.**
1. At the FINANCE-006 / FINANCE-018 as-of day, figures use integer cents of the engagement currency. Approved cost equals frozen approved time cost plus approved expenses.
2. Provisional cost equals submitted unapproved time at its work-date cost rate under RATE-002 precedence, rounded half up per entry, plus submitted expenses. It is separate from approved cost and actual margin.
3. Earned operational value equals FINANCE-006 / FINANCE-018 actual fees, including recorded opened-period retainer fees earned ratably through the inclusive as-of day; it is labelled operational value. Accountant-decided recognized revenue remains separately labelled under FINANCE-005.
4. Remaining effort shows open-task estimates and committed allocation seconds after the as-of day. Actual margin equals earned operational value minus approved cost; forecast margin equals FINANCE-006 committed margin.
5. Margin is finance-only. Missing or other-currency cost, or missing hourly bill amount, makes each affected figure and margin unknown beside the known subtotal and named source links, never zero.
6. Approve time and expenses, leave one cost unknown and invoice half the project: actual and forecast margins and their incomplete flags trace to the exact source records.

#### FINANCE-008 — Distinguish issued billing and paid cash

*Tier:* Core · *From:* FINANCE-001 · *Rules:* D-4

**Requirement.** Finance distinguishes issued billing, preparation adjustments and allocated cash; INVOICE-001/004 supply net issued documents and INVOICE-006 / INVOICE-015 supplies allocated payments before those capabilities ship.

**Acceptance.**
1. Native issued totals net of issued credit notes read invoiced, pre-tax. Without issued documents, approved packets net of adjustments read billing prepared, not invoiced; preparation adjustment deltas remain distinct from issued credits.
2. Paid cash uses dated allocated manual receipts, labelled user-recorded, not provider verified. Without receipts it reads No payments recorded, never zero. Amounts and source rows reconcile with the margin view.

#### FINANCE-002 — Revenue and cash forecast

*Tier:* Core · *From:* FINANCE-002 · *Rules:* D-4

**Requirement.** Finance forecasts revenue on FINANCE-006 and expected invoices and cash on FINANCE-007, by currency and month at the FINANCE-006 as-of day; INVOICE-001 supplies actual issued receivables, and FINANCE-007 supplies disputes, scheduled-invoice probabilities and processor cash distinctions before each ships.

**Acceptance.**
1. Each month shows committed revenue, separate + tentative and + weighted pipeline additions, expected invoices, on-terms cash, historical-timing cash and the range between them. Each engagement shows booked revenue as actual fees and contracted backlog as committed EAC fees minus actual fees.
2. Issued invoices replace matching forecast sources once using actual issue and immutable due dates; dated manual receipts reduce open amounts. Native open receivables reconcile per currency, or read None issued.
3. Manual receipts, pending processor cash and bank-settled cash remain separate; a manual receipt never verifies processor settlement.
4. A month is incomplete when any engagement forecast in that currency is incomplete. Client terms, days late and probability remain finance-only; every cash figure links to milestones or committed-fee sources, assumptions and as-of day.
5. Delay a milestone two weeks: the shifted cash curve equals an independent FINANCE-007 recomputation month by month while booked revenue and settled cash remain distinct.

#### FINANCE-009 — Schedule unissued invoices and expected receipts

*Tier:* Core · *From:* FINANCE-002 · *Rules:* D-4

**Requirement.** Finance schedules unissued pre-tax invoices and expected receipts using FINANCE-007; RETAINER-005 / RETAINER-013 replaces the explicitly assumed recorded-period date with contractual scheduling.

**Acceptance.**
1. An approved fixed milestone is scheduled on its due date. Other monthly committed hourly fees, billable expenses, expense budget and retainer overages are scheduled monthly in arrears on the first of the next month.
2. A recorded opened-period retainer fee is assumed in advance on its active start, once, labelled assumed, not issued, and excluded from the arrears cycle.
3. Expected receipt equals invoice date plus finance-set client Net N terms, from 0 to 365 days. Only unset terms use 30 days with Net 30 assumed. Finance-approved average days late, from 0 to 365 with the approver retained, adds the historical-timing date.
4. A receipt date before the as-of day moves to the as-of month flagged past due. Expected cash equals open amount times collection probability, rounded half up to cents, beside full open amount; probability is 100% unless finance sets 0–100.

#### FINANCE-010 — Forecast payment promises

*Tier:* Core · *From:* FINANCE-002 · *Rules:* D-4

**Requirement.** The cash forecast applies the latest immutable finance-recorded payment promise under INVOICE-006 / INVOICE-017 and FINANCE-007.

**Acceptance.**
1. A promise moves up to its stated amount of remaining open balance to its date without adding days late and supersedes earlier promises.
2. Once the promise date is before the as-of day it is broken; its amount returns to the as-of month flagged overdue. Changing a promise shifts only the corresponding cash curve and reconciles month by month to FINANCE-007.

#### FINANCE-003 — Project scenarios and baseline comparison

*Tier:* Core · *From:* FINANCE-003 · *Rules:* D-4

**Requirement.** Finance and leads compare isolated scope, staffing, rate, write-down, overtime and deadline alternatives using FINANCE-006 / FINANCE-018 pricing and FINANCE-002 cash assumptions; BUDGET-002, RETAINER-005, SALES-002/005 and INVOICE-001/004 inherit comparison and exact native adoption for new capabilities.

**Acceptance.**
1. Compare up to 20 distinct alternatives against an unchanged baseline, per currency, showing dates, utilization, remaining cost, margin and cash across affected projects.
2. Private financial comparisons and cross-project adoption are finance/owner-only; leads retain project-scoped planning visibility.
3. Finance prepares an immutable scenario and explicitly selects alternatives for a fresh comparison. Adoption retains the exact selection, input revisions and named human approval atomically; changed baseline records or a new agency day require fresh preparation and review.
4. Alternatives altering the same source are compared separately. Unknown prices or calendars remain incomplete, with null financial comparisons and named sources; no currency conversion is implied.
5. Adoption changes only selected alternatives, once on replay, preserving the baseline history and unselected records. A two-project employee-to-contractor comparison adopts only selected future staffing.

#### FINANCE-011 — Compare future staffing replacements

*Tier:* Core · *From:* FINANCE-003 · *Rules:* D-4

**Requirement.** A staffing scenario replaces future work while retaining the original booking economics and history; staffing linked to an approved DELIVERY-002 baseline first uses that schedule flow.

**Acceptance.**
1. The inclusive replacement date is strictly after the agency as-of day and inside the original booking. Quantity, commitment, service and original end date are preserved; earlier dates retain the original person.
2. Both affected projects show baseline and candidate utilization, dated costs, margin and cash. Cross-project overtime spillover is included even where another project has no edited source.

#### FINANCE-012 — Compare prospective rates and billing adjustments

*Tier:* Core · *From:* FINANCE-003 · *Rules:* D-4

**Requirement.** Rate scenarios append a RATE-002 card strictly after the as-of day, with ordinary scope, currency and precedence, and compare all matching future staffed projects. [Mechanism](docs/contract/mechanism-finance.md#finance-012).

**Acceptance.**
1. Frozen approved actuals and earlier cards remain unchanged. Prospective write-down is in basis points after the daily overtime billing premium; neither changes declared labor cost.
2. Allocation pricing uses exact seconds without time-entry billing increments. Approved raw seconds consume the daily threshold first, then committed bookings across projects, then tentative bookings; tentative work never changes committed prices.
3. Internal, nonbillable and unpriced allocations also consume the threshold. Premium hourly rate, ordinary/premium fee segments and write-down each round half up to integer cents; actual approvals retain their approval-order calculation and frozen prices.

#### FINANCE-013 — Compare dependency-aware deadline changes

*Tier:* Core · *From:* FINANCE-003 · *Rules:* D-4

**Requirement.** A deadline scenario delays a node in the latest approved DELIVERY-002 baseline using its business calendar, dependencies and linked-booking offsets.

**Acceptance.**
1. Only source work starting after the as-of day moves. Compare original and candidate task, milestone, staffing and finish dates, global utilization and conflicts, effective-dated cost, margin and expected cash months.
2. Adoption appends the reviewed native baseline without changing approved milestone amounts.

#### FINANCE-014 — Compare future scope and replacement terms

*Tier:* Core · *From:* FINANCE-003 · *Rules:* D-4

**Requirement.** Scope scenarios explicitly revise engagement scope, selected future staffing quantities, service and billability, future open-task effort and optional approved replacement commercial terms.

**Acceptance.**
1. Replacement terms are whole terms rather than additive deltas. Earlier booking dates, prior terms and all approved actuals remain intact; billing mode cannot change when approved actuals exist.
2. A scope split linked to a delivery baseline uses the schedule flow first. Scope effort alone does not move dates.
3. Replacement terms cannot erase approved fixed-fee milestones. Additional unscheduled fixed fees remain incomplete with null financial comparisons until scheduled.

#### FINANCE-004 — Monthly period close

*Tier:* Core · *From:* FINANCE-004 · *Rules:* D-4

**Requirement.** Finance resolves operational reconciliation and closes an immutable agency period. The close composes TIME-003 and RETAINER-004, retaining their independent cutoffs and close records.

**Acceptance.**
1. Resolve missing time, missing or unapproved costs, WIP, unbilled work and connector mismatches through a checklist and reconciliation snapshot.
2. The finance locked-through date is at or after period end and remains held. Every active retainer family period has an immutable close link or named open exception; the agency snapshot does not duplicate or replace the retainer close.
3. Manual external matching binds exact invoice net amounts, currency and native source revisions. Finance-recorded controls read unverified and never claim accounting-provider acceptance.
4. Close and reopen apply GOVERN-001 review limits to the largest source-currency gross reconciliation-category sum, with mixed/unpriced protection. Changed exact inputs or time-cutoff effects require renewed review.
5. Attempt close with missing cost and an unmatched invoice: it is refused; after both are resolved, the immutable snapshot and repeated downloads reconcile unchanged. All supported dated financial facts respect an active close.

#### FINANCE-015 — Reopen and correct a closed agency period

*Tier:* Core · *From:* FINANCE-004 · *Rules:* D-4

**Requirement.** Authorized reopening and later adjustments preserve the original immutable reconciliation; late time follows TIME-003.

**Acceptance.**
1. Late correction requires an authorized TIME-003 reopen and ordinary time approval, or a linked later adjustment. Role-checked agency reopening is audited.
2. Relocking and closing append a link to the original immutable agency record rather than overwrite it.

#### FINANCE-005 — Revenue schedules for the accountant

*Tier:* Core · *From:* FINANCE-005 · *Rules:* D-4

**Requirement.** Configure service-delivery, milestone and time-based operational revenue schedules, deferred/unbilled balances and journal mappings under the appointed accountant’s recognition policy; the accountant decides policy and certification.

**Acceptance.**
1. The owner records the accountant and policy reference against an exact approved budget. A schedule has revision history, one schedule per engagement and four distinct journal accounts.
2. Revising the accountant or policy reference changes neither schedule terms nor journal accounts. Approved journals retain original policy; outstanding drafts require fresh preparation.
3. Finance prepares and explicitly approves operational journals. Service delivery uses a reviewed amount and evidence for one delivery month; milestones require exact approved, accepted, finance-authorized delivery; time uses exact approved hourly billable value.
4. Recognition never exceeds the approved schedule amount. A prepaid fixed project recognized over approved delivery months reconciles with its deferred and unbilled balances.

#### FINANCE-016 — Reconcile recognition and correct delivery journals

*Tier:* Core · *From:* FINANCE-005 · *Rules:* D-4

**Requirement.** Reviewed revenue snapshots reconcile net issued invoices through their date with cumulative approved recognition without inventing delivery.

**Acceptance.**
1. Deferred equals positive billed excess; unbilled equals positive recognized excess. Finance can approve zero-recognition reconciliation after net issued invoices change.
2. One signed correction per exact approved service-delivery journal records a corrected nonnegative amount, preserves the original and always requires another active owner or finance reviewer, even without a review limit.
3. Milestone/time source corrections require new approved source handling. Repeated corrections and phase schedules retain exact source and journal history rather than overwrite approved recognition.

#### FINANCE-017 — Provide reconciled recognition inputs to specialist books

*Tier:* Core · *From:* FINANCE-005 · *Rules:* D-4

**Requirement.** Provide reviewed ASC 606 inputs to QBO, Xero or enterprise ERP under BOUNDARY-001’s exact specialist-input and accepted/rejected reconciliation; the bounded manual flow carries no provider posting or certification authority.

**Acceptance.**
1. Balanced mapped movements retain exact source revisions in an immutable specialist handoff. Accepted and rejected lines bind the artifact hash, amounts and source identity, remain user-recorded and do not claim independently verified provider acceptance.
2. A person transfers the manual artifact; preparation or download is not an automatic send, accounting post or recognition certification. Broader live accounting handoff retains these identity, reconciliation and truthful outcome obligations.

#### FINANCE-006 — Committed forecast basis

*Tier:* Core · *From:* FINANCE-006 · *Rules:* D-4

**Requirement.** Finance forecasts project, phase and month on one stated FINANCE-006 basis, with effective RATE-002 rates and frozen RATE-001 actuals; BUDGET-002 inherits phase figures before phase budgets ship and REPORT-005 supplies lineage. [Mechanism](docs/contract/mechanism-finance.md#finance-006).

**Acceptance.**
1. Actual fees equal approved billable time at frozen bill rates plus approved billable expenses. ETC fees equal future committed allocations at each allocated day’s effective bill rate. EAC fees equal actual fees plus ETC fees plus remaining billable expense budget.
2. Cost actuals, ETC and EAC use the same basis with effective cost rates and remaining expense cost budget. Forecast margin equals EAC fees minus EAC cost.
3. The as-of day is the agency-timezone date or selected finance as-of day; only allocation days after it are future. Actuals fall in work month, allocations on allocated days and dated expense remainder on its dates.
4. Forecasts, costs and rates are finance-only. Each allocation day rounds half up to cents using FINANCE-003 overtime then write-down semantics for billing without changing declared labor cost.
5. An immutable finance-recorded rate withdrawal removes its card from subsequent pricing precedence while frozen approvals retain their rates. Unpriced allocations are listed and make figures incomplete, never zero.

#### FINANCE-018 — Schedule commercial revenue and forecast additions

*Tier:* Core · *From:* FINANCE-006 · *Rules:* D-4

**Requirement.** Hourly forecasts use the committed allocation basis; fixed fees follow approved INVOICE-002 milestone/percentage schedules, retainers follow RETAINER-002 / RETAINER-008/005 period and overage schedules, and SETUP-005 governs currency conversion.

**Acceptance.**
1. Fixed and retainer cost still uses allocation pricing. Unscheduled fixed-fee remainder or a missing period fee marks revenue incomplete.
2. Recorded opened-period retainer fees earn ratably through the inclusive as-of day using the immutable contractual version’s saved working weekdays and holidays; their unearned remainder is ETC. Scheduled issuance counts each fee once.
3. Approved terms may hold one billable expense budget, optionally dated, with equal pass-through bill and cost amount; COST-002 owns categories and markup. An undated remainder spreads whole cents evenly over the months from the day after the as-of date through the last committed allocation day, earliest months receiving leftover cents.
4. Tentative work and probability-weighted pipeline remain separate + tentative and + weighted pipeline additions to committed figures. Each open opportunity’s weighted value spreads evenly over proposed-date months with earliest months receiving leftover cents.
5. Other-currency engagement margin and portfolio totals use approved SETUP-005 conversion. Until conversion is available, totals remain per currency and other-currency costs make figures incomplete.

#### FINANCE-019 — Reconcile committed forecast arithmetic

*Tier:* Core · *From:* FINANCE-006 · *Rules:* D-4

**Requirement.** A dated hourly and fixed-fee scenario demonstrates committed forecast values independently of tentative work.

**Acceptance.**
1. As of 20 October, use $90/hour cost and $150/hour billing changing to $175/hour on 1 November; approve 10 hours worked 1–17 October, commit 12 hours on 21–31 October and 8 on 3–7 November, add 8 tentative November hours and a $500 November billable expense budget.
2. Actual fees are $1,500; committed ETC fees $3,200; committed EAC fees $5,200; tentative-inclusive EAC fees $6,600. Cost EAC is $3,200 ($900 + $1,800 + $500), and committed margin is $2,000.
3. Committed fees split October $3,300 and November $1,900, with +$1,400 tentative in November. Withdrawing the November rate changes November to $1,700 and committed EAC to $5,000.
4. A $20,000 fixed project with two $10,000 milestones places revenue in those milestone months regardless of allocations.

#### FINANCE-007 — Expected cash basis

*Tier:* Core · *From:* FINANCE-007 · *Rules:* D-4

**Requirement.** Every FINANCE-002 / FINANCE-009, REPORT-003 and RECOVER-001/003 cash figure uses one invoice/receipt-date basis, with INVOICE-002 billing schedules, DELIVERY-005 acceptance and RETAINER-005 contractual timing.

**Acceptance.**
1. Issued invoices use actual issue dates. Unissued hourly fees and billable expenses use actual/committed FINANCE-006 / FINANCE-018 billing-period fees on the engagement cycle, such as the first of next month for monthly arrears.
2. Fixed milestones, percentages and deposits use scheduled invoice dates, or the later required delivery-acceptance date. Retainers use contractual advance period start or arrears schedule, and overages the next cycle.
3. Recorded opened-period fees are assumed invoiced at active start, labelled not issued, with no arrears duplicate; contractual schedule and issuance replace that assumption once.
4. Expected receipt equals expected invoice date plus client terms: Net 30 on 15 October is 14 November. Finance may approve average days late proposed from settled history under RECOVER-006, labelled historical timing with days and approver.
5. A promise sets its amount’s date until broken. Issued unpaid amounts past expected receipt move to the as-of month flagged overdue, never a past month. Each month shows on-terms and approved historical timing, with the lower/higher figures as the assumption range.

#### FINANCE-020 — Weight open balances and distinguish settlement

*Tier:* Core · *From:* FINANCE-007 · *Rules:* D-4

**Requirement.** Expected cash uses open balances and explicit probabilities; INVOICE-006 / INVOICE-016/007 own disputes, PAYMENT-001/002 own pending/settled outcomes, SETUP-005 owns approved conversion and REPORT-005 owns lineage.

**Acceptance.**
1. Open amount equals invoice total less allocated payments and credits; unissued amounts are pre-tax fees plus billable expenses, labelled pre-tax.
2. Expected cash equals open amount times collection probability, 100% unless finance sets a client, issued-invoice or scheduled-invoice percentage, labelled beside full open amount.
3. Disputed amounts are excluded from expected cash and listed separately by invoice. Tentative and weighted-pipeline amounts remain only labelled FINANCE-006 / FINANCE-018 additions.
4. Pending ACH and other processor payments remain separate from settled cash and never count as settled. Other currencies convert only under SETUP-005.
5. Each figure links to invoice or schedule, terms, days late, probability and as-of time.

#### FINANCE-021 — Reconcile cash timing scenarios

*Tier:* Core · *From:* FINANCE-007 · *Rules:* D-4

**Requirement.** A New York client example reconciles invoice dates, historical timing and later milestone dates month by month.

**Acceptance.**
1. On 10 October with Net 30 and nothing issued, schedule a $10,000 fixed milestone for 15 October, $4,000 October hourly fees invoiced 1 November and a $3,000 November retainer invoiced in advance 1 November.
2. Expected cash is November $10,000 due 14 November and December $7,000 due 1 December. Approving 10 days late keeps those monthly amounts with 24 November and 11 December historical dates beside on-terms dates.
3. Moving the milestone to 29 October keeps $10,000 in November, due 28 November; moving it to 5 November moves $10,000 to December, due 5 December.

#### FINANCE-022 — Reconcile disputed probabilistic and pending cash

*Tier:* Core · *From:* FINANCE-007 · *Rules:* D-4

**Requirement.** Cash scenarios preserve open amount, dispute and processor-state distinctions under the original Net 30 schedule.

**Acceptance.**
1. Issue the milestone invoice on 15 October and record a $1,000 dispute: November expected cash is $9,000 with $1,000 separately disputed.
2. Set 50% collection probability on the scheduled retainer invoice: December expected cash is $5,500 beside the full $7,000.
3. On 2 December pay the $4,000 hourly invoice by ACH in Stripe test mode: it shows $4,000 pending ACH, never settled, until Stripe reports settlement.

### Invoices and collections

#### INVOICE-001 — Issue numbered USD and client-currency invoices

*Tier:* Core · *From:* INVOICE-001 · *Rules:* D-3

**Requirement.** Finance issues eligible approved time, services, reimbursable costs and fixed budgets in USD or the SETUP-005 engagement currency, carrying BOUNDARY-001 specialist-input identity and exact accepted/rejected reconciliation.

**Acceptance.**
1. Each invoice has one currency, bill-to, remit-to, PO, terms, due date and exact source allocation. Draft, approved, issued, partially paid, paid, void and credited states remain explicit.
2. Unique reservations bind exact source revisions. Concurrent USD issuance from time and expenses creates one immutable numbered invoice and bills each source once.
3. RETAINER-002 / RETAINER-008 reviewed overages retain exact agreed rates and quantities, while included allowance stays unbilled.
4. A CAD client’s invoice uses the same numbering sequence; lines, totals and payment link remain CAD. Provider outcomes remain honestly labelled.

#### INVOICE-009 — Reconcile issuance to financial reporting

*Tier:* Core · *From:* INVOICE-001 · *Rules:* D-3

**Requirement.** INVOICE-001 issuance feeds FINANCE-001 / FINANCE-008/002 without counting prepared billing as issued documents.

**Acceptance.**
1. Billed revenue uses issued invoices net of issued credit notes labelled invoiced, replacing billing prepared for the matching sources.
2. Issued receivables use actual issue date rather than None issued, replacing forecast sources once. Native source identity and accepted/rejected specialist results reconcile to the immutable document.

#### INVOICE-002 — Progress deposits and percentage charges

*Tier:* Core · *From:* INVOICE-002 · *Rules:* D-3

**Requirement.** Finance prepares and separately approves deposits or cumulative progress charges against the exact latest approved fixed project or phase budget, retaining DELIVERY-005 milestone acceptance and independent finance authorization. [Mechanism](docs/contract/mechanism-invoice.md#invoice-002).

**Acceptance.**
1. Percentage is 0.01–100% with at most two decimals. Gross target equals whole fixed fee times percentage, rounded half up to cents; charge equals target less all previously approved charges and approved milestone amounts, never negative. A deposit must be first.
2. Approval rechecks budget and prior approved amount together; competing approvals cannot reserve the same balance. Draft history remains; approved charges and issued source snapshots are immutable.
3. Finance may withdraw an exact unapproved draft with a reason, preserving history and approved amounts. Reservation, ordinary packet approval and issuance apply once per charge.
4. Credits, voids and packet cancellation never reset cumulative budget or recreate an approved percentage charge. Charge dates schedule pre-tax invoices using client terms; issuance replaces the schedule once.
5. A billing charge is neither delivery acceptance nor earned revenue. Unscheduled fixed delivery revenue remains incomplete.

#### INVOICE-010 — Consolidate approved client project billing

*Tier:* Core · *From:* INVOICE-002 · *Rules:* D-3

**Requirement.** Finance explicitly combines approved project and phase sources for one live client and currency into one packet and numbered invoice; BASE-002 and GOVERN-005 retain metadata, issued documents and history.

**Acceptance.**
1. Approval and issuance recheck every project and preserve per-line project, phase and source revisions and frozen remaining amounts.
2. A fixed charge’s remaining-to-bill amount equals approved project or phase fee minus its gross cumulative target. Collect a 20% deposit on two projects, then issue one combined progress invoice with both deposit deductions and each remaining budget reconciled.
3. Project and phase reports allocate receipts, promises and disputes by cumulative half-up shares of source-line amounts net of issued credits; agency totals count the document once.

#### INVOICE-011 — Bill disjoint partial time and recurring charges

*Tier:* Core · *From:* INVOICE-002 · *Rules:* D-3

**Requirement.** Partial hourly billing preserves approved source work; BUDGET-002 / BUDGET-004 supplies not-to-exceed caps and RETAINER-005 / RETAINER-013 supplies recurring principal and reviewed-overage issuance, consent and exception rules. [Mechanism](docs/contract/mechanism-invoice.md#invoice-011).

**Acceptance.**
1. Selected whole billing seconds reserve disjoint portions priced as the difference of cumulative half-up values, leaving the rest available without changing approved time.
2. Cancelled drafts release only their own portions; reserved originals cannot be edited or billed again in full. Portions and history survive BASE-002 portability.
3. Not-to-exceed work retains its capped draft. Recurring principal and reviewed overages remain version-bound to their existing native schedules and exact consent.

#### INVOICE-003 — Branded invoice preview and exact hosted access

*Tier:* Core · *From:* INVOICE-003 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001 · *Rules:* D-3

**Requirement.** Preview branded PDFs and secure hosted invoices under INVOICE-008 / INVOICE-019; RL-105 governs exact-document release. Under a company policy holding external and access actions for native-owner approval, the native owner releases one exact issued original to one existing email-confirmed native member without an internal Gauge grant.

**Acceptance.**
1. Preview includes logo, rich-text additional details, footer/remittance text and selected line presentation and time-detail files. The retained PDF and selected attachments remain the issued original bytes.
2. Release has an audited reason and expiry from one to thirty days and sends no message. Hosted page, PDF and selected attachments share the same exact authorization.
3. Each request rechecks live recipient, releasing owner, expiry and invoice revision. Revocation stops the next hosted read but does not recall delivered attachments.
4. Finance sees view facts bound to invoice revision and PDF digest. BASE-002 retains documents, authorization history and view facts without live recipient authority; CLIENT-003 inherits this exact-document boundary.
5. Finance delegation remains due under RL-105; the held native-owner journey is not a permanent removal of finance’s delivery capability.

#### INVOICE-012 — Dispatch exact-recipient invoice email

*Tier:* Core · *From:* INVOICE-003 · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001 · *Rules:* D-3

**Requirement.** RL-105 governs invoice email through a verified agency work address using Gmail, Microsoft 365 or transactional mail. Under a company policy holding external actions for native-owner approval, separate audited dispatch consent binds the exact document and recipient through GOVERN-008 custody and a durable provider job; INVOICE-007 inherits these fences. [Mechanism](docs/contract/mechanism-invoice.md#invoice-012).

**Acceptance.**
1. Queue and dispatch bind exact access release, invoice revision, recipient, configured sender, retained PDF digest and selected original detail-file bytes. PDF, message and invoice version remain linked.
2. Send to a controlled mailbox: its PDF, selected details and hosted link open the exact released document. Revoked source authority prevents dispatch.
3. Readback matches the admitted message, exact recipient, subject and durable delivery reference. Provider acceptance, mailbox delivery, bounce and client-view state remain distinguishable, with actionable failures.
4. Uncertain submissions never resend automatically; concurrent dispatch and replay cannot duplicate delivery. A bounce remains a visible owned failure.
5. Finance delegation and the broader named carrier doors retain their delivery obligations under RL-105.

#### INVOICE-004 — Credits discounts and write-offs

*Tier:* Core · *From:* INVOICE-004 · *Rules:* D-3

**Requirement.** Finance or the owner corrects issued invoices only through linked dated documents with reasons, source allocation and INVOICE-005 tax effects; BOUNDARY-001 carries exact specialist-input and accepted/rejected reconciliation. [Mechanism](docs/contract/mechanism-invoice.md#invoice-004).

**Acceptance.**
1. A credit, approved discount or write-off names invoice lines and is dated no earlier than issue. Across all credits, no line exceeds its billed amount and total credit never exceeds what remains owed after receipts and earlier credits.
2. Issued credit notes use their own sequence. The original invoice, packet and reservations remain unchanged; credited or written-down work never becomes billable again.
3. A correction reduction strictly above the GOVERN-001 owner-set limit remains pending without effect until another owner or finance person issues it; finance may withdraw it with a reason.
4. Credit part of an issued expense and reconcile original, source allocation and every linked credit. Pre-tax native corrections reverse no tax; provider tax calculation and reversal remain INVOICE-005 obligations.

#### INVOICE-013 — Void unpaid invoices and reissue valid balances

*Tier:* Core · *From:* INVOICE-004 · *Rules:* D-3

**Requirement.** Finance voids and reissues through immutable linked documents without reopening source eligibility. [Mechanism](docs/contract/mechanism-invoice.md#invoice-013).

**Acceptance.**
1. Only an invoice with no receipts and no credits can be voided. Its reissue is a new invoice in the ordinary sequence on the same packet, dated the void day with due date from saved client terms.
2. Each reissued line is no more than its original amount; unreissued value stays written down. The original packet and source reservations remain unchanged.
3. The review-limit reduction is voided total minus reissue. Above the GOVERN-001 limit it changes nothing until another owner or finance person issues the correction, or finance withdraws it with a reason.
4. Void an unpaid invoice and reissue its valid reduced balance: reconcile every original, source and linked document without billing source work again.

#### INVOICE-014 — Reconcile dated invoice corrections

*Tier:* Core · *From:* INVOICE-004 · *Rules:* D-3

**Requirement.** Issued credit notes and voids flow through FINANCE-001, SALES-001, REPORT-003, FINANCE-007 and BOUNDARY-001 on their effective dates.

**Acceptance.**
1. As of any day, invoices voided by then leave invoiced, open and cash figures; the reissue counts once. Credit notes issued by then reduce billed revenue, billed against booked value, open receivables and the open amount underlying expected cash.
2. Each correction has source lineage and a CSV row. Signed invoice-category handoff rows reconcile once to user-recorded accepted/rejected results without claiming provider verification.

#### INVOICE-005 — US sales tax and exemptions

*Tier:* Core · *Rules:* D-3

**Requirement.** Reviewed agency policy and Avalara or Stripe Tax determine service taxability and jurisdiction; QBO/Xero tax reconciles with the calculation while the accounting/tax provider files returns.

**Acceptance.**
1. Taxable and exempt US service invoices retain exemption-certificate references and consistent tax evidence from estimate through issue and credit.
2. In provider test mode, issue taxable and exempt invoices, credit a taxed line and reconcile calculation, invoice, reversal and books. Voids carry the corresponding tax effect.

#### INVOICE-006 — Accounts receivable aging and statements

*Tier:* Core · *From:* INVOICE-006 · *Rules:* D-3

**Requirement.** Finance sees aging, statements, disputes, unapplied and partial payments, credits and promises; FINANCE-001 uses allocated payments, FINANCE-007 uses promises/disputes, and PAYMENT-001/002/003 owns processor/bank reconciliation. [Mechanism](docs/contract/mechanism-invoice.md#invoice-006).

**Acceptance.**
1. The inclusive as-of day defaults to today in the saved agency timezone. Only issued invoices and manual receipts dated through it count; statements may filter by immutable issued client identity.
2. Each invoice retains issued client name, number, source revision, issue/frozen due dates, dated receipt references and invoiced, paid and open cents. Total equals paid plus credited plus owed; open after credits and allocations reconciles to that identity.
3. Due today is current; whole calendar days after due select 1–30, 31–60, 61–90 or 91+ days overdue. Paid invoices remain on statements with zero open.
4. Client and portfolio aging reconcile separately per currency without conversion. Revision-bound CSV agrees with the statement. Preparation sends nothing and verifies no settlement.

#### INVOICE-015 — Record and allocate client receipts

*Tier:* Core · *From:* INVOICE-006 · *Rules:* D-3

**Requirement.** Finance or the owner records client money and allocates it under unique-reference rules; processor payments and CONNECT-001/002 synced receipts enter the same allocation/unapplied rules before shipping. [Mechanism](docs/contract/mechanism-invoice.md#invoice-015).

**Acceptance.**
1. A receipt names one client, ISO 4217 currency, date, positive cents and an external reference unique across all client receipts and direct invoice receipts.
2. Allocate to one or many invoices of that client and currency. Each exact allocation is dated no earlier than receipt and invoice, no more than invoice open or receipt unapplied, once per receipt per invoice; concurrent allocations cannot exceed either balance.
3. Received equals allocated plus unapplied. Unapplied money never reduces invoice open; client net position is open minus unapplied. Statements count receipt and allocation dates inclusively, so before later allocation all money remains unapplied.
4. A receipt reads finance recorded; not bank or processor verified. Per-engagement paid cash is allocated payments.
5. Receive one payment covering two invoices, retain unapplied money and trace aging/statement totals through a later credit.

#### INVOICE-016 — Record and resolve invoice disputes

*Tier:* Core · *From:* INVOICE-006 · *Rules:* D-3

**Requirement.** Finance records dated disputes without changing invoice debt or aging; INVOICE-007 owns collection holds and late fees and FINANCE-007 excludes disputed expected cash. [Mechanism](docs/contract/mechanism-invoice.md#invoice-016).

**Acceptance.**
1. One open dispute per invoice flags at most its open amount from dispute date through, but excluding, resolution date. Displayed dispute is the lesser of flagged amount and remaining open.
2. Resolve as rejected, withdrawn or credited; credited resolution names an issued credit note of that invoice. Invoice, aging bucket and owed amount remain unchanged by the dispute itself.
3. The disputed amount is excluded from expected cash and listed separately with its invoice.

#### INVOICE-017 — Record payment promises and reconcile cash

*Tier:* Core · *From:* INVOICE-006 · *Rules:* D-3

**Requirement.** Finance records immutable promises used by FINANCE-002 / FINANCE-010/007 until broken.

**Acceptance.**
1. A promise sets its amount’s expected-cash month, superseding the previous promise up to remaining open balance. Changing it produces the independently recomputed FINANCE-007 shift month by month.
2. A broken promise returns its amount to the as-of month flagged overdue without fabricating receipt or settlement.

#### INVOICE-007 — Overdue follow-up until resolution

*Tier:* Core · *From:* INVOICE-007 · *Cites:* BASE-MAIL-001 · *Rules:* D-3

**Requirement.** Run approved email collection cadences from due dates and client terms, inheriting INVOICE-003 / INVOICE-012 exact-document, dispatch-consent and durable-job fences; uncertain outcomes belong to a named finance owner.

**Acceptance.**
1. Cadences track delivery, replies and promise-to-pay/dispute holds. Send a scheduled overdue reminder, record a dispute and pause the sequence.
2. Verified payment, credit or cancellation stops the sequence. Ingest payment before the next reminder and observe no further send; uncertain outcomes escalate rather than appear resolved.

#### INVOICE-018 — Draft permitted late fees

*Tier:* Core · *From:* INVOICE-007 · *Rules:* D-3

**Requirement.** Client terms may define a flat late fee or percentage per period with a cap; FOLLOWUP-003 owns bounded-policy issuance.

**Acceptance.**
1. A fee is a separate linked line for finance approval unless the bounded policy authorizes issuance. No disputed amount is charged.
2. An undisputed invoice reaching 30 days overdue with 1.5% monthly terms produces one draft of exactly 1.5% awaiting finance approval.

#### INVOICE-008 — Invoice line presentation and time-detail backup

*Tier:* Core · *From:* INVOICE-008 · *Rules:* D-3

**Requirement.** Finance chooses client presentation defaults and draft overrides without changing money, sources or numbering; INVOICE-003 / INVOICE-012 owns secure delivery.

**Acceptance.**
1. Time can be one line per service, task, person, phase or project, or one line per entry with date, person, task, hours, rate and notes. Expenses are itemized with date, category, vendor, amount and receipt reference, or summarized by category.
2. Optional PDF and CSV detail lists every billed source with date, person, task, notes, actual/billed duration, rate and amount, including expense receipt references, and totals to invoice lines.
3. Render the same 14 approved time entries and three approved expenses by service/category and by entry/item. Both PDFs agree to the cent; issuing the summarized version assigns the number once and its details list exactly those 14 entries and three expenses with equal total.
4. Defaults and overrides are finance-only. Issued originals and selected attachments remain unchanged for manual, scheduled and reissued invoices; approved expense category/vendor labels remain frozen.

#### INVOICE-019 — Agency and client invoice branding

*Tier:* Core · *From:* INVOICE-008 · *Cites:* BASE-INPUT-002 · *Rules:* D-3

**Requirement.** Agency invoice settings hold logo, rich-text additional details and footer/remittance text, including ACH/wire instructions and payment terms, with client overrides. [Mechanism](docs/contract/mechanism-invoice.md#invoice-019).

**Acceptance.**
1. The issued footer shows the selected client remittance text; previews consume no invoice number. Changing later defaults does not alter issued originals.
2. Logo accepts PNG/JPEG bytes and rich text uses limited formatting. Rendering fetches no remote assets; branding does not expose EIN or private internal data.

#### PAYMENT-001 — Stripe card and ACH payment links

*Tier:* Core · *From:* PAYMENT-001 · *Cites:* BASE-SECRET-001, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008 · *Rules:* D-1 · *Register:* R-7

**Requirement.** RL-107 governs collection through the agency merchant account. Attach Stripe-hosted card/ACH links to invoices; PAYMENT-002 reconciles canonical outcomes, INVOICE-006 / INVOICE-015 supplies receipt allocation and GOVERN-008 supplies credential custody.

**Acceptance.**
1. An authorized instruction binds the exact agency merchant account, invoice revision, amount, currency and canonical test/live mode. A mismatched merchant, mode or revision cannot release collection.
2. Payers enter card/bank details only at the processor. Gauge holds no funds and receives no raw card or bank credentials. Partial payments and processor fees stay explicit.
3. Card and ACH test payments progress through pending and final outcomes; ACH remains pending until the processor reports the outcome and never appears settled prematurely. Cash changes only when canonical available-balance evidence supports it.
4. Under a company policy holding money actions for native-owner approval, an audited exact owner instruction releases the link; the provider-required payer/onboarding step is gated and completed by a person.
5. Finance delegation and recurring collection remain due under RL-107, preserving exact amount, currency, mode, revision and outcome controls rather than treating the held owner-only journey as the final scope.

#### PAYMENT-004 — Preserve payment evidence without restored authority

*Tier:* Core · *From:* PAYMENT-001 · *Cites:* BASE-DATA-001, BASE-SECRET-001 · *Rules:* D-1 · *Register:* R-7

**Requirement.** PAYMENT-003, CLIENT-003 and CONNECT-001 inherit PAYMENT-001 custody, exact instruction and reconciliation obligations before adding payment doors.

**Acceptance.**
1. Refund authorization is exact, typed and audited under the held money policy. Refunds and returns append dated signed entries rather than rewrite prior receipts.
2. Archives retain business evidence and payment history without provider credentials, payment consent or executable claims. Restoring cannot collect, refund or revive old recipient access.

#### PAYMENT-002 — Reconcile processor outcomes

*Tier:* Core · *From:* PAYMENT-002 · *Cites:* BASE-OPS-003, BASE-AUDIT-001 · *Rules:* D-1 · *Register:* R-7

**Requirement.** RL-108 governs canonical payment state and stable payment identity. Verify signed provider events and periodically read back payments, refunds, disputes, fees, payouts and ACH returns; INVOICE-006 / INVOICE-015, INVOICE-016 supplies once-only allocations and BOUNDARY-002 supplies merchant custody.

**Acceptance.**
1. Invalid or expired signatures admit no outcome. Signed callbacks retain safe canonical evidence, and canonical readback determines the latest supported payment/balance state rather than callback arrival order.
2. Duplicates, out-of-order events, returns and retries never double-count a payment or allocation and never falsely label cash settled. Stable provider identity survives the full lifecycle.
3. Cash allocation changes only after canonical available-balance evidence, with pending and settled balances kept separate. Refunds and ACH returns append dated signed entries and reconcile to final invoice balances.
4. Replay out-of-order events, an ACH return and a refund: periodic readback reconciles the exact balances, disputes, fees and payout membership without a second allocation.
5. Under a company policy holding money actions for native-owner approval, each refund has a typed, exact audited instruction; signed callbacks alone do not refund or allocate cash. Finance delegation and periodic reconciliation remain due under RL-108.

#### PAYMENT-005 — Retain reconciled payment history safely

*Tier:* Core · *From:* PAYMENT-002 · *Cites:* BASE-DATA-001, BASE-SECRET-001 · *Rules:* D-1 · *Register:* R-7

**Requirement.** PAYMENT-003, CLIENT-003 and CONNECT-001 inherit PAYMENT-002 custody and reconciliation before adding doors; GOVERN-008 keeps provider credentials sealed.

**Acceptance.**
1. Safe payment metadata, signed refunds and returns retain source identity and dated history; fees and payout composition reconcile independently of gross invoice allocations.
2. Restore retains business evidence without provider credentials, consent or executable payment/refund claims; restored readback and refund execution require fresh authority before a provider request.

#### PAYMENT-003 — External payments and bank reconciliation

*Tier:* Core · *Rules:* D-1 · *Register:* R-7

**Requirement.** Reconcile accounting-recorded ACH, check, wire and card payments to Gauge invoices by stable references, inheriting PAYMENT-001/002 custody, authorization and outcome reconciliation and INVOICE-006 / INVOICE-015 receipt rules.

**Acceptance.**
1. Finance resolves ambiguous matches, overpayments and reversals before paid status changes.
2. Import a QBO check payment near two similarly numbered invoices, resolve the match as finance, then reverse it in QBO: Gauge shows the exact final allocation once.

### Reporting and client visibility

#### REPORT-001 — Portfolio profitability dashboard

*Tier:* Core · *From:* REPORT-001 · *Rules:* D-4

**Requirement.** Finance and owner filter/group portfolio comparisons by firm, client, project, team, service, lead, date and permitted SETUP-004 / SETUP-009, SETUP-010 custom fields; SETUP-005 supplies dated conversion before converted totals ship.

**Acceptance.**
1. Within an inclusive date window capped by explicit agency-local as-of day, select approved time by work date, approved expenses by date, fixed milestones by due date and recorded retainer fees by saved working-day earning basis.
2. Compare budget, burn, EAC, operational margin and losses. Operational margin equals earned value minus frozen approved labor/expense costs, not recognized revenue or certified profit.
3. Budget/EAC are labelled whole-project comparisons; monthly historical trends slice only earned value, approved burn and operational margin. Missing/unconverted costs keep affected figures null beside known subtotals and source links.
4. Filter a profitable retainer and loss-making fixed project by team and trace the difference to approved source time/cost. Every amount drills to immutable approved sources and current missing-cost rows.
5. CSV binds exact date, as-of, filters and revision snapshot and refuses stale inputs. Currency buckets remain separate; firm/client/project/lead grouping uses distinct stable identities.

#### REPORT-006 — Distinguish engagement cohorts and additive labor groups

*Tier:* Core · *From:* REPORT-001 · *Rules:* D-4

**Requirement.** Portfolio grouping distinguishes overlapping whole-engagement cohorts from additive labor and expense analysis. [Mechanism](docs/contract/mechanism-report.md#report-006).

**Acceptance.**
1. Filters select whole engagements. Team membership includes lead, assigned members and recorded time/staffing workers; services come from recorded time/staffing services.
2. Team/service/person groups read engagements involving X, are labelled non-additive and may overlap.
3. A separate additive view counts each approved source once by worker’s current team and recorded service, showing hours, frozen labor cost, expense cost and frozen hourly billable value only for hourly engagements. Expenses have unassigned service.
4. The additive view preserves unknown sources and claims no allocated commercial fee or team/service margin. Fixed and retainer fees appear separately unattributed, with daily earned value on each contractual version’s saved working weekdays/holidays, labelled and linked to terms.

#### REPORT-002 — Utilization and effective-dated billability targets

*Tier:* Core · *From:* REPORT-002 · *Rules:* D-4

**Requirement.** Show scheduled/actual utilization through RESOURCE-004 on Staffing, with targets and variance grouped by person, role, client, calendar month and permitted SETUP-004 / SETUP-009, SETUP-010 custom field. [Mechanism](docs/contract/mechanism-report.md#report-002).

**Acceptance.**
1. Utilization to target equals approved billable work-date seconds within inclusive report dates divided by net available seconds after holidays and leave. Internal work is never billable; a missing covered calendar day makes utilization unknown. Client groups have no capacity denominator.
2. Owner/finance records person or people-profile-role targets as percentages with up to two decimals and effective dates. Targets are immutable; latest effective date on/before last report date wins, then latest recorded, with person target above role target.
3. Variance equals utilization percent minus target percent in percentage points. At 75% target, 28 billable of 40 available hours shows 70% and −5 points.
4. Leads and staff see permitted people’s hours, utilization, targets and variance, never amounts, rates, costs or salary; REPORT-005 traces and exports every figure.

#### REPORT-007 — Realized billing and effective rates

*Tier:* Core · *From:* REPORT-002 · *Rules:* D-4

**Requirement.** Finance sees realization, write-offs and effective bill rates for approved billable hourly time in approved packets; SETUP-004 / SETUP-010 grouping and FINANCE-004 invoice write-offs inherit these definitions. [Mechanism](docs/contract/mechanism-report.md#report-007).

**Acceptance.**
1. Standard value is frozen approved entry bill amount; billed value is current approved packet amount after every approved correction. Write-offs equal standard minus billed; realization equals billed divided by standard times 100.
2. Effective rate equals billed value times 3600 divided by billed seconds, rounded half up to a cent, per currency. Approved unbilled standard value and approved nonbillable hours are separate.
3. Approve ten standard-value hours and write down two on the invoice: realized rate and utilization reconcile while frozen approved time remains unchanged and leads see no salary or private amounts.

#### REPORT-003 — Revenue cash and backlog dashboard

*Tier:* Core · *From:* REPORT-003 · *Rules:* D-4

**Requirement.** Finance sees weighted pipeline, signed backlog, WIP, retainer balances, invoices, collections and FINANCE-007 cash forecasts with explicit as-of time, connector freshness and reconciliation exceptions; approved SETUP-003 rates govern USD reporting conversion with each rate/date labelled.

**Acceptance.**
1. Week in review links weighted open pipeline, signed value before billing from latest approved budget or won opportunity, counting converted engagements once, current saved-period retainer statements and monthly cash forecast.
2. Hourly WIP equals frozen approved bill value of billable hourly work through inclusive as-of day outside retainer coverage and not source-billed, plus approved reimbursable expenses through that day. Fixed commercial fees and retainer allowances are excluded.
3. Packet approval does not issue invoices or remove WIP. Issuance removes each exact source once. Unknown bill values remain unknown beside known subtotal; overlapping measures are not summed.
4. Move a deal through won, delivered, invoiced and paid: value transfers once among the relevant buckets and stale accounting is flagged. Until approved conversion, currencies stay separate and unconverted.
5. Invoice/receipt figures, cash schedules and operational margin drill to immutable records and export; snapshot CSV binds revisions and refuses changed inputs. Manual receipt does not imply accounting connectivity or processor settlement.

#### REPORT-008 — Reconcile issued invoices and recorded receipts

*Tier:* Core · *From:* REPORT-003 · *Rules:* D-4

**Requirement.** The dashboard carries ordinary invoice-to-paid business audit, BOUNDARY-001 specialist input/result reconciliation and BASE-002 portability without implying provider verification.

**Acceptance.**
1. Native pre-tax issued invoices freeze approved packet, source revisions, bill-to/remit-to, client workspace, PO and saved Net N terms, using Net 30 assumed only while unset; numbering is sequential and there is one invoice per packet.
2. Manual bank receipts allocate exact positive cents once and cannot exceed outstanding value under concurrency. They read user-recorded, never provider-verified settlement.
3. Issued open plus recorded receipts reconciles to invoiced value per currency, with issued credits/corrections separately reconciled; issue and receipt dates count inclusively through as-of day. Business history survives whole-installation restore.

#### REPORT-004 — Custom reports and scheduled delivery

*Tier:* Core · *From:* REPORT-004 · *Cites:* BASE-ROLE-001, BASE-MAIL-001 · *Rules:* D-4

**Requirement.** Authorized users build saved reports from permitted fields, calculated measures and time/group filters, including SETUP-004 / SETUP-009, SETUP-010 custom fields; schedules retain recipient scope and freshness checks.

**Acceptance.**
1. Custom fields work as filters and groupings; number/currency fields support summed measures. Export CSV, XLSX and PDF with the saved report’s permitted data and totals.
2. Schedule client profit to finance and cost-free status to a lead. Revoke a recipient: the next email delivery stops without exposing the report.

#### REPORT-009 — Warehouse and read-only BI reporting

*Tier:* Core · *From:* REPORT-004 · *Rules:* D-4

**Requirement.** Finance schedules the same permitted saved datasets to Snowflake or BigQuery, or provides read-only feeds for Power BI and Looker Studio under unchanged field permissions.

**Acceptance.**
1. A scheduled BigQuery export has the same row count and totals as the on-screen saved report. Warehouse/feed access cannot reveal fields withheld from its recipient.

#### REPORT-005 — Trace every reported amount

*Tier:* Core · *Rules:* D-4

**Requirement.** Every reported figure identifies source rows, formula, rate version, currency, approvals and as-of timestamp; every future reported figure inherits this obligation before shipping.

**Acceptance.**
1. Screen/export totals agree; unknowns remain distinct from zero with known subtotals. Drill a project burn amount to frozen time/rate evidence and independently reconcile exported total while an unknown cost remains flagged.
2. RESOURCE-005 monthly committed, unfilled, won, tentative and weighted-pipeline demand, employee/contractor capacity, committed fees, cost and margin all have formulas, sources and snapshot CSV rows.
3. Approved resource scenarios retain capacity, demand, fees, cost and margin deltas versus baseline with allocations, open requests, opportunities, people, calendars, leave, engagements and scenario source rows. An incomplete FINANCE-006 fee/cost remains unknown beside its subtotal.

#### CLIENT-001 — Scoped client portal

*Tier:* Core · *From:* CLIENT-001 · *Cites:* BASE-ROLE-001

**Requirement.** Client sponsors and collaborators see only invited projects, accepted scope, deliverables, milestones and actions; finance separately chooses monetary disclosures. SETUP-004 / SETUP-009 versioned visibility applies before any custom field reaches a recipient; CLIENT-004 owns invitation/renewal notices.

**Acceptance.**
1. The explicit invitation journey uses a native owner, audited reason and an already Access-invited, email-confirmed recipient without an internal Gauge grant. Invitation sends nothing.
2. Every read rechecks live recipient, releasing owner, client identity, expiry and invitation revision. Cross-client direct URLs/API calls, private staff costs/rates, revocation and stale revisions are refused on the next request.
3. Try inviting a staff member or unconfirmed email, or short-link durations of zero or 31 days: each is refused. Invitation, sharing and revocation make no provider request.
4. Signed-in contacts from two clients see exactly their current invited projects and cannot read the other client. Archives retain audit without recipient authority.

#### CLIENT-005 — Renew standing project invitations

*Tier:* Core · *From:* CLIENT-001

**Requirement.** Project access supports a standing client relationship while retaining exact invitation identity and live releasing-owner authority.

**Acceptance.**
1. One-to-thirty-day access remains available. A native owner can grant up to 12 months and renew from the access list without re-entering the recipient; each renewal is audited.
2. When the releasing owner loses owner authority, invitations are stopped with that reason in the access list and recipient reads fail. A current owner renews in one audited action; reactivation alone does not revive old authority.
3. Grant a sponsor 12 months, renew it, deactivate the releasing owner and observe refusal/stopped state until current-owner renewal.

#### CLIENT-006 — Select client monetary details and retainer statements

*Tier:* Core · *From:* CLIENT-001

**Requirement.** Finance independently shares approved budget, burn, remaining budget and retainer value statements within each project’s client scope; RETAINER-003 governs statement calculations.

**Acceptance.**
1. Monetary details start off; each selected field is separately audited. Share only approved budget amount to one sponsor: that sponsor sees neither other money fields nor private costs, and a second sponsor with its own approved budget sees no monetary detail.
2. Permitted statements match the authorized manager’s opening allowance, rollover, approved consumption, pending provisional projection, linked adjustments, remaining hours/value and authorized source/rule versions.
3. Trace an approved statement source: pending time changes only provisional projection. Other-client and private cost/rate detail remains inaccessible; current/saved lead-and-finance fields remain excluded.

#### CLIENT-007 — Decide exact client deliveries from project pages

*Tier:* Core · *From:* CLIENT-001

**Requirement.** Permitted clients directly approve or reject exact delivered milestones with reasons under DELIVERY-005, preserving independent finance authorization.

**Acceptance.**
1. Exact deliveries released to the recipient appear on the project page; current invited recipients decide there under existing exact-delivery checks. Recipients without project access retain the shown-once review-key route.
2. Earlier snapshots, rejection issues and replacement decisions remain intact. A staff-recorded decision remains labelled not confirmed by the client and never becomes a direct confirmation.
3. Recipient decisions preserve separate independent finance authorization and the existing rejection/issue-resolution journey.

#### CLIENT-002 — Client status and budget reports

*Tier:* Core

**Requirement.** Leads publish dated client-readable status; clients acknowledge or comment and later versions preserve each publication.

**Acceptance.**
1. Status includes delivered/remaining work, budget burn, retainer balance, forecast dates, risks and next decisions under the selected budget-sharing policy.
2. Publish a redacted weekly report, receive a client question on a milestone and revise it: both publications remain readable without leaking private costs or other clients.

#### CLIENT-003 — Client financial self-service

*Tier:* Core · *From:* CLIENT-003

**Requirement.** Clients view issued invoices, credit notes, statements and permitted retainer consumption, download exact documents, pay through the processor and raise disputes; inherit INVOICE-003 exact-document access and PAYMENT-001/002 custody, authorization and reconciliation.

**Acceptance.**
1. A client opens a statement, questions an overage, downloads the invoice and pays only its undisputed balance. Replies route to the responsible lead or finance owner, who sees the reply and correct outstanding amount.
2. Payment details remain at the processor and no extra document authority is inferred from a payment link. Another client and private staff costs/rates remain inaccessible.

#### CLIENT-008 — Client retainer parity and delivery decisions

*Tier:* Core · *From:* CLIENT-003

**Requirement.** CLIENT-003 carries RETAINER-003 statement parity and DELIVERY-005 exact client decisions within its authorized client scope; CLIENT-001 / CLIENT-006, CLIENT-007’s direct milestone decision flow remains required before that portal ships.

**Acceptance.**
1. Statements show opening allowance, rollover, approved consumption, provisional pending projection, linked adjustments, remaining hours/value and authorized source/rule versions. Trace a source against the authorized manager statement; pending time changes only the provisional projection.
2. Permitted clients approve or reject exact delivered milestones with reasons, preserving earlier snapshots, rejection issues and separate independent finance authorization. Staff-recorded decisions remain labelled not confirmed by the client and never become direct confirmation.

#### CLIENT-004 — Client recipient accounts and delivery notices

*Tier:* Core · *From:* CLIENT-004 · *Cites:* BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Provide recipient accounts and explicit delivery notifications within the scoped client portal; DELIVERY-005’s bounded direct-review release alone does not supply account onboarding or notification.

**Acceptance.**
1. A recipient signs into their scoped account, receives a delivery notification and opens only the authorized delivery. Revoked and other-client accounts are refused.

#### CLIENT-009 — Explicit invitation and renewal notices

*Tier:* Core · *From:* CLIENT-004 · *Cites:* BASE-MAIL-001

**Requirement.** CLIENT-004 carries CLIENT-001 / CLIENT-005 invitation/renewal notices using INVOICE-003 / INVOICE-012’s exact-recipient durable dispatch and GOVERN-008 custody. Under a company policy holding external actions for native-owner approval, the native owner explicitly chooses each audited send.

**Acceptance.**
1. When chosen, an invited recipient receives an invitation and each renewal with the portal sign-in link. No invitation or renewal sends automatically, and an invitation without a selected notice sends nothing.
2. Invite a confirmed recipient with notice selected, receive it in a controlled mailbox and open the scoped portal from its link. Provider acceptance remains distinct from delivery.

### Named live integrations

#### CONNECT-001 — Reconcile QuickBooks Online

*Tier:* Core · *Rules:* D-1

**Requirement.** Connect the agency QBO company by OAuth and retain stable object mappings and external identities. BOUNDARY-001 governs specialist inputs, FINANCE-004 receives close mismatches and D-1 governs processor custody and settlement labels.

**Acceptance.**
1. Map customers, services, accounts, tax codes, invoices and credits; choose the issuing system for each entity so an invoice never issues twice.
2. Create and credit an invoice in a QBO sandbox, pay it there and sync payment/allocation changes back; replay yields one external invoice and its correct final balance.
3. Read bills and purchases coded to projects as COST-003 actual costs.
4. Reconcile exact accepted/rejected specialist inputs with honest provider labels and include unresolved sync mismatches in close.

#### CONNECT-002 — Reconcile Xero

*Tier:* Core

**Requirement.** Connect a Xero organization by OAuth, retaining original external IDs and visible validation conflicts. BOUNDARY-001 governs specialist inputs and FINANCE-004 receives sync mismatches.

**Acceptance.**
1. Map organization-scoped contacts, items, taxes, accounts, invoices and credit notes.
2. Issue an invoice in a Xero sandbox, amend it by credit and partially pay it; restart sync and reconcile one document with the correct remaining balance.
3. Read bills tracked to projects as COST-003 actual costs.
4. Reconcile exact accepted/rejected inputs with honest provider labels; unresolved sync conflicts remain on the close checklist.

#### CONNECT-003 — Collect consented Google Calendar context

*Tier:* Core

**Requirement.** Workers choose permitted Google calendars, privacy controls and date ranges for time and availability context; attendance alone never establishes worked time.

**Acceptance.**
1. Collection observes worker consent, selected calendars and attendee/privacy settings.
2. Incremental sync preserves cursors and handles event changes and deletions.
3. Sync private and shared calendars, edit then delete an event and revoke consent; suggestions change or disappear and collection stops.
4. Private descriptions remain hidden under the selected privacy controls.

#### CONNECT-004 — Connect Microsoft work context

*Tier:* Core

**Requirement.** Scoped Microsoft Graph consent supports work calendars, email context, staff interoperability and authorized agency messages.

**Acceptance.**
1. Expose tenant approval, revoked permissions, private event controls and shared-mailbox boundaries.
2. In a Microsoft test tenant, process a changed calendar event and invoice reply into their permitted context.
3. Revoke one scope and stop collection for that scope without crossing shared-mailbox or private-event rights.

#### CONNECT-005 — Reconcile Jira delivery evidence

*Tier:* Core

**Requirement.** Map selected Jira projects, issues, epics, statuses and worklogs to Gauge tasks and source-cited evidence.

**Acceptance.**
1. Preserve issue identities and source permissions while reconciling updates and deletions.
2. Resolve an issue and import one worklog update twice; show one linked delivery change and an unapproved suggested time entry.
3. Suggested time requires the worker’s actual-interval confirmation before posting; issue activity alone is not worked time.

#### CONNECT-006 — Reconcile Linear delivery evidence

*Tier:* Core

**Requirement.** Connect selected Linear projects, cycles and issues for scoped progress and cited activity. [Mechanism](docs/contract/mechanism-connect.md#connect-006).

**Acceptance.**
1. Webhook and polling updates reconcile by stable source identity without inventing worked duration.
2. Move an issue to done and replay the webhook; one linked completion remains and suggested time stays unconfirmed.

#### CONNECT-007 — Bind selected GitHub repositories

*Tier:* Core · *From:* CONNECT-007 · *Cites:* BASE-ROLE-001, BASE-SECRET-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** A bounded GitHub App connection binds an exact authorized source repository to one Gauge project under current authorization. GOVERN-008 owns sealed credential custody; D-2 governs automation and company policy decides agent external, commitment and security actions. [Mechanism](docs/contract/mechanism-connect.md#connect-007).

**Acceptance.**
1. The native owner connects an App credential, selects only repositories held by the installation and binds each to one project.
2. Read only the selected repository’s issue, PR, review and merge evidence; retain titles, numbers, states, labels, review counts and links, never code, diffs, commit messages, bodies, comments or logins.
3. The bounded App read uses repository-limited read-only authority. Every read and effect rechecks current source/project binding and authorization.
4. Commits alone create no evidence; no commit or merge establishes billability.
5. In the bounded native-owner journey, client and unauthorized-repository access exposes no private code or context; project-rights visibility for delegated leads and staff remains a separate required capability.

#### CONNECT-021 — Reconcile GitHub milestone effects and follow-ups

*Tier:* Core · *From:* CONNECT-007 · *Cites:* BASE-AGENT-007, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** A merged PR can suggest delivery of exactly one milestone in its bound project; delivery acceptance and finance authorization remain DELIVERY-005’s separate gates.

**Acceptance.**
1. A merged PR naming exactly one project milestone proposes a delivery; under the held company policy for commitment, the native owner approves it through the ordinary milestone delivery action.
2. An authorized issue follow-up sends the exact reviewed text once; an uncertain write is reconciled and never retried automatically.
3. Merge a PR in an authorized repository, inspect its exact milestone effect and verify it creates no approved billable time and bypasses neither client acceptance nor finance authorization.
4. Delegated lead/staff project visibility, scheduled and webhook ingestion, scoped-token connection alternatives and automatic client-decision follow-ups retain the same source, privacy and authority boundaries.

#### CONNECT-008 — Reconcile Asana delivery evidence

*Tier:* Core

**Requirement.** Map Asana projects, tasks, subtasks, assignments, dates and completion with explicit source-of-truth ownership.

**Acceptance.**
1. Webhook replay, edits and deletion reconcile by stable source identity.
2. Complete a task, change its due date and replay both events; Gauge shows the current source date and one linked completion.

#### CONNECT-009 — Act on scoped Slack follow-ups

*Tier:* Core

**Requirement.** Configured Slack users and channels receive timesheet nudges, staffing conflicts, decisions and billing alerts.

**Acceptance.**
1. Signed interactive actions recheck current native authority and exact record revision.
2. Replies attach to the exact follow-up and preserve message references.
3. Send a missing-time nudge to a controlled workspace, submit time through its action and refuse stale or wrong-person approval without changing work.

#### CONNECT-010 — Act on scoped Teams cards

*Tier:* Core

**Requirement.** A registered Teams app with tenant consent provides private and channel reminders and approval cards equivalent to Slack.

**Acceptance.**
1. Authenticate callbacks, map provider users to native people and retain message/reply references.
2. Send a card and approve as the assigned lead; a forwarded card from another person is refused.
3. Show the verified resulting revision rather than treating card submission as approval.

#### CONNECT-011 — Hand off HubSpot and Orbit deals

*Tier:* Core

**Requirement.** Import won deals, companies, contacts, accepted line items and dates from HubSpot and Orbit while CRM remains the sales system of record.

**Acceptance.**
1. Stable deal IDs make a repeated HubSpot or Orbit won-deal event create one linked project per deal.
2. Return project health and commercial changes to the originating CRM.
3. A later source edit becomes a reviewed change rather than silently overwriting agreed work.

#### CONNECT-012 — Hand off Salesforce opportunities

*Tier:* Core

**Requirement.** Map Salesforce accounts, opportunities, products and approved contract references into PSA scope and resource demand, with explicit field mappings and conflict ownership.

**Acceptance.**
1. Convert a sandbox closed-won opportunity to one linked project and its staffing demand.
2. Replay creates no duplicate; a conflicting amount remains an explicit conflict rather than a silent overwrite.
3. Return permitted delivery/financial summaries while Salesforce retains enterprise CRM ownership.

#### CONNECT-013 — Continue Harvest and Forecast in parallel

*Tier:* Core

**Requirement.** Connect Harvest and Forecast for a controlled parallel run of projects, time, expenses, rates and staffing. MIGRATE-010 owns reviewed operational cutover. [Mechanism](docs/contract/mechanism-connect.md#connect-013).

**Acceptance.**
1. Reconcile stable source identities and billed flags between API/schedule exports and Gauge.
2. Sync the same Harvest time twice, amend it at source and compare Forecast staffing with actual work without duplicates.
3. Adopt an unbilled period without billing historical work again; stop source-system writes at the reviewed cutover.

#### CONNECT-014 — Reconcile NetSuite transactions

*Tier:* Core

**Requirement.** Send reviewed customer, project-invoice, credit, expense and revenue inputs to NetSuite under account, department and entity mappings; BOUNDARY-001 owns specialist-input controls.

**Acceptance.**
1. Persist stable external transaction IDs and reconcile payment and posting outcomes.
2. Post an invoice and credit to a sandbox, expose a mapping rejection and correct it; reconcile acceptance/rejection and payment without duplicate transactions.
3. Provider outcome labels distinguish submission, rejection, accepted posting and verified payment.

#### CONNECT-015 — Reconcile Sage Intacct batches

*Tier:* Core

**Requirement.** Map Sage Intacct customers, projects, dimensions, invoice/credit and expense inputs; BOUNDARY-001 owns exact specialist-input controls.

**Acceptance.**
1. Keep batch and external IDs and reconcile accepted, rejected and paid results in the PSA exception queue.
2. Send a two-project batch to a test company with one rejected dimension, correct it and reconcile both transactions and payment once.
3. Keep honest provider outcome labels without treating accepted input as independently proved settlement.

#### CONNECT-016 — Release exact Zapier and Crank events

*Tier:* Core · *From:* CONNECT-016 · *Cites:* BASE-OPS-003, BASE-AGENT-007, BASE-AGENT-002 · *Rules:* D-2

**Requirement.** Publish scoped project, approved-time, budget-risk, invoice and payment events to Zapier and Crank. RL-103 permits exact current release and bounded authorized subscriptions; D-2 and company policy decide agent external and standard actions. [Mechanism](docs/contract/mechanism-connect.md#connect-016).

**Acceptance.**
1. An exact release binds the current source and revision, destination connection, event and permitted action under current authorization; a bounded subscription retains the same bindings and bounded consent.
2. Signed exact event bytes carry a stable event identity; durable deduplication makes replay and concurrent dispatch yield one source/revision delivery.
3. Support created/changed project, approved-time, budget-exception, issued-invoice and recorded-payment projections for Crank and signed hooks, without private costs, notes or hook secrets.
4. Revoked connections receive no new data; stale sources and rotated/revoked credential versions cannot dispatch.
5. Budget-exception replay through Zapier and Crank yields one permitted follow-up; pending/held admission is never downstream completion.

#### CONNECT-022 — Authorize workflow callback effects

*Tier:* Core · *From:* CONNECT-016 · *Cites:* BASE-OPS-003, BASE-AGENT-007, BASE-AGENT-002 · *Rules:* D-2

**Requirement.** A verified workflow receipt can create a separately authorized native follow-up; a signature alone grants no Gauge authority. D-2 and company policy decide agent external, standard and commitment actions. [Mechanism](docs/contract/mechanism-connect.md#connect-022).

**Acceptance.**
1. The receipt binds the exact source, destination, event and action and is durably deduplicated.
2. Under the held company policy for external/standard callback effects, the original owner approves the exact receipt before one ordinary nonbillable task is created.
3. Current project rights, custom fields and phase rules apply; wrong signatures, stale sources, revoked keys, other actors and changed replay payloads cannot write.
4. Subscriptions support bounded authorization and current-rights checks without granting remote approval authority.
5. Provider admission and the verified native task do not claim whole-run Crank completion; whole-run health requires a minimally scoped provider event-status capability.

#### CONNECT-017 — Route agency mail and replies

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Connect Gmail, Microsoft 365 work mailboxes or Resend/SES transactional senders for authorized proposals, invoices and follow-ups.

**Acceptance.**
1. Verify sender domains and retain provider delivery IDs and case-linked inbound replies.
2. Hard bounces and complaints suppress repeated bad-address sends.
3. Deliver an authorized invoice through a controlled sender, receive the client reply and simulate a hard bounce; the case shows the reply and later bad-address sends are suppressed.

#### CONNECT-018 — Hand off signed documents

*Tier:* Core

**Requirement.** Accept proposals and signed scope from Platter, Inkwell, Docusign and PandaDoc and link contract versions to Locket.

**Acceptance.**
1. Stable document IDs, signature state and original artifacts establish provenance; imported document text does not grant authority.
2. Receive a signed-scope event twice and link one accepted version; a later unsigned revision requests review rather than changing accepted scope.

#### CONNECT-019 — Reconcile bound connector sources

*Tier:* Core · *From:* CONNECT-019 · *Cites:* BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Every connector exposes scopes, source-of-truth mapping, last successful sync, cursor, lag and unresolved differences. RL-104 permits bounded read-only reconciliation of existing Gauge-bound sources; GOVERN-008 owns credential custody.

**Acceptance.**
1. Inspect current scopes, source mapping, last success, checkpoint age and unresolved jobs without discovering a wider provider account or audience.
2. Each explicit successful page advances its durable checkpoint; a failed page does not.
3. Expire a token mid-page, restart, reauthorize and resume under current rights; no resumed source restores stale authority.
4. Reconcile two exact Resend sources and 30,000 USD cents once, retaining source currency; provider content must match the bound version, recipient and quoted amount.
5. For bound Inkwell sources, rotation/resume preserves exact source/value controls and immutable verified artifacts; replay adds nothing and revoked-source refusal makes no provider read.
6. Archives preserve reconciliation snapshots without readback authority.

#### CONNECT-023 — Operate general connector recovery

*Tier:* Core · *From:* CONNECT-019 · *Cites:* BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Durable rate-limited connector jobs support general backfill, pagination, periodic reconciliation, restart and dead-letter resolution without losing or duplicating source effects.

**Acceptance.**
1. Interrupt a provider page, resume after authorized reauthentication and reconcile complete source counts and money once.
2. Operators can resolve dead letters and see lag, unresolved differences and the resulting reconciliation outcome.
3. General provider-wide discovery and backfill retain current source access and mapping rules rather than inheriting authority from restored cursors.

#### CONNECT-020 — Use documented PSA integration APIs

*Tier:* Core · *From:* CONNECT-020 · *Cites:* BASE-DOCS-001, BASE-ROLE-001

**Requirement.** Expose versioned documented PSA reads and writes with scoped app credentials, pagination, filters and request keys; rights equal the native product. GOVERN-008 owns provider custody and D-2 governs automation authorization.

**Acceptance.**
1. Page all permitted projects through an app credential and post own draft time twice with one key; one draft results and native validation still applies.
2. Complete read/write coverage is documented by job, permission and observable refusal; future API doors inherit native rights and field visibility before shipping.
3. Keyed requests, source revisions and integration outcomes remain traceable through GOVERN-005 audit.

#### CONNECT-024 — Read aggregate utilization with a narrow key

*Tier:* Core · *From:* CONNECT-020

**Requirement.** The owner creates or revokes a read-only utilization key, shown once, for an inclusive-date agency aggregate with no person or economic detail. [Mechanism](docs/contract/mechanism-connect.md#connect-024).

**Acceptance.**
1. The aggregate includes every person record in participant count, net calendar availability after holidays/leave and approved billable client seconds by work date.
2. Any missing participant calendar day makes availability unknown, with known subtotal and missing-day count shown instead of a misleading total.
3. The key exposes no names, rates, costs or pay; any other route or business write is refused, and revocation affects the next request.
4. The key may revoke only itself; active, unknown and already-revoked presented keys receive the same empty success response, and the first successful revocation records key label attribution.
5. Create, read and revoke are audited; exports contain no utilization keys and restored installations hold none.

#### CONNECT-025 — Bind app credentials to current staff rights

*Tier:* Core · *From:* CONNECT-020

**Requirement.** The native owner issues a version-1 app credential for one named active staff operator/person, exact staff-grant version and explicitly captured assigned-project identities.

**Acceptance.**
1. Authority is the intersection of captured projects and current native rights; later grant widening never widens the credential.
2. Permit project reads and, only if expressly selected at issuance, the named person’s own draft-time writes; grant no submission, approval, billing, access-management or outbound authority.
3. Any bound operator/grant version change invalidates the key and requires fresh issuance; the issuing owner must remain active.
4. Expiry and revocation apply on the next request, including request-key replay; writes recheck live authority inside the committing transaction.
5. Project pagination binds the credential, filters and complete currently visible snapshot; changes require restarting pagination.
6. Native task, custom-field visibility, exact revision, interval, date and locked-period rules apply.

#### CONNECT-026 — Inspect finite app-credential lifecycle

*Tier:* Core · *From:* CONNECT-020

**Requirement.** Access shows each app credential’s named principal and bounded lifecycle without retaining a reusable secret. [Mechanism](docs/contract/mechanism-connect.md#connect-026).

**Acceptance.**
1. Show permitted projects and permissions, issuing owner, credential and grant versions, issue time, finite expiry, revocation state and safe use history.
2. Show the secret once and retain only its hash; revoked or expired credentials cannot read or write.
3. Changing the bound identity, grant or captured scope requires fresh issuance rather than silently extending authority.

#### CONNECT-027 — Preview and release exact outbound events

*Tier:* Core · *From:* CONNECT-020 · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** A signed outbound release binds exact current source revisions to a configured connection/destination and captured credential version. D-2 and company policy decide agent external actions; the native-owner exact-release journey remains available.

**Acceptance.**
1. Show the exact payload before release; retain stable event identity, type, source kind, source ID/revision and a documented closed field projection.
2. Project, approved-time, budget-exception, issued-invoice and recorded-payment events exclude notes, evidence, receipts, credentials, authentication material, private costs, rates and pay.
3. Each permitted commercial amount is individually documented and visible in that release; owner authority does not license undocumented fields.
4. Under the held external policy, a native owner deliberately releases the event and separately dispatches it; changed source, destination, payload or authority requires renewed review.
5. A signature grants no Gauge approval or write authority; an exact release alone grants neither standing class release nor unattended subscription.

#### CONNECT-028 — Control signed subscription lifecycle

*Tier:* Core · *From:* CONNECT-020 · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Signed webhook subscriptions retain bounded class and field selection and current consent. D-2 governs source/destination/event/action binding and company policy decides agent external subscription actions.

**Acceptance.**
1. Capture bounded native-owner class consent with version and expiry, selected event classes and fields, connection and destination.
2. Pause and immediate revocation stop new delivery; safe resumption rechecks current source, credential, destination and consent rather than replaying old authority.
3. Changing selected fields, source/destination or bound authority requires new authorization.
4. A subscription grants no remote approval and no authority beyond its explicit bounded actions.

#### CONNECT-029 — Verify and deduplicate signed events

*Tier:* Core · *From:* CONNECT-020

**Requirement.** Receivers authenticate exact transmitted event bytes, reject stale replay and durably deduplicate the stable event identity before any separately authorized effect. [Mechanism](docs/contract/mechanism-connect.md#connect-029).

**Acceptance.**
1. The event identity is also its delivery idempotency identity; replay cannot create a second effect.
2. Receivers enforce the documented bounded timestamp window and reject invalid signatures or stale replay.
3. Reviewed redelivery preserves identity and exact payload, rechecks current source/credential authority and retains reason and attempt.
4. Explicit rate-limit refusals use bounded manual retry; uncertain sends, timeouts and server failures remain owned exceptions and never retry automatically.

#### CONNECT-030 — Inspect delivery outcomes without secrets

*Tier:* Core · *From:* CONNECT-020 · *Cites:* BASE-AUDIT-001

**Requirement.** Integration delivery history and audit distinguish provider admission from downstream completion and preserve authority and source bindings.

**Acceptance.**
1. History distinguishes queued, claimed, admitted, refused, uncertain, cancelled and exhausted work; admission never claims downstream completion.
2. Audit retains issuance, scope/version bindings, expiry/revocation, keyed reads/writes, exact release, safe destination identity, payload digest, deciding owner, reason, request key, event identity, credential version, attempts, references and outcomes.
3. Inspection and audit exclude secrets, raw authentication signatures and request/response bodies.
4. Failed and uncertain delivery remains visible with its reconciliation result.

#### CONNECT-031 — Restore integration history without authority

*Tier:* Core · *From:* CONNECT-020 · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Whole-installation portability retains permitted integration business history without app, provider, subscription or execution authority.

**Acceptance.**
1. Archives exclude app credentials and hashes, provider secrets, secret-bearing destinations, private authentication receipts and execution/subscription authority.
2. Restored connections remain disconnected and old events, jobs, subscriptions and deliveries never resume, even after reconnection.
3. Fresh work requires fresh authorization from the currently authorized native owner; for agent work company policy decides the external, access and security classes.

#### CONNECT-032 — Erase released integration data truthfully

*Tier:* Core · *From:* CONNECT-020 · *Cites:* BASE-DATA-006

**Requirement.** Retention and erasure cover principal metadata, event history and released personal data under GOVERN-006’s consequence preview and lawful holds.

**Acceptance.**
1. Authorized erasure removes eligible local copies and fences old restores so erased content cannot return.
2. Retained financial records and minimal audit follow existing consequence-preview and hold rules.
3. Connected-copy deletion requires separate authorized proof; event dispatch never proves remote erasure.

### Follow-up and unattended operation

#### FOLLOWUP-001 — Follow timesheets to acceptance

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Configured weekly submission and reviewer follow-ups observe each worker’s timezone, working days, leave and due date.

**Acceptance.**
1. Slack, Teams and email delivery preserve references, replies and escalation.
2. Miss a Friday submission and receive the configured nudge; submission, return and resubmission move reminders to the person whose action is currently due.
3. Reminders stop only after the exact required timesheet reaches final acceptance.
4. For agent-sent reminders and escalations, company policy decides external and standard actions under the configured authority.

#### FOLLOWUP-002 — Manage owned operational cases

*Tier:* Core · *From:* FOLLOWUP-002

**Requirement.** The native owner manages cases for exact risk, blocked-input, staffing-gap, billing-exception and client-decision sources; opening a case grants no access and sends nothing automatically.

**Acceptance.**
1. Each case retains responsible person, next action, UTC-offset due time, attempts, external references, reply state and completion evidence; the owner is the default responsible person and may reassign among active existing members.
2. Snooze, reassignment and escalation preserve previous responsibility and immutable case history without granting assignee or external access.
3. Actual provider requests retain their references and linked jobs; owner-recorded quoted replies are inert and labelled unverified.
4. An approved request’s job invocation alone never completes its case; ambiguous replies remain unresolved.

#### FOLLOWUP-005 — Verify operational case closure

*Tier:* Core · *From:* FOLLOWUP-002

**Requirement.** Commercial case closure binds current exact client acceptance, the converted engagement and a changed native forecast; noncommercial cases inherit verified completion before shipping.

**Acceptance.**
1. Use SALES-003 / SALES-008’s exact email-confirmed acceptance and linked converted engagement; closing binds current acceptance authority and every server-computed forecast input against the opening agency-date baseline.
2. A stale forecast fingerprint, ambiguous reply, request submission alone or disconnected restore cannot close the case.
3. Open a scope-risk case, link its authorized request, escalate an ambiguous reply and close only after verified client acceptance and changed forecast.
4. Archives retain cases and history without outbound authority.

#### FOLLOWUP-003 — Configure follow-up rules

*Tier:* Core · *Cites:* BASE-AGENT-007, BASE-AGENT-011, BASE-AGENT-002

**Requirement.** Owners configure event and schedule rules for risk alerts, staffing requests, time reminders, retainer drafts and finance handoffs. D-2 and company policy decide agent dispositions for standard, external, money and commitment classes.

**Acceptance.**
1. Rules retain conditions, contact limits, quiet hours, spend and authority limits and manual pause.
2. Under a held company policy for money and commitment, the named people approve exact financial or client commitments; a bounded policy authorizes only its stated action.
3. Trigger a budget-risk rule twice and observe one bounded case; pause prevents further rule effects.
4. Change the budget and, under the held policy, require a fresh decision on the changed inputs.

#### FOLLOWUP-004 — Run durable scheduled work

*Tier:* Core · *Cites:* BASE-OPS-003, BASE-OPS-004, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Recurring work survives restarts with bounded provider use, cancellation and explicit uncertain-result reconciliation. D-2 and company policy determine agent external, money and commitment actions. [Mechanism](docs/contract/mechanism-followup.md#followup-004).

**Acceptance.**
1. Durable claims and idempotency prevent lost work or duplicate drafts and sends after restart.
2. Retainer jobs retain separate claims and atomic draft/run outcomes, cancellation and three-attempt bounded backoff; exhausted or expired authority opens an owned exception, expired consent belonging to finance.
3. Provider jobs bind source and credential versions and allow at most ten claimed source jobs per connection per minute; explicit 429 non-admission alone can retry.
4. An expired claim, ambiguous send, server failure or timeout remains visible as an owned uncertain outcome and never triggers an automatic resend.
5. Audited review by the original authorized person can release a proven non-admission dead letter; source corrections recover into one draft.
6. Restart during a retainer draft and interrupt an email beyond its deadline; reconcile provider state into one draft/send or a visible uncertain case requiring the policy-named person.

### Move in and switch without losing the business record

#### MIGRATE-001 — Capture complete migration sources

*Tier:* Core · *From:* MIGRATE-001

**Requirement.** Each named importer retains the provider/account identity, administrator permissions, complete page/date coverage, original files, source IDs, mappings and independent source controls.

**Acceptance.**
1. Preview a filtered or incomplete package without writing and refuse to declare completeness.
2. Reconcile counts, raw and billable hours, costs, invoice/paid/outstanding totals and retainer balances independently by client, month and currency; missing, unknown, inexact or mismatched required currency/money controls prevent completeness or apply.
3. Show rejected and omitted records rather than silently dropping them; source records alone grant neither access nor approval.
4. Exported custom-field definitions and values become SETUP-004 / SETUP-009, SETUP-010 fields with source field/value IDs, reviewed native relationships and private visibility; unmappable values remain reported.
5. Retain owner-reviewed original custom-field carriers for all seven native types, exact originals and independent controls through archive/restore.
6. Signed source retainer balances reconcile for Kantata OX/SX, Scoro, Teamwork, Productive and Rocketlane where exported; Float retains explicit non-retainer controls.

#### MIGRATE-011 — Apply and reverse reviewed migrations

*Tier:* Core · *From:* MIGRATE-001

**Requirement.** A reviewed fingerprint governs resumable journaled batches; rollback and undo preserve later native work and source custody.

**Acceptance.**
1. Interrupt, resume and reapply a package without duplicate effects; undo only untouched imported effects and preserve later native edits.
2. Custom-field reversal restores untouched values with prior source/version metadata, retires unused adopted schemas and keeps later native values and referenced definitions.
3. Stale reversal and silent replay of undone sources are refused; original evidence and effect journals survive whole-installation restore.
4. Full provider-format, financial adoption and cutover duties remain with MIGRATE-002, MIGRATE-004 and MIGRATE-010.

#### MIGRATE-002 — Capture complete Harvest history

*Tier:* Core · *From:* MIGRATE-002

**Requirement.** Accept detailed time CSV/XLSX and owner-authorized Harvest API captures for clients, people, projects, tasks, rate histories, estimates, expenses/receipts, invoices/payments and approvals. [Mechanism](docs/contract/mechanism-migrate.md#migrate-002).

**Acceptance.**
1. Retain raw hours separately from rounded hours and preserve billable, invoiced and locked flags and invoice IDs.
2. PDF invoice/estimate ZIPs remain linked originals rather than invented financial records; PDF-only financial history cannot claim complete finance migration.
3. API and source records retain full approval, expense, receipt, estimate and invoice/payment evidence with independent outstanding-balance controls.
4. Invoice references and imported approval/lock flags remain evidence only; imported time stays draft and native review applies its own approved terms.

#### MIGRATE-012 — Preserve Harvest time and rate arithmetic

*Tier:* Core · *From:* MIGRATE-002

**Requirement.** Detailed Harvest time preserves exact worked and billed quantities and historical person rates with independent client/month controls.

**Acceptance.**
1. Import 2.11 raw hours and 2.25 rounded hours as 7,596 actual and 8,100 billing seconds; missing rounded quantity remains unknown.
2. Source billable value uses supplied rounded seconds, otherwise raw seconds; declared cost uses raw seconds. Price each at the latest supplied person rate effective on or before the work date, rounded half up to cents per entry.
3. Rate versions have unique effective dates; rounded time or multiple rates require independent raw/rounded/billed/unbilled/cost controls by client and month.
4. Exact invoice joins preserve billed/unbilled source state without native approval or rebilling authority.

#### MIGRATE-013 — Read bounded Harvest workbooks

*Tier:* Core · *From:* MIGRATE-002

**Requirement.** Value-only detailed time workbooks retain original bytes, named-sheet selection and row provenance and share CSV source identities and controls. [Mechanism](docs/contract/mechanism-migrate.md#migrate-013).

**Acceptance.**
1. Select the exact named worksheet and accept exported numeric/text values, ISO date text and whole Excel date serials using the workbook’s 1900/1904 date system.
2. Formula cells and simultaneous CSV/XLSX time inputs are refused before any write.
3. Refuse compressed input above 2 MiB, expanded content above 8 MiB, more than 128 ZIP members or more than 1,000 time rows.
4. Cross-format replay does not duplicate time; other source record kinds keep their existing import doors.

#### MIGRATE-003 — Preserve Forecast schedule meaning

*Tier:* Core

**Requirement.** Accept Forecast Project/Team CSV periods in rows or columns and authorized API captures of people, projects, assignments and availability.

**Acceptance.**
1. Preserve periods, working days, leave, placeholders and tentative/committed meaning without deriving original daily facts from aggregate totals.
2. Team controls overlap project controls and are never added to them.
3. Unresolved aggregates and named placeholders remain downloadable source snapshots on Imports, excluded from daily staffing; reviewed daily distributions are labelled as reviewed distributions.
4. Captured availability retains explicit workdays and holidays, with Time Off reducing capacity separately.
5. API captures declare authorization and field, identity and unit mappings and supply date detail for multi-date assignments; do not claim live connection or independently verified consent.
6. Import both report orientations across a holiday and reconcile team/project controls; finance-only source custody and ordinary staffing, leave and calendar rights still apply.

#### MIGRATE-004 — Capture distinct Kantata source formats

*Tier:* Core · *From:* MIGRATE-004

**Requirement.** Identify Kantata OX and Salesforce-native SX explicitly, retaining their separate relationship maps and complete authorized source windows.

**Acceptance.**
1. OX accepts complete-year time CSV/XLSX, Insights ID tables and asynchronous Data Export JSON/download artifacts; SX accepts Salesforce object CSV ZIPs and API captures under an SX-specific reviewed map.
2. Carry clients, people, skills, estimates, scope, tasks, schedules, time, expenses, rates, invoices, payments and WIP with source IDs and original custody.
3. Contiguous year windows, object permissions, source joins and independent object/client/month/currency controls gate apply; missing permissions or windows block cutover.
4. Reconcile an OX two-year package with time/invoice/expense joins and a separate SX package; neither uses the other’s mapping.
5. Journaled source batches resume, replay without duplicates and undo only untouched source effects.

#### MIGRATE-014 — Adopt Kantata custom fields and native drafts

*Tier:* Core · *From:* MIGRATE-004

**Requirement.** Reviewed Kantata adoption creates bounded native drafts and tentative exact-date staffing while retaining source approval and financial evidence separately. MIGRATE-010 owns the separate explicit owner cutover.

**Acceptance.**
1. OX project, user and task fields become SETUP-004 / SETUP-010 fields; user fields are usable as resource fields, and reviewed Group fields map to client fields or remain reported as unmapped. SX custom object fields use only its reviewed SX map.
2. All seven supported native field types retain source definitions, values and private finance-only visibility.
3. Project Practice and user Office arrive with every value; freshly reviewed reports grouped by them reconcile utilization and profitability to independent source controls.
4. Owner-confirmed resumable stages adopt draft clients, people, skills, projects, tasks, rates, time and expenses and tentative staffing without imported native approval; source-billed time cannot rebill.
5. Historical estimates, invoices, payments and WIP stay source-owned reconciled evidence and grant no issuance, settlement or cutover authority.
6. Undo holds later edits/approvals and source custody while adoption remains; native core/fields/history and source/adoption journals survive restore.

#### MIGRATE-005 — Reconcile Scoro exports and captures

*Tier:* Core

**Requirement.** Accept Scoro filtered CSV/XLS exports and v2 API captures for contacts, quotes, projects/tasks, bookings, time, rates, expenses, invoices/payments and history. [Mechanism](docs/contract/mechanism-migrate.md#migrate-005).

**Acceptance.**
1. Validate filtering, grouping and complete historical date/page coverage before claiming completeness.
2. Preserve timezone timestamps, duration versus billable duration and billing links from invoice lines or allocated invoices.
3. An entry with only an allocated-invoice reference stays billed; differently grouped reports and cross-format replay reconcile to one set of raw hours, billable value and invoice totals.
4. Independent project/month controls, exact originals and source identities survive archive/restore.
5. Explicit owner review creates native core/time drafts while source-billed work stays excluded; historical approvals, invoices and payments never grant native authority.
6. Later native approvals hold undo; staff cannot inspect private source history. MIGRATE-010 owns separate cutover.

#### MIGRATE-006 — Reconcile Teamwork historical work

*Tier:* Core

**Requirement.** Accept Teamwork timesheet CSV/Excel, invoice Excel/accounting exports and paginated v1/v3 captures for clients, users, projects, task lists/subtasks, dependencies, milestones, budgets/retainers, time, expenses, billing and proofs. [Mechanism](docs/contract/mechanism-migrate.md#migrate-006).

**Acceptance.**
1. Preserve integer minutes and user work dates separately from UTC audit timestamps, including DST-boundary work.
2. Keep billable/billed flags, invoice IDs, archived state and proof approvals as source evidence.
3. Carry signed surplus/deficit retainer history and reconcile project financial/period balances independently.
4. Import DST-boundary time, an archived project, billed/unbilled work, proof approval and value-retainer carry; each matches source controls.
5. CSV/Excel and JSON capture replay creates no duplicates; exact originals and histories survive restore and staff privacy remains intact.
6. Native drafts inherit no source approval or retainer billing authority; MIGRATE-010 owns separate cutover.

#### MIGRATE-007 — Reconcile Productive billing meaning

*Tier:* Core

**Requirement.** Accept manager-level CSV/XLSX and authorized Productive captures for deals, budgets, service/phase rates, bookings, time versions, expenses, invoices/attributions and retainers. [Mechanism](docs/contract/mechanism-migrate.md#migrate-007).

**Acceptance.**
1. Verify captured units; preserve worked versus billable quantities, versioned time, recurring budgets and dated phase-rate overrides.
2. Keep an unnumbered draft attribution and manually marked invoiced state without inventing invoice numbers; both stay excluded from rebilling after fresh native approval.
3. Reconcile retainer opening/closing balances and dated rate overrides to independent manager controls.
4. Exact decimal money, number values and source identities survive cross-format replay; duplicate keys are refused and bounded rollback/undo preserves later work.
5. Originals, private staff/history boundaries and source-owned historical invoices/retainers survive restore; MIGRATE-010 owns separate cutover.

#### MIGRATE-008 — Capture Rocketlane source history

*Tier:* Core · *From:* MIGRATE-008

**Requirement.** Accept owner-exported tracked-time reports and paginated Rocketlane captures of accounts, people, project/phase/task/ad-hoc work, budgets, time, allocations, approvals and finance. [Mechanism](docs/contract/mechanism-migrate.md#migrate-008).

**Acceptance.**
1. Preserve integer minutes, SOFT/HARD allocations, exact daily units, unfilled placeholders, rate overrides and epoch audit timestamps.
2. Phase and ad-hoc work, approval/rate history and separate original finance attributions reconcile independently; request additional original finance exports where time APIs lack billing/payment history.
3. CSV/XLSX/API cross-format replay preserves originals and creates no duplicates; native adoption remains draft and source-billed work cannot rebill.
4. Bounded reversal, scoped reads and whole-installation restore preserve source custody and later native work.

#### MIGRATE-015 — Record exact Rocketlane source comparison

*Tier:* Core · *From:* MIGRATE-008

**Requirement.** The native owner records an explicit audited comparison of exact Rocketlane sources, preserving omitted records and unresolved control totals. MIGRATE-010 owns owner-reserved operational cutover.

**Acceptance.**
1. The comparison receipt binds the reviewed originals and source versions and names omitted records and unresolved totals rather than implying complete reconciliation.
2. Compare phase/ad-hoc time, soft placeholder demand, approval/rate history and separate invoice totals before any operational cutover decision.
3. A source comparison grants no provider action, deletion, native financial ownership transfer or payment authority.
4. Revised source captures require a fresh exact-source comparison; comparison history survives restore without executable authority.

#### MIGRATE-009 — Reconcile Float schedules and actuals

*Tier:* Core

**Requirement.** Accept Float schedule/report CSVs with complete year windows and paginated captures of allocations, actuals, leave, people, projects, phases and rates. [Mechanism](docs/contract/mechanism-migrate.md#migrate-009).

**Acceptance.**
1. Preserve dated weekday capacity, historical costs, retained project bill rates and allocation granularity; repeated task-row budgets count once.
2. Import two windows with repeated phase budgets, a changed workweek and leave; reconcile schedule and actuals with independent controls.
3. Native staffing begins tentative and imported leave requires the explicit confirming owner; source actuals and historical finance remain evidence.
4. Native adoption and deletion continuation are separate explicit audited native-owner decisions.
5. Duplicate deletion events affect linked untouched daily schedule/leave effects only; committed staffing, later edits and approvals hold deletion.
6. Missed deletion coverage requires a fresh full comparison; source comparison alone grants no deletion, provider action or financial cutover authority.
7. MIGRATE-010 owns operational cutover and CONNECT-013 owns live provider access.

#### MIGRATE-010 — Choose operational cutover after a shadow period

*Tier:* Core

**Requirement.** Run Gauge beside the incumbent for a complete agency billing period; the owner and finance explicitly choose the cutover fence and responsible system for each open invoice and period.

**Acceptance.**
1. Compare delivery, capacity, approved time, expenses, rates, retainers, invoices and payments across the full period, retaining omissions and unresolved differences.
2. Reconcile one period before adopting the next unbilled period; source comparison or a migration receipt alone never authorizes operational cutover.
3. Keep opening balances, historical reports and source links usable from day one.
4. Route late time and an old invoice payment to the selected owning system and issue the first new invoice once.
5. Changed source extracts create explicit revisions rather than duplicate history; retirement of the incumbent remains a separate owner-reserved act.

### People, permissions and governance

#### GOVERN-001 — Separate agency and finance authority

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-002

**Requirement.** Owner authority manages grants, identity/connector custody and installation policy; finance authority manages private rates/costs, billing, accounting sync, monetary corrections and close. Company policy decides agent access, security and money actions subject to current role and financial separation. [Mechanism](docs/contract/mechanism-govern.md#govern-001).

**Acceptance.**
1. Every grant change retains operator, person, role, enabled state, acting owner and time and is visible on Access; approved decisions retain approver/time on the exact revision.
2. Staff and leads cannot prepare or approve credits or export private costs; finance exports can include them.
3. The owner alone versions an agency-currency two-person-review threshold with reason; unset means no threshold and a stale change is refused.
4. Billing adjustments use absolute total, with a credit a negative delta; RETAINER-004 / RETAINER-010 linked corrections use its approved review-value rule.
5. A value strictly above threshold, or in another currency, needs a different active owner/finance approver than its preparer through every door; until then it reads “Needs an independent approver”. At or below threshold the preparer may approve.
6. Under a held company money policy, an agent’s credit action waits for the policy-named approver and cannot impersonate a person’s approval.
7. INVOICE-004 corrections, FINANCE-004 / FINANCE-015 close/reopen, COST-003 bills/POs and SETUP-003 FX approval inherit the threshold and independence rule before shipping.

#### GOVERN-002 — Scope delivery and worker roles

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Leads manage delivery/staffing and approve only engagements they lead; staff and 1099 contractors record their own assigned work and see only permitted delivery context.

**Acceptance.**
1. A contractor person holds the ordinary staff grant, with exactly staff rights rather than a wider contractor role.
2. A worker records time and expenses only for their person on member engagements, sees those engagements/tasks and their own time, and sees no rate or cost records/amounts or salary.
3. Other people’s leave reads “Private leave” and reveals no private leave reason.
4. TIME-004 delegation grants only dated time review of the lead’s own engagement to active lead/finance, covering review and work dates; it grants no staffing, planning, receipts, packets, archives or rates.
5. Give a contractor two projects and a lead one, then use page forms, commands, state, history and downloads; unauthorized approval/file access is refused and delegate revocation affects the next request.
6. GOVERN-003 roles, CLIENT-001 identities and future delegation kinds inherit these scoped rights before shipping.

#### GOVERN-003 — Plan through a scoped resource-manager role

*Tier:* Core · *From:* GOVERN-003 · *Cites:* BASE-ROLE-001

**Requirement.** Owner explicitly grants a resource manager named engagements and a named roster with an audited reason; authority requires the granting owner to remain active.

**Acceptance.**
1. Create/fill resource requests and create/move/split staffing only within the granted project/roster scope.
2. Skills and availability show only the named roster; competing work reduces availability without exposing its project identities.
3. Private costs, leave reasons, custom fields, raw history/downloads and all other mutations stay denied, including invoices, time edits and access changes.
4. Narrow scope or revoke the grant and the next request through every door follows the new rights.

#### GOVERN-009 — Inspect through a read-only accountant role

*Tier:* Core · *From:* GOVERN-003 · *Cites:* BASE-ROLE-001

**Requirement.** Owner grants/revokes an accountant role to an active native operator/person separately from finance authority.

**Acceptance.**
1. The closed read set includes reviewed accounting-handoff metadata/downloads, completed operational-close evidence and the read-only review page.
2. Payroll handoffs, raw state/audit, source history, archives and invoice-document doors are denied.
3. All mutations are refused before execution, including time edits and invoice issuance.
4. Every download rechecks current session and grant version; revocation affects the next request.

#### GOVERN-010 — Define client and custom roles without finance bypass

*Tier:* Core · *From:* GOVERN-003 · *Cites:* BASE-ROLE-001

**Requirement.** Client sponsors approve scope/deliverables and view shared finances; collaborators see only delivery. Configurable roles preserve finance separation.

**Acceptance.**
1. A client collaborator cannot read private billing; a client sponsor sees only explicitly shared project finances and decisions.
2. Custom grants cannot bypass financial independence or confer invoice authority through a planning role.
3. Exercise each role through direct APIs and downloads; the declared permission set agrees across doors.

#### GOVERN-004 — Retain agency identity controls across lifecycle

*Tier:* Core · *Cites:* BASE-SIGNIN-001, BASE-SIGNIN-002 · *Register:* R-3

**Requirement.** Enterprise identity supports Okta, Microsoft Entra ID, Google Workspace and Auth under Base standards-based sign-in and native MFA; Gauge adds agency domain controls, immediate app-credential deprovisioning and a controlled recovery owner.

**Acceptance.**
1. On the agency’s provider lifecycle fixture, deprovisioning an agency staff member invalidates their Gauge app credentials on the next request.
2. Agency domain controls constrain admission without widening native roles and retain a controlled recovery-owner path.

#### GOVERN-005 — Keep exact native business audit

*Tier:* Core · *From:* GOVERN-005 · *Cites:* BASE-AUDIT-001, BASE-AGENT-009, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Each native write and recorded decision appends one immutable audit entry in commit order with exact identity, revision and business references.

**Acceptance.**
1. Cover person/agent writes, resulting commands, grant changes, API-key creation/read/revocation, packet export, first-run agency setup and import apply/undo.
2. Retain sequence, time, operator/role/person, request key, action, record kind/ID, previous/resulting revisions and resulting value; previous values remain in record history.
3. Import effects name the job principal, operation key, source identity and provenance.
4. Approval, bound policy/limit/rule, provider/import IDs, linked correction and receiver references remain readable from the result; receiver outcomes remain explicitly user-recorded under BOUNDARY-001.
5. Every future record, provider or action inherits external-reference and outcome audit before shipping; trace corrected time through approval, adjustment and provider sync.
6. The installation archive retains audit and history; earlier changes predating audit installation remain in record history.

#### GOVERN-011 — Search and verify private audit

*Tier:* Core · *From:* GOVERN-005 · *Cites:* BASE-AUDIT-001

**Requirement.** Only owner and finance search/export Gauge business audit and verify tamper evidence; private time favorites remain withheld. [Mechanism](docs/contract/mechanism-govern.md#govern-011).

**Acceptance.**
1. Search record kind/ID, person, action prefix, contained text and inclusive agency-calendar dates; other roles are refused.
2. Export the complete trail, all integrity fields and its head; an earlier export supplies a checkpoint for detecting retrospective tampering.
3. Verification names changed entries, missing sequence numbers and unsealed entries and verifies the checkpoint against the recomputed trail.
4. Favorites are omitted from search and replaced by integrity-only stubs in export so their contents stay private while integrity verification still works.

#### GOVERN-006 — Preview lawful agency erasure

*Tier:* Core · *From:* GOVERN-006 · *Cites:* BASE-DATA-006

**Requirement.** The native owner sets versioned retention days for evidence, files and personal data, records exit and reviews exact erasure consequences before authorizing bounded manual erasure.

**Acceptance.**
1. Eligibility accounts for elapsed personal/file/evidence retention, revoked grants and reassigned leadership.
2. Preview identifies affected financial/legal holds, the anonymized attribution and eligible receipt removal; receipt removal needs separate lawful authorization.
3. Preview includes cached archive/restore jobs; a new or advanced transfer requires a new preview and is fenced in the erasing transaction.
4. Before any transfer or erasure, downloading the erasure journal yields an empty journal.
5. The bounded manual slice destroys nothing automatically and reports only its actual scope.

#### GOVERN-012 — Erase eligible native worker content

*Tier:* Core · *From:* GOVERN-006 · *Cites:* BASE-DATA-003, BASE-DATA-006

**Requirement.** Authorized bounded native erasure removes eligible worker profile content while preserving explicitly held financial evidence under anonymized attribution.

**Acceptance.**
1. Erase an exited worker: replace the current profile with “Erased worker” and remove profile/leave history, private leave notes, favorites and eligible receipt bytes.
2. Billed work, frozen economics, issued artifacts, financial records/totals and immutable audit stay exact under the anonymized attribution the preview names.
3. The same transaction writes a mandatory completion record certifying only actual bounded erasure.
4. A post-erasure archive restores anonymous attribution and no erased receipt bytes.

#### GOVERN-013 — Extend retention and erase across restores

*Tier:* Core · *From:* GOVERN-006 · *Cites:* BASE-DATA-006

**Requirement.** Owner-set retention execution, search/cache erasure, authorized connected-copy erasure and old-restore redaction complete the privacy flow without claiming held data erased.

**Acceptance.**
1. Execute the configured retention schedule within lawful hold and consequence-preview rules.
2. Apply later erasure journals when restoring an old archive so eligible private content stays erased; a refusal of the archive is not yet successful redacted restoration.
3. Cover eligible personal content in search, caches, source originals, retained audit payloads and other free text; authorized connected-copy erasure requires actual proof.
4. Future legally held/provider-content erasure inherits current authority, preview, hold and transfer/restore fences.

#### GOVERN-007 — Bind agent purpose and cited-source decisions

*Tier:* Core · *Cites:* BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-009, BASE-AGENT-002

**Requirement.** Gauge agent grants name a purpose and covered engagements; permitted fields are the intersection of declared purpose, sponsor/current granting authority and agency visibility. Company policy decides standard, external, money and commitment actions without widening the grant.

**Acceptance.**
1. Time reconstruction, resourcing, billing preparation and delivery-exception purposes expose only their declared data; billing-preparation scope still exposes no amounts.
2. After revocation, an open proposal remains readable and is labelled agent revoked.
3. Under a held company policy for the action’s classes, a revoked proposal cannot complete the held decision; fresh authority and current sources are required.
4. Every proposal records source kind, ID and revision for time, allocation, rate card, calendar, exception, packet and commercial-version inputs.
5. A decision against changed, withdrawn or erased cited inputs writes nothing and reports staleness; a fresh proposal may be prepared under current authority.
6. Quoted calendar/issue/worklog/file/note instructions retain source attribution and change no proposal kind, amount, person, target or question posed to a person.
7. FOLLOWUP-004 and future connected evidence/agent work inherit these purpose/source controls.

#### GOVERN-008 — Keep versioned provider credentials in server custody

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-SECRET-002, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Provider credentials require owner authority, per-connection encryption and safe use inspection; company policy decides agent security/access actions, and provider-hosted person-only steps remain gated. [Mechanism](docs/contract/mechanism-govern.md#govern-008).

**Acceptance.**
1. The native-owner journey enters, rotates, revokes and inspects credentials in a browser; connection fails explicitly when dedicated installation custody configuration is absent.
2. Pages show only provider/account label, scopes, version, created/rotated times and last four characters; use inspection shows time, connection/version, job/request ID, operation and outcome class, never bodies.
3. Queue a source-bound Crank trigger job, rotate before dispatch and observe no send under either version and an owned credential-rotated exception.
4. The originally authorized person requeues under the new version in one action and one delivery results; revocation permanently refuses a queued job.
5. Restore returns connections disconnected without credentials; fresh credential entry cannot revive historical execution authority.
6. CONNECT-001 through CONNECT-019 inherit version-bound dispatch, safe metadata and authority-free restore before shipping.

### Mobile desktop and everyday access

#### MOBILE-001 — Complete responsive agency journeys

*Tier:* Core · *Cites:* BASE-ACCESSIBILITY-001 · *Register:* R-1, R-2

**Requirement.** Workers, leads, finance and clients complete their agency workflow at both 390px and 1440px under the shared accessibility bar.

**Acceptance.**
1. Workers record time/receipts, leads approve and inspect staffing, finance reviews budgets/invoices and clients read reports and pay at both widths.
2. Complete a realistic worker-to-client invoice path without clipped controls or private-data leakage.

#### MOBILE-002 — Work through native iOS and Android apps

*Tier:* Core · *Register:* R-4, R-5

**Requirement.** Native iOS and Android apps share timer state and preserve exact private work through offline capture and device loss.

**Acceptance.**
1. Create offline time/expense drafts and camera receipts; reconnect once without duplicate work.
2. Push reminders and approval deep links reach the exact current work; approve through a push link with current native authority.
3. Device credentials are secure, offline conflicts require review and remote revocation ends the lost device’s access.
4. Complete receipt/time capture offline, reconnect and revoke a lost device on both platforms.

#### MOBILE-003 — Time from macOS and Windows

*Tier:* Core

**Requirement.** Native macOS menu-bar and Windows tray apps provide project/task timer shortcuts with shared exclusion and offline recovery.

**Acceptance.**
1. Start a macOS timer, inspect on Windows/web, recover an outage and stop twice; one exact interval remains.
2. Worker-controlled idle prompts apply the worker’s chosen correction.
3. No screenshots, keystroke logging or invisible activity capture occurs.

#### MOBILE-004 — Time from permitted browser pages

*Tier:* Core · *Register:* R-6

**Requirement.** Chrome and Edge extensions offer quick timer entry from permitted Jira, Linear, GitHub and Asana pages with explicit project selection and restricted host permissions.

**Acceptance.**
1. Collect browser data only after user action; unrelated pages cannot be read.
2. Start from a linked Jira page and stop on web; retain one task-linked exact interval.
3. Revoke extension authority and end its API access on the next request.

### Owned platform and product boundaries

#### BASE-001 — Own an empty independent Gauge installation

*Tier:* Core · *Cites:* BASE-INSTALL-001, BASE-OPS-001

**Requirement.** Gauge remains MIT open source; the agency owns its domain, storage and provider accounts, and a clean installation starts empty. [Mechanism](docs/contract/mechanism-base.md#base-001).

**Acceptance.**
1. Clone and configure an empty agency, then complete its primary flow locally and in the agency’s own supported Cloudflare installation without seeded client data.
2. Sign-in and unknown routes have explicit usable outcomes; health follows the Base dependency-health duty.
3. The owner retains control of domain, storage, source and provider accounts.

#### BASE-002 — Carry agency history without installation authority

*Tier:* Core · *Cites:* BASE-DATA-001

**Requirement.** Whole-installation portability covers every supported Gauge business record, exact artifact and outcome while stripping credentials and execution authority. Each future record, provider and door inherits this obligation before shipping. SETUP-004, SALES-002–005, RETAINER-001–005, DELIVERY-001–006, FINANCE-004–007, INVOICE-001–008, PAYMENT-001–003, CONNECT-001–020 and FOLLOWUP-004 inherit complete business-history custody before shipping.

**Acceptance.**
1. Round-trip projects, commercial versions, actual work, source originals, receipts, audit, retainers, invoices, schedules and outcomes into an empty destination and reconcile counts, contents and money.
2. Integrity validation refuses corrupt archives and occupied destinations; old sessions never admit restored access.
3. Provider-job history retains exact sources, queued credential versions, claims and outcomes but excludes installation keys, provider secrets, private authentication receipts and executable claims.
4. Restored connections require fresh reconnection; historical jobs remain history and no external write replays.
5. Fresh native sign-in is required and restored history imports no operator, payment-consent, app-key or subscription authority.

#### BASE-003 — Replace platform providers explicitly

*Tier:* Core · *Cites:* BASE-SECRET-002, BASE-OPS-002

**Requirement.** Gauge declares the Base interfaces it consumes and their supported replacements, allowing owner-selected mail/model providers under the same business controls. [Mechanism](docs/contract/mechanism-base.md#base-003).

**Acceptance.**
1. Switch a supported mail or model provider, revoke its credentials and read an explicit failed job without fabricated results or changed business records.
2. Upgrade then export/restore and retain historical calculations unchanged.

#### BASE-004 — Operate measured agency-size jobs

*Tier:* Core · *Cites:* BASE-BACKUP-001, BASE-OPS-002, BASE-OPS-004

**Requirement.** Publish supported dataset/job/upload limits at or above BASE-005 and monitor connector lag and errors; large imports use bounded resumable jobs or suitable workers.

**Acceptance.**
1. At the BASE-005 floor import and bill a multi-project agency, interrupt work and resume without missing or duplicated records.
2. Quotas never silently drop rows or mark unfinished work complete; exceeding a bound produces a visible resumable or refused operation.
3. Restore a floor-sized backup and reconcile counts and financial totals; recover an upgrade under the documented Base rollback without losing historical calculations.
4. Published measurements identify supported limits and visible connector lag/error conditions.

#### BASE-005 — Support the minimum agency dataset

*Tier:* Core · *From:* BASE-005

**Requirement.** One supported Cloudflare installation admits the complete minimum agency dataset with exact records and artifacts.

**Acceptance.**
1. Support at least 40 active and 100 historical people, 300 clients and 2,000 engagements.
2. Support seven years holding 500,000 time entries, 60,000 expenses, 20,000 invoices/credit notes, 30,000 payments and 250,000 daily allocations.
3. Support 50,000 receipt/source files up to 25 MB each and 50 GB in total.
4. Release notes disclose any measured capacity below the floor; preview refuses a package above the measured limit before writing, including one 10% above that limit.

#### BASE-006 — Meet agency page and reporting bounds

*Tier:* Core · *From:* BASE-005

**Requirement.** At the full BASE-005 floor, timesheet, approval, capacity and reporting journeys meet published p95 response bounds on supported Cloudflare hosting.

**Acceptance.**
1. Timesheet, approval and capacity pages render in under two seconds at p95.
2. Portfolio profitability, utilization and revenue/cash reports (REPORT-001–003) render in under five seconds at p95 for any 12-month window.
3. The full seven-year report renders in under 30 seconds or runs as a resumable background report.
4. Each release publishes measured results and the reproducible floor-dataset generator used for those results.

#### BASE-007 — Complete floor-sized migration and portability

*Tier:* Core · *From:* BASE-005

**Requirement.** A complete Kantata OX package at the floor moves through the real migration and whole-installation doors within measured elapsed-time bounds.

**Acceptance.**
1. Generate a fixed-seed floor-sized Kantata OX package and import through MIGRATE-004 in under six hours using resumable bounded jobs.
2. Whole-installation export and restore into an empty installation each finish in under four hours.
3. Reconcile every record count and money total after import and after restore on the private supported deployment.

### Honest boundaries and neighboring products

#### BOUNDARY-001 — Keep specialist accounting and payroll ownership

*Tier:* Core · *From:* BOUNDARY-001

**Requirement.** Gauge owns agency estimates, staffing, delivery, time, expenses, invoicing and operational forecasts; specialist products retain statutory books, payroll, benefits, tax and recognition judgments. [Mechanism](docs/contract/mechanism-boundary.md#boundary-001).

**Acceptance.**
1. QBO, Xero, NetSuite, Sage Intacct or Pantry owns statutory books/accountant-reviewed close; Gusto/ADP owns payroll and W-2/1099 filing and benefits.
2. Tax and revenue-recognition judgments stay with the appointed provider/accountant using reconciled PSA inputs.
3. Labor handoffs use actual seconds and frozen declared costs rather than wages owed; unknown cost remains unknown.
4. Revenue inputs, including signed adjustments, remain billing preparation rather than recognized revenue or certified profit.
5. Issued invoices and user-recorded payment receipts remain separate categories with separate totals and no implied provider settlement.

#### BOUNDARY-004 — Prepare immutable specialist handoffs

*Tier:* Core · *From:* BOUNDARY-001

**Requirement.** Finance approves an immutable manual-handoff artifact from exact approved labor, expense and billing-packet revisions; downloading prepares transfer without claiming a send. [Mechanism](docs/contract/mechanism-boundary.md#boundary-004).

**Acceptance.**
1. Retain recipient, purpose, approver, reason, source revisions, exact bytes and artifact integrity; control totals stay separate by category and currency.
2. Export approved labor/expense and revenue inputs with native issued invoice and user-recorded receipt categories kept distinct.
3. Artifacts, receiver results and history survive BASE-002 without transfer or execution authority.
4. INVOICE-001/004, FINANCE-005, COST-002 and CONNECT-001/002/014/015 inherit exact input/result reconciliation for issued documents, reimbursement, recognition schedules and live accounting handoffs.

#### BOUNDARY-005 — Reconcile specialist receiver decisions

*Tier:* Core · *From:* BOUNDARY-001

**Requirement.** Finance records exact receiver decisions without treating manually supplied results as independently verified provider acceptance. [Mechanism](docs/contract/mechanism-boundary.md#boundary-005).

**Acceptance.**
1. A receiver result binds the handoff and exact artifact and accounts for every line once, preserving amount, currency and duration; every rejection has a reason.
2. Results and accepted/rejected totals remain immutable and labelled user-recorded; rejected lines remain unresolved.
3. Acceptance/rejection changes no approved work and performs no accounting, payroll or tax filing.
4. Export to an accounting/payroll test receiver, reconcile acceptance and rejection and find no claim of payroll filing, provider settlement or certified profit.

#### BOUNDARY-002 — Reconcile the agency’s processor-held payments

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007 · *Rules:* D-1 · *Register:* R-7

**Requirement.** D-1 governs payment custody and the authorized exact agency-merchant instructions under RL-101. PAYMENT-003, CLIENT-003 and CONNECT-001 retain their additional financial, client and accounting obligations.

**Acceptance.**
1. Connect the agency Stripe test account, authorize exact invoice instructions, complete payment/refund and trace pending, failed, available and payout-reconciled states without collapsing them.
2. Refund/return actions append dated signed entries; signed callbacks retain safe canonical evidence without silently changing allocations.
3. An explicit authorized readback changes cash only on evidence of processor availability; charge success alone establishes neither availability nor payout reconciliation.
4. Processor onboarding and restricted-business requirements are explicit obligations; ACH requires an enabled US-bank-account test merchant.
5. Restore carries safe business evidence without credentials, payment consent or executable claims. Company policy decides agent money, external, security and gated actions.

#### BOUNDARY-003 — Remain a standalone PSA among separate products

*Tier:* Core

**Requirement.** Gauge keeps project-specific records and completes its own PSA work independently while linking to separate specialist products.

**Acceptance.**
1. Orbit owns general CRM, Platter proposal authoring, Inkwell signatures, Locket CLM, Chest broad files, Slate the company wiki, Crank general automation and Auth workforce identity.
2. Connect Jira, Linear, GitHub, Asana and the named siblings without absorbing them or requiring a sibling for Gauge’s own PSA job.
3. Complete estimate-to-cash with an external CRM, signature provider and delivery tool, retain source links and export Gauge independently.

### Agent surface

**Specialist: agency operations coordinator.** It keeps agreed work, staffing, approved actuals, invoices and recovery reconciled for the agency.

Inherits BASE-AGENT-001 to BASE-AGENT-013. The company’s policy decides every call; Gauge presets no dispositions.

**How Gauge computes each class.**

- **standard.** A reversible draft, internal report, time entry or tentative allocation stays inside the agency; facts name its item count.
- **external.** A call reaches an outside contact or newly exposes a proposal, invoice, report or connector record. Facts name recipients and counterparty: known for an existing client, vendor or trusted connected account, new otherwise, public for an open link.
- **money.** A call issues or changes an invoice charge, payment/refund instruction, credit, late fee or recurring charge; facts name exact amount, currency and counterparty.
- **commitment.** A call agrees terms, client acceptance, a signature or committed staffing others rely on; facts name value and counterparty.
- **gated.** The processor or identity provider requires its hosted consent, payer authorization or verification step from a person; facts name provider and step.
- **access.** A call changes staff, client, device or integration authority; facts name affected people and widening or narrowing.
- **security.** A call changes a protective setting or handles a provider credential; facts name setting or connection.
- **destructive.** The requested erasure, source removal or financial correction cannot be undone in Gauge; facts name affected items.
- **sensitive.** A call touches retained EIN, bank or regulated payer data; facts name records and kind, derived from selected fields rather than free-text labels.

| Tool | Does | Core clauses | Risk class | Today |
| --- | --- | --- | --- | --- |
| `gauge.engagements.manage` | Maintain engagements and their work | ENGAGEMENT-001 | standard | Native subset; MCP missing |
| `gauge.terms.manage` | Agree project and phase terms | BUDGET-001, BUDGET-002, BUDGET-003, BUDGET-004 | standard or commitment | Native subset; MCP missing |
| `gauge.rates.manage` | Maintain effective rates and cost policy | RATE-001, RATE-002, RATE-003 | standard | Native subset; MCP missing |
| `gauge.capacity.read` | Read dated availability and conflicts | CAPACITY-001 | standard | Native subset; MCP missing |
| `gauge.time.manage` | Record, submit and correct work | TIME-001, TIME-002, TIME-003, TIME-007, TIME-004, TIME-008, TIME-005, TIME-006 | standard | Native subset; MCP missing |
| `gauge.expenses.manage` | Record expenses and reimbursements | COST-001, COST-002, COST-004, COST-003 | standard or money | Native subset; MCP missing |
| `gauge.economics.read` | Reconcile engagement economics | ECONOMICS-001 | standard | Native subset; MCP missing |
| `gauge.packets.manage` | Prepare and approve billing packets | BILLING-001, BILLING-002 | standard or money | Native subset; MCP missing |
| `gauge.review.read` | Read linked weekly exceptions | REVIEW-001 | standard | Native subset; MCP missing |
| `gauge.members.manage` | Change agency membership | ACCESS-001 | access | Native subset; MCP missing |
| `gauge.proposals.manage` | Prepare and decide agency proposals | AGENT-001, AGENT-002, AGENT-003, AGENT-004 | standard or commitment or money | Native subset; MCP missing |
| `gauge.agency.manage` | Maintain agency and client settings | SETUP-001, SETUP-006, SETUP-002, SETUP-007, SETUP-008, SETUP-003, SETUP-004, SETUP-009, SETUP-010, SETUP-005, SETUP-011, SETUP-012 | standard (+ sensitive) | Native subset; MCP missing |
| `gauge.sales.manage` | Maintain opportunities, estimates and proposals | SALES-001, SALES-006, SALES-002, SALES-007, SALES-003, SALES-008, SALES-009, SALES-010, SALES-004, SALES-011, SALES-005, SALES-012 | standard or external or commitment | Native subset; MCP missing |
| `gauge.retainers.manage` | Maintain allowances and recurring charges | RETAINER-001, RETAINER-006, RETAINER-007, RETAINER-002, RETAINER-008, RETAINER-003, RETAINER-009, RETAINER-004, RETAINER-010, RETAINER-011, RETAINER-012, RETAINER-005, RETAINER-013, RETAINER-014 | standard or money or commitment | Native subset; MCP missing |
| `gauge.staffing.manage` | Plan and commit people and leave | RESOURCE-001, RESOURCE-002, RESOURCE-003, RESOURCE-007, RESOURCE-004, RESOURCE-005, RESOURCE-008, RESOURCE-006 | standard or commitment | Native subset; MCP missing |
| `gauge.delivery.manage` | Maintain tasks, intake and milestone acceptance | DELIVERY-001, DELIVERY-007, DELIVERY-002, DELIVERY-008, DELIVERY-003, DELIVERY-009, DELIVERY-004, DELIVERY-010, DELIVERY-011, DELIVERY-005, DELIVERY-012, DELIVERY-006 | standard or external or commitment | Native subset; MCP missing |
| `gauge.finance.manage` | Read forecasts, compare scenarios and close periods | FINANCE-001, FINANCE-008, FINANCE-002, FINANCE-009, FINANCE-010, FINANCE-003, FINANCE-011, FINANCE-012, FINANCE-013, FINANCE-014, FINANCE-004, FINANCE-015, FINANCE-005, FINANCE-016, FINANCE-017, FINANCE-006, FINANCE-018, FINANCE-019, FINANCE-007, FINANCE-020, FINANCE-021, FINANCE-022 | standard or commitment | Native subset; MCP missing |
| `gauge.invoices.manage` | Issue, deliver and correct invoices | INVOICE-001, INVOICE-009, INVOICE-002, INVOICE-010, INVOICE-011, INVOICE-003, INVOICE-012, INVOICE-004, INVOICE-013, INVOICE-014, INVOICE-005, INVOICE-006, INVOICE-015, INVOICE-016, INVOICE-017, INVOICE-007, INVOICE-018, INVOICE-008, INVOICE-019 | standard or external or money (+ destructive) | Native subset; MCP missing |
| `gauge.payments.manage` | Instruct and reconcile processor payments | PAYMENT-001, PAYMENT-004, PAYMENT-002, PAYMENT-005, PAYMENT-003 | money (+ gated) (+ sensitive) | Native subset; MCP missing |
| `gauge.reports.manage` | Read and deliver operational reports | REPORT-001, REPORT-006, REPORT-002, REPORT-007, REPORT-003, REPORT-008, REPORT-004, REPORT-009, REPORT-005 | standard or external | Native subset; MCP missing |
| `gauge.clients.manage` | Invite client recipients and provide scoped service | CLIENT-001, CLIENT-005, CLIENT-006, CLIENT-007, CLIENT-002, CLIENT-003, CLIENT-008, CLIENT-004, CLIENT-009 | standard or external or access or money | Native subset; MCP missing |
| `gauge.followup.manage` | Schedule and reconcile agency follow-through | FOLLOWUP-001, FOLLOWUP-002, FOLLOWUP-005, FOLLOWUP-003, FOLLOWUP-004 | standard or external or money | Native subset; MCP missing |
| `gauge.governance.manage` | Manage roles, custody, audit and privacy | GOVERN-001, GOVERN-002, GOVERN-003, GOVERN-009, GOVERN-010, GOVERN-004, GOVERN-005, GOVERN-011, GOVERN-006, GOVERN-012, GOVERN-013, GOVERN-007, GOVERN-008 | standard or access or security or destructive (+ sensitive) | Native subset; MCP missing |
| `gauge.recovery.manage` | Compare, negotiate and verify recovery | RECOVER-001, RECOVER-010, RECOVER-002, RECOVER-003, RECOVER-004, RECOVER-005, RECOVER-006, RECOVER-007, RECOVER-008, RECOVER-009 | standard or external or commitment or money | Native subset; MCP missing |

**Resources.** `gauge://clients/{id}`, `gauge://engagements/{id}`, `gauge://terms/{id}/{revision}`, `gauge://time/{id}`, `gauge://expenses/{id}`, `gauge://allocations/{id}`, `gauge://invoices/{id}`, `gauge://retainers/{id}`, `gauge://reports/{id}`, `gauge://cases/{id}`, `gauge://sources/{id}`. **Events.** engagement.changed, work.approved, invoice.issued, payment.reconciled, client.decided, connector.exception, recovery.verified. **Prompts.** Prepare the agency week (TIME, RESOURCE, BILLING); reconcile estimate-to-cash (SALES, INVOICE, PAYMENT, FINANCE); recover a drifting engagement (RECOVER).

**Not tools, and why.**

- MOVE-001: the import door accepts original Harvest packages and reconciles native adoption.
- MIGRATE-001, MIGRATE-011, MIGRATE-002, MIGRATE-012, MIGRATE-013, MIGRATE-003, MIGRATE-004, MIGRATE-014, MIGRATE-005, MIGRATE-006, MIGRATE-007, MIGRATE-008, MIGRATE-015, MIGRATE-009, MIGRATE-010: source-package capture, comparison and cutover use the import door.
- CONNECT-001, CONNECT-002, CONNECT-003, CONNECT-004, CONNECT-005, CONNECT-006, CONNECT-007, CONNECT-021, CONNECT-008, CONNECT-009, CONNECT-010, CONNECT-011, CONNECT-012, CONNECT-013, CONNECT-014, CONNECT-015, CONNECT-016, CONNECT-022, CONNECT-017, CONNECT-018, CONNECT-019, CONNECT-023, CONNECT-020, CONNECT-024, CONNECT-025, CONNECT-026, CONNECT-027, CONNECT-028, CONNECT-029, CONNECT-030, CONNECT-031, CONNECT-032: provider subscriptions, callbacks and integration transports belong to their connectors; setup and current connection management are security/access calls in gauge.governance.manage, with gated added by a provider step.
- MOBILE-001, MOBILE-002, MOBILE-003, MOBILE-004: device applications, offline timers, camera receipts and browser extensions execute on the device; their server actions use the corresponding time, expense and access tools.
- BASE-001, BASE-002, BASE-003, BASE-004, BASE-005, BASE-006, BASE-007: install, upgrade, portability, replacement interfaces and measured installation capacity are installation facts and rer command doors.
- BOUNDARY-001, BOUNDARY-004, BOUNDARY-005, BOUNDARY-002, BOUNDARY-003: the statutory specialist and standalone-product boundaries are installation and connector facts; their agency handoff actions use gauge.reports.manage and their merchant instructions use gauge.payments.manage.

**Limits.** Capacity limits bound request rate, record bodies, uploaded bytes and resumable job batches; BASE-005 states the agency-size floor. Business limits and provider spend caps are the company’s policy. **Handoffs.** Listens for CRM wins, calendar and issue changes, signed evidence and processor outcomes; emits reconciled agency-work, invoice and exception events to books, signature and follow-up specialists.

#### SURFACE-001 — Registry of agency jobs

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-001, BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-013 · *Register:* R-8

**Requirement.** The agency operations specialist exposes the Core jobs in the tool table through Gauge’s native actions.

**Acceptance.**
1. The tool-to-clause mapping equals the table, including the declared connector, device, import and installation reasons for jobs outside the tool registry.
2. On an agency fixture, the MCP and native action results agree for a time draft, a staffing choice, an invoice instruction and a client decision.
3. The Base conformance journey runs on these Gauge records.

#### SURFACE-002 — Classify operational and outward work

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Gauge computes operational risk from the selected agency records and destination, including an indirect disclosure caused by a move or report.

**Acceptance.**
1. A reversible internal time draft, staffing alternative or saved report carries standard with its item count.
2. A proposal, invoice email, client share, outside connector write or publicly exposed report carries external with recipient count and known, new or public counterparty; internal-only work remains standard.
3. Agreeing commercial terms, committing staffing, signing a proposal or recording a binding acceptance carries commitment with value and counterparty.

#### SURFACE-003 — Classify financial and private work

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Gauge computes financial risk from exact source amounts, currencies and protected fields.

**Acceptance.**
1. Issuing invoice or refund instructions, credits, fees or recurring charges carries money with exact amount, currency and payee; preparing an unissued internal draft remains standard.
2. Reading or changing a retained EIN, bank reference or regulated payer record adds sensitive with its record count and data kind; a redacted finance summary does not acquire sensitive merely because it has a price.

#### SURFACE-004 — Classify authority and provider work

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006, BASE-AGENT-008

**Requirement.** Gauge classifies authority, credentials, irreversible work and provider-required steps from the requested change and current records.

**Acceptance.**
1. Granting or revoking staff, client invitation, device or integration authority carries access with affected people and whether authority widens or narrows.
2. Connecting, rotating or revoking provider credentials and changing protective settings carries security with the named connection or setting.
3. A provider consent or hosted payer step that the provider requires a person to perform carries gated with provider and step; an available company-credential route retains the company policy decision for its other classes.
4. Erasure, irreversible imported-record removal and irreversible financial corrections carry destructive with item count; a reversible draft or tentative allocation stays standard.

#### SURFACE-005 — Agency record resources

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-003, BASE-AGENT-005

**Requirement.** Gauge resources identify clients, engagements, terms, work, billing and operational evidence using the templates in this surface.

**Acceptance.**
1. Resource templates cover each listed primary record, including its commercial version and source lineage.
2. On an engagement with a private rate and an attributed client decision, a lead reads the delivery context and finance reads the permitted amounts; the client resource shows only the invitation’s selected disclosures.

#### SURFACE-006 — Agency events and handoffs

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-010, BASE-AGENT-005

**Requirement.** Gauge’s typed events connect agency delivery, financial and recovery work to the specialist jobs listed here.

**Acceptance.**
1. The event inventory includes changed engagement, approved work, issued invoice, processor outcome, client decision, connector exception and recovery outcome, each linked to its Gauge resource.
2. A delivery change and an invoice payment outcome are available to the agency specialist; a retained external source quotation does not itself authorize an action.
3. A books or signature handoff retains its exact approved source and reconciled external outcome under BOUNDARY-001 and CONNECT-018.

#### SURFACE-007 — Embedded agency specialists use the registry

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008

**Requirement.** Gauge’s time reconstruction, staffing, billing, delivery and recovery specialists use the agency tool registry and the company’s policy for each class.

**Acceptance.**
1. The four published proposal jobs operate on their purpose-scoped engagement records and retain the ambiguities, alternative economics and source revisions their Core clauses name.
2. Under the held company policy, a time proposal is confirmed by the worker, a staffing option by the lead, packet preparation by finance and a change-order brief by its lead; the resulting native records equal the selected exact proposal.
3. Under the all-autonomous company policy, equivalent granted agent calls complete with the agent’s truthful attribution and the record’s computed classes, without representing any act as the person’s confirmation.

#### SURFACE-008 — A seeded agency week through MCP

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-007, BASE-AGENT-013 · *Register:* R-8

**Requirement.** A stranger agent given only the Gauge installation URL performs the agency operations specialist’s seeded week under two company policies.

**Acceptance.**
1. Find one accepted engagement and its terms, reconstruct missing time from consented calendar evidence, compare two dated staffing alternatives and prepare the eligible billing packet.
2. Issue a numbered invoice instruction to the agency merchant account, reconcile an authoritative provider outcome and report the resulting margin, remaining capacity and expected cash with source links.
3. Run that week under an all-autonomous policy for every declared class: every granted call completes without a person’s policy approval or a policy refusal.
4. Run the same week under the held company policy and complete exactly the reviews, approvals and handoffs that policy decides; altered terms and an unsafe payment source leave no effect.
5. The company-policy journey and resulting agency records, review feed and class facts are available through the documented MCP door and the browser at 1440 and 390.

## Push further

### Honest boundaries and neighboring products

#### RECOVER-001 — Diagnose portfolio drift with cited alternatives

*Tier:* Core · *From:* RECOVER-001 · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Continuously join signed scope, approved changes, retainer rules, delivery evidence, capacity, rates, actual time/cost, invoices and payment expectations into owned recovery cases. Company policy decides agent standard, money and commitment actions.

**Acceptance.**
1. Delay a key deliverable on two staffed projects and ingest missing cost; compare contractor, scope and date alternatives with source citations and effects on both projects.
2. Each alternative shows dates, team load, margin and cash against the current baseline with cited assumptions.
3. Unsupported/infeasible options are not offered without explicitly identifying the cost or required change.

#### RECOVER-010 — Validate recovery feasibility and economics

*Tier:* Core · *From:* RECOVER-001

**Requirement.** Every offered recovery satisfies the full feasibility definition across dated capacity, dependencies, client commitments and approved commercial constraints; FINANCE-006 and FINANCE-007 own comparable delta arithmetic.

**Acceptance.**
1. No committed allocation exceeds dated capacity unless each excess is costed as overtime or contractor hours × rate and names the required lead acceptance; under held commitment policy that acceptance precedes execution.
2. Task/milestone dependencies hold; each moved client commitment is named as a change requiring client acceptance.
3. Approved budgets, phase caps and retainer rules hold or the required SALES-005 change order is identified with its amount.
4. Date/load/margin deltas use the FINANCE-006 basis and cash delta uses FINANCE-007 against the current baseline.
5. Offer an alternative six hours over capacity only with explicit over-allocation cost; refuse one starting before its predecessor finishes.
6. Independently recomputed margin and cash deltas equal every offered alternative’s figures.

#### RECOVER-002 — Negotiate and execute governed recovery

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Draft scoped requests to staff, contractors and clients, interpret replies as proposals and recheck RECOVER-001 feasibility after every reply. Company policy decides agent external, money, commitment and standard actions under explicit lead/client/finance authority.

**Acceptance.**
1. Authorization binds exact schedule, scope, amounts, recipient and expiry; changed affected inputs require fresh authorization.
2. Under a held company policy, approve one recovery, receive a client counteroffer and staffing refusal and show a revised feasible plan before renewed affected approvals and connector writes.
3. Refuse a counteroffer that overbooks the refusing person without a feasible agreed alternative.
4. Execute only the exact authorized staffing, delivery and billing changes through real connectors and escalate conflicts.

#### RECOVER-003 — Verify actual recovery improvement

*Tier:* Core

**Requirement.** Read back changed schedules, allocations, approved commercial terms and invoice/payment state and compare the followed-up forecast with its approved recovery baseline.

**Acceptance.**
1. Recompute margin on FINANCE-006 and cash on FINANCE-007, retaining actual variance.
2. A successful write response with unchanged provider state cannot close the case.
3. Close only when forecast dates, load and cash/margin improve as promised; otherwise reopen or escalate the remaining gap.
4. After real changes reconcile, show measured improvement or the explicit shortfall.

#### RECOVER-004 — Steward retainers through cash

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Explain retainer promises, consumption, carry-over and overage from versioned terms and delivery evidence and follow missing worker/client decisions to reconciled billing. Company policy decides agent standard, external, money and commitment actions.

**Acceptance.**
1. Detect an overused retainer with pending work and explain the exact included promise and overage.
2. Under held commitment/money policy, obtain the lead’s changed-promise/waiver decision, client overage decision and finance monetary-correction approval.
3. Prepare the correct invoice and follow accounting/payment results to reconciled payment or an owned exception.

#### RECOVER-005 — Follow evidence through accepted timesheets

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Collect opted-in calendar/delivery evidence and follow worker clarification, submission and reviewer replies through a completed timesheet. Company policy decides agent standard and external actions; worker truth and time-review separation remain intact.

**Acceptance.**
1. Ask the worker about unmatched or overlapping intervals and billability without passive monitoring or invented durations.
2. Offer an ambiguous two-client meeting and PR activity; accept only worker-confirmed actual intervals.
3. Follow a returned clarification to resubmission and final lead approval, then stop chasing.
4. Revocation stops evidence collection; the worker cannot bypass required independent time review.

#### RECOVER-006 — Learn traceable future forecast assumptions

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Compare estimates, staffing, changes, missing costs, approved actuals and collection timing to propose future role-effort, cost and payment assumptions with confidence, cohort and sample lineage. Company policy decides agent standard and money actions; the owner selects usable history and adopts future versions.

**Acceptance.**
1. Score current and proposed assumptions on the same held-out completed projects, at least five per cohort; four projects produces “insufficient history” with nothing to adopt.
2. Publish effort error as mean absolute percentage error of estimated versus approved actual hours per role; margin error as mean absolute estimated-versus-final FINANCE-006 margin difference in percentage points; payment-timing error as mean absolute forecast-versus-settled-cash days.
3. Offer adoption only if the changed quantity’s held-out error falls and neither other error rises; show both scores, difference and held-out projects.
4. Otherwise show “no improvement” and scores without an adoption action.
5. Exclude an atypical client and score two proposals on the same six completed projects; an effort improvement such as 28% to 12% with no other regression is offered, while a non-improving proposal is withheld.
6. Owner adoption changes only future estimate previews, never approved terms or past work.

#### RECOVER-007 — Turn signed scope into governed plans

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Extract deliverables, exclusions, retainer terms, roles and billing triggers from approved proposal/SOW documents with exact citations and unresolved ambiguity. Company policy decides agent standard, money and commitment actions.

**Acceptance.**
1. A signature alone never resolves contradictory meaning; a conflicting milestone and retainer clause remains visible for resolution.
2. Under a held company policy, the lead and finance review all plan and financial effects, resolve the conflict and approve the exact feasible interpretation before creation.
3. The created staffing plan, budgets, retainer setup and invoice triggers match the accepted interpretation.

#### RECOVER-008 — Answer operational questions with permitted evidence

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Natural-language analysis uses role-permitted records and shows formulas, sources, freshness and uncertainty. Company policy decides agent standard, money and commitment actions; an answer itself grants no authority.

**Acceptance.**
1. Ask a lead and finance why utilization fell and one project lost margin; each answer cites reconciled source records and only amounts their role permits.
2. Private costs remain unavailable outside the separately authorized financial scope.
3. Proposed time-policy, margin or billing corrections retain source citations; under held company policy the authorized person decides the exact correction before effect.

#### RECOVER-009 — Guide migration through a settled cycle

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Inspect authorized captures, suggest mappings/setup and explain unsupported objects and reconciliation differences through shadow billing and first settlement. Company policy decides agent standard, external, money and access actions; MIGRATE-010 retains owner-reserved cutover.

**Acceptance.**
1. Present two ambiguous source users and mismatched invoice totals without guessing missing history.
2. Under a held company policy, the owner resolves mappings and finance confirms monetary totals; a proposal is not its own approval.
3. Follow unresolved cases through a reconciled shadow period and verify first-cycle invoice/payment continuity before recommending incumbent retirement.
4. Only MIGRATE-010’s explicit owner/finance cutover choice changes operational ownership.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass on the complete agency workflow | MOBILE-001 | not run | | |
| R-2 | Independent VPAT for the agency workflow | MOBILE-001 | not run | | |
| R-3 | SAML/OIDC/SCIM conformance in real Okta and Entra vendor tenants | GOVERN-004 | not run | | |
| R-4 | Apple App Store approval of the native iOS app | MOBILE-002 | not run | | |
| R-5 | Google Play approval of the native Android app | MOBILE-002 | not run | | |
| R-6 | Chrome Web Store and Edge Add-ons publication | MOBILE-004 | not run | | |
| R-7 | Live agency merchant onboarding and live card/ACH settlement and payout reconciliation | PAYMENT-001, PAYMENT-004, PAYMENT-002, PAYMENT-005, PAYMENT-003, BOUNDARY-002 | not run | | |
| R-8 | Gauge MCP operation in Claude, ChatGPT, Codex and Copilot clients | SURFACE-001, SURFACE-008 | not run | | |

## Boundaries

- New installations start empty; fixture records do not establish live agency, merchant, bank or provider proof.
- Gauge is standalone PSA. Its statutory books, payroll, tax, signature and general-purpose neighboring-product boundaries remain in BOUNDARY-001 and BOUNDARY-003.
- Agency source and imported notes are evidence, never operational authority.
- Historical AUD records retain their currency; no implicit foreign-exchange conversion occurs.

## Homepage claims

| # | Claim | Clauses |
| --- | --- | --- |
| 1 | Estimate and retainer through staffing, time and invoices to cash; recovery when a project drifts; capacity per person; utilization | SALES-002, SALES-007, RETAINER-001, RETAINER-006, RETAINER-007, RESOURCE-002, TIME-002, INVOICE-001, INVOICE-009, RECOVER-001, RECOVER-010, CAPACITY-001, REPORT-002, REPORT-007 |
| 2 | Estimate versions, proposal acceptance, HubSpot handoff, engagement from accepted work | SALES-002, SALES-007, SALES-003, SALES-008, SALES-009, SALES-010, SALES-004, SALES-011, CONNECT-011 |
| 3 | Rollover and overage statement, overage invoice, client portal | RETAINER-001, RETAINER-006, RETAINER-007, RETAINER-002, RETAINER-008, RETAINER-003, RETAINER-009, RETAINER-004, RETAINER-010, RETAINER-011, RETAINER-012, RETAINER-005, RETAINER-013, RETAINER-014, CLIENT-001, CLIENT-005, CLIENT-006, CLIENT-007, CLIENT-003, CLIENT-008 |
| 4 | Five-week committed/tentative board, leave, agent staffing alternatives whose standard calls follow company policy (the held policy has a person approve), placeholders | RESOURCE-001, RESOURCE-002, RESOURCE-003, RESOURCE-007, AGENT-002 |
| 5 | Drafted missing hours, personal confirmation, return and approve queue, Slack nudge | AGENT-001, TIME-002, TIME-004, TIME-008, TIME-005, CONNECT-009 |
| 6 | Costed options, change order versions, client e-signature, verified outcome, margin and cash effect | RECOVER-001, RECOVER-010, RECOVER-002, RECOVER-003, BUDGET-001, SALES-005, SALES-012, CONNECT-018, FINANCE-001, FINANCE-008, FINANCE-002, FINANCE-009, FINANCE-010 |
| 7 | Invoice from an accepted milestone, card/ACH link, QuickBooks, not-to-exceed cap | BILLING-001, INVOICE-001, INVOICE-009, INVOICE-003, INVOICE-012, PAYMENT-001, PAYMENT-004, CONNECT-001, BUDGET-002, BUDGET-003, BUDGET-004 |
| 8 | ACH return reopens the invoice, fresh pay link, processor fee, QuickBooks rows | PAYMENT-001, PAYMENT-004, PAYMENT-002, PAYMENT-005, INVOICE-006, INVOICE-015, INVOICE-016, INVOICE-017, INVOICE-007, INVOICE-018, CONNECT-001 |
| 9 | Loose ends listed, locked close packet, expected cash, utilization, backlog | REVIEW-001, FINANCE-004, FINANCE-015, FINANCE-007, FINANCE-020, FINANCE-021, FINANCE-022, REPORT-002, REPORT-007, REPORT-003, REPORT-008 |
| 10 | Harvest and Forecast import with reconciliation and shadow run, cutover, other incumbents | MOVE-001, MIGRATE-002, MIGRATE-012, MIGRATE-013, MIGRATE-003, MIGRATE-004, MIGRATE-014, MIGRATE-005, MIGRATE-006, MIGRATE-007, MIGRATE-008, MIGRATE-015, MIGRATE-009, MIGRATE-010 |
| 11 | `npx -y @runeditrun/rer dev just-every/run-gauge`; 100% free, MIT licensed | BASE-001 |

## Status

Judged from the code and tests at commit `47b862d1ce99cf7ed238a4235455404f0fb8b8f7` (27 October 2026).

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 11 | 6 | 0 | 17 |
| Target and push further | 96 | 90 | 49 | 235 |
| All | 107 | 96 | 49 | 252 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `ENGAGEMENT-001` | Set up agreed work | published | done | `tests/gauge.mjs` — "ENGAGEMENT-001 real empty account to scoped engagement" |  |
| `BUDGET-001` | Agree terms and change orders | published | done | `tests/gauge.mjs` — "BUDGET-001 immutable approved terms and additive change orders" |  |
| `RATE-001` | Keep rates by effective date | published | done | `tests/gauge.mjs` — "RATE-001 effective-dated private rates"; `tests/gauge.mjs` — "TIME-002 return, correction and approval of exact revisions" |  |
| `CAPACITY-001` | See next month's capacity | published | done | `tests/gauge.mjs` — "CAPACITY-001 working calendar, leave and separate tentative staffing" |  |
| `TIME-001` | Record time | published | done | `tests/gauge.mjs` — "TIME-001 persistent timer, exact manual duration, parallel exclusion and idempotence" |  |
| `TIME-002` | Approve and correct time | published | partial | `tests/gauge.mjs` | Missing a cited return-and-correction journey that reads back the return reason. The cited flow submits, returns, corrects and reapproves exact revisions, but never reads its return reason; the reason-reading journey in tests/gauge-timesheets.mjs is outside the old Evidence set. |
| `COST-001` | Record expenses with receipts | published | done | `tests/gauge.mjs` — "COST-001 expense receipt custody, exact approval and attachment privacy" |  |
| `ECONOMICS-001` | Reconcile the engagement | published | done | `tests/gauge.mjs` — "ECONOMICS-001 approved actual cost and remaining effort" |  |
| `BILLING-001` | Draft a billing packet | published | done | `tests/gauge.mjs` — "BILLING-001 concurrent source reservations and fixed-fee eligibility" |  |
| `BILLING-002` | Approve and export once | published | done | `tests/gauge.mjs` — "BILLING-002 exact approval, formula-safe repeated exports and linked correction" |  |
| `REVIEW-001` | Review the week's exceptions | published | partial | `tests/gauge.mjs` | Missing a complete weekly exception journey that reads overspend, approved-unbilled work, missing-rate sources and the policy-selected decision queue. The cited flow checks missing time and capacity conflicts and opens the pages. |
| `ACCESS-001` | See only permitted work | published | done | `tests/gauge.mjs` — "GOVERN-002 contractor on two projects, one-project lead, direct approval/file denials and a revoked dated delegate" |  |
| `MOVE-001` | Process supplied Harvest exports and leave whole | published | done | `tests/gauge.mjs` — "MOVE-001 Harvest preview, partial rollback, native reconciliation, idempotence and untouched undo" |  |
| `AGENT-001` | Time reconstruction | published | partial | `tests/gauge-agent.mjs` | Missing a company-policy journey for time reconstruction that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `AGENT-002` | Resourcing | published | partial | `tests/gauge-agent.mjs` | Missing a company-policy journey for resourcing that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `AGENT-003` | Billing preparation | published | partial | `tests/gauge-agent.mjs` | Missing a company-policy journey for billing preparation that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `AGENT-004` | Delivery exceptions | published | partial | `tests/gauge-agent.mjs` | Missing a company-policy journey for delivery exceptions that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `SETUP-001` | US agency profile | target | partial | `src/gauge/agency.ts`; `src/gauge/agency-profile.ts`; `src/gauge/fx-rates.ts`; `src/gauge/setup.ts`; `src/gauge/ui-agency.ts`; `migrations/core/0019_gauge_agency.sql`; `migrations/core/0058_gauge_agency_profile.sql`; `tests/gauge-currency.mjs`; `tests/gauge-agency.mjs`; `src/gauge/invoices.ts`; `tests/gauge-invoices.mjs` | Invoice and quote legal-business/address printing remains inherited by INVOICE-003. |
| `SETUP-006` | Keep imported source currencies | target | partial | `src/gauge/agency.ts`; `src/gauge/agency-profile.ts`; `src/gauge/fx-rates.ts`; `src/gauge/setup.ts`; `src/gauge/ui-agency.ts`; `migrations/core/0019_gauge_agency.sql`; `migrations/core/0058_gauge_agency_profile.sql`; `tests/gauge-currency.mjs`; `tests/gauge-agency.mjs`; `src/gauge/invoices.ts`; `tests/gauge-invoices.mjs` | Every acceptance point passes through public doors, including 1440/390: first-run and Access save the legal business, US billing address, EIN, fiscal-year start, agency currency (USD default) and IANA timezone; the owner versions the workweek and holidays; a USD quote converts to work across the 8 March 2026 spring-forward and issues one USD invoice equal to the quote; an AUD Harvest record imports only with an explicit keep-source-currency policy, stays AUD, and consolidates only at owner-approved effective-dated rates. PARTIAL until ct approves the adopted privacy default: the EIN is owner-only (finance sees no EIN in state, history or audit; leads, staff and agents see no profile) and no document prints it. Owner-only rate approval, attributed to its approver, is approved (ct, 23 October 2026). Invoice/quote documents printing the legal business and address (INVOICE-003) and SETUP-005's per-client currencies and report-wide conversion inherit the profile and SETUP-003's rate table. |
| `SETUP-002` | Client billing records | target | done | `tests/gauge-clients.mjs` — "SETUP-002 client workspace, search and merge" |  |
| `SETUP-007` | Find clients and their work | target | partial | `tests/gauge-clients.mjs` | Missing a cited client-search journey using a custom field. The cited journey proves PO/external identity search, duplicate exclusion and linked engagements, but defines no custom field. |
| `SETUP-008` | Merge duplicate clients | target | partial | `tests/gauge-clients.mjs` | Missing a cited duplicate-client merge journey that preserves client custom fields. The cited journey reconciles legal fields, identities, chosen terms, every project/opportunity and audit; it defines no custom field. |
| `SETUP-003` | Approved dated exchange rates | target | done | `tests/gauge-agency.mjs` — "clientCurrencyJourney"; `tests/gauge-agency.mjs` — "agencyJourney"; `tests/gauge-invoices.mjs` — "agencyCloseJourney" |  |
| `SETUP-004` | Versioned custom field definitions | target | done | `tests/gauge-invoices.mjs` — "customFieldJourney" |  |
| `SETUP-009` | Custom field visibility | target | partial | `tests/gauge-invoices.mjs` | Missing a visibility journey through XLSX/PDF, scheduled reports and BI feeds. The cited journeys show native page/API/CSV, saved-report/history and current/original-definition visibility, with full field custody; the future export and scheduled doors are not exercised. |
| `SETUP-010` | Custom field reporting and resource filters | target | done | `tests/gauge-invoices.mjs` — "customFieldJourney" |  |
| `SETUP-005` | Billing currency from client to payment | target | partial | `tests/gauge-agency.mjs`; `tests/gauge-currency.mjs`; `src/gauge/portfolio.ts`; `src/gauge/ui-portfolio.ts`; `src/gauge/cash-conversion.ts`; `src/gauge/ui-cash.ts`; `src/gauge/ui-conversion.ts`; `src/gauge/fx-rates.ts` | Remaining: strict per-client USD default when agency currency differs; complete estimate/proposal/retainer/credit/payment-link carriage; live QBO multicurrency sandbox sync needs sandbox access and owner connection authority. |
| `SETUP-011` | Converted portfolio and forecast economics | target | partial | `tests/gauge-agency.mjs`; `tests/gauge-currency.mjs`; `src/gauge/portfolio.ts`; `src/gauge/ui-portfolio.ts`; `src/gauge/cash-conversion.ts`; `src/gauge/ui-cash.ts`; `src/gauge/ui-conversion.ts`; `src/gauge/fx-rates.ts` | Remaining: closed-October proof after October ends; portfolio budget/EAC conversion, dated FINANCE-006 EAC components, and REPORT-003 converted figures with source drills/CSVs. |
| `SETUP-012` | Converted expected cash | target | partial | `tests/gauge-agency.mjs`; `tests/gauge-currency.mjs`; `src/gauge/portfolio.ts`; `src/gauge/ui-portfolio.ts`; `src/gauge/cash-conversion.ts`; `src/gauge/ui-cash.ts`; `src/gauge/ui-conversion.ts`; `src/gauge/fx-rates.ts` | Remaining: cash forecast committed-revenue and historical-timing conversion with source drills and CSVs. |
| `SALES-001` | Opportunity pipeline | target | done | `tests/gauge-pipeline.mjs` — "SALES-001 / SALES-006 two probabilities, won/lost history, separate tentative demand, exact replay, scoped access and booked backlog without double counting" |  |
| `SALES-006` | Billed value and booked backlog | target | done | `tests/gauge-pipeline.mjs` — "SALES-001 / SALES-006 two probabilities, won/lost history, separate tentative demand, exact replay, scoped access and booked backlog without double counting" |  |
| `SALES-002` | Costed estimate versions | target | done | `tests/gauge-invoices.mjs` — "estimateJourney" |  |
| `SALES-007` | Reported offline estimate acceptance | target | done | `tests/gauge-invoices.mjs` — "estimateJourney" |  |
| `SALES-003` | Exact-version client proposals | target | done | `tests/gauge-commercial-proposals.mjs` — "commercialProposalJourney"; `tests/gauge-commercial-proposals.mjs` — "commercialRestartJourney" |  |
| `SALES-008` | Proposal delivery reconciliation | target | done | `tests/gauge-commercial-proposals.mjs` — "commercialProposalJourney"; `tests/gauge-commercial-proposals.mjs` — "commercialRestartJourney" |  |
| `SALES-009` | Signature originals and evidence custody | target | done | `tests/gauge-commercial-proposals.mjs` — "commercialProposalJourney"; `tests/gauge-commercial-proposals.mjs` — "commercialRestartJourney" |  |
| `SALES-010` | Signed proposal client decision | target | done | `tests/gauge-commercial-proposals.mjs` — "commercialProposalJourney"; `tests/gauge-commercial-proposals.mjs` — "commercialRestartJourney" |  |
| `SALES-004` | Convert won opportunities | target | done | `tests/gauge-pipeline.mjs` — "SALES-004 / SALES-011 won fixed-fee opportunity converts once into an engagement, draft budget and staffing requests that reconcile to it" |  |
| `SALES-011` | Convert accepted scoped work | target | partial | `tests/gauge-pipeline.mjs` | Missing a cited accepted-work conversion journey that reads the resulting invoice schedule and staffing-request links together. The imported estimate journey proves phases, draft budget, tasks, milestones, required fields and once-only conversion; the won-opportunity leg proves role requests. |
| `SALES-005` | Internal scope-change review | target | partial | `tests/gauge-project-scenario-scope.mjs`; `tests/gauge-project-scenarios.mjs`; `tests/gauge-base-portability.mjs` | Immutable scope comparisons, independent internal approval or decline, revision chains and stale-input fences are proved. ct approved this PARTIAL boundary on 25 October 2026: native owner or finance prepares; a different owner or finance person reviews. Self-review is refused after a role change and through another account bound to the same person. Approval is labelled internal in state, history and audit views and exports. Internal review grants no client acceptance or business-effect authority. Gap: PARTIAL implementation/proof under the adopted ct ruling of the adopted default: native-owner-only explicit release of one exact internally approved change version to a confirmed non-staff recipient for one to 30 days; shown-once hashed key, immediate revocation, live owner and recipient authority, baseline and supersession fences, description-only projection, no outbound sending and no business-effect authority. Direct API rejection and acceptance retain exact reasons, recipient and fingerprint with audited request keys and revisions. Remaining: recipient forms at 1440 and 390, complete exact client commercial disclosure, signed change evidence and once-only adoption of only the accepted increment. Direct responses remain unsigned and do not change the forecast. |
| `SALES-012` | Client acceptance and adoption of change | target | partial | `tests/gauge-project-scenario-scope.mjs`; `tests/gauge-project-scenarios.mjs`; `tests/gauge-base-portability.mjs` | implementation/proof under the adopted ct ruling of the adopted release default. Missing recipient forms at 1440/390, complete exact commercial disclosure, signed change evidence and once-only adoption of the accepted increment. |
| `RATE-002` | Rate-card precedence and currency | target | done | `tests/gauge-rate-cards.mjs` — "RATE-002 / RATE-003 explain view shows precedence; billed value and declared cost trace without changing historical approvals" |  |
| `RATE-003` | Overtime, write-down and loaded cost arithmetic | target | done | `tests/gauge-rate-cards.mjs` — "RATE-002 / RATE-003 explain view shows precedence; billed value and declared cost trace without changing historical approvals" |  |
| `BUDGET-002` | Balanced phase and service allowances | target | done | `tests/gauge-invoices.mjs` — "phaseBudgetJourney"; `tests/gauge-invoices.mjs` — "notToExceedJourney" |  |
| `BUDGET-003` | Budget threshold warnings | target | done | `tests/gauge-invoices.mjs` — "phaseBudgetJourney"; `tests/gauge-invoices.mjs` — "notToExceedJourney" |  |
| `BUDGET-004` | Hourly not-to-exceed billing | target | done | `tests/gauge-invoices.mjs` — "phaseBudgetJourney"; `tests/gauge-invoices.mjs` — "notToExceedJourney" |  |
| `RETAINER-001` | Recurring allowance terms and periods | target | partial | `tests/gauge-retainers.mjs` | Missing a company-policy journey for retainer writes and sensitive amount reads. The cited native retainer journey proves terms, periods, renewal and work consumption; it never selects the company money, commitment and sensitive policy. |
| `RETAINER-006` | Prorated retainer entitlement | target | done | `tests/gauge-retainers.mjs` — "RETAINER-001 / RETAINER-006 / RETAINER-007: native USD value/hours terms, monthly/quarterly/annual periods, exact calendar/working proration, inclusive ends and renewal, immutable commercial versions/calendar snapshots, eligible approved-work policy, lineage and scoped authority" |  |
| `RETAINER-007` | Retainer service fee and earned revenue | target | done | `tests/gauge-retainers.mjs` — "RETAINER-001 / RETAINER-006 / RETAINER-007: native USD value/hours terms, monthly/quarterly/annual periods, exact calendar/working proration, inclusive ends and renewal, immutable commercial versions/calendar snapshots, eligible approved-work policy, lineage and scoped authority" |  |
| `RETAINER-002` | Aged FIFO carry and deficits | target | done | `tests/gauge-retainer-rules.mjs` — "retainerRulesJourney" |  |
| `RETAINER-008` | Eligible retainer overage billing | target | done | `tests/gauge-retainer-rules.mjs` — "retainerRulesJourney" |  |
| `RETAINER-003` | Retainer balance and provisional projection | target | done | `tests/gauge-retainer-statements.mjs` — "retainerStatementsJourney" |  |
| `RETAINER-009` | Resolve ambiguous retainer allocation | target | partial | `tests/gauge-retainer-statements.mjs` | Missing a company-policy journey for resolve ambiguous retainer allocation that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `RETAINER-004` | Close retainer periods permanently | target | done | `tests/gauge-retainer-close.mjs` — "retainerCloseJourney" |  |
| `RETAINER-010` | Post late work to an open period | target | done | `tests/gauge-retainer-close.mjs` — "retainerCloseJourney" |  |
| `RETAINER-011` | Retainer waivers and declared refunds | target | partial | `tests/gauge-retainer-close.mjs` | Missing a company-policy journey for retainer waivers and declared refunds that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `RETAINER-012` | Retainer pause, cancellation and renewal | target | done | `tests/gauge-retainer-close.mjs` — "retainerCloseJourney" |  |
| `RETAINER-005` | Contractual recurring drafts | target | done | `tests/gauge-retainer-rules.mjs` — "retainerScheduleJourney"; `tests/gauge-retainer-rules.mjs` — "retainerRestartAndCloseJourney" |  |
| `RETAINER-013` | Bounded native recurring invoice issue | target | partial | `tests/gauge-retainer-rules.mjs` | Missing a company-policy journey for bounded native recurring invoice issue that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `RETAINER-014` | Apply selected retainer credits once | target | done | `tests/gauge-retainer-rules.mjs` — "retainerScheduleJourney"; `tests/gauge-retainer-rules.mjs` — "retainerRestartAndCloseJourney" |  |
| `RESOURCE-001` | Skills and unfilled role requests | target | done | `tests/gauge-resources.mjs` — "RESOURCE-001 qualified employee/contractor search, effective costs and privacy, unavailable capacity, filters, stale search refusal, human browser fill, exact replay, racing approvals and 20h demand reconciliation" |  |
| `RESOURCE-002` | Portfolio resource calendar | target | partial | `tests/gauge-schedule.mjs` | Missing a cited portfolio-calendar search journey filtered by person custom fields. The cited calendar journey shows atomic moves, splits, global conflicts, holidays and leave but defines no custom field. |
| `RESOURCE-003` | Dated working calendars | target | done | `tests/gauge-schedule.mjs` — "RESOURCE-003" |  |
| `RESOURCE-007` | Private leave requests and decisions | target | done | `tests/gauge-schedule.mjs` — "RESOURCE-003" |  |
| `RESOURCE-004` | Scheduled and actual utilization | target | done | `tests/gauge-utilization.mjs` — "RESOURCE-004 scheduled/recorded/pending/approved utilization, 30/32 billable capacity, internal training, holiday and leave denominators, zero and missing capacity, service/project/detail grouping, scoped sources, CSV fingerprint and browser drills" |  |
| `RESOURCE-005` | Monthly resource demand forecast | target | done | `tests/gauge-demand-forecast.mjs` — "RESOURCE-005 / RESOURCE-008 monthly committed, unfilled, contractor and weighted pipeline demand on the FINANCE-006 / FINANCE-018 / FINANCE-019 basis, owner-approved hire/contractor/delayed-start scenarios beside an untouched baseline, won demand moving to committed once" |  |
| `RESOURCE-008` | Approved capacity scenarios | target | done | `tests/gauge-demand-forecast.mjs` — "RESOURCE-005 / RESOURCE-008 monthly committed, unfilled, contractor and weighted pipeline demand on the FINANCE-006 / FINANCE-018 / FINANCE-019 basis, owner-approved hire/contractor/delayed-start scenarios beside an untouched baseline, won demand moving to committed once" |  |
| `RESOURCE-006` | HR-system approved time-off sync | target | missing |  | No HR-system connection, stable-source-ID replay or source cancellation flow exists. Live BambooHR proof requires a sandbox and owner connection authority. |
| `DELIVERY-001` | Execute assigned tasks | target | done | `tests/gauge-tasks.mjs` — "DELIVERY-001 / DELIVERY-007: assignment, task tree, board/personal filters, progress, time/expense links, exact recurrence, history and revocation" |  |
| `DELIVERY-007` | Repeat a task tree | target | done | `tests/gauge-tasks.mjs` — "DELIVERY-001 / DELIVERY-007: assignment, task tree, board/personal filters, progress, time/expense links, exact recurrence, history and revocation" |  |
| `DELIVERY-002` | Preview dependent schedules | target | done | `tests/gauge-delivery.mjs` — "DELIVERY-002 / DELIVERY-008: phase/task/milestone DAG, inclusive business dates, Thanksgiving cascade, critical path/slack, global staffing effects, immutable baseline, exact replay/stale refusal and scoped access" |  |
| `DELIVERY-008` | Approve immutable schedule baselines | target | done | `tests/gauge-delivery.mjs` — "DELIVERY-002 / DELIVERY-008: phase/task/milestone DAG, inclusive business dates, Thanksgiving cascade, critical path/slack, global staffing effects, immutable baseline, exact replay/stale refusal and scoped access" |  |
| `DELIVERY-003` | Version delivery templates | target | done | `tests/gauge-delivery-templates.mjs` — "deliveryTemplatesJourney" |  |
| `DELIVERY-009` | Start a project from a template | target | done | `tests/gauge-delivery-templates.mjs` — "deliveryTemplatesJourney" |  |
| `DELIVERY-004` | Discuss project work | target | partial | `src/gauge/catalog.ts`; `src/gauge/harvest.ts` | Task discussions, subscriptions, in-app notifications and optional email digests remain to be built. |
| `DELIVERY-010` | Version and proof deliverables | target | partial | `src/gauge/catalog.ts`; `src/gauge/harvest.ts` | Document versioning, proofing annotations and project-specific file visibility remain to be built. |
| `DELIVERY-011` | Reference external project files | target | partial | `src/gauge/catalog.ts`; `src/gauge/harvest.ts` | Google Drive, Box and Dropbox project references remain to be built. |
| `DELIVERY-005` | Track milestone delivery decisions | target | done | `tests/gauge-milestone-delivery.mjs` — "milestoneDeliveryJourney" |  |
| `DELIVERY-012` | Release exact milestone reviews | target | done | `tests/gauge-milestone-delivery.mjs` — "milestoneDeliveryJourney" |  |
| `DELIVERY-006` | Request client onboarding inputs | target | done | `tests/gauge-delivery-templates.mjs` — "clientIntakeJourney" |  |
| `TIME-003` | Complete day and week timesheets | target | done | `tests/gauge-timesheets.mjs` — "TIME-003 / TIME-007: daily/week grid, favorites/recent copy, atomic bulk submit, missing/status, audited lock/reopen, import guards and exact approval history" |  |
| `TIME-007` | Lock and reopen work periods | target | partial | `tests/gauge-timesheets.mjs` | Missing a company-policy journey for lock and reopen work periods that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `TIME-004` | Apply timesheet policies | target | done | `tests/gauge-time-review.mjs` — "timeReviewJourney" |  |
| `TIME-008` | Delegate exact independent time review | target | done | `tests/gauge-time-review.mjs` — "timeReviewJourney" |  |
| `TIME-005` | Review consented evidence | target | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` | Live consent management, connected collection and the evidence inbox remain to be built. |
| `TIME-006` | Recover continuous timers | target | partial | `src/gauge/time.ts`; `tests/gauge.mjs` | Cross-device clients, offline reconciliation and idle or forgotten-timer recovery remain to be built. |
| `COST-002` | Review expense economics | target | done | `tests/gauge-handoffs.mjs` — "expensePolicyJourney" |  |
| `COST-004` | Reconcile reimbursement handoffs | target | done | `tests/gauge-handoffs.mjs` — "expensePolicyJourney" |  |
| `COST-003` | Track purchase commitments and actual costs | target | missing |  | Vendor commitments, purchase orders, expected-cost ledger and accounting bill readback remain to be built. |
| `FINANCE-001` | Explain actual and forecast margin | target | done | `tests/gauge-finance-forecast.mjs` — "FINANCE-001 / FINANCE-008 actual/forecast margin with unknown cost traced to sources, billed net of credits not invoiced, no payments recorded; FINANCE-006 / FINANCE-018 / FINANCE-019 committed ETC/EAC at effective rates, monthly split, tentative and weighted pipeline additions, unpriced incompleteness, fixed-fee milestone schedule, rate withdrawal and finance-only lineage"; `tests/gauge-invoices.mjs` — "invoiceDashboardJourney" |  |
| `FINANCE-008` | Distinguish issued billing and paid cash | target | done | `tests/gauge-finance-forecast.mjs` — "FINANCE-001 / FINANCE-008 actual/forecast margin with unknown cost traced to sources, billed net of credits not invoiced, no payments recorded; FINANCE-006 / FINANCE-018 / FINANCE-019 committed ETC/EAC at effective rates, monthly split, tentative and weighted pipeline additions, unpriced incompleteness, fixed-fee milestone schedule, rate withdrawal and finance-only lineage"; `tests/gauge-invoices.mjs` — "invoiceDashboardJourney" |  |
| `FINANCE-002` | Revenue and cash forecast | target | done | `tests/gauge-cash-forecast.mjs` — "FINANCE-002 / FINANCE-009 / FINANCE-010 milestone delay moves expected cash as an independent FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022 recomputation; days-late range, collection probability, unset terms Net 30 assumed, booked revenue and settled cash distinct, finance-only" |  |
| `FINANCE-009` | Schedule unissued invoices and expected receipts | target | done | `tests/gauge-cash-forecast.mjs` — "FINANCE-002 / FINANCE-009 / FINANCE-010 milestone delay moves expected cash as an independent FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022 recomputation; days-late range, collection probability, unset terms Net 30 assumed, booked revenue and settled cash distinct, finance-only" |  |
| `FINANCE-010` | Forecast payment promises | target | done | `tests/gauge-cash-forecast.mjs` — "FINANCE-002 / FINANCE-009 / FINANCE-010 milestone delay moves expected cash as an independent FINANCE-007 / FINANCE-020 / FINANCE-021 / FINANCE-022 recomputation; days-late range, collection probability, unset terms Net 30 assumed, booked revenue and settled cash distinct, finance-only" |  |
| `FINANCE-003` | Project scenarios and baseline comparison | target | done | `tests/gauge-project-scenarios.mjs` — "FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 isolated two-project contractor comparison, exact cost/margin/cash/utilization, named selected future adoption, history, replay and stale/access refusals; capacity browser 1440/390" |  |
| `FINANCE-011` | Compare future staffing replacements | target | done | `tests/gauge-project-scenarios.mjs` — "FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 isolated two-project contractor comparison, exact cost/margin/cash/utilization, named selected future adoption, history, replay and stale/access refusals; capacity browser 1440/390" |  |
| `FINANCE-012` | Compare prospective rates and billing adjustments | target | done | `tests/gauge-project-scenarios.mjs` — "FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 isolated two-project contractor comparison, exact cost/margin/cash/utilization, named selected future adoption, history, replay and stale/access refusals; capacity browser 1440/390" |  |
| `FINANCE-013` | Compare dependency-aware deadline changes | target | done | `tests/gauge-project-scenarios.mjs` — "FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 isolated two-project contractor comparison, exact cost/margin/cash/utilization, named selected future adoption, history, replay and stale/access refusals; capacity browser 1440/390" |  |
| `FINANCE-014` | Compare future scope and replacement terms | target | done | `tests/gauge-project-scenarios.mjs` — "FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 isolated two-project contractor comparison, exact cost/margin/cash/utilization, named selected future adoption, history, replay and stale/access refusals; capacity browser 1440/390" |  |
| `FINANCE-004` | Monthly period close | target | done | `tests/gauge-invoices.mjs` — "agencyCloseJourney" |  |
| `FINANCE-015` | Reopen and correct a closed agency period | target | done | `tests/gauge-invoices.mjs` — "agencyCloseJourney" |  |
| `FINANCE-005` | Revenue schedules for the accountant | target | partial | `tests/gauge-handoffs.mjs` | Phase-based revenue schedules remain absent. |
| `FINANCE-016` | Reconcile recognition and correct delivery journals | target | partial | `tests/gauge-handoffs.mjs` | Corrections to milestone/time recognition, repeated service-delivery corrections and phase schedules remain absent. |
| `FINANCE-017` | Provide reconciled recognition inputs to specialist books | target | partial | `tests/gauge-handoffs.mjs` | Live accounting posting remains absent. |
| `FINANCE-006` | Committed forecast basis | target | done | `tests/gauge-finance-forecast.mjs` — "FINANCE-001 / FINANCE-008 actual/forecast margin with unknown cost traced to sources, billed net of credits not invoiced, no payments recorded; FINANCE-006 / FINANCE-018 / FINANCE-019 committed ETC/EAC at effective rates, monthly split, tentative and weighted pipeline additions, unpriced incompleteness, fixed-fee milestone schedule, rate withdrawal and finance-only lineage" |  |
| `FINANCE-018` | Schedule commercial revenue and forecast additions | target | done | `tests/gauge-finance-forecast.mjs` — "FINANCE-001 / FINANCE-008 actual/forecast margin with unknown cost traced to sources, billed net of credits not invoiced, no payments recorded; FINANCE-006 / FINANCE-018 / FINANCE-019 committed ETC/EAC at effective rates, monthly split, tentative and weighted pipeline additions, unpriced incompleteness, fixed-fee milestone schedule, rate withdrawal and finance-only lineage" |  |
| `FINANCE-019` | Reconcile committed forecast arithmetic | target | done | `tests/gauge-finance-forecast.mjs` — "FINANCE-001 / FINANCE-008 actual/forecast margin with unknown cost traced to sources, billed net of credits not invoiced, no payments recorded; FINANCE-006 / FINANCE-018 / FINANCE-019 committed ETC/EAC at effective rates, monthly split, tentative and weighted pipeline additions, unpriced incompleteness, fixed-fee milestone schedule, rate withdrawal and finance-only lineage" |  |
| `FINANCE-007` | Expected cash basis | target | partial | `src/gauge/cash-forecast.ts`; `src/gauge/report-lineage-cash.ts`; `tests/gauge-expected-cash.mjs`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-portfolio.mjs` | Unissued fixed milestones and monthly-arrears hourly fees follow client Net N terms, labelled approved days late, collection probability and the on-terms/historical range. Recorded period fees use an explicitly assumed in-advance date. Ordinary issued invoices, dated manual receipts and payment promises now replace their sources once. Contractual retainer schedules/issuance, scheduled-invoice probability overrides, dispute collection holds, processor pending versus settled cash and approved FX remain absent. |
| `FINANCE-020` | Weight open balances and distinguish settlement | target | partial | `src/gauge/cash-forecast.ts`; `src/gauge/report-lineage-cash.ts`; `tests/gauge-expected-cash.mjs`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-portfolio.mjs` | Scheduled-invoice probability overrides, dispute collection holds, processor pending/settled integration and approved FX remain incomplete; contractual retainer schedules and issuance retain their obligations. |
| `FINANCE-021` | Reconcile cash timing scenarios | target | partial | `src/gauge/cash-forecast.ts`; `src/gauge/report-lineage-cash.ts`; `tests/gauge-expected-cash.mjs`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-portfolio.mjs` | Unissued fixed milestones and monthly-arrears hourly fees follow client Net N terms, labelled approved days late, collection probability and the on-terms/historical range. Recorded period fees use an explicitly assumed in-advance date. Ordinary issued invoices, dated manual receipts and payment promises now replace their sources once. Contractual retainer schedules/issuance, scheduled-invoice probability overrides, dispute collection holds, processor pending versus settled cash and approved FX remain absent. |
| `FINANCE-022` | Reconcile disputed probabilistic and pending cash | target | partial | `src/gauge/cash-forecast.ts`; `src/gauge/report-lineage-cash.ts`; `tests/gauge-expected-cash.mjs`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-portfolio.mjs` | The scheduled-invoice probability and ACH settlement scenario remain required. |
| `INVOICE-001` | Issue numbered USD and client-currency invoices | target | partial | `src/gauge/billing.ts`; `tests/gauge.mjs`; `tests/gauge-currency.mjs`; `src/gauge/invoices.ts`; `src/gauge/ui-invoices.ts`; `tests/gauge-invoices.mjs` | Retainer overage issuance, tax, delivery and client-currency payment links remain absent from the ordinary pre-tax slice. |
| `INVOICE-009` | Reconcile issuance to financial reporting | target | partial | `src/gauge/billing.ts`; `tests/gauge.mjs`; `tests/gauge-currency.mjs`; `src/gauge/invoices.ts`; `src/gauge/ui-invoices.ts`; `tests/gauge-invoices.mjs` | Approved billing packets and immutable CSVs retain their source currency, including USD, and refuse mixed currencies. Native ordinary pre-tax invoice issuance freezes exact approved sources, client workspace/PO/Net N terms and unique sequential numbering; manual receipts distinguish unpaid, partially paid and paid; INVOICE-004 credit notes, voids and reissues keep credited and void states explicit. Retainer overage issuance, tax, delivery and client-currency payment links remain absent. |
| `INVOICE-002` | Progress deposits and percentage charges | target | done | `tests/gauge-progress.mjs` — "progressJourney" |  |
| `INVOICE-010` | Consolidate approved client project billing | target | done | `tests/gauge-progress.mjs` — "progressJourney" |  |
| `INVOICE-011` | Bill disjoint partial time and recurring charges | target | done | `tests/gauge-progress.mjs` — "progressJourney" |  |
| `INVOICE-003` | Branded invoice preview and exact hosted access | target | partial | `tests/gauge-invoices.mjs`; `tests/gauge-invoice-delivery.mjs`; `tests/live/invoice-delivery.mjs`; `tests/gauge-base-portability.mjs`; `src/gauge/invoice-delivery.ts`; `src/gauge/invoice-delivery-readback.ts`; `src/gauge/invoice-mail-provider.mjs` | Finance delegation remains due; the held native-owner release and dispatch journey preserves the exact-document boundary without satisfying that broader role flow. |
| `INVOICE-012` | Dispatch exact-recipient invoice email | target | partial | `tests/gauge-invoices.mjs`; `tests/gauge-invoice-delivery.mjs`; `tests/live/invoice-delivery.mjs`; `tests/gauge-base-portability.mjs`; `src/gauge/invoice-delivery.ts`; `src/gauge/invoice-delivery-readback.ts`; `src/gauge/invoice-mail-provider.mjs` | Finance delegation remains due; the held native-owner release and dispatch journey preserves the exact-document boundary without satisfying that broader role flow. |
| `INVOICE-004` | Credits discounts and write-offs | target | done | `tests/gauge-invoice-corrections.mjs` — "invoiceCorrectionJourney" |  |
| `INVOICE-013` | Void unpaid invoices and reissue valid balances | target | done | `tests/gauge-invoice-corrections.mjs` — "invoiceCorrectionJourney" |  |
| `INVOICE-014` | Reconcile dated invoice corrections | target | done | `tests/gauge-invoice-corrections.mjs` — "invoiceCorrectionJourney" |  |
| `INVOICE-005` | US sales tax and exemptions | target | missing |  | No sales-tax configuration, provider calculation, exemption workflow or tax reversal. |
| `INVOICE-006` | Accounts receivable aging and statements | target | done | `tests/gauge-receipts.mjs` — "receiptJourney"; `tests/gauge-invoices.mjs` — "receivablesJourney" |  |
| `INVOICE-015` | Record and allocate client receipts | target | done | `tests/gauge-receipts.mjs` — "receiptJourney"; `tests/gauge-invoices.mjs` — "receivablesJourney" |  |
| `INVOICE-016` | Record and resolve invoice disputes | target | done | `tests/gauge-receipts.mjs` — "receiptJourney"; `tests/gauge-invoices.mjs` — "receivablesJourney" |  |
| `INVOICE-017` | Record payment promises and reconcile cash | target | done | `tests/gauge-receipts.mjs` — "receiptJourney"; `tests/gauge-invoices.mjs` — "receivablesJourney" |  |
| `INVOICE-007` | Overdue follow-up until resolution | target | missing |  | No collection cadence, delivered reminder, reply handling or payment stop condition. |
| `INVOICE-018` | Draft permitted late fees | target | missing |  | No late-fee calculation, approval draft or bounded issuance flow. |
| `INVOICE-008` | Invoice line presentation and time-detail backup | target | done | `tests/gauge-invoices.mjs` — "invoicePresentationJourney" |  |
| `INVOICE-019` | Agency and client invoice branding | target | done | `tests/gauge-invoices.mjs` — "invoicePresentationJourney" |  |
| `PAYMENT-001` | Stripe card and ACH payment links | target | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-cash-forecast.mjs` | Card settlement and ACH payment/settlement remain unproved; ACH needs an enabled US bank-account merchant. Finance delegation and recurring collection remain due. |
| `PAYMENT-004` | Preserve payment evidence without restored authority | target | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-cash-forecast.mjs` | Real Stripe test card completion is proved by `tests/journeys/stripe-sandbox.mjs` — held-key hosted checkout and canonical readback, recorded in `tests/artifacts/stripe-sandbox.json`; its charge balance remained pending, so settlement is not yet proved. ACH sandbox payment and settlement are blocked: the held Australian Stripe test account has no activated US bank account capability. Default ADOPTED implementation/proof under the adopted ct ruling: only a native owner may release an exact invoice instruction; test mode must match canonical Stripe mode; no raw payer credentials, automatic collection or new recipient access. |
| `PAYMENT-002` | Reconcile processor outcomes | target | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/fixtures/stripe-archive.mjs`; `tests/journeys/stripe-native.mjs` | Live signed Stripe delivery, ACH return and unattended periodic reconciliation remain unproved; the existing periodic readback is an explicit owner polling action. |
| `PAYMENT-005` | Retain reconciled payment history safely | target | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/fixtures/stripe-archive.mjs`; `tests/journeys/stripe-native.mjs` | The held-key run in `tests/artifacts/stripe-sandbox.json` proves the actual card refund and canonical payment readback, plus a 152-transaction automatic AUD payout with zero difference. Live signed Stripe delivery and ACH return remain unproved. ACH requires an enabled US bank account test merchant. Periodic readback is an explicit native-owner polling command, not an unattended schedule. Default ADOPTED implementation/proof under the adopted ct ruling: signed callbacks only record verified canonical metadata; they never allocate cash or issue refunds. Each refund needs a typed, exact, audited native-owner instruction. |
| `PAYMENT-003` | External payments and bank reconciliation | target | missing |  | No external payment reconciliation or ambiguous payment queue. |
| `REPORT-001` | Portfolio profitability dashboard | target | done | `tests/gauge-portfolio.mjs` — "REPORT-001" |  |
| `REPORT-006` | Distinguish engagement cohorts and additive labor groups | target | done | `tests/gauge-portfolio.mjs` — "REPORT-001" |  |
| `REPORT-002` | Utilization and effective-dated billability targets | target | done | `tests/gauge-realization.mjs` — "realizationJourney" |  |
| `REPORT-007` | Realized billing and effective rates | target | done | `tests/gauge-realization.mjs` — "realizationJourney" |  |
| `REPORT-003` | Revenue cash and backlog dashboard | target | partial | `src/gauge/revenue-dashboard.ts`; `src/gauge/ui-revenue-dashboard.ts`; `src/gauge/report-lineage-revenue.ts`; `tests/gauge-revenue-dashboard.mjs`; `tests/gauge-cash-forecast.mjs` | Full invoicing, client-currency payment links, provider settlement/accounting freshness and approved reporting FX remain incomplete. |
| `REPORT-008` | Reconcile issued invoices and recorded receipts | target | partial | `src/gauge/revenue-dashboard.ts`; `src/gauge/ui-revenue-dashboard.ts`; `src/gauge/report-lineage-revenue.ts`; `tests/gauge-revenue-dashboard.mjs`; `tests/gauge-cash-forecast.mjs` | Native pipeline-to-issued-open-to-manual-receipt transfer, immutable pre-tax documents, exact source reservations, dated cash/receipts, races/replay, margin, lineage/CSV, specialist reconciliation and archive preservation are asserted. Full invoicing (including retainer overages, credits, tax, sending and client-currency links), provider settlement/accounting freshness and approved USD FX conversion remain unproven. |
| `REPORT-004` | Custom reports and scheduled delivery | target | missing |  | No report builder, saved reporting or scheduled report exports. |
| `REPORT-009` | Warehouse and read-only BI reporting | target | missing |  | No warehouse export schedule or read-only BI feed. |
| `REPORT-005` | Trace every reported amount | target | done | `tests/gauge-report-lineage.mjs` — "REPORT-005"; `tests/gauge-demand-forecast.mjs` — "RESOURCE-005 / RESOURCE-008 monthly committed, unfilled, contractor and weighted pipeline demand on the FINANCE-006 / FINANCE-018 / FINANCE-019 basis, owner-approved hire/contractor/delayed-start scenarios beside an untouched baseline, won demand moving to committed once" |  |
| `CLIENT-001` | Scoped client portal | target | done | `tests/gauge-milestone-delivery.mjs` — "clientPortalJourney" |  |
| `CLIENT-005` | Renew standing project invitations | target | done | `tests/gauge-milestone-delivery.mjs` — "clientPortalJourney" |  |
| `CLIENT-006` | Select client monetary details and retainer statements | target | done | `tests/gauge-milestone-delivery.mjs` — "clientPortalJourney" |  |
| `CLIENT-007` | Decide exact client deliveries from project pages | target | done | `tests/gauge-milestone-delivery.mjs` — "clientPortalJourney" |  |
| `CLIENT-002` | Client status and budget reports | target | missing |  | No publishable client reports, client replies or budget-sharing policy. |
| `CLIENT-003` | Client financial self-service | target | missing |  | No client invoice/statement financial self-service or payment/dispute portal. |
| `CLIENT-008` | Client retainer parity and delivery decisions | target | missing |  | The CLIENT-003 financial portal and retainer self-service flow remain absent. |
| `CLIENT-004` | Client recipient accounts and delivery notices | target | missing |  | No client-specific recipient-account onboarding or delivery notices. |
| `CLIENT-009` | Explicit invitation and renewal notices | target | missing |  | The complete explicit invitation and renewal notices workflow remains absent; the parent’s bounded native workflow is retained separately. |
| `CONNECT-001` | Reconcile QuickBooks Online | target | missing |  | QBO OAuth, object mapping, accounting writes and payment/cost reconciliation remain to be built. |
| `CONNECT-002` | Reconcile Xero | target | missing |  | Xero connection, writes and payment reconciliation remain to be built. |
| `CONNECT-003` | Collect consented Google Calendar context | target | missing |  | Google OAuth, calendar sync and consent controls remain to be built. |
| `CONNECT-004` | Connect Microsoft work context | target | missing |  | Microsoft Graph connection, mail context and calendar interoperability remain to be built. |
| `CONNECT-005` | Reconcile Jira delivery evidence | target | missing |  | Jira connection and worklog/progress reconciliation remain to be built. |
| `CONNECT-006` | Reconcile Linear delivery evidence | target | missing |  | Linear connection and issue evidence sync remain to be built. |
| `CONNECT-007` | Bind selected GitHub repositories | target | partial | `tests/gauge-github.mjs`; `tests/live/github.mjs`; `src/gauge/github.ts`; `API.md` | PARTIAL implementation/proof under the adopted ct ruling confirmation of the adopted owner-only default: only the native owner connects, selects repositories, reads, approves milestone effects and sends follow-ups, and no client, agent, lead, staff or finance role sees GitHub records. Not built: project-rights visibility for leads and staff, webhook-driven or scheduled ingestion (reads are owner-initiated and cover the latest 30 pull requests and issues per repository), a scoped personal token alternative, and automatic follow-ups from client decisions. |
| `CONNECT-021` | Reconcile GitHub milestone effects and follow-ups | target | partial | `tests/gauge-github.mjs`; `tests/live/github.mjs`; `src/gauge/github.ts`; `API.md` | Delegated lead/staff visibility, scheduled/webhook ingestion, a scoped personal-token alternative and automatic client-decision follow-ups remain to be built. |
| `CONNECT-008` | Reconcile Asana delivery evidence | target | missing |  | Asana connection and delivery reconciliation remain to be built. |
| `CONNECT-009` | Act on scoped Slack follow-ups | target | missing |  | Slack delivery, interactions and reply routing remain to be built. |
| `CONNECT-010` | Act on scoped Teams cards | target | missing |  | Teams app, delivery and authenticated action callbacks remain to be built. |
| `CONNECT-011` | Hand off HubSpot and Orbit deals | target | missing |  | HubSpot/Orbit deal handoff and health sync remain to be built. |
| `CONNECT-012` | Hand off Salesforce opportunities | target | missing |  | Salesforce connection and opportunity mapping remain to be built. |
| `CONNECT-013` | Continue Harvest and Forecast in parallel | target | partial | `src/gauge/harvest.ts`; `src/gauge/forecast.ts`; `tests/gauge-forecast.mjs` | Live connections, continuous comparison and reviewed cutover write control remain to be built. |
| `CONNECT-014` | Reconcile NetSuite transactions | target | missing |  | NetSuite integration and posting reconciliation remain to be built. |
| `CONNECT-015` | Reconcile Sage Intacct batches | target | missing |  | Sage Intacct integration and batch/payment reconciliation remain to be built. |
| `CONNECT-016` | Release exact Zapier and Crank events | target | partial | `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs` | The Crank budget-exception trigger submits an owner-authorized exact source as a durable version-bound job; pending or held admission is never downstream completion. Native owner release now supports sealed Zapier Catch Hooks and general signed hooks for exact project changes, time approvals, budget exceptions, issued invoices and recorded payments. `tests/gauge-provider-custody.mjs` — providerCustodyJourney proves HMAC-SHA-256 over exact event bytes, stable event IDs, one source/revision delivery on replay/concurrent dispatch, credential rotation/requeue, revocation sending no new data, no private costs/notes or hook secrets on public surfaces and native 1440/390. Provider admission is not downstream completion. The same journey proves created/changed project, approved-time, issued-invoice and recorded-payment projections through native sources for both Crank and signed hooks; a domain-separated workflow receipt and explicit original-owner approval create exactly one ordinary nonbillable task, honoring current custom fields and phase rules. Wrong signatures, stale sources, revoked keys, other actors and changed replays cannot write. PARTIAL: unattended subscriptions/callback execution remain disabled implementation/proof under the adopted ct ruling of the adopted owner-review boundary. Signed receipt verification proves the permitted native follow-up; whole-run Crank status readback is not claimed. Dependency for whole-run health: Crank’s published trigger credential cannot read runs; a minimally scoped event-status door must be supplied by Crank. Default ADOPTED for new unattended/outbound policy: explicit native-owner release only, no automatic outbound subscriptions or remote write callbacks until ct rules. |
| `CONNECT-022` | Authorize workflow callback effects | target | partial | `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs` | Unattended subscriptions and callback execution remain to be built; whole-run Crank status readback requires a minimally scoped event-status door from Crank. |
| `CONNECT-017` | Route agency mail and replies | target | missing |  | Complete business-mail delivery and reply routing remain to be built. |
| `CONNECT-018` | Hand off signed documents | target | missing |  | Complete commercial-document and signature integrations remain to be built. |
| `CONNECT-019` | Reconcile bound connector sources | target | partial | `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-commercial-proposals.mjs` | GOVERN-008 supplies encrypted per-connection custody, rotation/revocation, owner use inspection and disconnected restore. Owner Access now shows current scopes, source mapping, last successful readback, checkpoint age and unresolved jobs. `tests/gauge-provider-custody.mjs` — connectorHealthJourney proves a two-source Resend reconciliation snapshot, token expiry mid-page, actual Worker restart, reauthorization and exact once-only source counts/30000 USD cents with source currency retained; provider message content must match the exact version, recipient and quoted amount. Each explicit read-only page commits its durable cursor; failed reads do not advance it. `tests/gauge-base-portability.mjs` — prepareCurrentPortability preserves snapshots and strips readback authority. PARTIAL: Crank trigger credentials cannot read run outcomes under its published contract, and provider-wide/general connector backfill, provider-wide pagination and automatic dead-letter recovery remain absent. `tests/gauge-commercial-proposals.mjs` — commercialProposalJourney additionally proves a bounded Inkwell binding manifest, expired-token checkpoint, explicit rotation/resume into exact source/value controls, immutable previously verified artifacts, replay and revoked-source refusal without a provider read; Inkwell health is inspected at 1440/390. Current cursors page frozen Gauge delivery/binding manifests, not whole provider accounts. Default ADOPTED implementation/proof under the adopted ct ruling: native-owner-only read-only reconciliation of exact existing Gauge sources; no provider-wide mailbox discovery or new audience exposure. |
| `CONNECT-023` | Operate general connector recovery | target | missing | `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-commercial-proposals.mjs` | The complete operate general connector recovery workflow remains absent; the parent’s bounded native workflow is retained separately. |
| `CONNECT-020` | Use documented PSA integration APIs | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Complete documented PSA read and write coverage remains to be built. |
| `CONNECT-024` | Read aggregate utilization with a narrow key | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Policy ruling, ct, 26 October 2026: APPROVE WITH RIDERS for owner-issued exact-staff-grant project reads, explicitly selected own draft-time writes, and individually reviewed native-owner release of signed outbound events. This is a policy ruling only; status remains partial. No delegated approval, remote approval, standing class release or unattended subscription is authorized. Existing evidence is retained without asserting a fresh test pass. Gaps: complete documented PSA read and write coverage; finite credential expiry and visible lifecycle; exact captured project-scope non-widening; exact payload preview and complete field projections; the complete signed webhook subscription lifecycle with class and field selection, bounded consent, versioning, expiry, pause, immediate revocation and safe resumption; receiver replay-window and durable deduplication proof; complete delivery-failure reconciliation; connected-copy erasure and old-restore erasure coverage. Native rights, custom-field visibility, audit, provider custody, erasure and authority-free restore remain inherited requirements. |
| `CONNECT-025` | Bind app credentials to current staff rights | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Exact captured project-scope non-widening remains to be proved. |
| `CONNECT-026` | Inspect finite app-credential lifecycle | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Finite credential expiry and its complete visible lifecycle remain to be built. |
| `CONNECT-027` | Preview and release exact outbound events | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Exact payload preview and complete closed field projections remain to be built. |
| `CONNECT-028` | Control signed subscription lifecycle | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Complete signed subscription lifecycle with class/field selection, bounded consent, versioning, expiry, pause, immediate revocation and safe resumption remains to be built. |
| `CONNECT-029` | Verify and deduplicate signed events | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Receiver replay-window and durable deduplication proof remain to be supplied. |
| `CONNECT-030` | Inspect delivery outcomes without secrets | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Complete delivery-failure and reconciliation evidence remains to be supplied. |
| `CONNECT-031` | Restore integration history without authority | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Policy ruling, ct, 26 October 2026: APPROVE WITH RIDERS for owner-issued exact-staff-grant project reads, explicitly selected own draft-time writes, and individually reviewed native-owner release of signed outbound events. This is a policy ruling only; status remains partial. No delegated approval, remote approval, standing class release or unattended subscription is authorized. Existing evidence is retained without asserting a fresh test pass. Gaps: complete documented PSA read and write coverage; finite credential expiry and visible lifecycle; exact captured project-scope non-widening; exact payload preview and complete field projections; the complete signed webhook subscription lifecycle with class and field selection, bounded consent, versioning, expiry, pause, immediate revocation and safe resumption; receiver replay-window and durable deduplication proof; complete delivery-failure reconciliation; connected-copy erasure and old-restore erasure coverage. Native rights, custom-field visibility, audit, provider custody, erasure and authority-free restore remain inherited requirements. |
| `CONNECT-032` | Erase released integration data truthfully | target | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` | Connected-copy erasure and old-restore erasure coverage remain to be built. |
| `FOLLOWUP-001` | Follow timesheets to acceptance | target | partial | `src/gauge/reports.ts`; `src/gauge/time.ts`; `tests/gauge.mjs` | Scheduled reminders, message replies and escalation remain to be built. |
| `FOLLOWUP-002` | Manage owned operational cases | target | partial | `src/gauge/operational-cases.ts`; `src/gauge/ui-operational-cases.ts`; `tests/gauge-commercial-proposals.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs` | Native-owner-only durable cases cover exact risk/input/staffing/billing/client-decision sources, responsible person (the owner by default, reassignable among existing active members), next action/due, immutable attempts/replies and snooze/reassignment/escalation history. An actual approved proposal request is linked to its provider job; invocation never completes a case. Closure requires current exact email-confirmed client acceptance, conversion and a changed native forecast fenced to its reviewed inputs. BASE-002 preserves cases/history without outbound authority. ct approved (22 Oct): owner-only management, the owner as default responsible person reassigning among existing active members with no external access, no automatic outbound action, owner-recorded replies explicitly unverified. Remaining: verified closure of noncommercial cases (internal risk, blocked input, staffing gap, billing exception) without a linked proposal/opportunity. |
| `FOLLOWUP-005` | Verify operational case closure | target | partial | `src/gauge/operational-cases.ts`; `src/gauge/ui-operational-cases.ts`; `tests/gauge-commercial-proposals.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs` | Verified closure of internal risk, blocked-input, staffing-gap and billing-exception cases without a linked opportunity/proposal remains to be built. |
| `FOLLOWUP-003` | Configure follow-up rules | target | missing |  | Configurable event/schedule rules and unattended action policies remain to be built. |
| `FOLLOWUP-004` | Run durable scheduled work | target | partial | `tests/gauge-retainer-rules.mjs`; `tests/gauge-commercial-proposals.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs` | Current provider jobs require explicit native-owner queue/dispatch, bind source and credential versions, and retain claims/outcomes with visible expired-claim uncertainty. Native retainer schedules now persist separate job claims, atomic draft/run outcomes, three-attempt bounded backoff/exhaustion, explicit audited review of proven non-admission dead letters and cancellation; expired consent is an owned finance exception. `tests/gauge-retainer-rules.mjs` — retainerDurableJobJourney proves refused atomic draft, backoff, real restart, corrected-source recovery into one draft, expired authority and cancellation at 1440/390; retainerRestartAndCloseJourney retains month-end and consecutive-invoice proof. `tests/gauge-commercial-proposals.mjs` — commercialRestartJourney proves an actual in-flight Worker interruption beyond the mail deadline, no resend, visible owned uncertainty and exact provider readback. `tests/gauge-provider-custody.mjs` — providerRetryJourney is the committed outside-Verify elapsed-time journey for 60/120-second backoff, real restart, cancellation, three-attempt exhaustion, the ten-job connection limit and audited original-owner review of proven non-admission dead letters. Provider dispatch is limited to ten claimed source jobs per connection per minute. Only explicit 429 refusal is retryable; ambiguous/5xx/timeout results never retry. PARTIAL: general unattended external dispatch remains disabled under the adopted conservative policy (explicit native-owner release only); the exact-candidate elapsed-time proof is the outside-Verify cloud run `sx-gauge-c38-retry-20261022-final` of the committed providerRetryJourney; its SHA-bound receipt is retained by the lane. This closes timing proof only and does not approve unattended policy. |
| `MIGRATE-001` | Capture complete migration sources | target | done | `tests/gauge.mjs` — "MOVE-001 Harvest preview, partial rollback, native reconciliation, idempotence and untouched undo"; `tests/fixtures/source-custom-fields.mjs` — "sourceFieldJourney" |  |
| `MIGRATE-011` | Apply and reverse reviewed migrations | target | done | `tests/gauge.mjs` — "MOVE-001 Harvest preview, partial rollback, native reconciliation, idempotence and untouched undo"; `tests/fixtures/source-custom-fields.mjs` — "sourceFieldJourney" |  |
| `MIGRATE-002` | Capture complete Harvest history | target | partial | `src/gauge/harvest.ts`; `src/gauge/harvest-workbook.ts`; `src/gauge/harvest-time.ts`; `src/gauge/harvest-rates.ts`; `tests/gauge-harvest-history.mjs`; `tests/gauge.mjs`; `tests/gauge-currency.mjs` | API captures, full source approval decisions, expenses/receipts, estimates, invoice/payment records and outstanding-balance reconciliation remain to be built. |
| `MIGRATE-012` | Preserve Harvest time and rate arithmetic | target | partial | `src/gauge/harvest.ts`; `src/gauge/harvest-workbook.ts`; `src/gauge/harvest-time.ts`; `src/gauge/harvest-rates.ts`; `tests/gauge-harvest-history.mjs`; `tests/gauge.mjs`; `tests/gauge-currency.mjs` | CSV/XLSX raw/rounded time, original workbook custody, explicit worksheet/row provenance, value-only bounded decoding, cross-format replay, source invoice/approval/lock evidence, dated person-rate histories and independent client/month billed/unbilled/cost controls are asserted. API captures, full source approval decisions, expenses/receipts, estimates, invoice/payment records and outstanding-balance reconciliation remain absent. |
| `MIGRATE-013` | Read bounded Harvest workbooks | target | partial | `src/gauge/harvest.ts`; `src/gauge/harvest-workbook.ts`; `src/gauge/harvest-time.ts`; `src/gauge/harvest-rates.ts`; `tests/gauge-harvest-history.mjs`; `tests/gauge.mjs`; `tests/gauge-currency.mjs` | CSV/XLSX raw/rounded time, original workbook custody, explicit worksheet/row provenance, value-only bounded decoding, cross-format replay, source invoice/approval/lock evidence, dated person-rate histories and independent client/month billed/unbilled/cost controls are asserted. API captures, full source approval decisions, expenses/receipts, estimates, invoice/payment records and outstanding-balance reconciliation remain absent. |
| `MIGRATE-003` | Preserve Forecast schedule meaning | target | done | `tests/gauge-forecast.mjs` — "MIGRATE-003"; `tests/gauge-base-portability.mjs` — "prepareCurrentPortability" |  |
| `MIGRATE-004` | Capture distinct Kantata source formats | target | partial | `src/gauge/kantata-package.ts`; `src/gauge/kantata.ts`; `src/gauge/kantata-native.ts`; `src/gauge/ui-kantata.ts`; `tests/gauge-kantata.mjs`; `tests/gauge-harvest-history.mjs` | Provider-format coverage beyond the documented bounded adapters remains due. |
| `MIGRATE-014` | Adopt Kantata custom fields and native drafts | target | partial | `src/gauge/kantata-package.ts`; `src/gauge/kantata.ts`; `src/gauge/kantata-native.ts`; `src/gauge/ui-kantata.ts`; `tests/gauge-kantata.mjs`; `tests/gauge-harvest-history.mjs` | Full native financial adoption and receipt custody remain to be built; operational cutover belongs to MIGRATE-010. |
| `MIGRATE-005` | Reconcile Scoro exports and captures | target | done | `tests/gauge-scoro.mjs` — "scoroJourney" |  |
| `MIGRATE-006` | Reconcile Teamwork historical work | target | done | `tests/gauge-teamwork.mjs` — "teamworkJourney" |  |
| `MIGRATE-007` | Reconcile Productive billing meaning | target | done | `tests/gauge-productive.mjs` — "productiveJourney" |  |
| `MIGRATE-008` | Capture Rocketlane source history | target | partial | `src/gauge/rocketlane.ts`; `src/gauge/rocketlane-cutover.ts`; `src/gauge/ui-rocketlane.ts`; `tests/gauge-rocketlane.mjs` | Phase/ad-hoc minutes, SOFT/HARD exact daily allocations, unfilled placeholders, epoch units, approval/rate history and separate original finance attributions reconcile before owner source comparison review. CSV/XLSX/v1 capture custody/replay, native draft/source-billed fences, bounded reversal, scoped reads and complete restore pass. Default ADOPTED implementation/proof under the adopted ct ruling: owner-only explicit audited exact-source comparison receipt; no automatic provider action, deletion, native financial ownership transfer or payment authority. Operational cutover stays held; its policy and resulting native ownership workflow remain unproven. MIGRATE-010 retains broader retirement/parallel-run obligations. |
| `MIGRATE-015` | Record exact Rocketlane source comparison | target | partial | `src/gauge/rocketlane.ts`; `src/gauge/rocketlane-cutover.ts`; `src/gauge/ui-rocketlane.ts`; `tests/gauge-rocketlane.mjs` | Operational cutover and the resulting native ownership workflow remain due under MIGRATE-010. |
| `MIGRATE-009` | Reconcile Float schedules and actuals | target | done | `tests/gauge-float.mjs` — "floatJourney"; `tests/fixtures/float-native-journey.mjs` — "floatNativeJourney"; `tests/fixtures/float-deletion-journey.mjs` — "floatDeletionJourney" |  |
| `MIGRATE-010` | Choose operational cutover after a shadow period | target | partial | `src/gauge/harvest.ts`; `src/gauge/imports.ts`; `tests/gauge.mjs` | Complete parallel-run comparison and explicit invoice/retainer ownership cutover remain to be built. |
| `GOVERN-001` | Separate agency and finance authority | target | partial | `tests/gauge-approvals.mjs` | Missing the company money-policy credit journey. The cited governJourney proves human cost-export and credit rights, the owner-set threshold, independent approver and grant history; it does not select a company agent policy. |
| `GOVERN-002` | Scope delivery and worker roles | target | done | `tests/gauge.mjs` — "GOVERN-002 contractor on two projects, one-project lead, direct approval/file denials and a revoked dated delegate" |  |
| `GOVERN-003` | Plan through a scoped resource-manager role | target | partial | `tests/gauge-handoffs.mjs` | Read-only accountant and explicitly scoped resource-manager grants ship. Client sponsors, client collaborators and configurable role grants remain absent. |
| `GOVERN-009` | Inspect through a read-only accountant role | target | partial | `tests/gauge-handoffs.mjs` | Read-only accountant and explicitly scoped resource-manager grants ship. Client sponsors, client collaborators and configurable role grants remain absent. |
| `GOVERN-010` | Define client and custom roles without finance bypass | target | partial | `tests/gauge-handoffs.mjs` | Client sponsor/collaborator roles and configurable role grants remain to be built. |
| `GOVERN-004` | Retain agency identity controls across lifecycle | target | missing |  | Agency domain controls, app-token lifecycle integration and controlled recovery-owner flow remain to be built. |
| `GOVERN-005` | Keep exact native business audit | target | partial | `tests/gauge-audit.mjs` | Missing a cited audit journey that performs provider synchronization and reads its linked audit outcome. The cited journey proves corrected time, approvals, packet adjustment/export, import effects, key events and native audit integrity; its privacy helper covers erasure. |
| `GOVERN-011` | Search and verify private audit | target | done | `tests/gauge-audit.mjs` — "GOVERN-005 / GOVERN-011 corrected time traced through approval, billing adjustment, import and export with a verified chain"; `tests/gauge-audit.mjs` — "privacyJourney" |  |
| `GOVERN-006` | Preview lawful agency erasure | target | partial | `src/gauge/privacy.ts`; `src/gauge/ui-privacy.ts`; `tests/gauge-privacy.mjs`; `tests/gauge-audit.mjs` | Owner-only versioned retention, explicit exit, read-only exact consequence preview and manually confirmed bounded native erasure ship. ct approved this slice (22 Oct): native-owner-only manual erasure after the exact preview and explicit lawful-receipt authorization; financial totals and immutable audit stay on legal hold under the anonymized profile the preview names; every erasure writes its mandatory completion record. Profiles, private leave notes, favorites and eligible receipt bytes are removed; billed work and financial artifacts remain exact. Base redaction journal refuses an old archive with the trusted later journal, and post-erasure archives restore anonymous profiles without erased receipt bytes. Remaining: the owner-set retention schedule and its automatic execution (saved retention days only gate this manual erasure); erasure in search, caches and connected copies where authorized; restoring an old archive with the erasure journal so private content stays erased (today that archive is refused); full personal-content erasure in retained audit, source originals and other free text. This is not complete subject erasure. |
| `GOVERN-012` | Erase eligible native worker content | target | partial | `src/gauge/privacy.ts`; `src/gauge/ui-privacy.ts`; `tests/gauge-privacy.mjs`; `tests/gauge-audit.mjs` | Owner-only versioned retention, explicit exit, read-only exact consequence preview and manually confirmed bounded native erasure ship. ct approved this slice (22 Oct): native-owner-only manual erasure after the exact preview and explicit lawful-receipt authorization; financial totals and immutable audit stay on legal hold under the anonymized profile the preview names; every erasure writes its mandatory completion record. Profiles, private leave notes, favorites and eligible receipt bytes are removed; billed work and financial artifacts remain exact. Base redaction journal refuses an old archive with the trusted later journal, and post-erasure archives restore anonymous profiles without erased receipt bytes. Remaining: the owner-set retention schedule and its automatic execution (saved retention days only gate this manual erasure); erasure in search, caches and connected copies where authorized; restoring an old archive with the erasure journal so private content stays erased (today that archive is refused); full personal-content erasure in retained audit, source originals and other free text. This is not complete subject erasure. |
| `GOVERN-013` | Extend retention and erase across restores | target | missing | `src/gauge/privacy.ts`; `src/gauge/ui-privacy.ts`; `tests/gauge-privacy.mjs`; `tests/gauge-audit.mjs` | The complete extend retention and erase across restores workflow remains absent; the parent’s bounded native workflow is retained separately. |
| `GOVERN-007` | Bind agent purpose and cited-source decisions | target | partial | `tests/gauge-agent.mjs` | Missing a company-policy journey for bind agent purpose and cited-source decisions that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `GOVERN-008` | Keep versioned provider credentials in server custody | target | partial | `tests/gauge-provider-custody.mjs` | Missing a company-policy journey for keep versioned provider credentials in server custody that runs the granted action under held and all-autonomous policies. The cited legacy journey shows the native purpose/role gates and exact business effects, without selecting policy dispositions. |
| `MOBILE-001` | Complete responsive agency journeys | target | partial | `src/gauge/ui.ts`; `src/gauge/ui-time.ts`; `tests/fresh-clone.mjs`; `src/gauge/ui-invoices.ts`; `tests/gauge-invoices.mjs` | Client reports/payments and complete workflow keyboard, focus, error-recovery and screen-reader proof remain due. |
| `MOBILE-002` | Work through native iOS and Android apps | target | missing |  | Native iOS/Android apps, offline synchronization and push delivery remain to be built. |
| `MOBILE-003` | Time from macOS and Windows | target | missing |  | Native macOS/Windows timer apps and offline recovery remain to be built. |
| `MOBILE-004` | Time from permitted browser pages | target | missing |  | Chrome/Edge extensions and browser-host consent controls remain to be built. |
| `BASE-001` | Own an empty independent Gauge installation | target | partial | `AGENTS.md`; `SEED-COMMAND-CONTRACT.md`; `src/server.ts`; `tests/gauge-cli-journey.mjs` | Hosted target deployment and new integration operational capacity remain to be proved. |
| `BASE-002` | Carry agency history without installation authority | target | partial | `tests/gauge-portability.mjs`; `tests/gauge-base-portability.mjs` | Missing a whole-installation journey through the public export/import commands. The cited portability helpers build and restore via the portability service, reconcile exact records/artifacts and refuse corrupt or occupied destinations; the public CLI/browser journey in tests/fresh-clone.mjs is outside the old Evidence set. |
| `BASE-003` | Replace platform providers explicitly | target | partial | `base-copies.json`; `edition.json`; `src/modules/operator-auth/README.md`; `SEED-COMMAND-CONTRACT.md` | Model-backed PSA execution and tested provider substitution for the target remain to be built/proved. |
| `BASE-004` | Operate measured agency-size jobs | target | partial | `MOVE-IN.md`; `src/gauge/imports.ts`; `tests/gauge.mjs` | Target capacity measurements, scheduled backup operation and operational monitoring remain to be proved. |
| `BASE-005` | Support the minimum agency dataset | target | missing |  | The minimum floor dataset, hosted capacity measurements and preview admission against measured limits remain to be proved. |
| `BASE-006` | Meet agency page and reporting bounds | target | missing |  | Hosted floor-sized page/report measurements and reproducible published results remain to be supplied. |
| `BASE-007` | Complete floor-sized migration and portability | target | missing |  | A floor-sized generator and hosted import/export/restore timing proof remain to be supplied. |
| `BOUNDARY-001` | Keep specialist accounting and payroll ownership | target | done | `tests/gauge-handoffs.mjs` — "BOUNDARY-001 / BOUNDARY-004 / BOUNDARY-005: exact approved labor/expense/revenue input export, unknown and signed reconciliation, real test-receiver acceptance/rejection, honest labels, immutable results, replay and scoped privacy" |  |
| `BOUNDARY-004` | Prepare immutable specialist handoffs | target | done | `tests/gauge-handoffs.mjs` — "BOUNDARY-001 / BOUNDARY-004 / BOUNDARY-005: exact approved labor/expense/revenue input export, unknown and signed reconciliation, real test-receiver acceptance/rejection, honest labels, immutable results, replay and scoped privacy" |  |
| `BOUNDARY-005` | Reconcile specialist receiver decisions | target | done | `tests/gauge-handoffs.mjs` — "BOUNDARY-001 / BOUNDARY-004 / BOUNDARY-005: exact approved labor/expense/revenue input export, unknown and signed reconciliation, real test-receiver acceptance/rejection, honest labels, immutable results, replay and scoped privacy" |  |
| `BOUNDARY-002` | Reconcile the agency’s processor-held payments | target | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/fixtures/stripe-archive.mjs` | The card charge’s own settlement and payout composition, ACH collection with an enabled merchant, live merchant onboarding and independent bank reconciliation remain unproved. |
| `BOUNDARY-003` | Remain a standalone PSA among separate products | target | missing |  | Complete named sibling/external handoffs for the PSA target remain to be built. |
| `RECOVER-001` | Diagnose portfolio drift with cited alternatives | push-further | partial | `src/gauge/reports.ts`; `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` | Continuous cross-system diagnosis, portfolio/cash comparisons and owned recovery cases remain to be built. |
| `RECOVER-010` | Validate recovery feasibility and economics | push-further | partial | `src/gauge/reports.ts`; `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` | The complete dependency, budget/retainer and comparable finance-delta feasibility flow remains to be built. |
| `RECOVER-002` | Negotiate and execute governed recovery | push-further | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` | External negotiation, post-reply feasibility checks, authorized follow-up delivery and cross-system execution remain to be built. |
| `RECOVER-003` | Verify actual recovery improvement | push-further | missing |  | Cross-system recovery readback, baseline comparison and verified closure remain to be built. |
| `RECOVER-004` | Steward retainers through cash | push-further | missing |  | Retainer stewardship, approval chasing and complete invoice/payment follow-through remain to be built. |
| `RECOVER-005` | Follow evidence through accepted timesheets | push-further | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` | Connected collection and active timesheet completion chasing remain to be built. |
| `RECOVER-006` | Learn traceable future forecast assumptions | push-further | partial | `src/gauge/reports.ts`; `src/gauge/proposals.ts` | Held-out outcome scoring, improvement gating and prospective recalibration remain to be built. |
| `RECOVER-007` | Turn signed scope into governed plans | push-further | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` | Initial document extraction, ambiguity resolution and complete staffed-plan/financial setup remain to be built. |
| `RECOVER-008` | Answer operational questions with permitted evidence | push-further | missing |  | Role-aware cited natural-language reporting and financial policy analysis remain to be built. |
| `RECOVER-009` | Guide migration through a settled cycle | push-further | partial | `src/gauge/imports.ts`; `src/gauge/harvest.ts`; `tests/gauge.mjs` | Migration/configuration agents, case resolution and settled-cycle continuity verification remain to be built. |
| `SURFACE-001` | Registry of agency jobs | target | missing |  | No Gauge MCP journey yet proves this seed delta under the two company policies. |
| `SURFACE-002` | Classify operational and outward work | target | missing |  | No Gauge MCP journey yet proves this seed delta under the two company policies. |
| `SURFACE-003` | Classify financial and private work | target | missing |  | No Gauge MCP journey yet proves this seed delta under the two company policies. |
| `SURFACE-004` | Classify authority and provider work | target | missing |  | No Gauge MCP journey yet proves this seed delta under the two company policies. |
| `SURFACE-005` | Agency record resources | target | missing |  | No Gauge MCP journey yet proves this seed delta under the two company policies. |
| `SURFACE-006` | Agency events and handoffs | target | missing |  | No Gauge MCP journey yet proves this seed delta under the two company policies. |
| `SURFACE-007` | Embedded agency specialists use the registry | target | partial | `tests/gauge-agent.mjs` | Native purpose-scoped proposal journeys exist. Registry routing, computed classes and the two company-policy runs remain missing. |
| `SURFACE-008` | A seeded agency week through MCP | target | missing |  | No Gauge MCP journey yet proves this seed delta under the two company policies. |
