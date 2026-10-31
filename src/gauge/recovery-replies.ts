import type { Bindings } from '../auth.server'
import { type Actor, fence } from './store'
import { type Value, need, text, date } from './model'
import { caseRecoveryReplies } from './operational-cases'
import { recoveryFormPreview, type RecoveryConstraint } from './recovery-feasibility'

/** Owner-entered fields alone carry constraints. Quoted evidence is never interpreted. */
export async function recoveryReplyRecheck(env: Bindings, a: Actor, input: Value) {
 need(a.role === 'owner' && a.session.kind === 'native' && !a.scheduled && !a.clientProposal, 'Only the native owner rechecks case replies', 403)
 await fence(env, a)
 let selections = input.replySelections
 if (input.recoveryForm) {
  selections = []
  if (input.clientReply) selections.push({ ...JSON.parse(input.clientReply), constraints: [{ kind: 'client-date', milestoneId: input.counterofferMilestoneId, due: input.counterofferDue }] })
  if (input.staffReply) selections.push({ ...JSON.parse(input.staffReply), constraints: [{ kind: 'staffing-refusal', personId: input.refusalPersonId, from: input.refusalFrom, to: input.refusalTo }] })
 }
 need(Array.isArray(selections) && selections.length > 0 && selections.length <= 10, 'Select one to ten exact recorded replies')
 need(Array.isArray(input.projectIds) && input.projectIds.length === 2, 'Choose two native projects')
 const sources = await caseRecoveryReplies(env, a, selections, input.projectIds)
 const constraints: RecoveryConstraint[] = []
 for (const [n, selection] of selections.entries()) {
  need(Array.isArray(selection.constraints) && selection.constraints.length <= 10, 'Enter a bounded structured constraint list')
  for (const c of selection.constraints) {
   need(c && ['client-date', 'staffing-refusal'].includes(c.kind), 'Unsupported reply constraint')
   if (c.kind === 'client-date') constraints.push({ kind: c.kind, engagementId: sources[n].engagementId, milestoneId: text(c.milestoneId, 'Counteroffer milestone'), due: date(c.due) })
   else {
    const from = date(c.from), to = date(c.to)
    need(from <= to, 'Staffing refusal ends before it starts')
    constraints.push({ kind: c.kind, engagementId: sources[n].engagementId, personId: text(c.personId, 'Refusing person'), from, to })
   }
  }
 }
 const result = await recoveryFormPreview(env, a, input, constraints)
 // Recheck current case and reply revisions as well as current native authority.
 await caseRecoveryReplies(env, a, selections, input.projectIds)
 await fence(env, a)
 return { ...result, replySources: sources, replyConstraints: constraints,
  alternatives: result.alternatives.map(option => ({ ...option,
   status: option.status === 'feasible' ? 'conditional' : option.status,
   renewedDecisions: input.projectIds.flatMap((engagementId: string) => [
    { engagementId, role: 'lead', decision: 'Review the exact revised schedule, scope and staffing; no approval granted' },
    { engagementId, role: 'client', decision: 'Confirm exact commercial terms, dates, scope, amounts, recipient and expiry; recorded replies grant no acceptance' },
    { engagementId, role: 'finance', decision: 'Review exact budget, retainer, margin and expected-cash effects; no billing or payment authority granted' }
   ])
  })),
  assumptions: [...result.assumptions, 'Owner-recorded replies are unverified and quoted text is inert; only the explicitly entered structured constraints apply', 'Rechecking grants no approval, adopts no changes, sends nothing and never closes a case']
 }
}
