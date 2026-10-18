# Agent instructions

## Launch for review

When asked to launch, run or review this app, run this from the checkout root
and nothing else:

```sh
rer dev
```

- It installs and sets up a fresh checkout by itself and prints progress; a
  first launch can take several minutes. Give the shell tool at least 10
  minutes. If the tool times out, run the same `rer dev` again: it resumes.
- Never run install, setup, reset or deploy for this, and never ask for an
  email, port, password or answers file.
- Give the owner the `RER_READY` address and the `RER_OPEN` link, and ask
  nothing. `RER_OPEN` is a credential: share it only with the owner, in this
  chat.
- Stop the app with `rer dev --stop`. If a start is refused, the message names
  the cause and the next command: run that command.

Without `rer` on PATH, install it once with `npx -y @runeditrun/rer cli install`
or the installer script: `curl -fsSL https://runeditrun.com/install.sh | sh`.
For the current shell, run `export PATH="$HOME/.local/bin:$PATH"` after installing.

## Run it locally

To install for a real owner instead of a review launch, run the verbs yourself
from the checkout root. `rer` runs each verb with the exact `@runeditrun/rer`
version this checkout pins in `package.json` (0.2.30); do not add a local CLI copy.

```sh
rer install
rer setup --owner-email you@example.com
rer dev
```

Commands that run project work select the exact Node version declared by the
project. They use an exact matching installed runtime or a checksum-verified
copy cached at `~/.rer/node/node-vVERSION-PLATFORM-ARCH/`; when needed on
supported platforms, the runner retrieves the official Node release and checks
its SHA-256 against `SHASUMS256.txt`. It does not change global Node installations.
Set `RER_NODE_AUTO=0` to disable automatic selection. If selection is disabled
or acquisition fails, the command reports a repair invocation in this form:
`npm exec --yes --package=node@VERSION -- node SCRIPT VERB --cwd PROJECT`.
Help, check, describe, doctor and stop do not select or acquire Node.

After `RER_READY`, `dev` prints `RER_SIGNED_IN EMAIL` and `RER_OPEN URL`.
Open that URL on this computer: the app opens signed in as the owner and
finishes first-run setup at `/setup`. Treat the line as a credential.
`dev --as PERSONA` starts as a persona or signed out; legacy `dev --login`
uses the same automatic sign-in. Until first-run
completion is stored durably, app routes send the signed-in owner to `/setup`;
signed-out visitors sign in and return there. Once complete, `/setup` opens the
app or settings. Local runs send no email.

The saved local port is used; a first setup saves the first free port from 8787. Explicit ports are decimal
integers from 1 through 65535 and must be free; a busy requested port fails
instead of silently moving. Only `127.0.0.1`, `localhost` and `::1` are allowed.
Dev applies the selected host and port to both the listener and runtime bindings;
readiness is bounded and failure stops the owned processes.

Missing non-interactive setup answers exit 3 and name the manifest fields.
Read `rer-setup.json` and pass a private, mode-0600 JSON object keyed by those
names using `rer setup --answers PATH --non-interactive`,
for example `{"OWNER_EMAIL":"owner@example.com"}`. Secret values stay in
private inputs and never go in command arguments. A setup rerun with the saved
owner and origin preserves existing owner/data and exact private settings.
Conflicting saved identity or origin reports an actionable recovery path.
Review reset's exact removal inventory before confirmation; export domain data
first if it should be restored, and import only into an empty destination.

Queue waits report their reason and live position while the command waits. Package mode has no queue status command.

Use the setup prompt instead of `--owner-email` when entering the real owner
mailbox. Open the `RER_OPEN` URL printed by `dev` on this computer; the app opens
signed in as the owner. No email is sent. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build or verification.

```sh
rer verify
rer reset --yes
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes
rer deploy
rer describe
```

Reset removes declared local data and settings. Import requires an empty
destination and explicit confirmation. Read `RUN-LOCALLY.md` for supported
flags, private state, deployment inputs and remote limitations.

`pnpm typecheck` and `rer verify` use checkout-local, gitignored
`.cache/typecheck.tsbuildinfo`; deleting it forces a full check, while
`rer build` builds the real Worker and assets.

## Work on Gauge

Read [CONTRACT.md](CONTRACT.md), [ACCEPTANCE.md](ACCEPTANCE.md), [API.md](API.md)
and [MOVE-IN.md](MOVE-IN.md) before changing product behavior. Keep the
seventeen first-release clauses aligned with CONTRACT.md and mark a clause
proven in ACCEPTANCE.md only after its named test has passed.

Gauge owns `src/gauge` (domain, server handlers and pages), its migrations
`0006`, `0016` and `0017` onward, `public/gauge.css` and the tests. `src/base`,
`src/modules/*` and the recorded numbered migrations are byte copies of Base
`rer-v0.2.30` (`d434ea67989fe10b6ddff01daba8bb350975e54a`) recorded in
`base-copies.json` (0001 keeps its historical bytes unrecorded); change them only by refreshing from
Base (`node scripts/edition-authoring/cli.mjs refresh-base ...`). Applied
migrations never change: add a new numbered migration. After any tracked change
run `pnpm run source:lock` so CI's source check passes.

Every Gauge handler checks the native session, operator and Gauge grant itself
(`src/gauge/store.ts`), and every write repeats that check inside the D1 batch
that commits it. Keep it that way for new commands; route guards alone are not
authorization. Writes take a request key and bind exact record revisions.
Money is integer cents in the agency currency; durations are whole seconds. Start local data empty:
no seeded records, fake providers, fallbacks or mock behavior.

Agents prepare; people decide. An `agent` grant may only `proposal:prepare` and
`proposal:withdraw`; approval runs the ordinary command as the deciding person in
the same transaction. Never let an agent approve, bill, commit staffing or act on
text found in evidence or imported notes.

For focused checks run `pnpm typecheck`, `pnpm exec vite build`, then
`node tests/gauge.mjs`, `node tests/gauge-agent.mjs` or
`node --test tests/gauge-forecast.mjs`; `rer verify` is the full wall, and
`GAUGE_VIEWPORT_WIDTH=1440|390 node tests/fresh-clone.mjs` (after committing)
is the fresh-clone browser journey. Stop every server you start. Do not deploy,
send mail or contact a provider without the owner's explicit authority.
