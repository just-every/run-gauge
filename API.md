# Gauge HTTP API

The app's pages and any agent use the same server handlers. Every call needs a native Base session cookie; each handler checks the session, operator and Gauge grant itself and repeats the check inside the D1 batch that writes.

## Agency setup and money

The owner completes the first-run form at `/setup`, saving `currency` and an IANA `timezone` with the owner confirmation. New installations default to `USD` and `America/Los_Angeles`. Supported setup currencies are `USD`, `AUD`, `CAD`, `EUR`, `GBP`, `NZD`, `CHF` and `SGD`; each uses two decimal minor units. Setup checks the native owner session and origin and saves the choices with first-run completion. This is not a currency-change command for an operating agency.

Money inputs such as `amountMinor`, `costMinor` and `billMinor` are exact integer minor units; rates are minor units per hour. New engagements and rates use the saved agency currency. Terms, milestones, expenses, approved time economics and billing packets follow their engagement currency. On monetary record editors and packet commands, an optional `currency` input must match the relevant record; a mismatch is refused without conversion. Packet adjustments retain the original packet currency, and reports label amounts with their stored currency and refuse mixed-currency calculations.

The forward migration infers an existing agency's currency from stored monetary records and leaves existing amounts, revisions and approved artifacts untouched. There is no FX conversion or per-client currency override; native pre-tax issuance is the partial REPORT-003 slice below. Approved packet downloads remain billing-preparation CSVs.

## Reads

- `GET /api/gauge/state?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{agency: {currency, timezone}, data, capacity, economics, exceptions, correctionReviews, from, to}` filtered to what the caller may see. `data` holds `clients, people, engagements, budgets, tasks, milestones, rates, calendars, leave, staffing, time, expenses, packets, archives, proposals`; each record is `{id, revision, value}`. Rates, costs, packets and archives are empty for anyone but finance and the owner.
- `GET /api/gauge/history/{kind}/{id}` returns earlier revisions with actor, action and time.
- `GET /api/gauge/audit?kind&recordId&actor&action&text&from&to` (GOVERN-005, finance and owner only; others 403) returns `{entries, head, intact, timezone}`: newest 500 matching audit entries, each with `seq`, `at`, `actor` (`id`, `name`, `role`, `personId`), `automated`, `action`, `decision`, `kind`, `recordId`, `previousRevision`, `revision`, `previous` and `result` values, `changes`, `approval`, `policy`, `requestKey`, `references` and its chain `hash`. `action` matches as a prefix, `text` as contained text, and `from`/`to` are inclusive agency-calendar dates. Time favorites are never returned.
- `GET /api/gauge/audit/export` downloads the complete audit (`gauge-audit.json`): every entry in sequence with its hashed fields (`seq`, `at`, `actor`, `role`, `personId`, `requestKey`, `action`, `kind`, `recordId`, `previousRevision`, `revision`, `data`, `reference`), its `hash`, a readable `view`, and the chain `head`. hash = SHA-256 of canonical JSON (sorted keys, no spaces) `{"entry": fields, "previous": prior hash}`, the first entry's previous being `gauge-audit-v1`. Favorites appear as `{seq, kind, withheld, hash}` stubs, so a recipient can still recompute the chain.
- `GET /api/gauge/audit/verify[?seq&hash]` recomputes the chain and returns `{entries, head, mismatches, gaps, unsealed, checkpoint, intact}`; a checkpoint (an earlier export's `head.seq` and `head.hash`) matches only when the chain recomputed from the first entry reproduces it.
- `GET /api/gauge/packets/{id}` downloads an approved packet's CSV (finance); `GET /api/gauge/files/{id}` a receipt (its owner or finance).

## Utilization keys (CONNECT-020)

The owner creates a read-only utilization key on **Access** (or `apikey:create` with a `label`; owner only, 403 otherwise). The answer and the page show the key (`gauge_util_…`) once; Gauge stores only its SHA-256, and replaying the request key returns the key's `id` without it. `apikey:revoke` with the key's `id` revokes it; the next keyed request answers 401.

`GET /api/gauge/state?from=YYYY-MM-DD&to=YYYY-MM-DD` with `Authorization: Bearer <key>` returns only `{scope: "utilization:read", from, to, participantCount, availableSeconds, knownAvailableSeconds, missingCalendarDays, approvedBillableSeconds, asOf}` for the whole agency. Both dates are required and inclusive, up to one year apart. `participantCount` counts every person record. `availableSeconds` is their net calendar seconds after holidays and leave, or `null` when any participant lacks a calendar day in the window (then `knownAvailableSeconds` and `missingCalendarDays` say how much is known). `approvedBillableSeconds` sums approved, billable client time whose work date, in the entry's own time zone, falls in the window; internal work is never billable. The figures equal the owner's own utilization report; the answer names no person and carries no rate, cost or pay. A key opens no other route (403) except its self-revocation door and cannot change business data. Each create, revoke and keyed read is audited and listed under **Key activity**; export leaves keys out, so a restored installation holds none.

`POST /api/gauge/keys/revoke` with `Authorization: Bearer <key>` revokes only the presented utilization key. No body or request key is required; body fields cannot select another key. Active, unknown and already-revoked keys all receive HTTP 200 with an empty body. Only the first successful revocation is audited, as `key:<label>`. The next read with that key returns 401. Missing/malformed Bearer authentication returns 401; other methods return 405. This is RFC 7009 style idempotent revocation for Gauge's scoped keys, not an OAuth token endpoint.

## Commands

`POST /api/gauge/command` with `Content-Type: application/json`, the app origin in `Origin`, and a body `{action, key, ...input}`. `key` is a unique request key: repeating it with the same body returns the first outcome. Success returns `{id, revision, saved: true}`; a refusal returns `{error}` with 400, 401, 403, 404 or 409. Record updates and decisions send the record's current `id` and `revision`.

People use `save:{clients|people|engagements|budgets|tasks|milestones|rates|calendars|leave|staffing}`, `budget:approve`, `milestone:approve`, `time:save`, `timer:start`, `timer:stop`, `time:submit|return|approve|correct`, `expense:save|file|submit|return|approve`, `packet:create|approve|cancel|adjust`, `import:preview|create|resume|rollback|undo`, `grant` and `apikey:create|revoke` (owner). The page forms post the same actions to `/app/action`.

Rate cards (RATE-002, finance only): `save:rates` takes exactly one of `engagementId` (project card), `clientId` (client card, with an optional `role` for a client-role card), `role`, `personId`, or none (service card, which needs a named `service`); plus `service` (`*` for all), `effective`, `billMinor` (agency currency), optional `costMinor` (declared USD per hour; person, role and service cards only), optional `overtimeAfterSeconds` with `overtimeBps` (10000–30000), and optional `writeDownBps` (0–10000). `rate:entry` with an unapproved time entry's `id` and `revision` sets `billRateMinor`, optional `writeDownBps` and a `reason` (a blank `billRateMinor` clears it). `rate:withdraw` with a card's `id`, `revision` and a `reason` records an immutable withdrawal: the card leaves precedence for later pricing (explain, new approvals, forecasts) while frozen approvals keep it. `GET /api/gauge/rates/explain?personId=&engagementId=&service=&date=` returns the precedence, every matching card version at each level, and the bill and cost cards that apply. Approved time `economics` freeze `rateId`, `rateLevel`, `entryOverride`, `costRateId`, `costLevel`, `costCurrency`, `costKind` (`w2-loaded` or `1099-contract`), `overtimeSeconds`, `overtimeRateMinor`, `standardBillMinor`, `writeDownBps`, `writeDownMinor`, `billMinor` and the `precedence` trace. Engagement `economics` report `costByCurrency` buckets; when `otherCostCurrencies` is non-empty, `costMinor` is null and `knownCostMinor` is the engagement-currency subtotal.

Billability targets (REPORT-002, owner or finance only; 403 otherwise): `target:set` takes `scope` (`person` with `personId`, or `role` with the people-profile `role` text), `percent` (0–100, up to two decimals, stored as `basisPoints`) and `effectiveFrom` (YYYY-MM-DD). Targets are never rewritten; a later one supersedes from its date. `GET /api/gauge/state` returns `performance` (`asOf` = last report date, `byPerson`, `byRole`, `byClient`, `byPeriod` by calendar month): approved, billable and nonbillable seconds, `availableSeconds` (null when a calendar is missing; always null for clients), `utilization` (billable ÷ available), the `target` in force (person before role) and `variancePoints`. For finance each group's `money` lists one bucket per currency with `standardMinor` (frozen approved bill amounts of billed entries), `billedMinor` (current approved packet amounts after corrections), `writeOffMinor`, `realizationPercent`, `effectiveRateMinor` (per hour, half up), `unbilledStandardMinor` and `missingBillRate`; other viewers get `"Restricted to finance"`. Each figure has a `performance:` lineage entry and a report CSV row.

Agency profile (SETUP-001): the owner alone sends `agency:profile` with `legalBusiness`, `addressLine1`, optional `addressLine2`, `city`, `state` (US code), `postalCode` (ZIP), optional `einReference` (`12-3456789`), `fiscalYearStartMonth` (1–12) and a `reason`, plus the current profile `id`/`revision` once one exists (stale 409, others 403). State shows the owner the whole profile, finance everything but the EIN, and others nothing. `fx:approve` (owner only) takes `currency`, `rate` (up to six decimals, one unit of that currency in the agency currency), `effective` date, `source` and `reason`; a rate effective before the currency's latest approved rate is refused (409). Finance or the owner reads `fx:consolidate` (optional `from`/`to` work dates): per currency the approved time and expense value, the rate/date/source used per conversion, `consolidatedMinor` (null with `missingRates` until every currency has an approved rate). `import:preview` of a package in another currency needs `manifest.currencyPolicy: "keep-source-currency"` and reports `currency`, `agencyCurrency` and `currencyPolicy`.

Two-person review (GOVERN-001): the owner alone sends `approval:limit` with `reviewAboveMinor` (agency-currency cents, or `""`/`null` for no limit) and a `reason`, plus the current policy `id`/`revision` once one exists (stale revisions 409; others 403). Finance sees the policy in state as `approvalPolicies`. `packet:approve` on an adjustment packet whose absolute `totalMinor` is strictly above the limit, or whose currency differs from it, refuses its preparer (`createdBy`) with 403; another owner or finance person may approve. Grant changes are kept in `g_grant_audit` and listed on Access.

`import:preview` and `import:create` take `package: {manifest, files, archives?}` as described in [MOVE-IN.md](MOVE-IN.md). Detailed time may instead use `package.workbook: {base64}` with exact `manifest.timeWorksheet`, omitting `files["time.csv"]`; the multipart door takes `time.xlsx`. Worksheet values share CSV mappings/controls/source identities and retain binary originals and worksheet/row locations. Formula, conflicting time format and size refusals happen before writes (see MOVE-IN.md). The offline manifest must declare the package's actual `currency`, matching the saved agency currency; there is no default for an omitted manifest currency. A mismatch returns 400 with a reason such as `Harvest package uses AUD; agency uses USD. No currency conversion is performed.` Preview returns the reviewed fingerprint, counts, totals, `timeSources` (source IDs with artifact/worksheet pointer/row locations), memberships, omissions and package without writes; create requires that `fingerprint` and returns the bounded import job. Imported engagements, rates and source time amounts retain the declared currency.

## Client and contact workspace (SETUP-002)

Finance and the owner keep the client workspace with `save:clients` beside `name` and the cash terms: `legalName`; `contacts` (an array of `{role: "billing"|"project", name, email?, phone?}`, or lines `role; name; email; phone`); `addresses` (`{purpose: "billing"|"legal"|"project", line1, line2?, city, region?, postalCode?, country}` or lines `purpose; line 1; line 2; city; state; postal code; country`, country a two-letter ISO code, `US` when blank); `taxId` (a reference such as an EIN); `exemptions`, `poNumbers` and `tags` (arrays or comma-separated); `poRequired`; and `externalIds` (`{system, id}` or `system:id`, comma-separated; systems are lower-cased short names). A field left out keeps its saved value. An external identity, recorded or an import source, belongs to one active client (409 otherwise). Other roles read only the client name in state and history.

`GET /api/gauge/clients?q=` (finance and owner; 403 otherwise) returns `{query, clients: [{id, revision, name, legalName, matches, engagementIds}]}`: PO numbers, tags and external IDs (`system:id` or the bare ID) match whole and case-insensitively, names, legal names and contact names or emails by contained text; `matches` names `po`, `externalId`, `tag`, `name` or `contact`. Merged duplicates are never returned. The Engagements page offers the same search (`/app/engagements?clientSearch=`).

`client:merge` (finance and owner) takes `survivorId`, `survivorRevision`, `duplicateId`, `duplicateRevision` and `reason` (the page form sends `survivor` as `id@revision`), and `terms: "survivor"|"duplicate"` whenever the two clients' payment terms, approved days late or collection probability differ (409 otherwise). A duplicate with client rate cards in force is refused until `rate:withdraw`. Every engagement and opportunity of the duplicate moves to the survivor as a new revision; the survivor keeps its scalar fields (filling empty ones from the duplicate) and gains the duplicate's contacts, addresses, exemption references, PO numbers, tags and external identities; the duplicate keeps `merge: {into, reason, terms, by, at}` and refuses new work, edits and a second merge. Each changed record is audited as `client:merge`.

## Agent preparation

The owner invites an operator for the agent, has it accept, then on **Access** grants it the `agent` role with no person. In local development the `agent` dev persona (`rer dev --as agent`) is such an operator once granted. An agent may send only these two actions; anything else answers 403.

`proposal:prepare` body: `{kind, engagementId, assumptions, evidence: [{source, summary}] (1–20), plan}`

| kind | plan | Who decides | Approval creates |
|---|---|---|---|
| `time` | `{personId, taskId, service, start, end, timezone, notes, billable, ambiguity?}`; instants are ISO with a UTC offset, at most 24 hours | that person | their own draft time entry (they may confirm a different `start`, `end` or `billable`) |
| `staffing` | `{alternatives: [{personId, from, to, dailySeconds, rationale}] (1–5)}`; always tentative | engagement lead or finance (`choice` selects the alternative) | a tentative staffing allocation |
| `billing` | `{title, sources: ["time:ID", "expenses:ID", "milestones:ID"]}`; each must be approved, unallocated and (for time) carry hourly terms and a bill rate | finance | a draft billing packet, approved separately |
| `change-order` | `{mode: "hourly"|"fixed", amountMinor, effortSeconds, roundingSeconds, brief}` | engagement lead or finance | a draft change-order budget version, approved separately |

`proposal:withdraw` `{id, revision}`: the preparing agent withdraws an open proposal.

People decide with `proposal:approve` `{id, revision, choice?, start?, end?, billable?}` or `proposal:decline` `{id, revision, reason}`. A decided proposal cannot change; it keeps `decidedBy`, `decidedAt`, the reason or `effect: {kind, id, revision}`, and its history.

An owner assigns an agent with `grant` `{operatorId, role: "agent", enabled: true, purpose, engagementIds: [ID]}`. `purpose` is exactly one of `time`, `staffing`, `billing`, `change-order` (AGENT-001–004). No person is attached. The owner narrows or revokes through the same door (`enabled: false` revokes without resupplying scopes), or on Access. Legacy unscoped grants start disabled. Each change increments the grant version; existing open proposals require fresh preparation. The granting owner must remain active with owner authority. Every request and committing batch rechecks that authority.

The agent's reads come from `GET /api/gauge/state`, its Review page, and visible record history. All other Gauge read doors are refused. Each purpose uses the closed field allowlists in `src/gauge/agent-data.ts`: common client name, engagement identity/membership/timezone, task context, person name/timezone and its own same-purpose proposals; time adds approved time and work calendars; staffing adds availability, leave duration (no reasons) and scoped staffing; billing adds approved time, expenses and milestones without amounts; delivery exceptions add those work and scheduling sources and non-amount budget context. Resourcing can consider agency people and availability, but no other engagement's allocations or work. Undeclared kinds and fields stay absent, including rates, credentials, private contact details and finance amounts. Derived reports use only this projection.

Evidence items are quoted `{source, summary}` data. A native citation adds `record: {kind, id, revision}`, validated against the agent's purpose and engagement visibility. Quoted instructions never become plan fields or commands. Proposals capture source kind/id/revision and relevant set membership at preparation, including automatic dependencies (work, calendars, allocations, rates, packets and terms as applicable). Decisions recheck these and the original agent grant in the committing transaction. Changed, added, withdrawn or erased inputs refuse the decision as stale; revoked agents' proposals remain readable with "Agent revoked" and no approval. Refusals change no business record or receipt; GOVERN-005 records only the reason class and proposal revision. Ask the agent to prepare a fresh proposal.

## Opportunity pipeline (SALES-001)

Leads manage their own opportunities; finance manages all. `save:opportunities` takes `name`, `clientId`, `ownerId` (person), `stage` (`discovery`, `qualified`, `proposal`, `won`, `lost`), integer `probability` (0–100 percent), proposed `from`/`to` dates, `services`, `amountMinor`, `demandSeconds`, and optional `engagementId`. Updates bind `id` and `revision`. Won requires 100%, lost 0%; only won work may link to a same-client, same-currency engagement the actor manages. An engagement links to at most one opportunity. The engagement page and current state show opportunity history and pipeline totals.

`pipeline` groups totals by explicit currency. Open weighted value rounds each opportunity’s amount × probability half-up to cents; open demand remains tentative whole seconds outside signed staffing. Booked backlog is agreed value before billing: the latest approved engagement budget, or its linked won value when no budget is approved, plus unlinked wins. Linked opportunity and approved terms count once. Lost opportunities contribute neither. For finance, `billedMinor` is the pre-tax total of native invoices issued on or before the report's as-of day on engagements that carry booked value (`billedInvoices` lists them) and `backlogMinor` is `bookedMinor − billedMinor`, which equals `bookedMinor` while nothing is issued and is negative when billing exceeds it; both are `null` for leads, who never read invoice amounts. No cash completion is implied.

## Won work becomes an engagement (SALES-004)

Finance or the owner sends `opportunity:convert` with a won opportunity's `id` and `revision`. One batch creates a client engagement (the opportunity's name and client, its owner as lead, agency currency and zone, `opportunityId`), a draft `fixed` budget whose `amountMinor` is the won value and `effortSeconds` the won demand (approve it with `budget:approve`), and one open resource request per comma-listed service over the inclusive won dates; it sets the opportunity's `engagementId` and `conversion: {engagementId, budgetId, resourceRequestIds, unplacedSeconds, convertedAt, convertedBy}`. Demand splits evenly by service and then by date in whole seconds rounded down; `unplacedSeconds` is what did not divide. Converting again returns the same engagement. Other roles get 403; an opportunity that is not won gets 409.

