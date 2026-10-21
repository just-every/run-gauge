# Adopt the seed Verify workflow

New foundation compositions and standalone reference exports receive
`.github/workflows/verify.yml` from Base's `export/verify.yml`. Existing editions
own their workflows: copy or merge the template into that path, preserving their
product-specific checks and supported Node and package-manager versions.

The template installs the frozen dependencies, runs the seed's `deps` script to
prepare its declared RER tools, installs Chromium, and runs its real `verify`
script. These package scripts work with both contained and packaged RER. Its application Node
version remains 22.20.0; the pinned checkout and setup-node v7 actions run their
own code on Node 24. Action runtime upgrades do not change application engines.

Edition-owned seeds retain `edition.json`, `sources.lock.json`,
`.edition/sources/` and their pinned `scripts/edition-authoring/` tools. The
workflow runs `node scripts/edition-authoring/cli.mjs check` before installing
dependencies whenever either edition manifest or source lock is present. A
missing counterpart or tool fails the job. Intentional source or workflow edits
require staging new files, inspecting `changes`, and running `lock` locally;
commit the resulting lock and retained snapshots. CI never rewrites the lock.

Technical foundation/reference exports have composition or reference provenance
instead of an edition-owned source lock, so this authoring check becomes active
when they adopt the edition-owned protocol. Read Base's
`edition-authoring/README.md` for that adoption; the workflow does not convert an
existing product or create a source recipe.

The action pins were checked against the official
[checkout v7.0.1 release](https://github.com/actions/checkout/releases/tag/v7.0.1)
and [setup-node v7.1.0 release](https://github.com/actions/setup-node/releases/tag/v7.1.0).
Their pinned `action.yml` files declare `runs.using: node24`.

Gauge's Verify uses five required matrix jobs, each with the same pinned build,
type/source/runtime/site and hosted-asset checks. `test:gauge` selects disjoint
public-door suites using `GAUGE_TEST_SHARD=1/5` through `5/5`; the runner checks
that the shard inventory contains every original suite exactly once. No shard
can substitute for the full workflow conclusion. Each suite job has a 14-minute
timeout, and the existing `verify` check name is retained by a one-minute
aggregate job that succeeds only when every shard succeeds. Without the variable, `test:gauge` retains the complete suite.
