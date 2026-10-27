import type { Value } from './model'
import { escape as e } from './ui-forms'

export function acceptanceSummary(v:Value={}){
 const notice=v.acceptanceNotice??v.notice
 if(!notice)return ''
 return `<p class="g-note">Acceptance carrier: ${e(notice)}</p>${v.acceptorName?`<p>Reported acceptor: ${e(v.acceptorName)} · ${e(v.acceptorContact)}. Reported acceptance date: ${e(v.acceptanceDate)} · channel: ${e(v.channel)} · evidence: ${e(v.evidenceRef)}.</p>`:''}${v.status==='withdrawn'?`<p>Withdrawn: ${e(v.withdrawalReason)}</p>`:''}`
}
