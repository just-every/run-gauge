import type { Actor } from './store'
import type { Report } from './ui-describe'
import { escape as e, decision } from './ui-forms'
import { nameOf, period } from './ui-format'
export function leaveSection(a:Actor,report:Report) {
 const alerts=report.data.leave.filter(r=>r.value.status==='approved').flatMap(r=>(r.value.conflicts??[]).filter((c:any)=>a.role==='owner'||c.leadId===a.personId).map((c:any)=>`<li>Approved leave conflicts with ${e(nameOf(report.data.engagements,c.engagementId))} · ${e(period(c.from,c.to))}. Review staffing on this page.</li>`))
 const requests=report.data.leave.map(r=>`<li>${e(nameOf(report.data.people,r.value.personId))} · ${e(period(r.value.from,r.value.to))} · ${e(r.value.status??'approved')}${a.role==='owner'?(r.value.status==='requested'?decision('leave:decide','Approve leave',r,false,'primary','<input type="hidden" name="outcome" value="approved"><input type="hidden" name="reason" value="Owner approved requested absence">')+decision('leave:decide','Reject leave',r,false,'secondary','<input type="hidden" name="outcome" value="rejected">'):(!r.value.status||r.value.status==='approved')?decision('leave:decide','Cancel leave',r,false,'secondary','<input type="hidden" name="outcome" value="cancelled">'):''):''}</li>`)
 return `<section class="g-card" id="leave-requests"><h2>Leave requests and lead alerts</h2><p>Requested leave does not reduce capacity. Owner approval recalculates capacity and posts a conflict alert here for the responsible lead. Request reasons are visible only to that person. Email delivery and HR sync are not connected.</p><ul>${alerts.join('')||'<li>No approved leave conflicts.</li>'}</ul><ul>${requests.join('')||'<li>No leave requests.</li>'}</ul></section>`
}
