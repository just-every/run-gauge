# Run it locally

Gauge is an MIT-licensed agency operations seed for owner-led design, marketing and software agencies of about 5–40 people. It keeps engagements and agreed terms, effective-dated rates, capacity, time and expense approval, operational economics, weekly exceptions and deduplicated billing-preparation packets in your own workspace. An agent you already run can prepare time drafts, staffing alternatives, billing packets and change orders; the right person approves each one. [CONTRACT.md](CONTRACT.md) lists the seventeen first-release clauses and [ACCEPTANCE.md](ACCEPTANCE.md) records their proof. Source code: [just-every/run-gauge](https://github.com/just-every/run-gauge).

One line installs the shared `rer` command, clones Gauge and starts it:

```sh
npx -y @runeditrun/rer dev just-every/run-gauge
```

To start it again later, run `cd run-gauge && rer dev`. To choose the owner yourself, from the checkout:

```sh
rer install
rer setup
rer dev
```

`rer dev` alone also works on a fresh checkout: it installs, sets up a local owner and starts the app. Open the `RER_OPEN` link it prints on this computer (it is a sign-in credential: keep it private). The owner finishes first-run setup at `/setup`; afterwards `/` is the Base Lobby with **Sign in**, and Gauge lives at `/app`. Stop the server with `rer dev --stop`.

Gauge starts with no business records. Local operation uses the real Worker with persistent local D1 and Base's native sessions; no model, calendar, mail, accounting or cloud account is needed. The checkout pins Node 22.20.0, pnpm 10.12.4 and the published `@runeditrun/rer` 0.2.4.

## Daily use

- **Engagements:** clients, people, engagements with lead, members and scope, terms and change orders, tasks and fixed-fee milestones.
- **Time** and **Expenses:** record, submit, return, approve and correct with history; receipts stay private.
- **Capacity:** dated calendars, leave, tentative and committed staffing, next-month remaining time.
- **Rates**, **Billing**, **Imports** (finance): effective-dated rates, billing packets approved and downloaded once, Harvest move-in.
- **Review:** the week's exceptions and agent proposals awaiting your decision.
- **Access** (owner): invite operators and grant staff, lead, finance or agent roles.

The owner holds finance authority. Other operators have no Gauge authority until the owner maps them to a person and role under Access. An agent operator gets the `agent` role and may only prepare proposals; see [API.md](API.md).

## Commands

```sh
rer build
rer verify
rer check
rer describe
rer export --output exports/gauge.rer
rer import --input exports/gauge.rer --yes
rer reset --yes
rer deploy
```

`rer verify` builds the Worker, typechecks, runs the Worker/D1 flow tests and the native sign-in check, then loads the public pages in Chromium (run `pnpm exec playwright install chromium` once). `rer export` writes a verified archive of every record, revision history, receipt file and import original; `rer import` restores it only into an empty installation and never restores sessions or credentials, so run `rer setup` afterwards and sign in again. `rer reset --yes` removes local state: export first. `rer deploy` needs an owner's own cloud account; no hosted deployment has been accepted for Gauge.

The owner guides (getting started, the weekly flows, move-in, backup and restore) are the Markdown in [docs/](docs/site.json); `rer build --site` publishes them with the homepage at run-gauge.com/docs. The site is live at https://run-gauge.com. Harvest is the first move-in kit: read [MOVE-IN.md](MOVE-IN.md). Billing packets are preparation for your bookkeeper, not invoices; Gauge does no tax, payment, payroll or ledger posting. Read [OPERATIONS.md](OPERATIONS.md) and [RUN-LOCALLY.md](RUN-LOCALLY.md) for setup answers, private settings and deployment inputs.