Resource demand (RESOURCE-005, finance only): the state read's `demandForecast` (null for everyone else) gives `baseline.months` with `committedSeconds`, `unfilledSeconds`, `wonSeconds`, `committedDemandSeconds`, `tentativeSeconds`, `weightedPipelineSeconds`, `employeeCapacitySeconds`, `contractorCapacitySeconds`, `committedFeesMinor`, `committedCostMinor`, `marginMinor` and `weightedPipelineFeesMinor`, plus `incomplete`, `unplaced` and `scenarios`. Finance sends `save:demandScenarios` with `opportunityId` (an open opportunity), `name`, `reason`, `costPerHourMinor`, optional `delayDays` (0–366) and optional `supply` `{type: 'hire'|'contractor', label, from, to (required for a contractor), dailySeconds}`; updates bind `id` and `revision` while the scenario is a draft. The owner sends `demandScenario:approve` with `id` and `revision`; approved scenarios are immutable and each carries `months` and a `delta` (capacity, demand, fees, cost, margin) against the unchanged baseline.

## Report calculations and exports (REPORT-005)

State responses include `asOf` (ISO timestamp), `fingerprint` and `lineage`. Each calculation carries its numeric value (exact cents or seconds), currency, formula, contributing source IDs/revisions and already-permitted source values including frozen rates and approvals. Missing rates or calendars produce an incomplete `null` total and an explicit known subtotal, never a zero total. Finance economics also exposes `knownCostMinor` and `knownBillableMinor`; `costMinor` and `billableMinor` are null while their sources are incomplete. Source visibility follows the caller; restricted global time is not disclosed in lineage.

On Review, Engagements, Staffing and Billing, open **Report calculations and sources**, choose a calculation and inspect its source revisions. `GET /api/gauge/report.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&fingerprint=...` downloads figures and source rows with formulas, currency, approval evidence, reporting window and as-of timestamp. The fingerprint binds the current visible inputs and figures, excluding the read timestamp: any changed input or permission refuses the old snapshot with 409 so the person refreshes before exporting. Native authority is checked on each download; exports carry no inaccessible costs, rates or leave reasons.

## Scheduled versus actual utilization (RESOURCE-004)

`save:engagements` accepts `type: "client" | "internal"` (default `client`). Internal work requires no `clientId` and an `internalCategory` of `admin`, `sales`, `training`, `PTO` or `other`. Type cannot change after creation. Internal time and allocations cannot be billable; time approval freezes declared labor cost without requiring commercial terms. Internal engagements cannot have commercial budgets, milestones or billing packets.

`save:staffing` also accepts `service` and `billable`. Existing allocations with no service remain explicitly `Unspecified`; absent billability means billable client work and nonbillable internal work. `save:calendars` accepts `holidays` as an array or comma-separated list of dates inside its coverage. A listed holiday removes the working-day hours before leave is deducted; no public-holiday policy is inferred.

The dated state response includes `utilization.byPerson`, `byService`, `byProject` and `details` (person/project/service). Each row compares committed scheduled seconds, separately labelled tentative seconds, all stopped recorded seconds, submitted seconds awaiting approval, and approved seconds, with billable subsets and recorded-minus-committed variance. Its capacity denominator counts each participating person once for the complete requested window, after their holidays and leave; a missing calendar makes it unknown. Work numerators include only the caller's permitted records. Each ratio states `numeratorSeconds`, `denominatorSeconds` and `percent`; zero and unknown denominators produce `percent: null`. Billable/capacity and approved-billable/committed-schedule ratios stay distinct, and a second schedule ratio explicitly includes tentative hours.

On Staffing, **Scheduled versus actual utilization** has independent date and grouping controls, source links, daily calendar explanations and an export bound to that exact dated snapshot. Utilization figures and their permitted source revisions also appear in the ordinary report calculations CSV.

## Skills and resource requests (RESOURCE-001)

Finance edits a person's `skills: [{name, proficiency}]` (integer 1–5), `team`, `location`, `role` and `employmentType: "employee" | "contractor"` with `save:people`. Omitted profile fields retain their saved values. The form accepts skills as comma-separated `UX:4, Research:3`; duplicate names are refused case-insensitively. Staffing managers share the agency skills catalogue and profiles; rates and costs remain private to finance.

`save:resourceRequests` creates or revises an open role placeholder with `engagementId`, `role`, `skill`, `minProficiency`, `from`, `to`, `dailySeconds`, `service`, `billable` and optional `team`, `location`, `employmentType` filters. Dates are inclusive and every date carries demand. The caller must be finance or that engagement's lead. Internal requests cannot be billable. Open requests represent unfilled demand without booking a person.

`GET /api/gauge/resources/{id}` searches the agency roster by skill/proficiency and the request's filters. It returns the request revision, feasible `candidates`, qualified-but-`unavailable` people and an opaque `fingerprint`. Each candidate's dated net hours deduct holidays, leave and every competing committed allocation, including work the lead cannot open. Missing calendars or any daily shortfall prevent approval. Responses expose no private competing project IDs or leave reasons. Finance additionally sees exact declared cost at each requested day's effective person/service rate, rate versions and missing-rate dates; missing cost is null, never zero. Other roles receive no cost or rate fields.

`resource:fill` takes the open request's `id`, `revision`, the chosen `personId` and search `fingerprint`. It recalculates eligibility, refuses changed inputs, fences all observed availability and profile revisions plus concurrent inserts, and atomically marks the request filled, creates one linked committed allocation and adds the person to the engagement's members. The usual request key makes exact replay safe; independently keyed competing approvals cannot fill twice. Filled requests retain approval identity and history. Ordinary staffing edits preserve their request link; callers cannot inject one.

The dated state response includes manager-scoped `data.resourceRequests` and `resourceDemand`: per-engagement unfilled seconds plus named staffing seconds equals total demand. Filled requests count only through their named allocation. Staffing's **Skills and resource requests** panel exposes the same create/search/approve workflow and demand reconciliation.

## Portfolio schedule changes (RESOURCE-002)

Staffing's calendar searches person names, roles and skills case-insensitively; its Week and 5 weeks controls retain dated daily/weekly allocations. Managers see global availability totals, with only permitted project bars and leave details. Custom person fields added by SETUP-004 must join this search before shipping.

`staffing:preview` takes a booking `id`, `revision` and `operation`. A `move` takes `personId`, `from`, `to` and preserves the inclusive number of dates. A `split` takes `splitDate` and `secondPersonId`; the original person retains dates before the split and the second receives the remainder. Daily seconds, service, billability, commitment and resource-request link remain intact. Preview does not write: it returns normalized `input`, proposed `parts`, global daily capacity (after holidays, leave and competing projects), separate tentative demand, unknown-calendar and overbooking warnings, unfilled demand and an opaque `fingerprint`. Private competing source IDs and leave reasons are excluded.

`staffing:apply` takes the same normalized input plus the fingerprint and a request key. Only finance or the project's lead may apply; it rechecks every observed revision and concurrent insert in the committing batch, retains the original history, adds new assigned members, and saves a split atomically. Changed inputs refuse with 409; exact replay acknowledges the original result. The person explicitly accepts any displayed capacity warnings.

## Task execution and recurring work (DELIVERY-001)

`save:tasks` creates or edits a task under its engagement lead or finance. In addition to `engagementId`, `name` and `remainingSeconds`, it accepts `estimateSeconds`, `assigneeId` (an engagement member or lead, optional), `parentId` (same-engagement task, optional), `status` (`todo`, `in-progress`, `blocked`, `done`), `priority` (`low`, `normal`, `high`, `urgent`), optional inclusive `from`/`to` dates, `billable`, and `checklist: [{id, label, done}]`. Hierarchies cannot cycle or exceed ten levels. Effort is each task's own work, not a roll-up of its children. Internal tasks are nonbillable. Time retains its required same-engagement task; expenses accept an optional `taskId`, enforce the same boundary, and preserve an omitted existing link.

