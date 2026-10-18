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
