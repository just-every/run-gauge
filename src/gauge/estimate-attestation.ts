import { type Value,need,text,date } from './model'

export const acceptanceNotice='recorded by agency, client identity unverified'
export const acceptanceChannels=['signed document','email','PO','verbal']
export function reportedAcceptance(input:Value){
 need(acceptanceChannels.includes(input.channel),'Choose signed document, email, PO or verbal')
 return {acceptorName:text(input.acceptorName,'Reported acceptor name',200),acceptorContact:text(input.acceptorContact,'Reported acceptor contact',500),acceptanceDate:date(input.acceptanceDate),channel:input.channel,evidenceRef:text(input.evidenceRef,'Acceptance evidence reference'),notice:acceptanceNotice}
}
export function activeAttestation(v:Value){return v.status!=='withdrawn'&&v.notice===acceptanceNotice&&!!v.acceptorName&&!!v.acceptorContact&&!!v.acceptanceDate&&acceptanceChannels.includes(v.channel)&&!!v.evidenceRef}
/** Preserve the immutable estimate carrier when native records are edited. */
export function estimateLineage(v:Value={}){return v.estimateId?{estimateId:v.estimateId,estimateRevision:v.estimateRevision,...(v.approvalId?{approvalId:v.approvalId}:{}),...(v.acceptanceNotice?{acceptanceNotice:v.acceptanceNotice}:{})}:{}}