A root may set `repeatEveryDays` (1–366 calendar days, 0 for once) and `repeatUntil` (inclusive last start date); recurring work requires start and due dates. Completion commits the next occurrence and its descendant tasks (up to 50) atomically, shifts dates by that interval, resets status and checklist progress, restores estimated remaining effort, and retains predecessor/successor links. Request receipts and exact revisions prevent duplicate or stale completion. A completed occurrence with a successor cannot reopen; its recorded time and expense links remain on the original occurrence. No scheduled job or external delivery is implied.

`task:progress` accepts `id`, `revision`, `status`, optional `remainingSeconds`, and `completedItems` (the exact list of completed checklist IDs). The current assignee or engagement lead/finance can apply it; it cannot change assignment or task terms. Done sets remaining effort to zero. The Engagements page exposes list, board and Mine views using `taskView=list|board|mine`, `taskClient` and `taskProject` filters, progress forms, source history and permitted recorded-time totals. Mine means the signed-in person's assignments. Costs remain finance-only under the ordinary state and history handlers.

## Daily/weekly timesheets and period policy (TIME-003)

On Time, select Day or Week, a period start and your person (finance can enter time for people). The grid shows net available, recorded and missing hours per day and separate draft/returned/submitted/approved actual seconds. Missing calendar capacity is unknown. Expand a day to enter its actual start/end clock times, explicit work timezone, task, service and notes. Recent-task copy and favorite reuse prepare defaults only; no interval, source identity, approval or economics is copied. The ordinary manual interval and persistent timer remain available.

`time:favorite` takes `personId`, `name`, `taskId`, `service`, `timezone`, `billable` and optional `enabled` (default true); edits bind `id` and `revision`. Retire with `enabled: false`. Favorites stay private to their person; only the owner may act for another person through finance Time. Ordinary owner state does not list other people's favorites; selecting `sheetPerson` explicitly on `/app/time` loads that person's templates. Leads and other finance users cannot read another person's favorite via state or history. The BASE-002 archive preserves favorites and histories.

`time:bulk-submit` accepts 1–50 `entries: [{id, revision}]`. Every entry must be the caller's (or entered by finance), stopped, draft/returned and unlocked. A stale, inaccessible, running or locked item refuses the entire batch. Request receipts retain exact replay behavior.

`time:policy` lets finance save the singleton policy with `lockThrough` (inclusive YYYY-MM-DD, or null to reopen all) and mandatory `reason`; updates bind its returned `id` and `revision`. An empty installation starts unlocked. Policy history records the actor, date, prior cutoff and reopening reason. A running timer in the affected period prevents locking. The cutoff uses the start work date in each entry's explicit timezone, or an imported date-only entry's stated work date. Edits check both old and proposed dates. Save, timer, submit, review, historical correction and agent-confirmed time use the same fenced policy; import application and reversal check it atomically with their native writes. No finance bypass exists: reopen with a reason first, then use the ordinary audited correction and renewed approval. Original actual duration, approver and frozen billing rounding remain in revision history, and billed-source immutability remains enforced.

## Delivery dependencies and baselines (DELIVERY-002)

`delivery:preview` accepts `engagementId`, `previousId` (null for the first baseline), `operation: "baseline"`, and `plan: {calendar: {weekdays: [1,2,3,4,5], holidays: ["2026-11-26"]}, nodes: [...]}`. Each node has an agency-local `id`, `kind` (`phase`, `task`, `milestone`), `sourceId` (existing same-project task or milestone, null for a phase), `name`, `start`, `durationDays`, `predecessors` and `staffingIds`. Durations count working days, inclusive; milestones take one. Finish-to-start edges advance to the next working day, respecting every declared minimum start. Cycles, duplicate references and cross-project sources/bookings refuse. The bounded graph supports 100 nodes and a three-year date horizon.

For a delay, send `operation: "delay"`, the latest `previousId` and `revision`, `nodeId` and `delayBusinessDays` (1–366). Preview returns the calculated schedule, real critical-path slack, source date changes, and global daily capacity for linked bookings. Bookings preserve inclusive calendar duration and move by the node's calendar-date offset; private competing projects and leave reasons are excluded, while unknown calendars and tentative totals remain explicit. Preview writes nothing.

`delivery:approve` takes the returned `input`, `fingerprint`, `acceptEffects: true`, a reason and request key. The ordinary engagement lead/finance authority applies. It atomically fences observed inputs and concurrent inserts, updates task dates, milestone due dates and linked booking dates, and appends one immutable baseline. A stale preview refuses all effects; exact replay acknowledges the original approval. Milestone price, commercial authorization and issued artifacts stay fixed; prior baselines and source revision histories remain available. `/app/engagements?edit=...` exposes the same plan, Gantt, dependency table, preview, approval and prior-baseline inspection. BASE-002 includes every baseline.

## Recurring retainer terms and periods (RETAINER-001)

The owner saves `agency:calendar` with `previousId` (null initially), `weekdays` (0 Sunday–6 Saturday), explicit `holidays` and a reason. Each saved calendar is append-only; previously approved retainer terms retain their own calendar snapshot.

`retainer:preview` uses the existing engagement budget-manager authority (lead for that engagement, or finance; ct approved 19 October 04:33Z). For commercial terms send `engagementId`, `operation: "terms"`, optional `previousId` for a new version, and `terms: {name, frequency: "monthly"|"quarterly"|"annual", unit: "value"|"hours", allowance, services: [...], consumes: "all"|"billable"|"nonbillable", proration: "calendar"|"working", start, end: null|date, renewal: "automatic"|"manual", noticeDays, currency?}`. Value allowance is integer currency cents; hours allowance is seconds divisible by 60. Currency must match the engagement. A working-day term requires the owner's saved agency calendar.

The inclusive `from`/`to` preview window (up to 366 days, default the start date) selects complete overlapping commercial periods; it does not shorten entitlement. Calendar anchors are the first of the month, quarter or year. Only contractual start/end prorate entitlement: allowance × active calendar/working days ÷ full-period days, rounded half up once to cents or whole minutes. A manual renewal permits the initial period and previews its next renewal decision date; automatic renewal permits subsequent periods until the inclusive end. Notice dates subtract the stated calendar days.

`retainer:approve` takes the preview's returned `input`, `fingerprint`, reason and request key. It fences all observed versions/inserts and appends commercial terms and separate immutable period records. Later versions start after all saved periods; prior versions/periods remain unchanged. To open further periods, preview with `operation: "periods"`, `retainerId`, `from` and `to`, then approve that fingerprint. Exact replay and reopening saved periods create no duplicates. This is a reviewed period door; RETAINER-005 owns future scheduled invoice drafting.

Manager state includes `retainerBalances`: eligible approved time is selected by work-start date, case-insensitive eligible service and the terms' billability choice. Hours consume actual whole seconds; value consumes frozen approved bill value. Draft/submitted/returned work is excluded. Missing or restricted approved bill value produces null consumption/remaining and named unknown sources. Entitlement, consumption and remaining figures have source/formula lineage and appear in the ordinary calculations CSV. `/app/engagements?edit=...#retainers` exposes these same forms, previews, period records and version history. Value consumption retains existing finance-only approved-economics visibility; leads receive unknowns when those source amounts are restricted. Staff/agents receive no terms, periods, balances or their histories; RETAINER-003 retains its staff/client statement, pending-work and adjustment obligations. BASE-002 carries calendars, terms and periods with their source records.

Retainer-covered time is listed as `retainer billing held` and refused by ordinary hourly packet creation/approval and agent billing preparation, including future automatic periods not opened yet. RETAINER-002/005 must supply reviewed overage/scheduled billing eligibility; existing approved artifacts remain immutable.

Timesheet policy and review (`TIME-004`): `time:policy` takes an exact policy `id/revision`, audited `reason`, optional inclusive `lockThrough`, and `review: {dueWeekday: 0..6, dueTime: "HH:MM", minimumNotes, maxEntrySeconds, maxDaySeconds, reviewLevels: 1|2, separation, serviceBillability: {service: boolean}}`. Omitted `review` preserves it. `time:delegate` takes `engagementId`, `delegateId` (a person with an active lead/finance grant), inclusive `from/to` and `reason`; only that engagement's lead creates or revokes (`time:revoke-delegate`, exact `id/revision`, reason). Native `time:approve` records each exact review; two levels require lead/delegate then independent finance and freeze economics only on the last decision. A changed policy requires return and resubmission. State includes visible `timeReview` flags, weekly local due dates and whole-calendar-day review ageing; the lead's delegate picker contains only eligible reviewer names.

Specialist boundaries (`BOUNDARY-001`): finance calls `handoff:prepare` with `recipient`, `purpose` (`accounting` or `payroll`), audited `reason` and `sources: [{kind: "time"|"expenses"|"packets", id, revision}]`. It fixes the exact approved snapshot. `GET /api/gauge/handoffs/:id` downloads the immutable CSV and exposes its SHA-256 in `x-gauge-artifact-sha256`; it never sends it. `handoff:record-result` takes exact handoff `id/revision` and either a JSON `file` or `result: {handoffId, artifactHash, lines:[{id,status:"accepted"|"rejected",reason?,currency,amountMinor,durationSeconds}]}`. Every exported line appears once with the exact quantities (including null unknown amounts); rejected lines need a reason. This is an immutable user-recorded receiver result, not independent provider verification or a financial source mutation. State/history/artifact access requires current finance authority.

## Retainer closes and adjustments (RETAINER-004)

Finance/owner sends `retainer:close` with a period `id`, `revision` and `reason` after its end in the agency timezone. Earlier periods must be closed first. One immutable `retainerCloses` record preserves statement, outgoing FIFO state, rules/calendar and source revisions; there is no reopen.

`retainer:adjust-prepare` takes the closed period `id`/`revision`, `reason`, and `kind`: `late` with `sourceId` of approved work missing from the close; `waiver` with positive `quantity` (seconds for hours, cents for value) no greater than its unwaived original billable overage; `refund` with `amountMinor`; `pause` or `cancellation` with declared external credit `amountMinor`; or `renewal` with the next base-allowance `quantity` and declared external charge `amountMinor`. The destination is the earliest later open period in that family. The acknowledgment names a `retainerAdjustments` row whose preview shows `nextAllowance`, `nextRemaining` and signed `cashDeltaMinor`. Preparation affects projections only. `retainer:adjust-approve` binds that adjustment `id`/`revision` and the exact current inputs; stale previews require `retainer:adjust-cancel` (with reason) and a fresh preparation. Posted late work consumes next-period FIFO once. A pause removes next base entitlement and holds overages; cancellation also zeroes later open entitlements and blocks new periods until renewal. Existing carried lots retain their original rules.

Cash is an external adjustment record, never payment/refund execution, invoice correction or settlement confirmation. Waiver cash uses the frozen original price, as the difference between rounded cumulative waived amounts before and after approval (splitting never over-credits); the other cash effects are finance-declared. Above the GOVERN-001 limit, another active finance/owner must approve; allowance changes count at the original overage price (value changes use cents), and an unpriced allowance needs an independent approver whenever a limit exists. New close/correction records expose only hour-unit information to leads/staff, and staff source links remain their own. Existing lead commercial setup rights remain unchanged. BASE-002 includes these business records and their history in the archive.

Committed forecast (FINANCE-006, finance only): `GET /api/gauge/state` returns `forecast` (`null` for other roles) as of `asOf=YYYY-MM-DD` (default: today in the agency timezone). Each engagement carries `basis` (`hourly`, `fixed` or `retainer`), `actualFeesMinor`, `etcFeesMinor`, `eacFeesMinor`, `tentativeFeesMinor`, `eacFeesWithTentativeMinor`, the matching cost fields, `marginMinor`, `months[]` (committed fees and cost with separate `tentativeFeesMinor`/`tentativeCostMinor`), `unpriced[]`, `incomplete[]` and `complete`; `totals[]` stay per currency and `pipeline[]` lists the `+ weighted pipeline` addition by month. Lineage ids `forecast:<engagementId>:<field>` give each figure's formula and source rows. `save:budgets` accepts optional `expenseBudgetMinor` and `expenseDate`.

Project margin (FINANCE-001, finance only): `GET /api/gauge/state` returns `margin` (`null` for other roles) on the same as-of day as `forecast`. Each engagement carries `approvedCostMinor` (frozen approved time cost + approved expenses), `provisionalCostMinor` (submitted time at the cost rate effective on its work date + submitted expenses), `earnedValueMinor` (FINANCE-006 actual fees, `earnedLabel` operational value, not recognized revenue), `billedMinor` (native issued totals when present, labelled invoiced; otherwise approved preparation packets net of adjustments), `creditsMinor` (negative adjustment deltas, already inside billed), `paidCashMinor` (dated user-recorded receipts, or null with "No payments recorded"), `remainingTaskSeconds`, `committedFutureSeconds`, FINANCE-006 `etcFeesMinor`/`eacFeesMinor`/`etcCostMinor`/`eacCostMinor`, `actualMarginMinor` and `forecastMarginMinor`. A figure with an unknown source is `null` beside its `known…Minor` subtotal and its `costUnknown`, `feesUnknown`, `provisionalUnknown`, `actualUnknown` or `forecastUnknown` sources. Lineage ids are `margin:<engagementId>:<field>`.

