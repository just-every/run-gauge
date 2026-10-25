# Harvest move-in

This adapter is **documented format, synthetic-only; realExport: not-supplied**.
No customer export has been exercised. A consenting agency must reconcile an
actual billing period before switching tools. The fixture package under
`./tests/fixtures/harvest` exists only for tests.

Harvest's [export guide](https://support.getharvest.com/hc/en-us/articles/31625325401229-Exporting-data), read 11 October 2026, describes an all-company-time CSV and separate client, project and people exports. Available report columns depend on the report and customization. Gauge therefore requires explicit column/identity mappings; the fixture headers are an adapter shape, not a claim that every Harvest export has those headers. Obtain stable source entry IDs where possible; if absent, supply a reviewed stable source-ID column and retain its derivation with your manifest. Never use a row number as a durable time-entry identity across changed exports.

Forecast's [schedule export guide](https://help.getharvest.com/forecast/schedule/analyze/exporting-data/) describes Project or Team exports, weekly/monthly periods in rows or columns. All four layouts are accepted with explicit mappings below. Team totals span projects and are separate controls, never additional project demand. Aggregate periods retain their original total, period and working-day count as downloadable JSON source snapshots on Imports; they create no daily facts until dates are reviewed. Placeholders retain their name and tentative demand without creating a real person, availability or access.

