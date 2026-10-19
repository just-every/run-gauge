# Gauge HTTP API

The app's pages and any agent use the same server handlers. Every call needs a native Base session cookie; each handler checks the session, operator and Gauge grant itself and repeats the check inside the D1 batch that writes.

## Agency setup and money

The owner completes the first-run form at `/setup`, saving `currency` and an IANA `timezone` with the owner confirmation. New installations default to `USD` and `America/Los_Angeles`. Supported setup currencies are `USD`, `AUD`, `CAD`, `EUR`, `GBP`, `NZD`, `CHF` and `SGD`; each uses two decimal minor units. Setup checks the native owner session and origin and saves the choices with first-run completion. This is not a currency-change command for an operating agency.

Money inputs such as `amountMinor`, `costMinor` and `billMinor` are exact integer minor units; rates are minor units per hour. New engagements and rates use the saved agency currency. Terms, milestones, expenses, approved time economics and billing packets follow their engagement currency. On monetary record editors and packet commands, an optional `currency` input must match the relevant record; a mismatch is refused without conversion. Packet adjustments retain the original packet currency, and reports label amounts with their stored currency and refuse mixed-currency calculations.

The forward migration infers an existing agency's currency from stored monetary records and leaves existing amounts, revisions and approved artifacts untouched. There is no FX conversion, per-client currency override or invoice issuance. Approved packet downloads remain billing-preparation CSVs.

## Reads

- `GET /api/gauge/state?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{agency: {currency, timezone}, data, capacity, economics, exceptions, correctionReviews, from, to}` filtered to what the caller may see. `data` holds `clients, people, engagements, budgets, tasks, milestones, rates, calendars, leave, staffing, time, expenses, packets, archives, proposals`; each record is `{id, revision, value}`. Rates, costs, packets and archives are empty for anyone but finance and the owner.
- `GET /api/gauge/history/{kind}/{id}` returns earlier revisions with actor, action and time.
- `GET /api/gauge/packets/{id}` downloads an approved packet's CSV (finance); `GET /api/gauge/files/{id}` a receipt (its owner or finance).

## Commands

`POST /api/gauge/command` with `Content-Type: application/json`, the app origin in `Origin`, and a body `{action, key, ...input}`. `key` is a unique request key: repeating it with the same body returns the first outcome. Success returns `{id, revision, saved: true}`; a refusal returns `{error}` with 400, 401, 403, 404 or 409. Record updates and decisions send the record's current `id` and `revision`.

People use `save:{clients|people|engagements|budgets|tasks|milestones|rates|calendars|leave|staffing}`, `budget:approve`, `milestone:approve`, `time:save`, `timer:start`, `timer:stop`, `time:submit|return|approve|correct`, `expense:save|file|submit|return|approve`, `packet:create|approve|cancel|adjust`, `import:preview|create|resume|rollback|undo` and `grant` (owner). The page forms post the same actions to `/app/action`.

`import:preview` and `import:create` take `package: {manifest, files, archives?}` as described in [MOVE-IN.md](MOVE-IN.md). The offline manifest must declare the package's actual `currency`, matching the saved agency currency; there is no default for an omitted manifest currency. A mismatch returns 400 with a reason such as `Harvest package uses AUD; agency uses USD. No currency conversion is performed.` Preview returns the reviewed fingerprint, counts, totals, memberships, omissions and package without writes; create requires that `fingerprint` and returns the bounded import job. Imported engagements, rates and source time amounts retain the declared currency.

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

The agent's own reads come from `GET /api/gauge/state`: every engagement with its tasks, people, calendars, leave (notes private), staffing and approved work without rates or costs, plus the proposals it prepared and the week's exceptions.

## Opportunity pipeline (SALES-001)

Leads manage their own opportunities; finance manages all. `save:opportunities` takes `name`, `clientId`, `ownerId` (person), `stage` (`discovery`, `qualified`, `proposal`, `won`, `lost`), integer `probability` (0–100 percent), proposed `from`/`to` dates, `services`, `amountMinor`, `demandSeconds`, and optional `engagementId`. Updates bind `id` and `revision`. Won requires 100%, lost 0%; only won work may link to a same-client, same-currency engagement the actor manages. An engagement links to at most one opportunity. The engagement page and current state show opportunity history and pipeline totals.

`pipeline` groups totals by explicit currency. Open weighted value rounds each opportunity’s amount × probability half-up to cents; open demand remains tentative whole seconds outside signed staffing. Booked backlog is agreed value before billing: the latest approved engagement budget, or its linked won value when no budget is approved, plus unlinked wins. Linked opportunity and approved terms count once. Lost opportunities contribute neither; no invoice or cash completion is implied.

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