Revenue and cash forecast (FINANCE-002, finance only): `GET /api/gauge/state` returns `cash` (`null` for other roles) on the forecast's as-of day. `months[]` carry per `currency` and `month`: `revenueMinor` (FINANCE-006 committed fees), `tentativeMinor`, `pipelineMinor`, `invoicesMinor` (expected invoices), `openMinor` and `expectedMinor` (cash on terms × collection probability), `historicalOpenMinor`/`historicalExpectedMinor` (with approved days late), `rangeLowMinor`/`rangeHighMinor`, `pastDueMinor` and `complete`. `engagements[]` list `items[]` (source, invoice date, receipt date, cash month, historical date), `termsLabel` (`Net N` or `Net 30 assumed`), `daysLate`, `daysLateApprovedBy`, `collectionPercent`, `bookedRevenueMinor` and `backlogMinor`. `issuedReceivables` shows native open totals per currency, or `None issued`; `recordedCash` labels manual receipts while pending/settled processor amounts remain unverified. Finance sets `paymentTermsDays`, `daysLate` and `collectionPercent` (0–100, default 100) with `save:clients`; other roles never read them. Lineage ids are `cash:<currency>:<month>:<invoicesMinor|expectedMinor|historicalExpectedMinor>`.


## FINANCE-003 project scenarios

Native finance/owner sessions use `POST /api/gauge/command`; leads, staff, agents and utilization Bearer keys cannot use this door. Leads keep the ordinary project-scoped delivery and staffing doors.

1. `projectScenario:preview` takes `{asOf, changes: [...]}` for 1–20 alternatives with unique `id` values. A staffing change is `{type: "staffing", id: bookingId, revision, personId, effectiveFrom}` (`type` may be omitted for existing clients). The inclusive replacement begins after `asOf`, inside the original booking, preserving its end, daily quantity, service and commitment. Existing delivery-baseline bookings use their schedule door first.
2. A rate change is `{type: "rate", id: "reviewer-chosen-alternative-id", card: {...}}`. `card` has the native RATE-002 scope, service, effective date, bill and optional declared cost fields. The effective date is after `asOf`, with no active duplicate scope/date and no implicit FX. Every matching future staffed project is compared; frozen actuals and prior cards remain unchanged. Cards may include native `writeDownBps`, `overtimeAfterSeconds` and `overtimeBps`. These change prospective billing, not labor/payroll cost. Exact allocation seconds consume a person’s daily threshold across projects: approved raw seconds first, then committed bookings sorted lexically by engagement id and staffing id, then tentative bookings. Tentative work never changes committed prices; internal, nonbillable and unpriced allocations count toward the threshold. Premium hourly rate, ordinary/premium segments and the subsequent write-down round half up to cents. Actual approvals retain approval-order semantics and frozen economics. A selected replacement can make a person rate applicable to its future work.
3. A deadline change is `{type: "deadline", id: latestDeliveryPlanId, revision, nodeId, delayBusinessDays}`. It reuses DELIVERY-002's calendar, dependencies and booking offsets. Only changed source work starting after `asOf` can move; milestone commercial amounts and approvals remain intact. Adopted dates become a new native delivery baseline. Alternatives changing the same source refuse; compare them separately. The combined comparison window is at most one year.
4. Preview writes nothing. The response contains `baseline`, `scenario`, per-project `deltas`, exact `changes`, `alternatives`, `asOf`, `from`, `to`, `basisDigest` and `fingerprint`. Each side has per-project FINANCE-006 forecasts, FINANCE-002 expected cash (not collected cash), global capacity/utilization for affected people, and `dates` per affected project: finish date and task, milestone and staffing dates. Alternative details contain the normalized rate card or native delayed schedule and source changes. Unknown financial comparisons are null with incomplete sources; unknown calendar capacity is null. Amounts stay per currency.
5. `projectScenario:prepare` takes that input and `fingerprint`, `name`, `reason`, `key`; it stores an immutable scenario and returns an id/revision acknowledgement. Preparation changes no live business records. Finance reads snapshots in `state.data.projectScenarios` and their native history door; other roles receive no scenario records or history.
6. `projectScenario:preview` with `{id, revision, asOf, selectedIds: [alternativeId, ...]}` compares only explicitly selected prepared alternatives. No empty, duplicate or foreign selection is allowed. Changed baseline inputs require a new preparation. Use the resulting subset fingerprint for approval.
7. `projectScenario:adopt` takes that selected input plus `fingerprint`, `reason`, `key`. The as-of date must be today's agency date. It atomically applies the selected staffing portions, scope/remaining effort/replacement terms, rate versions and deadline effects, updates affected memberships, and retains the comparison, effects, human actor/time/reason and prior prepared revision. Unselected alternatives and approved actuals stay unchanged. Concurrent edits/inserts, different request-key content and repeat adoption refuse; exact-key replays return the original acknowledgement. No invoice, payment or external action occurs.

8. A scope change is `{type: "scope", id: engagementId, revision, scope, allocations?: [{id: bookingId, revision, effectiveFrom, dailySeconds, service?, billable?}], tasks?: [{id: taskId, revision, remainingSeconds}], terms?: {mode, amountMinor, effortSeconds, roundingSeconds, reason, expenseBudgetMinor?, expenseDate?}}`. Scope is explicit native remaining work, never an inferred percentage. Booking quantities change only on inclusive dates strictly after `asOf`; prior portions are preserved. Tasks must be open and start after `asOf`; their dates stay unchanged. Terms are an approved new whole-budget version on human adoption; old terms remain. A billing-mode change refuses when approved actuals exist, preserving their revenue classification. Existing approved fixed milestones cannot be reduced/erased through replacement terms; an increased unscheduled fixed fee remains incomplete rather than creating cash. Splitting delivery-baseline bookings uses the schedule door first. Scope and other alternatives that edit the same source must be compared separately. Other projects whose overtime fees change are included even without a source edit. Future BUDGET-002, RETAINER-005, SALES-002/005 and INVOICE-001/004 records inherit scenario comparison/adoption before shipping.

## Milestone delivery and recorded client decisions (DELIVERY-005)

The engagement lead or finance posts `milestone:health|issue|dependency|deliver|decision` with the milestone's exact `id`, `revision` and request `key`. State and the ordinary milestone history door retain `value.delivery`; authority and revisions are fenced again at commit. Staff, other projects' leads and agents cannot write. Reserved/billed sources cannot be changed through these commands: cancel a draft first or use linked billing correction.

- `milestone:health`: `health` (`healthy`, `at-risk`, `blocked`) and `reason`.
- `milestone:issue`: `name`, `ownerId` (person), `mitigation`, `status` (`open`, `resolved`), `reason`; optional `itemId` updates an existing issue, retaining previous values in revision history.
- `milestone:dependency`: `name`, `contact`, `due` (YYYY-MM-DD), `status` (`pending`, `received`), `reason`; optional `itemId` updates a dependency. Each milestone supports 100 issues and 100 dependencies.
- `milestone:deliver`: `date` (YYYY-MM-DD), `reason` describing delivered work. Appends an immutable snapshot of health, issues, dependencies and commercial fields; at most 100 deliveries. Dates cannot precede the prior delivery.
- `milestone:decision`: exact latest `deliveryId`, `outcome` (`accepted`, `rejected`), named client `contact`, `date` on/after delivery, and `reason`. One decision per delivery; exact-key replay is idempotent. A later decision requires a new delivered snapshot. Each decision stores the recorder's native identity and name, server time and `notice`: `recorded by <person>, not confirmed by the client`. Until CLIENT-001 ships this is a person's record of the client's response, never independent client confirmation.

Health, issue, dependency and draft commercial edits invalidate current delivery acceptance. A new delivery needs its own decision. Milestone commercial approval, recorded acceptance of the current delivery, and finance's separate packet preparation/approval remain distinct. Both existing and new milestones require recorded acceptance before new packet preparation. Delivery or acceptance alone produces no packet or invoice. Whole-installation archives carry the milestone's delivery data and history; restored installations still require fresh native authority.

`milestone:authorize` (DELIVERY-005) takes an approved milestone’s `id`/`revision` with current recorded acceptance. Owner/finance only; the acceptance recorder cannot authorize it unless acting as owner, labelled “One-person approval by owner”. Authorization binds the exact delivery, is audited, and is invalidated by delivery changes. Packet preparation and approval require this authorization. Rejection creates an open issue owned by the engagement lead, linked to the rejected delivery. Direct client confirmation awaits CLIENT-001; DELIVERY-005 remains partial.

## Portfolio profitability (REPORT-001)

Finance/owner state and Review return `portfolio`: `projects`, grouped `rows`, and monthly `trends`, with date-scoped earned value, approved burn and operational margin, whole-project budget/EAC, known subtotals and missing sources. Query `portfolioGroup=firm|client|project|team|service|lead|person`, `portfolioClient`, `portfolioProject`, `portfolioLead` and `portfolioPerson` (record IDs), `portfolioTeam` and `portfolioService` (exact names), plus inclusive `from`, `to` and agency-local `asOf`. Filters select whole engagements; team/service cohorts can overlap and are non-additive. Currencies never mix. Report CSV takes the same options and fingerprint; stale inputs refuse 409. Other roles receive `portfolio:null`. SETUP-004 adds permitted custom-field dimensions before shipping.

Retainer `terms.feeMinor` is an optional finance-only integer cents per full period, separate from allowance. Blank/unset means unknown, zero is an explicit zero fee. Each immutable version and saved calendar determine calendar/working-day proration; cumulative half-up cent rounding supplies earned-through-as-of and month differences for opened periods. Finance-forecast/margin include earned fees and the unearned remainder; cash assumes the full prorated fee once in advance on the active period start, labelled not issued until RETAINER-005 supplies its schedule. Leads cannot set/read fees; a lead’s future commercial version preserves its hidden existing fee. State, preview/input, history, pages, CSV and audit use the existing finance boundary.

`portfolio.labor` supplies additive approved labor and expense costs by current worker team, recorded service (expenses explicitly unassigned) and currency. Every source counts once; `portfolioLabor:` lineage drills retain frozen approval costs and name unknown amounts. Commercial project fees are not allocated and this view claims no team/service margin.

Scope54 additions: team/service/person cohorts are labelled “Engagements involving X”; Firm deduplicates engagements. `portfolio.labor.rows` carries `seconds`, `laborCostMinor`, `expenseCostMinor` and `hourlyBillableMinor` (frozen hourly-engagement bill value only). `unattributedFees` keeps fixed and earned retainer fees in their source currency, without allocation to teams/services. Every measure has a `portfolioLabor:` or `portfolioFees:` drill and CSV source rows. Retainer fee earning retains the contractual version’s working-day fee basis, including its saved workweek and holidays.

## Native invoice-to-paid reporting slice (REPORT-003, partial)

Finance sends `invoice:issue` with an approved ordinary packet's `id`/`revision`, `issueDate`, `dueDate`, `billTo`, `remitTo` and `reference`. This creates one immutable sequentially numbered pre-tax invoice with exact source/client/PO/terms snapshots; due date must equal issue date plus saved client Net N (Net 30 assumed only when unset). A required PO must match a saved client PO. Retainer sources and correction packets cannot issue through this slice. No send, tax calculation, payment link or accounting sync occurs.

Finance corrects an issued invoice only with linked documents (INVOICE-004). `invoice:credit` binds invoice `id`/`revision`, `type` (`credit`, `discount` or `write-off`), `date`, `reason` and `lines` as `[{line, amountMinor}]` (or one `line` and `amountMinor`), crediting each invoice line at most its billed amount and never more than the invoice still owes; it issues a `CN-` numbered credit note. `invoice:void` binds an unpaid, uncredited invoice's `id`/`revision`, `date`, `reason` and `reissue` as `[{line, amountMinor}]`, each at most its original line; it voids the invoice and, when anything is reissued, issues a new invoice on the same packet. A correction whose reduction is above the owner's review limit is `pending` until another owner or finance person sends `invoice:correction-approve` with its `id`/`revision`; `invoice:correction-withdraw` withdraws a pending one with a `reason`. The original invoice and its sources never change or return to billing; corrections are finance-only and pre-tax.

