# Gauge: stop frozen-clock sessions expiring against real time

Repository: just-every/run-gauge
Tag: sx-gauge-clockrot-1
Branch: cloud/sx-gauge-clockrot-1
Candidate: 0982cf30fbd6e00b7dcc74f189f99d2c52bba0ee
PR: none required by the repository instructions; the fleet owns landing.
Verify: 42484631717, completed/success on this exact candidate.
Verify URL: https://github.com/just-every/run-gauge/actions/runs/42484631717

## Result
Frozen Worker Date and SQLite current-time expressions now share the journey's explicit instant. Native owner and staff sessions retain their normal production TTL and authorize writes at dates 30 and 400 days before the real date and 400 days after it. Expiry still rejects writes, including expiry inside the production transaction. Both existing Forecast journeys pass, including the previously failing fixed October 31 fixture.

Only tests/gauge-harness.mjs, tests/gauge-test-clock.mjs, tests/gauge-forecast.mjs and the generated sources.lock.json changed. Production source, TTL settings, assertions in existing journeys and contract views were not changed. No tests were deleted, skipped or weakened. No UI changes or browser proof were needed.

## Full plan and execution
1. Configure the fleet identity, refresh the authorized launcher bundle, install the decrypted-bundle Git helper, clone full history from main, and install commit hooks that preserve repository hooks and remove prohibited co-author lines. Completed.
2. Read the fleet rules and Gauge instructions, inspect session creation and transaction authorization, and reproduce the dated Forecast journey against the emitted Worker and real local D1. Completed: setup returned 403 where 303 was expected.
3. Freeze SQLite at the harness boundary alongside Worker Date, preserving native prepared statements, bind values, batch transactions and production authorization logic. Completed.
4. Add one date-table authorization regression to the existing Verify-run Forecast suite. Exercise real owner bootstrap/login/setup, staff invitation/grant and owner/staff writes at -30/-400/+400 days; verify SQL clocks/TTL and expiry refusal and rollback. Completed.
5. Regenerate the tracked test source lock last and run its check, build the real Worker, run the touched Forecast tests and the Verify typecheck, and inspect the exact product diff and every candidate commit identity/trailer. Completed; passing evidence is listed below.
6. Preserve the first real commit as a [skip ci] branch save, fetch and merge updated main after that published save, then push the checked candidate with the cloud push guard. Completed. Main was already current, so no merge commit was necessary. Published history was never rewritten.
7. Await completed/success Verify on the exact candidate using one budgeted REST watcher at intervals of at least 300 seconds, then publish the explicitly selected non-secret report/receipt packet only to evidence/sx-gauge-clockrot-1. Verify completed successfully; evidence transfer custody is returned by the separate publisher and terminal EVIDENCE line.

## Cause and repair
Native authentication creates sessions from the JavaScript clock. The frozen Forecast journey uses 2026-10-31T12:00:00Z, so its sessions were expired relative to SQLite's real wall clock by November 8. Gauge's repeated in-batch authorization compares expiry to SQLite unixepoch('subsec'), producing the setup 403 after successful native login.

The test-only Worker entry installs Date before application modules load and wraps the D1 binding for both fetch and scheduled handlers. The same adapter wraps D1 returned to the Node harness. It replaces only SQLite current-time expressions: unixepoch(), the subsecond form, explicit 'now', date/time functions and strftime defaults, and CURRENT_TIMESTAMP/CURRENT_DATE/CURRENT_TIME. Date modifiers retain their duration; SQL literals, identifiers, comments and bound values retain their bytes. The source review also found unixepoch() in import admission, so that form is covered too. Statements stay native D1 objects; production batches, fences and rollback remain active.

The regression expires the staff session with an AFTER INSERT trigger during an ordinary favorite write. The final production fence returns 409 and rolls back both the favorite and the expiry mutation; the original session and favorite still work afterward. A separate already-expired-session request returns 401 with no write. This proves the adapter synchronizes time while retaining expiry enforcement.

## Checks and counts
| Check | Result | Receipt |
| --- | --- | --- |
| Original fixed-clock Forecast Project/Team journey before repair | 0/1 passed, 1 failed: 403 != 303 | baseline-forecast.log |
| npx -y @runeditrun/rer build via cloud_run | exit 0; emitted production source is identical to the candidate | receipts.json |
| node --test --test-concurrency=1 tests/gauge-forecast.mjs on candidate | 3 passed, 0 failed, 0 skipped; 137.645 s | forecast-final.log |
| pnpm run typecheck on candidate | exit 0 | typecheck.log |
| pnpm run source:lock then pnpm run source:check on candidate tree | exit 0; no Base drift or unrecorded copies | source-check-summary.json |
| git diff --check and scope/identity/trailer audit | passed for every candidate, including side parents | receipts.json |
| Guarded product push | succeeded on first attempt | receipts.json |
| Exact-SHA Verify 42484631717 | completed/success, head 0982cf30fbd6e00b7dcc74f189f99d2c52bba0ee | ci-final.json |

Before/after: the originally failing dated Forecast journey is 0/1 -> 1/1 passed. Forecast test registrations are 2 -> 3; one table covers one authorization behavior at three dates. The final local suite is 3/3 passed. Verify Gauge suite entrypoints remain 35 -> 35.

Actual date sweep on 2026-11-08:
- -30 days: 2026-10-09T12:00:00.000Z, passed.
- -400 days: 2025-10-04T12:00:00.000Z, passed.
- +400 days: 2027-12-13T12:00:00.000Z, passed.

Each case verifies owner/staff authorization, frozen session creation and observation times, SQLite seconds/subseconds, strftime, a seven-day SQL TTL, CURRENT_TIMESTAMP, in-batch expiry rollback, and already-expired-session refusal.

## Custody and remaining gates
First published save: 3adf636e71df42e9914ab7c2a3da148ee314f321 [skip ci].
Final pushed product: cloud/sx-gauge-clockrot-1 at 0982cf30fbd6e00b7dcc74f189f99d2c52bba0ee.
All new authors and committers are Run Edit Run fleet <fleet@runeditrun.com>; no trailers remain. No main push, force push, deployment, release or landing was performed. No clause Status/Gap/Evidence or summary counts changed, and no DONE claim is made. The fleet's publication scan and landing gates remain its responsibility.

Blockers: none for this candidate. Evidence publication is separate from product READY and landing; the final EVIDENCE line identifies the report-only ref/head.
