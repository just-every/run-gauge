// Plain-language summaries of records and Review exceptions, each with the link
// to its source record, so no page shows a raw id, field name or JSON.
import type { reports } from './reports'
import type { Row } from './model'
import { hours, money, day, period, nameOf } from './ui-format'

export type Report = Awaited<ReturnType<typeof reports>>
type Data = Report['data']
export const proposalLabels: Record<string, string> = { time: 'Time draft', staffing: 'Staffing alternatives', billing: 'Billing packet', 'change-order': 'Change order' }
const find = (rows: Row[], id: string) => rows.find(r => r.id === id)

/** "Mia Chen · Workshop · 6.5 h · 6 Oct 2026" for one source line "time:ID" (or expenses, milestones, budgets, proposals). */
export function describeSource(d: Data, source: string): { text: string; href: string } {
 const [kind, id] = source.split(':') as [string, string]
 if(kind==='retainers'||kind==='retainerPeriods'){const r=find(d[kind],id);const t=kind==='retainers'?r:find(d.retainers,r?.value.retainerId);return {text:t?.value.terms.name??'Retainer period',href:`/app/engagements?edit=${r?.value.engagementId??''}#retainers`}}
 if (kind === 'opportunities') { const r = find(d.opportunities, id); return { text: r ? `${r.value.name} · ${r.value.stage}` : 'Opportunity', href: `/app/engagements?opportunity=${id}#pipeline-title` } }
 if (kind === 'resourceRequests') {const r=find(d.resourceRequests,id);return {text:r?`${r.value.role} · ${r.value.status}`:'Resource request',href:`/app/capacity?resourceRequest=${id}#resource-requests`}}
 if (kind === 'proposals') { const p = find(d.proposals, id); return { text: p ? `${proposalLabels[p.value.kind]} · ${nameOf(d.engagements, p.value.engagementId)}` : 'Agent proposal', href: `/app/review#${id}` } }
 if (kind === 'time') { const t = find(d.time, id); return { text: t ? [nameOf(d.people, t.value.personId), nameOf(d.engagements, t.value.engagementId), nameOf(d.tasks, t.value.taskId), hours(t.value.durationSeconds), day(t.value.workDate)].join(' · ') : 'Time entry', href: `/app/time?edit=${id}` } }
 if (kind === 'expenses') { const x = find(d.expenses, id); return { text: x ? [x.value.description, nameOf(d.engagements, x.value.engagementId), ...(x.value.amountMinor === undefined ? [] : [money(x.value.amountMinor, x.value.currency)])].join(' · ') : 'Expense', href: `/app/expenses?edit=${id}` } }
 if (kind === 'milestones') { const m = find(d.milestones, id); return { text: m ? [m.value.name, nameOf(d.engagements, m.value.engagementId), ...(m.value.amountMinor === undefined ? [] : [money(m.value.amountMinor, m.value.currency ?? find(d.engagements, m.value.engagementId)?.value.currency)])].join(' · ') : 'Milestone', href: m ? `/app/engagements?edit=${m.value.engagementId}#${id}` : '/app/engagements' } }
 if (kind === 'budgets') { const b = find(d.budgets, id); return { text: b ? `${b.value.mode === 'fixed' ? 'Fixed-fee' : 'Hourly'} terms · ${nameOf(d.engagements, b.value.engagementId)}` : 'Terms', href: b ? `/app/engagements?edit=${b.value.engagementId}#${id}` : '/app/engagements' } }
 if (kind === 'engagements') return { text: nameOf(d.engagements, id, 'Engagement'), href: `/app/engagements?edit=${id}` }
 if (kind === 'packets') { const p = find(d.packets, id); return { text: p ? [p.value.title, nameOf(d.engagements, p.value.engagementId), money(p.value.totalMinor, p.value.currency)].join(' · ') : 'Packet', href: '/app/billing' } }
 if (kind === 'rates') { const r = find(d.rates, id); return { text: r ? [r.value.engagementId ? nameOf(d.engagements, r.value.engagementId) : r.value.clientId ? [nameOf(d.clients, r.value.clientId), r.value.role].filter(Boolean).join(' · ') : r.value.personId ? nameOf(d.people, r.value.personId) : r.value.role ?? 'Everyone', r.value.service === '*' ? 'All services' : r.value.service, `from ${day(r.value.effective)}`].join(' · ') : 'Rate', href: '/app/rates' } }
 if (kind === 'calendars' || kind === 'leave' || kind === 'staffing') { const r = find(d[kind], id); return { text: r ? [nameOf(d.people, r.value.personId), ...(kind === 'staffing' ? [nameOf(d.engagements, r.value.engagementId)] : []), period(r.value.from, r.value.to)].join(' · ') : 'Record', href: '/app/capacity' } }
 return { text: 'Record', href: '/app/review' }
}

/** One Review exception as chip label, summary and link. */
export function describeException(report: Report, x: any): { type: string; text: string; href: string } {
 const d = report.data, person = () => nameOf(d.people, x.personId, 'Unknown person')
 if (x.type === 'missing time') return { type: x.type, text: `${person()} · ${hours(x.expectedSeconds)} expected, ${hours(x.recordedSeconds)} recorded`, href: '/app/time' }
 if (x.type === 'capacity conflict') return { type: x.type, text: `${person()} · ${day(x.date)} · ${hours(x.seconds)} over`, href: `/app/capacity?from=${report.from}&to=${report.to}` }
 if (x.type === 'availability missing') return { type: x.type, text: `${person()} · ${x.days} ${x.days === 1 ? 'day' : 'days'} without a calendar`, href: `/app/capacity?from=${report.from}&to=${report.to}` }
 const source = describeSource(d, x.source)
 if (x.type === 'overspend') return { type: x.type, text: `${source.text} · ${x.incomplete?'at least ':''}${money(x.amountMinor, x.currency ?? d.engagements.find(r => r.id === x.source.split(':')[1])?.value.currency ?? report.agency.currency)} over budget`, href: source.href }
 return { type: x.type, text: source.text, href: source.href }
}

/** Unbilled approved work as one line per engagement ("Brand refresh · 2 entries · 14 h"), linked to its lines on Billing. */
export function unbilledByEngagement(report: Report, exceptions: any[]): { type: string; text: string; href: string }[] {
 const d = report.data, groups = new Map<string, { count: number; seconds: number }>()
 for (const x of exceptions) {
  const [kind, id] = x.source.split(':') as [string, string], row = find((d as any)[kind] ?? [], id), engagementId = row?.value.engagementId ?? ''
  const group = groups.get(engagementId) ?? { count: 0, seconds: 0 }
  group.count++; if (kind === 'time') group.seconds += row?.value.durationSeconds ?? 0
  groups.set(engagementId, group)
 }
 return [...groups].map(([engagementId, g]) => ({ type: 'unbilled approved work', text: [nameOf(d.engagements, engagementId, 'Engagement'), `${g.count} ${g.count === 1 ? 'entry' : 'entries'}`, ...(g.seconds ? [hours(g.seconds)] : [])].join(' · '), href: `/app/billing#unbilled-${engagementId}` }))
}