`receipt:record` (finance/owner) binds `clientId`, three-letter `currency`, `date`, positive integer `amountMinor` and a unique external `reference`; a reference identifies one receipt across every client receipt and every direct invoice receipt. `receipt:allocate` binds the receipt `id`/`revision`, `invoiceId`, `date` and positive `amountMinor`: the invoice must belong to the receipt's client and currency, the date may not precede the receipt or the invoice, and the amount may not exceed the invoice's open amount or the receipt's unapplied balance; it records one ordinary payment naming the receipt, once per receipt per invoice, and concurrent allocations cannot exceed either balance. Unapplied balances never reduce an invoice's open amount. `invoice:dispute` binds invoice `id`/`revision`, `date`, `amountMinor` (at most what is open) and `reason`; one dispute is open per invoice. `invoice:dispute-resolve` binds the dispute `id`/`revision`, `outcome` (`rejected`, `withdrawn` or `credited` with an issued credit note's `creditId`), `date` and `resolution`. A standing dispute changes no invoice amount or aging bucket; it is excluded from expected cash and listed apart (FINANCE-007).

`payment:record` binds invoice `id`/`revision`, `date`, positive integer `amountMinor` and unique bank receipt `reference`. Exact-key replay does not record twice; concurrent receipts cannot exceed the full outstanding amount. A receipt cannot precede issue or change currency. These are manual records, never processor-verified settlement. `invoice:promise` binds invoice `id`/`revision`, positive `amountMinor`, promised receipt `date` and `reference`; immutable later promises supersede earlier ones. The current promise moves up to its stated amount of the remaining open balance, without adding days late; a past promised date is broken and returns its open amount to the as-of month. Invoice and receipt records are finance-only in state/history, audit, lineage and CSV. Review excludes future-dated issues/receipts until their inclusive as-of day, removes issued sources from WIP, and keeps issued open plus recorded receipts equal to issued totals per currency. Billing provides both commands as ordinary forms.

## Receivables aging, client receipts and disputes (INVOICE-006)

`GET /api/gauge/receivables?asOf=YYYY-MM-DD&clientId=...` is for finance/owner under a current native session. Both parameters are optional: `asOf` defaults to today in the agency timezone, and omitted `clientId` includes every immutable issued client identity. It returns `invoices` with frozen client names, numbers, revisions, dates, dated receipt references and exact `invoicedMinor`, `paidMinor`, `openMinor`, `daysOverdue` and `agingBucket`; `clients` and `totals` aggregate separately per currency. It includes only invoices issued and receipts dated through the inclusive as-of day. Current means due today or later; overdue buckets are 1–30, 31–60, 61–90 and 91+ calendar days after the frozen due date. Paid invoices remain with zero open amount. Merged client records do not rewrite issued client identity.

Download `/api/gauge/receivables.csv` with the same filters and the returned `fingerprint`. Changed dated inputs return 409 and require a fresh read. CSV row types are `invoice`, `receipt`, `credit`, `void`, `client total` and `aging`; sum only one row type at a time. Invoice rows include cumulative paid amounts; receipt rows itemize those same allocations. Every row names its currency, and all amounts are integer minor units. JSON/CSV are internal statement preparation: no client delivery or provider settlement is claimed. INVOICE-004 credit notes and voids issued through the as-of day reduce each invoice's open amount (`creditedMinor`, `voidedMinor`; invoiced = paid + credited + voided + open) and itemize as `credit` and `void` rows. Client receipts (`receipts`: client, date, reference, `amountMinor`, `allocatedMinor`, `unappliedMinor`, each allocation) and disputes (`disputedMinor`, `dispute` on each invoice) are in the same report and CSV (`client receipt` rows; sum only one row type at a time). Other roles receive 403, signed-out requests 401; scoped utilization keys cannot use this door.


### INVOICE-002 fixed-fee deposit and percentage schedule (partial)

Finance uses `fixed:prepare` with `engagementId`, `budgetId`, `budgetRevision`,
`chargeType` (`deposit` or `progress`), `cumulativeBasisPoints` (1–10000), `name`,
`date` and `reason`. It binds the latest approved fixed budget. The gross target
is the entire budget times basis points divided by 10000, rounded half up to cents;
the draft amount deducts every already approved fixed charge and milestone.
`fixed:withdraw` retires an exact unapproved `id`/`revision` with a `reason`, preserving history without changing approved amounts.
`fixed:approve` takes the exact draft `id` and `revision` and rechecks that basis
atomically. A deposit is the first approved charge; a zero or negative increment,
stale budget or competing approved amount is refused. Approved sources do not reset
after a packet cancellation, invoice credit or void. Prepare a fresh higher
cumulative target for more billing, never re-create an earlier deposit.

Use `fixedCharges:<id>` as a `packet:create` source for the same engagement;
ordinary packet approval and `invoice:issue` freeze the exact source and schedule.
The Billing page accepts percentages such as 20 or 50.25. Charges schedule invoices,
not delivery or revenue recognition. Their unissued amounts enter expected cash
on the charge date plus client terms, and an issued invoice replaces its schedule
once. Ordinary DELIVERY-005 milestone gates remain. Consolidated multi-project
invoices, time-source splits and recurring retainer principal schedules remain absent.

### Scheduled retainer billing (RETAINER-005)

Finance saves `retainer:schedule` with `retainerId`, `basis` (`advance` or
`arrears`), `from`, `enabled`, `heldPeriodIds` and an explicit `reason`. Updates
bind `id` and `revision`. `autoIssue:true` additionally requires `capMinor` at or
below the owner's saved source-currency review limit and records `includeOverages`.
Save `billTo`, `remitTo` and `reference` on that revision. Each batch checks the
consenting operator's live authority, saved client payment terms and PO, consent
terms version, cap and active TIME-003/FINANCE-004 locks. Exceptions leave a
named draft, without issue; a closed period or lifecycle exception defers its
financial sources until resolution. Finance can resolve ordinary draft exceptions
and use manual packet approval and native issue.

`creditAdjustmentIds` optionally names approved negative RETAINER-004 adjustments.
It requires `creditConfirmation: "apply-unexecuted-adjustments-as-invoice-credits"`:
finance explicitly confirms no prior external execution. The schedule captures
exact revisions and amounts; each is reserved once in the same retainer/currency,
never silently selected or sent as a refund. A nonpositive invoice stays a draft.

The hourly Worker processes one due period per enabled schedule, up to 100
schedules per invocation. `retainer:run` takes the exact schedule and `asOf` as a
finance-only public clock/repair door. Every path needs the schedule's live
installation consent. Automatic issue atomically saves the allowance, immutable
fee, source reservations, packet approval, consecutive INV number, contractual
issue date, terms-derived due date, invoice provenance and unique run receipt.
Advance uses active start; arrears uses the day after active end. Included work
is never billed again. Historical fees and earned amounts never change.

Invoices remain native and pre-tax, with nothing sent. Disabling or losing the
consenting operator's authority stops the next batch. Whole-installation restore
retains business schedules, invoices and receipts without execution consent;
finance must explicitly save a new schedule revision to resume. FOLLOWUP-004
inherits durable retries and external delivery.

### Phase budgets, alerts and hourly caps (BUDGET-002)

`save:budgets` accepts `phases`, each with a stable `key`, `name`, `service`,
`mode` (`hourly` or `fixed`), `hourBudgetSeconds`, `feeBudgetMinor`,
`expenseBudgetMinor` and `marginBasisPoints`. Phase hours, fees and expenses must
sum exactly to their engagement totals. Approval retains existing phase identities,
services and billing bases. Tasks, milestones and staffing use `phaseKey`; time
and expenses inherit the task's phase. Templates may carry a `budget` with these
phases and item phase keys; applying that exact version creates a draft budget
and its scoped work. Its commercial approval remains explicit. Existing work must
have a retained phase before phase terms can be approved. Fixed billing sources
remain within their phase fee; transferring a fixed allowance cannot strand
already approved charges above it.

`budget:transfer` takes the latest approved budget `id`/`revision`,
`engagementId`, `fromPhase`, `toPhase`, `metric` (`hourBudgetSeconds`,
`feeBudgetMinor` or `expenseBudgetMinor`), integer `amount` and `reason`. It
prepares a balanced new draft; `budget:approve` approves that exact version.

The owner uses `budget:thresholds` with `engagementId`, optional `phaseKey`,
`thresholds` and `reason` (updates bind the policy revision). Default thresholds
are 75% and 90%; at least one configured threshold stays below 100%. Approved
plus submitted time/expenses count. Submitted bill value uses current applicable
rates as a provisional amount; approval freezes the usual economics. Fixed-phase
fee actuals use approved fixed milestones. Crossing emits one immutable in-app
alert per engagement/phase, metric and percentage, for its lead and finance.
Crossing again after a correction never duplicates it. An overspend alert is
also raised strictly above 100%. No notification is sent externally; FOLLOWUP-003
inherits delivered notifications and further unattended rule actions. Leads get
the threshold and source identities, never private calculated amounts.

`notToExceed:true` on hourly terms caps hourly invoice eligibility. Finance calls
`cap:draft` with `engagementId`, `budgetId`, `budgetRevision` and `title`.
Work-date/start/id order selects exact portions of approved, unbilled work.
Immutable `timeSlices` retain the original time revision, quantity offset and
frozen rate/premium/write-down pricing; cumulative rounding makes portions sum
exactly to their source. The packet reserves only those ranges. Cancellation
releases ranges, approved source time stays unchanged, and ordinary whole-entry
packet creation cannot bypass the cap. The cap cannot fall below reserved slices;
accepted change orders preserve the cap policy and release newly eligible excess.

`cap:write-down` prepares a review of held work using `engagementId`, `sourceId`,
`sourceRevision`, optional `offsetSeconds`, `durationSeconds` and `reason`.
`cap:write-down-approve` binds its `id`/`revision`, rechecks current eligibility
and applies GOVERN-001's independent review limit. A write-down removes that
range permanently without altering approved time. Held and written-down amounts
leave expected cash; issued slices replace their schedule once.

Finance state includes `capBalances` and `phaseMargins`. Each phase carries all
FINANCE-001 costs, provisional costs, earned value, billed, credits, remaining
effort, ETC/EAC and margins, with source drills and CSV. Mixed billing keeps
hourly time separate from fixed fees. Currency stays explicit, unknown inputs
remain incomplete, and global allocation inputs preserve overtime across phases.
Whole-installation archives retain budgets, templates, slices, write-downs,
alerts and history.

### Agency monthly close (FINANCE-004)

Finance reads `period:preview` with `month` (`YYYY-MM`) and optional
`retainerExceptions` keyed by retainer family. It reports missing calendar time,
unapproved time/costs, missing frozen labor costs, unmatched invoices, source-linked
WIP and unbilled work. Unknown calendar expectations remain named, never zero.
Unbilled work includes prepared-but-unissued sources, held cap excess and earned
retainer fees. Amounts stay in source-currency buckets; net invoice amounts retain
their issued credits/voids. The record is operational reconciliation, not statutory
accountant close or provider verification.

`period:match` binds `invoiceId`/`invoiceRevision`, `month`, `system`, `externalId`,
exact `amountMinor`/`currency`, an evidence `reference` and `reason`. It records a
manual external identity and exact native net basis, never an accounting write.
Changed credits invalidate the match. One external identity cannot match two
native invoices. Updates bind the existing match's `id`/`revision` and retain history.

`period:prepare` binds the preview fingerprint, `acknowledgeWip:true`, a
`wipReconciliation` note and `reason`. The month must have ended in the agency
zone, and the TIME-003 finance cutoff must already reach its end. Every retainer
family active in the month has links to its RETAINER-004 immutable period closes
or a named open exception; those snapshots are never copied or replaced.
`period:approve` binds the exact prepared `id`/`revision`, rechecks the reconciliation
and creates an immutable agency record. Its known monetary review value is the
largest source-currency gross sum of the reconciliation categories; mixed currency
or unknown monetary work uses GOVERN-001's independent-review protection whenever
a limit is set. Above-limit closes/reopens require a different active owner or
finance approver. No automatic close or reopen exists.

An active agency close holds the TIME-003 cutoff. Native time, costs, invoices,
receipts, corrections, fixed charges and retainer charges cannot be dated into
or moved out of it. Current-period linked invoices/credits may still reference
older sources. Finance uses `period:reopen-prepare` on the exact closed record
with a reason, then `period:reopen` on that exact request. Approval binds the
reviewed time-policy revision and proposed cutoff, follows independent review,
and invokes TIME-003's ordinary audited reopening to the day before the month.
Later active closes must reopen first. Late work then uses the ordinary time
submission/approval rules. Relocking and closing again appends a reconciliation
linked to the previous close; the original remains unchanged.

`GET /api/gauge/closes/<id>` downloads the immutable record for finance/owner.
Repeated downloads and downloads after a reopen return the original record.
All close drafts, matches, closes, reopen requests/events and history travel in
BASE-002 archives, with fresh sign-in required and no automatic action replay.

### Typed custom fields and reviewed Kantata field packages (SETUP-004)

The owner uses `field:define` with `scope` (`clients`, `engagements`, `people`,
`tasks`), `name`, `type`, `visibility` (`everyone`, `lead-finance`,
`finance-only`), `required`, `retired` and a reason. Updates bind `id` and
`revision`. Scope/type/currency are immutable. Select options have stable `id`,
`name` and `retired`; add or retire them, never delete their identities. Number
values are signed exact decimal strings with at most six places; currency
values are signed integer minor units of the definition's ISO currency (JPY has
zero decimal places, BHD three). These fields do not convert currencies or
change native commercial terms.

Native `save:clients`, `save:people`, `save:engagements`, `save:tasks` and
`opportunity:convert` accept `customFields: {"<field-id>": value}`. `field:values`
edits only custom values on an exact `scope`, `id`, `revision`, using the
record's ordinary editing role. Omitted fields retain their values. Empty
values remove optional fields. Required fields hold every current creation
door, including imported native rows and each task in template application;
legacy records are not rewritten when a field becomes required. Template task
items accept typed `customFields` defaults. Later definition changes preserve
stored values and original definition revisions. Current visibility and the
value's definition-version visibility both apply to non-finance history and
reads; explicitly saving a value republishes it under the current definition.
Agents gain no custom-field authority.