Forecast [has no public documented API](https://help.getharvest.com/forecast/faqs/faq-list/api/). Gauge accepts an owner-authorized, uploaded capture, with explicit units, identities and field mappings; it does not fetch or verify provider authorization, infer an undocumented schema or claim a live connection (CONNECT-013). The capture's original bytes and all entity payloads remain in custody.

Upload `clients.csv`, `people.csv`, `projects.csv`, `time.csv`, optionally
`forecast.csv`, `forecast.json`, and optional PDF archives. Supply `time.xlsx` instead of `time.csv` for detailed time workbooks, and set `timeWorksheet` to the exact worksheet name. Never supply both time formats. CSV uploads retain their exact UTF-8
bytes. PDF bytes are retained as binary originals and downloadable historical
archives; they never become editable invoices, payment state or native authority.
Each CSV is limited to 2 MiB; PDF to 1 MiB; a package to 1000 rows and an HTTP
request to 8 MiB. Split larger exports at complete engagement boundaries, preserving
stable source IDs and namespace. Hosted upload capacity is unproven.

XLSX time uses the same time-column mappings, source IDs, historical rates and independent controls as CSV. The selected worksheet must have unique headers on row 1, exported numeric or text values, ISO `YYYY-MM-DD` date text or whole Excel date serials using the workbook’s declared 1900/1904 date system, and at most 1000 time rows. Raw and rounded numeric cell text is converted directly into exact seconds, without floating-point hour arithmetic. Shared strings, inline strings and sparse empty optional cells are accepted. Formula cells, fractional dates, the fictitious 1900-02-29 serial, unsupported cell types and ambiguous/missing worksheet names refuse; no cached formula result is trusted. Original workbook bytes and selected worksheet/row locations stay in custody. No source data is rewritten or discarded. ZIP decoding is bounded to 2 MiB compressed, 8 MiB expanded and 128 members. This is detailed time support only, not other workbook record kinds or complete finance history.

For `POST /api/gauge/command`, put the binary workbook in `package.workbook: {base64: "..."}`, omit `files["time.csv"]`, and provide `manifest.timeWorksheet`. Browser upload accepts `time.xlsx` directly; the retained artifact keeps that filename. Equivalent CSV and worksheet rows share source identities and do not duplicate imported work; source or later native changes still require reconciliation.

Before apply, `sourceCoverage` must describe `clients`, `people`, `projects`
and `time`, `expenses`, `estimates`, `invoices`, `payments` and `retainers`, plus `forecast` when supplied. Each entry declares its `provider`
(`harvest` or `forecast`), stable source `account`, `administrator: true`,
`permission: true`, `complete: true`, `filters: "all-records"`, independent
`historyRange: {from,to}` and ordered contiguous `windows: [{from,to,complete:true}]`.
Harvest entries also supply independent original row `count`; CSV and workbook
time share the same count. Forecast additionally declares `pagesComplete: true`.
These are reviewed source attestations, not verification against a live account.
They must come from the original exports and administrator, not the visible rows.
Missing permission, filtered or truncated data, unequal counts, date gaps or an
omitted history edge appear in an incomplete preview and refuse apply without a
journal or native write. Correct the package and review its new fingerprint.
The manifest, mappings and exact originals remain in custody through restore.

Complete packages also include original `finance.json`, even when its five arrays are empty. `manifest.finance` declares `mappingVersion: "harvest-finance-v1"`, `moneyUnit: "minor-units"`, optional source array aliases, and explicit semantic-to-original column maps for expenses, estimates, invoices, payments and retainers. Every row has a stable `id`, `date` and explicit ISO `currency`. Expenses carry client, project and amount; estimates carry client and amount; invoices carry client, amount, paid and outstanding; payments carry the exact invoice ID, payment date and signed amount. Billed time must resolve its retained source invoice and client. No unknown cost can establish financial completeness.

Retainers carry client, project, stable family ID, period date and exact opening, allowance, use, closing, carry-in and carry-out amounts. Signed surplus and deficit are preserved. Opening plus allowance minus use equals closing; closing equals carry-out; a later family period starts with the prior signed carry. These source balances never create native retainer terms or billing authority.

`manifest.finance.controls` contains independently supplied `counts` for all five objects and `financial` totals keyed by client, month and ISO currency. Each bucket explicitly includes `expenseMinor`, `estimateMinor`, `invoiceMinor`, `invoicePaidMinor`, `paidMinor`, `outstandingMinor`, `openingMinor`, `allowanceMinor`, `usedMinor`, `closingMinor`, `carryInMinor` and `carryOutMinor`, with zeroes where applicable. Invoice paid and outstanding amounts stay with the invoice cohort; cash follows each payment's own date, including signed refunds. Every required control must be known and match. The synthetic example in `tests/fixtures/harvest-finance.mjs` includes two months and signed retainer carry. Original finance bytes, mapped source identities, manifest and journal remain downloadable and portable; native invoices, payments and approvals are not created.

Supply a JSON manifest:

- `namespace`: stable source account identity; `coverage`: `all-time`;
  `currency`: the package's explicit three-letter ISO currency code, matching the
  saved agency currency; `units`: `decimal-hours`; `timezone`: explicit IANA zone.
  New agencies default to USD. The manifest is required: the importer never infers
  currency from CSV amounts or defaults an omitted currency. For example, an AUD
  package sent to a USD agency is refused with “Harvest package uses AUD; agency
  uses USD.” No conversion is performed. Imported engagements, rates and time
  amounts retain the manifest currency; existing historical records keep theirs.
- `columns`: optional maps keyed `clients`, `people`, `projects`, `time`, mapping
  semantic names to exported headers. Defaults are shown in the synthetic fixture.
  Clients need `id,name`; people `id,name`; projects `id,clientId,name`; time
  `id,personId,projectId,date,hours,task,notes,billable,billed`.
- `projectLeads`: source project ID to source person ID. `projectMembers`: source
  project ID to explicitly reviewed source person IDs (omission grants no members).
  Imported people never create operator accounts or role grants. Linking a native
  operator later is a separate owner action.
- `rates`: source person ID to `{effective,costMinor,billMinor}`. Rates are exact
  minor units of the declared currency per hour (cents for USD or AUD); cost may
  be explicitly null (unknown), bill must be resolved. A supplied
  rate must cover every source work date for that person. This first adapter accepts
  a supplied object or array of up to 100 immutable historical rates per person/package. Array dates must be unique; the latest date on or before each work date applies. It does not infer past rates from today's rate.
- `reconciliation`: independent totals keyed by `clientSourceId` and reporting
  month (`YYYY-MM`), each with
  `{count,seconds,amountMinor}`. Amount is billable value at supplied exact rates,
  rounded once per entry to minor units. If `Rounded Hours` is supplied, source billable value uses that quantity; source cost always uses raw actual duration. If rounded hours are absent, source value uses raw duration and billing rounding stays explicitly unknown.
  Gauge refuses disagreement before preview. Compare these independently with the
  source report, not by copying Gauge's calculated answer.
- Optional `columns.time.roundedHours`, `invoiceId`, `approved` and `locked` map exported evidence (default headers `Rounded Hours`, `Invoice ID`, `Approved?`, `Locked?`). Raw `Hours` and rounded hours independently convert decimal text into whole seconds without approximation: 2.11 → 7596 raw seconds, 2.25 → 8100 billing seconds. Source approval and lock flags are `Yes`/`No` or absent, retained as evidence; they never become native approval or native locking. Invoice references remain source links, not issued Gauge invoices. Actual time stays raw through native review; native billing rounding follows newly approved terms rather than silently adopting source rounding.
- `timeReconciliation` is required for every complete Harvest package. It contains independent client and month controls keyed like `reconciliation`, with `{count,rawSeconds,billableSeconds,billingSeconds,billedSeconds,unbilledSeconds,costMinor,billMinor}`. Billed and unbilled seconds partition raw time by the source invoiced flag. Billable seconds use exported billing duration when supplied, otherwise billable raw duration; nonbillable rows contribute zero. All controls are in the single explicitly declared package currency. Rounded totals are `null` if any entry lacks them; cost totals are `null` if any declared cost is unknown. Billable value uses the effective historical bill rate and exported rounded seconds when present, otherwise raw seconds; costs use actual seconds. Each entry rounds money half up to cents. Preview refuses any mismatch. These controls do not establish outstanding receivables, source completeness or payment balances.
- Optional `schedulePeople` maps CSV person labels or captured person IDs to source person IDs in `people.csv`; `scheduleProjects` maps CSV `Client/Project` labels or captured project IDs to source IDs in `projects.csv`. These reviewed links retain the captured people/projects and avoid creating duplicate identities. `schedulePlaceholders` maps a placeholder label/ID to its descriptive name; it never maps to a real person.
- `schedulePeriods` maps CSV period labels to inclusive `{from,to,workingDays}`. Omit `workingDates` to retain a labeled aggregate without distributing it. Add the exact reviewed `workingDates` (unique dates inside that period, count equal to positive integer `workingDays`) to distribute a Project total equally into whole seconds on those dates. Those rows are labeled reviewed distributions, not original daily facts. Totals need to divide exactly. Team totals remain aggregate controls even with reviewed dates, because they do not identify a project. Periods span at most one year; totals can exceed 24 hours.
- `forecast: {view: "project"|"team", orientation: "columns"|"rows", commitment: "tentative"|"committed", columns: {...}}` selects the CSV shape. Default is the original Project in columns door with tentative planning meaning. `columns` maps `person`, `client`, `project`, and for rows `period` and `hours`, to actual export headers; defaults are `Person`, `Client`, `Project`, `Period`, `Hours`. An optional `id` column supplies an explicit stable row identity; otherwise new shapes use person and project, task and period, with optional `task` mapping (default `Task`). Duplicate identities refuse instead of merging unrelated source rows. A mapped `commitment` column takes precedence over the package commitment. Never interpret an imported staffing commitment as commercial approval. For columns the period labels are the exported column headers. For rows the named period cell selects `schedulePeriods`. The original Project in columns source and target identities are preserved; changed source rows require explicit reconciliation, never a new namespace to bypass claims.
- `forecast.json` contains original captured page envelopes for `people`, `projects`, `assignments` and `availability`. Each object is `{pages: [{page, cursor?, next, totalPages, totalCount, data: [...]}, ...]}`. Pages are ordered from one, cursor links must match the next captured page, and the final next value is null. A separate original `forecast-metadata.json` supplies `provider: "forecast"`, the reviewed source account, history range and windows, plus independent per-object `counts`. Counts must match every original envelope and its captured rows, including explicitly empty objects. CSV reports instead supply `csv: {count, sha256}` in that metadata, binding the independent row count to the exact report bytes. Missing metadata, omitted or reordered pages, mismatched counts and unknown numeric metadata refuse completeness. The flattened page rows then use the following reviewed mappings. `forecastApi: {authorized: true, durationUnit: "seconds"|"decimal-hours", arrays: {...}, fields: {...}, leaveProjectIds: [...], allocations: {...}}` declares permission to supply the capture and maps its actual schema. `arrays` maps those four roles to top-level array names. `fields` maps semantic keys per array to actual field names. Every array needs unique `id`; people may carry `name`. Assignment fields are `personId`, `projectId`, `from`, `to`, `totalSeconds`, `commitment`; availability fields are `personId`, `from`, `to`, `dailySeconds`, `weekdays` (comma-separated weekday numbers, Sunday=0), `holidays` (explicit date list, empty if none). Both duration-named fields use the explicitly declared `durationUnit`. Date bounds are inclusive. Map captured identities through `schedulePeople`/`scheduleProjects`; include every referenced person and project in the capture. Names and other captured fields remain in original custody, without granting access.
- `forecastApi.allocations` maps assignment IDs to supplied exact date detail `[{date: "2026-11-02", seconds: 18000}, ...]` (always whole seconds). Dates must be unique, within the captured period and total exactly to its quantity; a one-date assignment already supplies its own exact detail. A multi-date capture without this detail remains an aggregate. No weekday or holiday algorithm invents daily assignment facts. `leaveProjectIds` identifies captured Time Off projects; their date allocations become leave, separately reducing available capacity. Availability preserves explicit workdays and holidays and refuses overlapping native calendars. Placeholders retain unfilled tentative totals only and cannot carry leave/availability. The source view preserves tentative and committed meaning; only named-person exact/reviewed allocations enter the daily staffing calculation. Compare Team and Project controls independently across the same holiday before cutover.

Dates without exported clock instants retain null start/end and explicit work date,
timezone and whole-second duration. They do not compete with live timer intervals.
Decimal hours that cannot exactly represent whole seconds are rejected. No implicit
FX, source approval, invitation or external action is imported. Staffing commitment is an explicit reviewed mapping, never an approval.
Imported notes are inert text, escaped on documents and formula-safe in billing CSV.
Source billed flags block repeat billing; unbilled work still needs native terms,
submission and approval.

Preview performs SELECT-only Base planning and shows counts, client and month totals,
memberships and omissions. Apply checks the exact reviewed fingerprint and the
current native session/grant inside every atomic D1 batch. A request publishes at
most ten source records. Resume uses retained custody; it does not refetch source
files. Rollback reverses a partial import; Undo reverses a completed import in
bounded batches. Reimport reuses source claims rather than duplicating work.
Changes to a source under the same identity are refused for explicit reconciliation.

Existing Forecast imports and retained plans are not rewritten by this fix;
resume continues their original reviewed effects. To correct an untouched old
import, use Undo (or Rollback for a partial import), resume until reversal is
complete, then add the reviewed `workingDates` to the retained source package,
preview again and apply the new fingerprint under the original namespace. Check
the capacity API for the original period against the source total. This reverses
the whole package, so resolve dependencies first and preserve later native work.
Do not use a new namespace to bypass a conflict or import over inflated rows.

Undo is strict: edited native values/revisions, later approvals, assignments, grants
or billing dependencies preserve affected data and refuse reversal with a conflict.
Resolve the named dependency or keep the import; never discard later business work.
Original files, manifest, source mappings and journal remain available to finance
and in the owned dataset after reversal. Roles and grants are not import effects.

`rer export` / `rer import` is complete installation portability, distinct from
Harvest move-in. It includes native history, originals and files, excludes session
credentials, requires fresh private settings, and refuses corrupt archives or an
occupied destination. There is no released Gauge dataset requiring an upgrade yet;
new migrations remain forward-only after the first release.

## What this kit does not map

- Native invoice issuance, payment settlement, estimate acceptance or retainer billing from source finance. Structured historical finance and PDFs remain evidence.
- Native expense and receipt adoption, project budgets and budget history, task estimates, and full source approval decision history. Exported approval and lock flags remain source evidence; imported time arrives as drafts for native submission and approval.
- Rate history inferred from today's rates, and per-project or per-task billable rates (supply reviewed person-rate versions).
- User accounts, roles, permissions and project managers beyond the reviewed `projectLeads` and `projectMembers` maps; no operator account or grant is created.
- Timer start and stop clock instants when the export has only dates and hours; a live Forecast API connection or provider-verified authorization.
- Packages whose declared currency differs from the saved agency currency,
  currency conversion, and any write back to Harvest or Forecast.

## Kantata OX and SX historical source evidence (partial)

Imports now has a separate **Kantata OX and SX source evidence** section. It requires a flavor-specific reviewed object map, complete year windows, source administrator and object permission attestations and independent client, month and currency controls. OX CSV, value-only time XLSX and completed asynchronous JSON artifacts, or SX Salesforce flat CSV ZIP and API captures retain their original bytes. See API.md and the synthetic documented adapter in `tests/fixtures/kantata.mjs`. The preview names unresolved relationships and options and incomplete source coverage before any apply. Batches are resumable and untouched historical effects can be undone.

This is historical source evidence, not an approved switch to native billing or staffing. It grants no user access and imports no approval, invoice issuance or payment settlement authority. Practice and Office historical source controls are labelled separately from native reports. The native owner can separately preview and confirm bounded native draft adoption: clients, people and skills, projects, tasks, rates, time and expenses; tentative exact-date staffing; and private native custom fields and values. Multi-date schedules need explicit reviewed allocations; no daily facts are invented. Ordinary native approval is still required and source-billed time cannot rebill. Undo holds later edits or approvals and dependencies. Source estimates, invoices, payments and WIP remain historical evidence; receipt adoption and approved cutover remain unimplemented.

## Scoro move-in

Imports has a Scoro source-package preview, exact-fingerprint apply, bounded
resume, rollback and undo, original-artifact download and historical-control report.
The documented adapter is synthetic-only: `tests/fixtures/scoro.mjs` and
`tests/gauge-scoro.mjs`. No consenting customer export or live connection is
claimed. CSV, original value-only legacy BIFF XLS and XLSX and uploaded paginated v2
JSON use explicit reviewed mappings. API.md documents the package and complete
filter and window checks. Records are bounded at 1000 physical rows (including
repeated report rows), artifacts at 2 MiB, the HTTP request at 8 MiB, and each
write at ten unique source records. Packages above these measured bounds refuse.

Scoro `duration` and `billable_duration` remain separate whole-second quantities.
Original timezone-bearing timestamps are retained alongside work dates. Either
`invoice_line_id` or `allocated_invoice_id` establishes source billed state;
invoice relationships, line totals and payment allocations must reconcile.
Differently grouped reports with the same stable source IDs count once. Missing
permissions, unreviewed filters, gaps, incomplete pages, unresolved joins and
independent control mismatches prevent apply. Date-only filters must cover all
historical windows and include archived work. No source notes execute.

Native core and time draft adoption is an explicit owner decision using reviewed
leads and memberships. Source approval is historical evidence; fresh native terms and
approval are required. Source-billed time cannot rebill. Historical invoices,
payments and quote and history records remain source-owned evidence, not issued or
settled Gauge records. Undo preserves later edits or approvals and dependencies.
MIGRATE-010 owns the separate retirement and cutover comparison; CONNECT-013 and other
connection clauses retain ongoing provider access and synchronization obligations.

## Teamwork.com move-in

The Teamwork.com section accepts reviewed timesheet CSV and value-only Excel,
invoice and accounting exports and complete uploaded v1 and v3 JSON captures under the
shared original-custody, currency, coverage, identity and independent-control
rules above. `tests/fixtures/teamwork.mjs` is a synthetic documented package;
`tests/gauge-teamwork.mjs` proves the DST-boundary work date versus UTC audit
instant, archived source project, task and subtask dependencies, billed and unbilled
minutes, proof approval evidence, signed retainer carry and independent
project and period financial balances. Source history does not approve native work,
reactivate provider accounts or issue a native invoice. Explicit native drafts
still need fresh owner and native review; MIGRATE-010 retains financial cutover.

## Productive move-in

Productive source imports retain current and prior time versions, distinct worked
and billable quantities, dated rate overrides, unnumbered draft attribution,
manual invoiced state, recurring budgets and retainer opening and period balances.
Manager-level CSV and value-only XLSX and complete uploaded API captures require
explicit units and the same independent source controls; JSON number lexemes and
duplicate keys are checked before mapping. See API.md and the synthetic package
`tests/fixtures/productive.mjs`. Imported draft and manual invoice state excludes
native rebilling without inventing an invoice number. Source financial history
remains evidence, while separately confirmed native drafts need ordinary native
terms and approval. MIGRATE-010 retains separate operational cutover.

## Rocketlane move-in (partial)

Tracked-time CSV and Excel and complete uploaded API pages preserve phase and ad-hoc
entries, integer minutes, SOFT and HARD daily allocations, unfilled placeholders,
epoch audit units, source approvals and dated overrides. Separate original
finance exports reconcile invoice allocations, invoices and payments before a
source comparison can be accepted. API.md and `tests/fixtures/rocketlane.mjs`
document the synthetic format. Explicit native drafts preserve source-billed
exclusion and carry no approval or settlement authority.

Operational cutover is held pending ct's policy ruling. The conservative owner
form records only an exact, explicit, audited source-comparison acceptance;
it performs no provider shutdown, deletion or native financial transfer. Its
receipt holds source reversal until an audited owner withdrawal. This is honest
partial progress, not a completed operational move from Rocketlane.


## Float move-in

The Float Imports section accepts bounded complete-year schedule and report CSVs,
value-only workbooks and paginated uploaded v3 JSON captures. The synthetic
`tests/fixtures/float.mjs` and API.md document explicit maps for allocations,
actuals, effective workweeks, leave, phases and historical project rates.
Independent project and month controls reconcile schedule and actuals. Repeated
phase budgets retain one stable identity. Originals remain available after replay.

The native owner separately reviews project leads and memberships, then explicitly
confirms exact weekday calendars, tentative daily allocations and daily leave.
That confirmation is the native owner's leave decision; source approval is never
inherited. Each batch creates at most five native effects with stable source links.
Changed source evidence, native revisions or reviewed mappings hold continuation.
Source actuals and financial records stay historical evidence.

Captured deletion continuation requires another exact preview, confirmation and
audited reason. A complete capture must continue the known event sequence; a
missed interval needs a newer full comparison covering every original object.
Only linked untouched daily staffing and leave effects can be removed. Later
native edits, approval or committed staffing hold deletion. Original captures,
source evidence, exact native revision history and deletion receipts remain.
Replay and real Worker restart do not duplicate effects, and the whole flow
survives complete installation archive restore. Imports has visible text controls
and is proved at 1440 and 390 pixels. No provider action, live feed or financial
cutover is authorized; CONNECT-013 and MIGRATE-010 retain those obligations.


## Original source custom-field exports

After importing core records, the native owner can use **Source custom fields** on Imports to review original definitions and values against exact existing native relationships. The `field:import-preview` and `field:import` doors accept `format: "source-custom-fields-v1"` for Harvest, Forecast, Kantata OX, Kantata SX, Scoro, Teamwork, Productive, Rocketlane and Float. This is a documented bounded original-export carrier; it does not claim live provider access or native financial cutover.

The package declares `provider` (Kantata uses `kantata-ox` or `kantata-sx`), source `account`, exact `namespace` of provider followed by a colon and account, source administrator and object permission, complete all-records coverage, and exact original `definitions.csv` and `values.csv` strings under `files`. Independently supplied `controls: {definitions, values}` must reconcile. At most 100 definitions, 1000 exported values and 100 mapped native records are accepted. Each artifact is at most 2 MiB.

`package.mapping.columns` explicitly maps the definition semantics `id`, `name`, `scope`, `type`, `options` and `currency`, and the value semantics `id`, `fieldId`, `scope`, `recordId` and `value`, to their original CSV headers. `package.mapping.scopes` maps original entities to clients, engagements, people or tasks; `package.mapping.types` maps original types to the seven native field types. Select options use JSON arrays with stable IDs. Currency values use exact JSON `{amountMinor, currency}` and multi-select values use JSON arrays. Exact decimal text is preserved without floating-point rounding. `input.mapping` explicitly maps each source record to its existing native record, including every referenced source person.

Preview names invalid options, unknown money, inexact values and unmapped types, records or people, and cannot apply while any finding remains. The native owner confirms the exact fingerprint and reason. Source fields are finance-only and a later source revision cannot inherit a wider native visibility; ordinary native policy review remains a separate explicit act. Originals, value IDs, definition IDs, mappings, native value versions and import receipts survive whole-installation restore. Replays retain one import receipt and no duplicate definitions. This fields-only door currently has no untouched reversal command; that remaining MIGRATE-001 obligation prevents DONE.
