# Agency preparation through the shared door

Gauge serves `/mcp`, canonical OAuth metadata, signed Business policy adoption at
`/api/rer/agent-policy`, and the native person's `/agents` policy, approval and
audit pages through Base's shared agent door. It accepts MCP 2026-07-28 and
2025-11-25. Gauge has no built-in model and this declared subset uses no paid AI.

The currently judged native agent authority is **preparation only**. Company
policy can hold, review or block a preparation; it cannot turn an agent into a
worker, lead, finance operator or owner. The broader agency surface under review
is not enabled by this adoption.

## Give an agent its native grant

1. On **Access**, invite the agent's native operator and have it accept.
2. Assign the **agent** role, one purpose and the permitted engagements. Leave
   Person empty. Only a current native owner grants or changes this scope.
3. For a company agent, enter its exact **Business agent id** in that grant.
   This explicit binding selects the existing native agent; neither a token
   email nor a Business team role creates a Gauge grant.
4. Choose company policy in Business, or set local policy on `/agents` for an
   independently operated installation. An unanswered or paused policy permits
   no agent effect. Native agent sessions keep their original narrow scope and
   enter the same registry when using Gauge's existing HTTP API.

A Business token's sponsoring person must be the current owner who made the
native grant. Its subject resolves through the signed settings `owner_id`, not
email. Other Business members retain their native accounts and signed roles but
cannot sponsor these owner-made preparation grants. Removing either authority
stops the next effect. Changing an email never moves a binding.

## Supported tools and resources

| Tool | Scope | Effect |
| --- | --- | --- |
| `gauge.review.read` | `gauge:read` | Read the native purpose-scoped agency projection for a date range |
| `gauge.history.read` | `gauge:read` | Read revisions of a currently permitted native record |
| `gauge.workspace.snapshot` | `gauge:read` | Read a fingerprint of that same permitted record set |
| `gauge.proposals.prepare` | `gauge:proposals` | Prepare the exact purpose's proposal through the native command |
| `gauge.proposals.withdraw` | `gauge:proposals` | Withdraw only that native agent's own open, current proposal |
| `gauge.events.list` | `events:read` | Base's built-in reader; agency event delivery is undeclared |

Every declared tool computes `standard` from its internal, non-committing
preparation effect. No tool sends, publishes, charges, changes standing authority
or promises committed staffing. Inputs cannot supply a lower risk class.
Mutations require an idempotency key and accept the native string revision.
Native transactions fence current grants, sponsor authority and the exact policy
state as well as the affected record revisions. Replayed native request keys
return the original acknowledgment; changed arguments conflict.

The `gauge://{kind}/{id}` catalogue covers clients, people, engagements, tasks,
proposals, time, calendars, leave, staffing, expenses, milestones and budgets.
Readers use the native closed field lists for the current purpose. Missing and
restricted records return the same refusal; imported notes and evidence are
untrusted. No rates, costs, bearer credentials or unrelated engagement data are
returned. A resource's `standard` class describes the redacted record actually
returned, rather than its URI or caller-supplied labels.

| Native purpose | What an agent prepares | Who makes the native decision |
| --- | --- | --- |
| Time reconstruction | Cited intervals and ambiguity | The worker confirms their own actual time and billability |
| Resourcing | Up to five tentative alternatives | The engagement lead or finance chooses one |
| Billing preparation | Eligible, approved, unbilled source lines, without amounts | Finance prepares the exact packet and separately approves it |
| Delivery exceptions | A cited change-order brief | The engagement lead or finance decides the draft; terms require their own approval |

Company approval records the named person's policy decision and leaves the
agent as preparer. It is separate from a worker's confirmation or commercial
acceptance. Native records and the business audit retain `<agent> for <person>`,
the operation identity and policy approvers. A later human proposal decision
remains that person's native act. Withdrawal is not offered as a generic Undo.

## Current limits

No provider execution, merchant instruction, mail, access/security mutation,
financial correction, privacy erasure, device operation, import or installation
operation is available through these tools. Those native doors keep their own
credentials and human requirements. No `cost` is registered; spend is
`{none:true}`. Agency events/subscriptions, multiple simultaneous sponsors,
resource refresh and provider delivery are not claimed. The pinned Base runtime
still exposes its built-in event reader; the future subset runtime must make
optional capabilities explicit.

The production owner-claim endpoint uses the installation's existing signed
claim trust. Normal `rer verify` runs the declared native lifecycle and
`agent-surface.json` journey on a disposable production build. Base 0.2.86 chooses
its random agent subject after the seed owner initializer returns, so that
initializer cannot bind the subject to an owner-made native agent grant. The
seed intentionally refuses the unbound verifier agent. This is an outstanding
verification lifecycle gap, not authority to manufacture a grant or bypass
native persistence.