`field:import-preview` accepts this fields-only, synthetic/export-normalization
format with an explicit native relationship mapping:

```json
{
  "package": {
    "format": "kantata-ox-custom-fields-v1",
    "namespace": "synthetic-gauge-kantata-1",
    "fields": [{"id":"project-practice","scope":"engagements","name":"Practice","type":"single-select","options":[{"id":"Brand","name":"Brand"},{"id":"Web","name":"Web"}]}],
    "records": [{"id":"project-1","scope":"engagements","values":{"project-practice":"Brand"}}],
    "controls": {"Practice":{"Brand":{"marginMinor":60000}}}
  },
  "mapping": {"engagements":{"project-1":"<existing-native-engagement-id>"}},
  "policies": {"project-practice":{"visibility":"everyone","required":false}}
}
```

The owner supplies field policy separately; source records never grant access.
New fields default to finance-only and optional. Definitions/source IDs, exact
original package, mappings, independent controls and each value's provenance
are retained. Undefined options (including `Legacy`), type failures and unmapped
relationships appear in the read-only preview; apply refuses every finding.
`field:import` adds the preview `fingerprint` and a review reason. Both definitions
and exact native revisions participate in the fingerprint and committing guards.
The bounded batch is atomic (at most 100 fields and 100 target records); an
identical package/mapping/policy digest returns its original receipt and
preserves later native edits. This adapter adds fields to existing native
records; the broader OX/SX migration and cutover remain MIGRATE-004's.

Reports accept `customGroup=<field-id>`, `portfolioGroup=custom:<field-id>`,
`customFilters=<JSON field/value object>` and `customMeasures=<JSON field-id
array>`. Every readable field groups/filters utilization and whole-engagement
profitability; number/currency fields sum distinct cohort records with unknown
values explicit. Shared-project and multi-select cohorts overlap and must not
be summed into a firm total. Currency measures keep their own ISO currency;
there is no implicit FX. Figure sources/CSV include exact definitions and
record revisions. Resource requests accept the same `customFilters`; person
fields match the candidate directly, other scopes match their visible project
relationships. The calendar offers the same filters without altering totals.

`saved:save` stores name, dataset (`profitability` or `utilization`), group,
filters, measures and dates. `GET /api/gauge/saved/<id>` recomputes with current
roles, record scope and field policies; it stores no result snapshot. Definitions
are private to their creator and finance; any inaccessible referenced field
hides the saved definition, including filter literals, and refuses execution.
Profitability remains finance-only. REPORT-004 inherits these same checks for
future scheduled reports, XLSX/PDF exports and BI feeds, and CLIENT-001 inherits
them for its portal. All definitions, value history, original imports and saved
reports travel in BASE-002 archives; restore grants no session or automatic
execution authority.

### Costed estimate versions (SALES-002, partial)

`estimate:save` is available to finance or the opportunity's lead, with a unique
request key, `opportunityId`, name, reason, phases and lines. Subsequent versions
name the latest `previousId`; converted work uses a commercial change order.
Each phase has key/name/service, hourly or fixed mode, from/to dates. Each line
has a stable key, phaseKey, name, kind (`labor`, `subcontractor`, `expense`), role,
optional native person, effortSeconds and customer billRateMinor. Expenses use
quantity and unitBillMinor. Finance may supply a private costRateMinor or total
expense costMinor with a costReference; otherwise named labor uses the native
cost card effective at the phase start. An unmatched or foreign-currency cost
stays unknown; no implicit FX occurs. All amounts are in the opportunity's
agency currency.

`contingencyBasisPoints` adds a fee and estimated-cost risk reserve; it does not
invent work hours. `discountBasisPoints` discounts customer price after fee
contingency. Final cents allocate by differences of cumulative proportional
half-up totals, so lines, phases and the document reconcile exactly. Fee and
expense allowances are separate. Versions preserve prices, original cost
assumptions, projected margin and calendar-only named-person feasibility,
including global committed demand without exposing competing projects or leave
reasons. Role-only lines retain unknown capacity. These simulations never
commit staffing.

`estimate:compare` takes beforeId/afterId from one version family. Costs, their
sources, and margin are omitted recursively for every non-finance read,
comparison, history and page. Staff/agents gain no estimate authority. Native
current roles and exact source revisions guard writes.

`estimate:approve` is owner-only, binds id/revision and unchanged pricing/calendar
inputs, and requires `attest: "owner-recorded-external-acceptance"`,
`acceptorName`, `acceptorContact`, `acceptanceDate` (YYYY-MM-DD), `channel`
(`signed document`, `email`, `PO` or `verbal`), `evidenceRef` and `reason`.
It records reported external acceptance and carries the exact notice
“recorded by agency, client identity unverified” on the estimate, engagement,
budget, milestones, history and exports. Unknown cost, infeasible dates and a
newer version refuse recording. This is the ct-approved offline carrier for
SALES-002; SALES-003 owns verified client-link or signed acceptance.

`estimate:withdraw` is owner-only and requires exact estimate `id`/`revision`,
`approvalId`, `approvalRevision` and a reason. Withdrawal is audited, retains
the reported fields in history, and prevents conversion until a fresh
attestation is recorded. After conversion withdrawal is refused; subsequent
commercial changes use change orders.

Finance/owner uses `estimate:convert` on that exact attested version. It creates
one linked client engagement, a draft phase budget, tasks, draft fixed-phase
completion milestones, and open role requests (daily whole seconds over each
inclusive phase window; any remainder stays named). Nothing invoices, sends a
message or commits staffing. Required engagement customFields and per-line
taskCustomFields (or taskCustomFieldsDefault) are enforced before the atomic
batch. Customer fees reconcile to budget.amountMinor and fixed-phase
milestones; the separate expense allowance reconciles to expenseBudgetMinor.
The combined estimate total is their sum. Booked opportunity fees exclude the
separate expense allowance. Native budget and milestone approvals remain
separate public decisions. Replays through either conversion carrier return
the same engagement; an earlier converted version needs a change order.

Versions, attestations, conversions, exact source links and native records all
travel in BASE-002 archives. Restoring history never executes a conversion or
replays an acceptance.


Accepted estimate hourly pricing is a real commercial source: while its linked
terms govern, task/role bill rates and customer discounts feed ordinary time
approval, provisional fee alerts, ETC, rate explanation and financial source
CSV. Contingency remains a budget reserve; it never bills unworked hours or
adds an unrelated card's overtime. Precedence is finance entry override, an
explicit effective-dated project card, the agreed quote line, then ordinary
client/role/person/service cards. Ambiguous quote work remains held/unknown,
never an unrelated fallback rate. Allowance-only change orders retain the quote
link; a finance project or entry renegotiation remains explicit. Task revisions
and recurrence preserve source references. Frozen approvals retain the exact
estimate version/line and their charged amount after later rate changes.


### Client proposals (SALES-003, approved native email-confirmed carrier)

`commercial:prepare` is owner-only. It binds `estimateId` and
`estimateRevision`, plus `previousId` when revising the proposal family.
Required document fields are agencyName, title, recipientName,
recipientContact (the invited email), scope, deliverables/exclusions arrays,
from/to matching the estimate, expiry, explicit boolean signatureRequired,
and paymentSchedule entries `{name, due, amountMinor}` reconciling to the
estimate's customer total. Preparation includes an audited reason. Customer
snapshots contain no private cost, margin, person-rate source or staffing
assumption. The complete canonical document has a SHA-256 fingerprint.

`commercial:send` takes exact proposal id/revision, a Resend `connectionId`,
a unique request key and an audited reason. Only the owner sends. The recipient must already have
confirmed their native email invitation and have no Gauge staff grant. The
GOVERN-008 sealed credential and Base Resend transport receive a durable
version-bound provider job and a single dispatch claim. Exact request replay cannot resubmit; uncertain
submission stays visible for reconciliation, with no automatic retry.
Provider acceptance does not claim mailbox delivery. `commercial:revoke`
requires exact id/revision and reason and immediately removes client access.

`GET /app/client-proposals/:id` requires the invited recipient's native
email-confirmed session and current installation release authority. The
client POST at the same path requires same-origin, key, exact revision,
fingerprint, outcome (`question`, `accepted` or `rejected`) and reason;
acceptance additionally requires `confirm: "accept-exact-proposal"`.
Superseded, expired and revoked proposals cannot be accepted. A signature-required proposal also needs verified exact-version provider evidence before the recipient can confirm it. Viewing/questions/decisions are audited.
Client membership grants no internal Gauge state, history or command access.

Current direct acceptance is the primary `estimate:convert` carrier for a
released proposal. It retains the document fingerprint and client decision
on the prepared native engagement, budget and milestones. A changed price
needs a fresh client decision; conversion remains manual, once-only and
subject to fresh native source assumptions and required custom fields.

BASE-002 carries proposal documents, customer decisions and send history,
without installation release authority or message replay. After restore,
`commercial:reconnect` lets the owner authorize the exact original recipient
again with id/revision and a reason; it sends nothing. Verified provider-signature intake and mailbox-delivery readback are described below.


### Provider custody and durable jobs

Only the owner with a native email-confirmed browser session can use these
commands or inspect provider metadata. Setup creates a dedicated installation
provider key. Existing or restored installs use `provider:initialize` before
connecting; this generates no provider credential and sends nothing.

`provider:connect` accepts provider (`resend`, `crank`, `inkwell`, `zapier`, `webhook` or `receipt`), accountLabel and
credential. `provider:rotate` takes exact connection id/revision and a fresh
credential; `provider:revoke` takes exact id/revision and permanently prevents
that connection's queued work. Credentials are AES-256-GCM sealed under
HKDF-SHA-256 keys bound to connection and version. Credential-bearing request
receipts use keyed digests in an archive-excluded table. Responses return
identifiers only. State/history/use inspection carries metadata, never secrets.

`providerJob:queue-crank` binds connectionId, alertId, alertRevision and an
owner-declared HTTPS endpoint `/api/crank/flows/{flow}/trigger`. Dispatch projects an
allowlisted event from that exact immutable budget exception; jobs and use
inspection retain source references, never request or response bodies. `providerJob:dispatch`
takes job id/revision and a request key. A durable compare-and-swap claim
precedes decryption and the network edge. Crank receives Bearer authority and
`{event_id, input}` using the stable job ID; a 201 pending run or 202 held event
is admission only, never proof of a downstream follow-up.

Dispatch rereads the queued credential version. Rotation produces an owned
`credential-rotated` exception without sending; the original owner uses
`providerJob:requeue` with exact id/revision to bind the current version, then
explicitly dispatches once. Revocation is permanent. Transport uncertainty
remains an owned exception; an abandoned claim becomes visibly uncertain when
its lease expires. Neither is automatically retried. The same job controls
protect proposal email. Bounded refusal backoff, explicit reconciliation and native retainer scheduling are described below; unattended external dispatch remains disabled.

Archives retain connection metadata, uses, jobs and outcomes, but exclude the
installation key, ciphertext, private receipts and job execution authority.
Restored connections and jobs are disconnected; old jobs cannot replay even
after credentials are re-entered. New work requires fresh owner authorization.

## Commercial provider readback

The native owner can connect `inkwell` with a credential scoped to `envelopes:read` and `artifacts:read`, and an HTTPS `origin`. It uses GOVERN-008 custody; no send or preparation scope is used. `commercial:signature-bind` takes the proposal `id`/`revision`, `connectionId`, `envelopeId`, `originalSha256`, `reason` and `confirm: "reviewed-exact-pdf"`. Gauge generates and retains a complete immutable original PDF for each signature-required proposal; the native owner downloads it from `/app/proposal-originals/{id}`. The bound `originalSha256` must equal that native original, so an owner cannot substitute another document by attesting to it. Inkwell original bytes must match the stored PDF digest. No filename or owner-attested content mapping grants acceptance. A different proposal version cannot reuse the same envelope at that Inkwell origin, even through another connection. `commercial:signature-readback` takes the proposal `id`/`revision`; it checks native completed status, recipient signing and the original, signed and certificate SHA-256 values through Inkwell's published read-only API. Signed/certificate PDFs are bounded to 256 KiB each and retained as business evidence. Client-link acceptance stays unavailable until evidence verifies, then still requires the recipient's deliberate exact-version response. The existing recipient authority guards also protect `/app/client-proposals/{id}/evidence/{original|signed|certificate}`.

`commercial:delivery-readback` takes a delivery event `id`/`revision`. A known Resend message ID is read directly. After an uncertain send the owner must supply `providerMessageId` and a reason; the response must prove the same recipient, version subject and unique delivery reference. Readback never submits a message. It records only recognized delivery classes, an opaque message ID and fixed exception classes. Rotation allows readback with the current credential; restore strips job authority and refuses it. Provider authorization failures leave an owned visible unresolved outcome.

`providerSync:start` with `connectionId` freezes up to 500 of the native owner's current Resend delivery jobs, their exact proposal identities, source counts and per-currency proposal values. `providerSync:advance` with that snapshot's `id`/`revision` reads one exact saved source and commits its cursor. Authorization failure leaves the same source pending. Rotation permits an explicit resume; a Worker restart retains completed checkpoints and values. Exact request replay returns the saved checkpoint. This pages the Gauge source manifest, not the entire provider mailbox. Source-of-truth/mapping, last successful sync, checkpoint age and unresolved work appear on Access. Snapshots are owner-only across state, history and audit; portable restore retains their history but strips readback authority. Values describe quoted proposals, never invoices or paid cash.

