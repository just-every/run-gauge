Everyone signs in with their own email link. A sign-in alone gives no Gauge access: the owner connects each operator to a person and a role.

## Roles

| Role | Can |
| --- | --- |
| owner | everything, including finance and assigning access |
| finance | rates, costs, billing packets, imports and every engagement |
| lead | approve time and expenses and manage terms, tasks, milestones and staffing on engagements they lead |
| staff | record their own time, expenses and leave on engagements they are assigned to |
| agent | prepare and withdraw proposals only; names no person |

Staff and leads never see private costs or rates.

## Invite and assign

1. **Invite operator** with their **Email** and **Display name**. They receive a sign-in link.
2. Once they accept, **Assign or revoke Gauge access**: choose the **Active operator**, the **Person** they are, and the **Gauge role**, with **Enabled** ticked.

**Current grants** lists who has which role.

## Revoke access

Save the grant again with **Enabled** cleared. It takes effect on that operator's next request.

## Utilization API keys

A sibling tool such as Easel can read the agency's utilization without anyone's sign-in. Under **Utilization API keys**, enter a **Key label** and choose **Create key**, then copy the key at once: Gauge shows it only this time and keeps only its fingerprint. The key reads the participant count, available hours and approved billable hours for a date range, with no names, rates, costs or pay, and cannot change anything. **Key activity** lists every creation, read and revocation. Choose **Revoke key** to stop it on its next request. Keys never travel in an export.

## Two-person review and grant history

On **Access**, the owner can set **Two-person review limit**: an adjustment (credit or increase) to an approved billing packet above that amount must be approved by an owner or finance person other than the one who prepared it. The preparer sees "Needs an independent approver" until someone else approves or the draft is cancelled. Leave the amount empty for no limit. **Grant history** lists every access change with who made it and when.
