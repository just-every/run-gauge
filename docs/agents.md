An agent you already run, such as your own coding agent, can prepare work in Gauge. It never decides: the right person approves each proposal. Gauge has no built-in model and needs no model account.

## Give an agent access

1. On **Access**, invite an operator for the agent and have it accept.
2. Under **Assign or revoke Gauge access**, choose that operator, leave **Person** empty and choose the **agent** role.

An agent uses the same HTTP API as the app (see `API.md` in the repository). It reads engagements, tasks, people, calendars, staffing and approved work, without amounts, rates or costs. It may prepare and withdraw proposals and nothing else.

## What an agent can prepare

| Proposal | Prepared from | Who decides | Approval creates |
| --- | --- | --- | --- |
| Time draft | cited evidence, such as a calendar entry | the person whose time it is | their own draft entry, which they then submit |
| Staffing alternatives | calendars and staffing, up to five options | the engagement lead or finance | a tentative allocation |
| Billing packet | approved, unbilled source lines | finance | a draft packet, approved separately |
| Change order | the week's exceptions | the engagement lead or finance | a draft change order, approved separately |

## Deciding

Proposals appear on **Review** for the person who can decide them, with their evidence and assumptions. A time draft can be adjusted before approving; a staffing proposal asks which alternative to take. **Approve exact proposal** writes the effect through the ordinary command, as you, and records who decided and when. **Decline proposal** asks for a reason. Text inside evidence or imported notes is never treated as an instruction.