## Signed automation events and durable job limits

Connect `zapier` or `webhook` with a compact JSON credential `{"endpoint":"HTTPS hook URL","signingKey":"a private 16–256 character signing key"}`. Both values are sealed; metadata shows only the signing key's final four characters. Zapier uses its HTTPS Catch Hook URL. `providerJob:queue-webhook` requires `connectionId`, `sourceRef: "kind:id:revision"` and an explicit release `reason`. Supported source kinds are `engagements`, approved `time`, `budgetAlerts`, issued `invoices` and recorded `payments`. Each sends a closed field projection, without notes or private costs. One connection/source/revision has one event; replay cannot create another. These are explicit owner releases, not unattended subscriptions.

`providerJob:dispatch` uses the existing durable native-owner claim and credential-version checks. The JSON envelope has `event_id`, `type`, `sourceKind`, `sourceId`, `sourceRevision` and `data`. `X-Gauge-Event-ID` and `Idempotency-Key` carry the same stable ID. `X-Gauge-Signature: t=SECONDS,v1=HEX` is HMAC-SHA-256 of `SECONDS + "." + exactBodyBytes` under the signing key. Receivers must verify it, bound timestamp age and deduplicate the event ID before any permitted follow-up. Zapier's success response or a signed-hook `{accepted:true,event_id}` response proves admission only. No remote write callback is accepted. Crank's trigger credential cannot read downstream runs; completion is not inferred.

Explicit HTTP 429 refusals permit at most three attempts, with durable 60/120-second exponential backoff (capped at 15 minutes); each retry still requires the original native owner to dispatch. Uncertain sends, timeouts and 5xx results cannot retry. Dispatch admits at most ten recently claimed source jobs per connection per minute. `providerJob:cancel` takes exact `id`/`revision` and a `reason`, and cancels only queued or retry-wait work; it cannot undo an in-flight or external effect. Revocation permanently stops further dispatch.

The approved native retainer scheduler stores its claims and outcomes in `retainerJobs`, separate from completed `retainerRuns`. One transaction commits draft/financial source effects and job completion. Abandoned claims recover after a one-minute lease; failed native transactions retry at most three times with bounded backoff, then produce an owned finance exception. Disable cancels pending work. Schedule consent is checked again on each batch, and missing/expired authority is shown on the finance schedule page. This schedules native ledger work only; no external email or webhook is scheduled automatically.

Exhausted explicit rate-limit refusals have a native-owner dead-letter review door, `providerJob:resume-refused` with exact `id`/`revision` and a reason. It refuses uncertain/admitted results, preserves the event ID and the completed attempt round, rechecks the exact source and current credential, and queues a fresh three-attempt round without sending. Dispatch remains a separate explicit native action. At most ten reviewed rounds are retained per source job.

Resend custody declares separate `email:send` and `email:read` operations. Readback is audited as `email:read`, and the provider still enforces the entered key’s real retrieval permission. Existing send-only connection versions must be explicitly rotated/reconnected by the native owner before readback; a missing read scope remains a visible unresolved case with nothing fetched.

## Reviewed signed workflow follow-up

A `receipt` connection holds a verification key (at least 16 characters), sealed under GOVERN-008 and usable only for `followup:verify`; it cannot send a trigger. A workflow may export a flat receipt with exactly `schema: "gauge-followup-v1"`, `eventId`, `sourceRevision`, `remoteReference`, and `taskName`. The remote reference is the admitted Crank run ID, or the stable Gauge event ID for a signed hook. Sign `"gauge-followup-v1\n" + canonical JSON` with HMAC-SHA-256; canonical JSON sorts these keys and retains exact trimmed strings. This domain is distinct from outbound event signatures.

Only the original native owner presents and approves it with `providerJob:apply-followup`: job `id`/`revision`, receipt-key `connectionId`, `receipt` JSON, hexadecimal `signature`, `reason`, `confirm: "apply-exact-followup"`, and current required task `customFields`/`phaseKey`. Access exposes the same review form. The command rechecks the exact source, native owner, original connection, receipt-key version and ordinary task field/phase rules in its committing batch. It creates one unassigned, nonbillable task with zero planned effort; source engagement is derived on the server. Quoted workflow instructions stay literal text. A changed source, wrong event/run, invalid signature, revoked key, missing custom fields or other role writes no task. Receipt/event replay returns the first native effect; changed receipt data cannot reuse it. Raw authentication signatures are neither stored nor hashed into portable request receipts.

The receipt and native effect are business history, labelled workflow-authenticated and owner-applied. This does not infer whole-workflow completion from admission. There is no automatic callback or unattended write door; restore keeps history but strips provider-job authority. Future unattended follow-up requires the policy ruling carried by CONNECT-016/FOLLOWUP-004.

`providerJob:queue-crank-source` takes the same exact `sourceRef`/`reason` plus the declared Crank trigger `endpoint`. It supports the same closed project, approved-time, budget, invoice and payment sources. Crank receives `{event_id,input}` with Bearer authority and the same signed exact-body headers. Crank’s published contract authenticates the trigger with its Bearer credential; Gauge does not claim Crank verifies the additional HMAC. One connection/endpoint/source/revision retains one event across queue replay. Existing `queue-crank` remains the budget-alert shortcut.

The same `providerSync:start`/`advance` door supports Inkwell: it freezes up to 500 latest owner-bound released proposal originals, with binding/proposal revisions and exact per-currency quoted values. A page rechecks that binding and native source, then verifies all published Inkwell artifacts under the current explicitly rotated read credential. A failed current read never counts an old verified artifact as a successful fresh reconciliation and never deletes retained legal evidence. Exact replay retains one checkpoint; a changed/revoked source stays an owned exception without requesting new provider data. These cursors do not enumerate a provider account.

## Bounded native retention (GOVERN-006, partial)

Only the native owner uses `privacy:policy` with explicit `personalDays`, `fileDays`, `evidenceDays` and `reason` (current policy id/revision on update), `privacy:exit` with `personId`, `date`, `reason` (current exit id/revision on revision), and SELECT-only `privacy:preview` with `personId`. The preview returns a fingerprint, removals, lawful financial/audit holds with the anonymized profile they keep (`retain.anonymizedAs`) and blockers. `privacy:erase` requires that exact `personId`/`fingerprint`, `confirm: "erase-reviewed-native-scope"`, `lawfulReceiptRemoval: "authorized"` and a reason. It removes the current profile, profile/leave revision history, private leave notes, favorites and eligible receipt bytes. Financial records and immutable audit remain on legal hold; source originals, other text and connected copies remain. The erasing transaction always writes the completion record. This is bounded native erasure, not a complete personal-data certificate. No automatic deletion runs; automatic execution of the owner's retention schedule is not built.

`GET /api/gauge/privacy/journal` downloads the native-owner-only trusted later Base journal. Keep it with backups; the portability module accepts it as `laterJournal`. The normal local CLI can use a later post-erasure archive with `rer import --journal LATER_ARCHIVE`. An old archive with that later checkpoint is refused before publishing any rows; a post-erasure archive restores anonymous attribution without erased bytes. Without the later journal, an empty destination cannot know an erasure happened elsewhere.

## Owned operational cases (FOLLOWUP-002, partial)

Native owner only: `case:open` takes `type` (scope-risk, blocked-input, staffing-gap, billing-exception, client-decision), `title`, `sourceRef` (`kind:id@revision` for opportunities, engagements, milestones, resourceRequests, budgetAlerts or packets), optional `ownerId` (omit it for the owner, the default responsible person; otherwise an existing active, non-exited person), `nextAction`, `dueAt` (ISO timestamp with offset) and `reason`. It captures the native forecast baseline for the opening agency date. Every later command sends exact case id/revision and reason: `case:edit` updates nextAction/dueAt; `case:snooze` takes `until`; `case:reassign` and `case:escalate` take ownerId (empty for the owner)/nextAction/dueAt and grant the responsible person no access; `case:reply` takes replyState (ambiguous/answered/unverified), quotedReply and externalReference; `case:attempt` links an actually attempted owner-approved proposal email by jobId. A linked provider attempt is never completion. Events and record revisions preserve history.

`case:preview-close` takes case id/revision and returns the current server-computed projection/fingerprint and whether its economics changed from the baseline. `case:close` requires that fingerprint, an exact native client `acceptanceId`, `confirm: "close-verified-case"` and reason. Acceptance must be current, live-authorized, after case opening, from the same proposal/opportunity and reflected in a converted engagement. Every forecast input is fenced again in the closing transaction; a changed input refuses closure. Closed cases are immutable. No case command sends mail or invokes an external provider; use the existing explicit approved request door and link its actual attempt. Case data remains owner-only in state, pages, history and audit (ct, 22 Oct). Verified closure of noncommercial cases without a linked proposal/opportunity is not built.

## Kantata historical evidence (MIGRATE-004, partial)

Finance/owner uses `kantata:preview` with `package: {manifest, files?, workbooks?, zip?}`. The manifest explicitly names `flavor: "ox"|"sx"`, account/org, administrator attestation, IANA timezone, consecutive complete year windows, per-object permissions, an independent count and client/month/currency financial control report, and `mapping: {flavor, version: "kantata-ox-v1"|"kantata-sx-v1", objects, fieldScopes}`. Object roles are clients, people, skills, projects, estimates, tasks, schedules, time, expenses, rates, invoices, payments, wip, customFields and customValues. Every role has an explicit artifact, format (CSV/JSON; OX time may be XLSX), stable ID column and semantic-column map. JSON declares its top-level array; XLSX declares its exact worksheet. No flavor borrows the other map.

OX sourceKind is `ox-insights-and-time` or `ox-data-export` (the latter requires retained exportJob id/status complete/downloaded true). SX is `sx-salesforce-export` (original bounded flat object CSV ZIP) or `sx-salesforce-api` (complete capture with no next page token). Raw artifacts and the manifest remain in custody. `tests/fixtures/kantata.mjs` documents the synthetic adapter shape; it is not a claim that all provider exports have these columns. Each artifact is at most 2 MiB, the SX ZIP expands to at most 8 MiB/64 flat CSV members and the package has at most 1,000 records. No formulas execute.

The source controls are `{counts: {ROLE: count}, financial: {"clientSourceId/YYYY-MM/ISO": {timeSeconds,billableSeconds,timeCostMinor,timeValueMinor,expenseMinor,invoiceMinor,paidMinor,outstandingMinor,wipMinor}}}`. Quantities and minor units are safe integers; currencies remain separate. Missing permissions, incomplete windows, unresolved joins/custom options and mismatched independent controls are visible findings; none can apply. `kantata:create` requires the reviewed fingerprint and key; `kantata:resume|read|rollback|undo` take the job id. The owner of an import controls its journal. Ten source rows apply per batch; replays use stable source identities. The existing `/api/gauge/imports/ID` download returns retained originals.

`kantata:report` takes namespace and optional source fieldId, returning finance-only historical groups and source IDs. Practice/Office grouping reconciles the retained source evidence. It is labelled historical controls, with no claim of current native utilization/profitability, native approval, invoice issuance, payment settlement or cutover. Native financial adoption, receipt adoption and approved cutover remain gaps. A separate owner-confirmed bounded native draft adoption is available below.

`kantataAdopt:preview` (native owner only) takes a completed imported `namespace` and `config: {scheduleAllocations: {SOURCE_SCHEDULE_ID: [{date,seconds}]}}`. Multi-date source schedules require explicit unique dates within their captured period, whole-day-bounded seconds and an exact sum equal to the source; no dates are inferred. Missing mappings and existing required native fields are findings, with no write. `kantataAdopt:create` requires the exact fingerprint/config, `confirm: "adopt-reviewed-native-drafts"` and reason. It creates a journal; `kantataAdopt:advance` with exact journal id/revision and reason creates up to ten effects per stage. It retains source IDs/custody and creates finance-only field definitions, draft work and tentative allocations, with no operator or approval. Custom values are applied under the actual definition revision using the ordinary field normalization after their native relationships exist. Each batch binds the source fingerprint; changed source evidence refuses continuation. An already-existing native target is never overwritten.

The adoption journal is owner-only, including audit exports. `kantataAdopt:undo` takes exact id/revision, `confirm: "undo-untouched-native-adoption"` and reason. It removes at most ten untouched effects per call, refuses native edits/approvals/dependencies and protects field values/reports outside the adoption. Reverse native adoption before source evidence can be undone. Source estimates, invoices, payments and WIP remain historical evidence, and native receipt adoption and cutover remain unavailable. An old source approval never approves a draft; after the owner performs ordinary native review, native Practice/Office reports reconcile, while source-billed time stays excluded from new billing.

## Reviewed incumbent move-in

Scoro now uses `import:scoro:preview`, `import:scoro:create`, `import:scoro:read`,
`import:scoro:resume`, `import:scoro:rollback`, `import:scoro:undo`,
`import:scoro:originals` and `import:scoro:report` through the ordinary authenticated
command door. Finance/owner authorization is repeated in each handler and each
import-kit transaction. `GET /api/gauge/imports/{id}` downloads the original
artifacts and manifest for that operator's import job. Source records do not enter
non-finance state, history or native reports.

