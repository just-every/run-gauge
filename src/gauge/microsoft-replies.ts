import type { Bindings } from '../auth.server'
import { type Actor, type Transaction, all, get } from './store'
import { type Row, type Value, need, text } from './model'
import { sha256 } from '../modules/import-kit/src/d1/index'
import { microsoftGet, microsoftPages } from './microsoft-api'
import { graphId, replyContext } from './microsoft-context'
import { graphToken, graphStaffMailbox } from './microsoft'
import { dispatchCredential, recordProviderUse } from './provider-custody'
import { assertInvoiceMailSource } from './invoice-mail-source'
import { invoiceSubject } from './invoice-delivery'
import { finishReadback } from './commercial-readback'

/** Bind only a reviewed outgoing message for a currently authorized exact invoice and recipient. */
export async function bindMicrosoftThread(env: Bindings, a: Actor, tx: Transaction, digest: string, s: Row, c: Row, input: Value) {
 need(s.value.scopes.mail==='active','Mailbox mail collection is stopped',409)
 const [releaseId,releaseRevision] = String(input.release??'').split('@')
 const release = await get(env,'invoiceAccess',text(releaseId,'Invoice release'))
 need(release.revision===releaseRevision,'Invoice release changed; refresh',409)
 const invoice = await assertInvoiceMailSource(env,tx,release)
 const messageId = graphId(input.messageId,'outgoing message id'), reason = text(input.reason,'Invoice thread review reason')
 const token = await graphToken(env,c,s.id,'mail')
 await graphStaffMailbox(token.token,s.value.mailboxId)
 const message = await microsoftGet(token.token,`/users/${s.value.mailboxId}/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,internetMessageId,isDraft,from,toRecipients,subject,sentDateTime`)
 need(message.id===messageId&&message.isDraft===false&&Number.isFinite(Date.parse(message.sentDateTime))&&message.from?.emailAddress?.address?.toLowerCase()===s.value.mailbox&&message.toRecipients?.length===1&&message.toRecipients[0].emailAddress?.address?.toLowerCase()===release.value.contact&&message.subject===invoiceSubject(invoice),'The message must match this exact invoice sender, recipient and subject',409)
 const conversationId = graphId(message.conversationId,'conversation id'), internetMessageId = text(message.internetMessageId,'Internet message id',512)
 need(/^<[^<>\s]+>$/.test(internetMessageId),'Microsoft returned an invalid Internet message id',409)
 const id = sha256(`graph:${s.id}:thread:${conversationId}`), prior = (await all(env,'graphThreads')).find(r=>r.id===id)
 need(!prior,'This conversation is already bound to an invoice',409)
 await dispatchCredential(env,c.id,c.value.version,s.id,'graph:mail')
 const row = await tx.record('graphThreads',{selectionId:s.id,invoiceId:invoice.id,invoiceRevision:invoice.revision,releaseId:release.id,releaseRevision:release.revision,conversationId,internetMessageId,messageId,contact:release.value.contact,reason,boundBy:a.session.operator.id,at:Date.now()},undefined,id,'graph:bind-invoice')
 await recordProviderUse(tx,{connectionId:c.id,credentialVersion:c.value.version,jobId:row.id,operation:'graph:mail',outcome:'accepted'})
 return finishReadback(tx,digest,row)
}

export async function collectMicrosoftReplies(env: Bindings, tx: Transaction, s: Row, token: string) {
 const threads = (await all(env,'graphThreads')).filter(t=>t.value.selectionId===s.id)
 need(threads.length>0,'Bind a reviewed outgoing invoice message before collecting replies',409)
 need(threads.length<=20,'Inspect at most twenty invoice conversations per selection',409)
 const items: {id:string;value:Value}[] = []
 for(const thread of threads) {
  tx.observe('graphThreads',thread)
  const release = await get(env,'invoiceAccess',thread.value.releaseId)
  need(release.revision===thread.value.releaseRevision,'Invoice recipient authority changed; review a new thread binding',409)
  const invoice = await assertInvoiceMailSource(env,tx,release)
  need(invoice.revision===thread.value.invoiceRevision,'Invoice changed; review its exact thread',409)
  // conversationId is an opaque provider id; it cannot contain an OData quote.
  const query = new URLSearchParams({$filter:`conversationId eq '${graphId(thread.value.conversationId,'conversation id')}'`,$top:'100',$select:'id,conversationId,subject,from,toRecipients,receivedDateTime,isDraft,internetMessageHeaders'})
  const messages = await microsoftPages(token,`/users/${s.value.mailboxId}/mailFolders/inbox/messages?${query}`)
  for(const message of messages) {const item=replyContext(s,thread,message);if(item)items.push(item)}
 }
 return items
}
