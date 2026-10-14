# Gauge acceptance record

Status: **all seventeen first-release clauses are LOCAL PROVEN** on Base `79f61faef682f9d6cdb64e843cfbd3cf02887982` with `@runeditrun/rer` 0.2.4. Each row's test runs through public doors: HTTP to the built Worker with real local D1 (`tests/gauge.mjs`, `tests/gauge-agent.mjs`, `tests/gauge-forecast.mjs`, all inside `rer verify`), and the fresh-clone browser journey `tests/fresh-clone.mjs` at 1440 and 390 pixels, which drives the same product with `rer check`, `describe`, `install`, `setup`, `dev`, `build`, `preview`, `deploy --dry-run`, `export`, `import` and `reset`. Records are synthetic. This proves the local product; it does not prove a hosted deployment, a real agency's export, or a real billing period.

| # | Clause | What a person can do | Test | Status |
|---|---|---|---|---|
| 1 | ENGAGEMENT-001 | Start empty and set up a client, people, a scoped engagement with lead and members, tasks and milestones | `ENGAGEMENT-001 real empty account to scoped engagement`; browser journey | **LOCAL PROVEN** |
| 2 | BUDGET-001 | Approve exact hourly or fixed terms; approved versions are immutable; change orders are new versions | `BUDGET-001 immutable approved terms and additive change orders` | **LOCAL PROVEN** |
| 3 | RATE-001 | Add effective-dated private rates; later rates never rewrite approved work | `RATE-001 effective-dated private rates`; `TIME-002 …` (later rate leaves approved economics); browser journey rate form | **LOCAL PROVEN** |
| 4 | CAPACITY-001 | Keep calendars, leave and tentative/committed staffing; see remaining time, conflicts and unknown availability | `CAPACITY-001 working calendar, leave and separate tentative staffing`; `tests/gauge-forecast.mjs`; browser journey capacity | **LOCAL PROVEN** |
| 5 | TIME-001 | Record manual time or a persistent timer; overlaps and a second timer are refused | `TIME-001 persistent timer, exact manual duration, parallel exclusion and idempotence`; browser journey manual time form | **LOCAL PROVEN** |
| 6 | TIME-002 | Submit, return, correct and approve exact revisions with audited history | `TIME-002 return, correction and approval of exact revisions`; browser journey correction | **LOCAL PROVEN** |
| 7 | COST-001 | Record expenses with private receipts and exact approval | `COST-001 expense receipt custody, exact approval and attachment privacy` | **LOCAL PROVEN** |
| 8 | ECONOMICS-001 | Reconcile budget, approved cost, billable value and remaining effort; see missing-rate sources | `ECONOMICS-001 approved actual cost and remaining effort` | **LOCAL PROVEN** |
| 9 | BILLING-001 | Draft a packet from eligible approved sources; a concurrent duplicate reservation fails | `BILLING-001 concurrent source reservations and fixed-fee eligibility`; browser journey packet form | **LOCAL PROVEN** |
| 10 | BILLING-002 | Approve and download the exact formula-safe CSV once; correct with a linked adjustment | `BILLING-002 exact approval, formula-safe repeated exports and linked correction`; browser journey download | **LOCAL PROVEN** |
| 11 | REVIEW-001 | See missing time, overspend, capacity conflicts, unbilled work and decisions due, each linked to its source | `REVIEW-001 grounded decisions, missing time and capacity exceptions`; browser journey review link | **LOCAL PROVEN** |
| 12 | ACCESS-001 | See only permitted work; leads approve only their engagements; costs stay with finance; revocation is immediate; direct calls are refused | `ACCESS-001 native personas, scoped data and direct transport denials`; `ACCESS-001 revocation and minimal replay acknowledgements`; browser journey anonymous 401 | **LOCAL PROVEN** |
| 13 | MOVE-001 | Preview, reconcile, apply, roll back, re-import and undo a Harvest package; export and restore the whole dataset | `MOVE-001 Harvest preview, partial rollback, native reconciliation, idempotence and untouched undo`; `MOVE-001 complete D1 archive restore, corruption and occupied refusal`; browser journey `rer export` → fresh clone `rer import` | **LOCAL PROVEN** |
| 14 | AGENT-001 | Have an agent draft time from cited evidence; only the person confirms it | `AGENT-001 time reconstruction: the agent drafts, only the person confirms actual time` | **LOCAL PROVEN** |
| 15 | AGENT-002 | Have an agent offer tentative staffing alternatives; the lead approves one | `AGENT-002 resourcing: tentative alternatives only, the lead approves one`; browser journey approves on Review | **LOCAL PROVEN** |
| 16 | AGENT-003 | Have an agent prepare a billing packet's sources; finance approves the exact packet | `AGENT-003 billing preparation: eligibility checked, finance approves the exact packet` | **LOCAL PROVEN** |
| 17 | AGENT-004 | Have an agent draft a change order; the lead declines or approves it | `AGENT-004 delivery exceptions: change-order briefs are declined or approved by the lead` | **LOCAL PROVEN** |

High-stakes paths carry more than one proof: authorization (direct unauthenticated and wrong-role calls, revocation, the agent's 403 on every non-proposal command and its inability to decide its own proposals), destructive and recovery operations (import rollback, strict undo with refusal after edits, archive restore with corruption and occupied-destination refusal, restore advancing the auth generation so no old session survives), and duplicate billing (concurrent reservation race, duplicate and already-allocated sources refused at preparation).

## Upgrade from the earlier Gauge

Gauge's earlier implementation (Base `3d643dd`, vendored CLI) never released customer data. Its applied migrations `0001`–`0007` keep their bytes; `0008`–`0017` are additive. A database built from Gauge's chain has the same auth, dependency, erasure and import-kit tables, columns, indexes and triggers as one built from current Base.

## Not yet proven

- A real, authorized Harvest all-time export with separate client, people and project exports, reconciled independently by client and month. Current fixtures are documented shapes only.
- A consenting agency's project lead and bookkeeper running one whole weekly exception-to-packet cycle and comparing an actual billing period and next-month capacity against their current tool. Do not recommend cancelling an incumbent before that.
- Hosted deployment, real sign-in mail, hosted capacity and cost. No deployment was made.
- Model-backed agents, calendar reads and accounting writes (phase 2 and 3). Today the agent is the owner's own program using the API.