`package` has `manifest` and `files`. `manifest` names `provider: "scoro"`,
`mappingVersion: "scoro-v1"`, stable `account`, agency-matching ISO `currency`,
IANA `timezone`, `authorized: true`, ordered inclusive `windows` with `from`, `to`
and `complete`, and object-level `permissions`. The importer reads the agency
currency and refuses all mismatches without conversion. `units.time` and
`units.bookings` explicitly select `seconds`, `minutes` or `hours`; quantities
must convert exactly to whole seconds. `objects` maps each source object to an
array of independently grouped original report/capture descriptors. Every object,
including empty objects, needs its own stable ID mapping and permission. See
`tests/fixtures/scoro.mjs` for the executable synthetic documented format.

Each descriptor has `columns` (semantic field to original header/JSON field),
`grouping` (explicit dimension array), `format`, and either `artifact` or JSON
`pages`. CSV is exact UTF-8 text. XLS/XLSX files are original base64 bytes and
require an exact `worksheet`; formulas are refused and nothing executes macros,
external links or source notes. Legacy XLS accepts compound BIFF workbooks;
XLSX uses the bounded value-only ZIP decoder. `filters: "all-records"` declares
an unfiltered report. A date-only filter is `{from,to,includeArchived:true}`;
its union must cover every declared historical window. Other filters and missing
coverage produce findings and prevent apply. Distinct grouped reports reuse stable
source identities; conflicting values refuse apply instead of being summed.

JSON descriptors declare captured `apiVersion: "v2"`, a top-level `array`,
`pagination: {page,next,total}` mapping metadata field names, and ordered
`pages: [{artifact,cursor}, ...]`. Each original page must declare its sequential
page number, total pages and next cursor (null on the last page). A missing,
truncated or out-of-order capture cannot be applied. This is uploaded capture
intake; it never contacts Scoro or represents a live connection.

`controls.counts` holds independent source object counts. `controls.financial`
holds independent `projectId/YYYY-MM/currency` controls for raw, billable, billed
and unbilled seconds; bill/cost, expenses, invoices and payments in minor units;
scheduled/leave seconds, budgets and signed retainer balances. Every measure is
explicit, including zero. The fixture documents the field names. The preview
returns discrepancies and `canApply`; create requires its exact `fingerprint` and
a unique request `key`. At most ten unique source records apply per request.
Changed source identities conflict; a changed namespace is not a reconciliation.

`nativeDrafts: true` additionally prepares source-linked clients, people,
engagements, tasks, dated rates and time drafts. `projectLeads` and
`projectMembers` must explicitly map captured people. Only an owner create with
`confirm: "adopt-reviewed-native-drafts"` can apply these effects. No account,
grant, terms, approval, invoice issuance or payment settlement is imported.
Source invoice-line/allocation links mark time billed, blocking native rebilling
even after fresh native approval. Source finances remain labelled historical
evidence. `import:scoro:report` takes `namespace` and `groupBy` (`project`, `client`
or `person`) and returns reconciled controls and source records, including the
separate raw and billable durations, original offset timestamps and billing links.
Cutover is a separate MIGRATE-010 obligation and remains unavailable here.

### Teamwork.com source semantics

The same reviewed package protocol uses `provider: "teamwork"`,
`mappingVersion: "teamwork-v1"` and the `import:teamwork:*` actions. Uploaded JSON
captures declare `apiVersion: "v1"` or `"v3"`. Timesheet CSV/Excel, invoice
Excel/accounting exports and capture pages all retain original custody; they
must reconcile under the same stable identities. See
`tests/fixtures/teamwork.mjs` for every required semantic object and field.

Time maps positive integer `minutes`, `userWorkDate`, UTC `auditTimestamp`,
explicit `isbillable`/`isbilled` and optional `invoiceId`; `units.time` is
`"minutes"`. The work date is never recomputed from the UTC audit timestamp,
including across DST. Project `archived` is retained source evidence. Task lists,
subtask `parentId`, dependencies, milestones and proof decisions retain their
source relationships. A captured proof approval grants no native approval.
Value-retainer periods carry `familyId`, inclusive dates, signed `openingMinor`,
`allowanceMinor`, `usedMinor`, `closingMinor`, `carryInMinor` and `carryOutMinor`.
Opening plus allowance minus use must equal closing and outgoing carry; each
later period's opening/incoming carry equals the prior signed outgoing carry.
Project/month source controls reconcile time, invoices, payments, budgets and
retainer balances. Source retainer periods do not create native recurring bills;
RETAINER-001 through RETAINER-005 retain their ordinary native review doors.

### Productive source semantics

`provider: "productive"`, `mappingVersion: "productive-v1"` and
`import:productive:*` use the same review/journal/report doors. Manager-authorized
CSV/value-only XLSX table exports and uploaded v2 JSON captures must retain deals,
phases, service/phase/person rates, bookings, recurring budgets, time versions,
expenses, invoice attributions and retainer periods. The executable documented
synthetic format is `tests/fixtures/productive.mjs`.

Every time/current-version row captures its `unit` and it must match
`units.time`; worked and billable quantities are converted independently into
exact whole seconds. Each current time revision must reconcile to its retained
latest version. `draftInvoiced` requires an attribution with the captured draft
identity, even when there is no invoice number. `invoicedManually` remains a
billed state without manufacturing a number or native invoice. Either flag blocks
native rebilling after fresh approval. Each time row's captured `rateId` must
cover its person/service/phase/work date, and independently captured bill/cost
values must equal those quantities at the dated override. Retainer opening,
allowance, use and signed closing balances reconcile separately from recurring
budget history; neither creates native recurring billing authority.

All incumbent capture adapters now preserve numeric JSON lexemes before mapping
and reject duplicate keys rather than accepting a rounded/last-key-wins value.
Money descriptors may explicitly set `moneyUnit: "decimal-major"`; exact decimal
text with at most two places converts once to integer cents. Otherwise
`units.money: "minor-units"` (the default) requires whole integer minor units.
There is no inferred unit, rounded source decimal or currency conversion.

### Rocketlane source semantics and held cutover

`provider: "rocketlane"`, `mappingVersion: "rocketlane-v1"` and
`import:rocketlane:*` accept owner-authorized tracked-time reports and complete
uploaded v1 API captures. Source accounts map to client identities; phase/task
and ad-hoc time remain distinct. `minutes` is a positive integer, and captured
`auditEpoch` retains its explicit `units.auditEpoch` (`seconds` or `milliseconds`).
Source approval decisions and rate histories retain original identities;
current time names its exact approval and effective rate override. Neither
source approval nor imported rate history approves native work.

Allocations preserve `SOFT`/`HARD`, named-person versus placeholder identity,
explicit `minutes-per-day`, and the original unique `dates` inside the captured
period. No dates are distributed or invented and no placeholder becomes a real
person or receives access. Additional original invoice, payment and attribution
exports must be named in `financeExports.artifacts` with `complete: true`.
Limited time APIs alone cannot establish billing/payment completeness. Finance
allocation joins establish source-billed time and must reconcile independently
to invoices and project/month source totals. The synthetic documented package is
`tests/fixtures/rocketlane.mjs`.

Conservative default pending ct: `import:rocketlane:cutover-preview` reviews a
completed owner source job and fingerprints its current records, revisions,
original job fingerprint and agency currency. `cutover-approve` requires the
exact review fingerprint, a unique request key, a reason and
`confirm: "accept-source-comparison-only"`. It writes an owner-attributed audit
receipt for the source comparison only. There is no provider action, automatic
shutdown/deletion, native financial ownership transfer or payment authority;
operational cutover remains held. The same request cannot create a second
receipt. An accepted receipt holds source undo until the owner audits a
`cutover-withdraw` with its `id` and reason. These receipts remain historical
annotations after restore; fresh native owner authentication is still required.
MIGRATE-008 remains partial until the operational cutover policy is decided and
its resulting native ownership workflow is proven; MIGRATE-010 retains the
broader parallel-run and retirement comparison.


### Float source snapshots (MIGRATE-009, partial)

`import:float:preview/create/resume/read/report/originals/rollback/undo` uses
that same exact-fingerprint, live finance/owner, ten-record journal. Use
`provider: "float"`, `mappingVersion: "float-v1"`, complete contiguous calendar
year windows, explicit object permissions and independent counts/project-month
controls. `tests/fixtures/float.mjs` documents a synthetic two-window package.
The native Imports section provides preview, apply, retained originals and
source controls. This adapter does not contact Float or claim provider access.

Map `clients`, `people`, `projects`, `phases`, `rates`, `budgets`, `allocations`,
`time`, `workweeks`, `leave` and `deletions`. Float `/tasks` allocations are
separate from `/logged-time` actuals and `/timeoffs` leave. Uploaded v3 JSON
pages declare their array, page/next/total metadata and every original page;
CSV and value-only workbook rows use the same stable source identities.

- Allocations carry `projectId`, `personId`, `phaseId`, inclusive `from/to`,
  `unit: "hours-per-day"`, and the exact original `daily: [{date,hours}]`.
  No aggregate is distributed into invented dates. Split allocation/leave
  rows at month boundaries using original daily detail. `budgetId` and repeated
  `phaseBudgetMinor` must match one independent `budgets` identity; repeated
  task-row budget values never add to the project budget.
- Actuals carry `workDate`, `duration`, `billable`, their explicit `unit`,
  `rateId`, `billMinor` and `costMinor`. Rates retain person/project, effective
  date, historical cost and project bill rate. The latest applicable captured
  rate must reproduce actual cost/value exactly, rounded half up per entry.
- Workweeks carry non-overlapping effective `from/to` and all seven `weekdays`
  keyed `0` (Sunday) through `6`, in `hours-per-weekday`. Each actual needs a
  captured workweek covering its date. Leave retains exact daily hours.
- Deletion records carry a stable event `id`, `entity` (`allocations`, `time`
  or `leave`), `recordId`, positive integer `sequence` and timezone-bearing
  `auditTimestamp`. Identical repeated events across reports count once;
  conflicting event identity, duplicate sequence or a missing sequence refuses.
  The original target row remains in custody with `sourceDeleted: true` and is
  excluded from source totals. This never deletes native business records.
- `deletionCoverage: {complete:true,fromSequence,toSequence,missed:false}`
  declares the exact uploaded event interval. If `missed:true`, include
  `missedAt` and `fullComparison: {complete:true,asOf,artifacts:[...]}`.
  `asOf` must be newer than the missed interval and `artifacts` must name
  every mapped allocation, actual, leave, people, project, phase, rate,
  workweek and budget original. An old or incomplete comparison cannot repair
  missed coverage. This is reviewed uploaded evidence, not a live event-feed
  freshness or webhook claim.

Float currently imports historical source evidence only. `nativeDrafts:true`
refuses rather than silently omitting native capacity, allocation or leave
adoption. Native adoption and follow-on deletion reconciliation remain pending;
MIGRATE-010 retains operational cutover and billing-ownership obligations.


## Reviewed leave (RESOURCE-003)

`leave:request` and the compatibility action `save:leave` both create a requested absence with `personId`, inclusive `from` and `to`, positive `dailySeconds` and `note`. The private `note` must be exactly `Personal time`, `Vacation` or `Prefer not to say`; free text is refused, including medical or legal details. Staff and leads request only their own absence; finance can submit for a person. Neither submission changes capacity, accepts an existing record id or trusts a supplied approval status.

Only the owner uses `leave:decide` with the exact `id`, `revision` and `outcome`: approve or reject a request, or cancel an approved absence. The stored administrative reason is fixed by the outcome; optional `reason` must match that fixed text. Approval immediately recomputes staffing conflicts and supplies scoped in-app lead alerts. Every decision is audited. No outbound notification is sent. Previously declared absences retain their historical capacity effect and can be cancelled through the same owner decision controls.

Only the person sees their private category in state, revision history and pages. Other people's audit exports withhold raw leave payloads as hash stubs and retain the redacted decision view. HR-system synchronization remains RESOURCE-006.

## Consolidated invoices and partial time (INVOICE-002)

Finance may send `packet:create` with `consolidate: true` and approved sources from several projects or phases. The primary `engagementId` must supply at least one source; every project must have the same live client and currency. Packet approval and invoice issuance repeat these checks. Lines retain `engagementId`, `projectName`, `phaseKey` and exact source revisions; issued lines additionally freeze source and project snapshots and `remainingMinor`. A fixed charge’s remaining amount is its approved phase or project fee less its gross cumulative target.

`packet:partial` takes `engagementId`, the latest approved `budgetId` and `budgetRevision`, approved time `sourceId` and `sourceRevision`, integer `durationSeconds`, and `title`. It prepares a draft reserving the first available range of frozen billing seconds; ordinary packet approval and issue remain separate decisions. Portion prices are differences of cumulative half-up values, preserving the whole source amount through the final cent. Cancelled drafts release their ranges; the original cannot be edited or billed in full while any portion remains reserved. Capped engagements use `cap:draft`. Recurring principal billing keeps RETAINER-005’s existing schedule, consent and exception doors.

Consolidated documents count once in agency totals. Project and phase reports use their source lines; receipt, promise and dispute shares use cumulative half-up cents weighted by line amounts net of issued credits as of the report day. These are native report allocations, never provider settlement.
