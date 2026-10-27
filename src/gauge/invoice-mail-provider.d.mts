import type { MailMessage, MailSender } from '../modules/operator-auth/index.mjs'

export type InvoiceMailProvider = 'resend' | 'sendgrid'
export type InvoiceMailStatus = 'accepted' | 'delivered' | 'bounced' | 'failed' | 'unknown'
export type InvoiceMailException = 'invalid-input' | 'authorization-expired' | 'scope-or-plan-missing' | 'rate-limited' | 'not-found' | 'readback-unavailable' | 'unreadable-evidence' | 'evidence-too-large' | 'unsafe-evidence' | 'readback-timeout' | 'verification-page-limit' | 'sender-unconfirmed' | 'message-mismatch' | 'correlation-unavailable' | 'message-not-found' | 'message-ambiguous' | 'unrecognized-provider-state'
export type InvoiceMailMessage = Omit<MailMessage, 'text' | 'html' | 'headers'> & {
 text?: string
 html?: string
 headers?: Record<string, string>
 attachments?: {filename: string; contentType: string; content: Uint8Array; disposition?: 'attachment' | 'inline'; contentId?: string}[]
 cc?: string[]
 bcc?: string[]
 replyTo?: string
 customArgs?: Record<string, string>
}
export interface InvoiceMailSender {send(message: InvoiceMailMessage): ReturnType<MailSender['send']>}
export interface InvoiceSenderEvidence {
 provider: InvoiceMailProvider | null
 verified: boolean
 kind: 'address' | 'domain' | 'unconfirmed'
 sender?: string
 domain?: string
 exception?: InvoiceMailException
}
export interface InvoiceMailEvidence {
 provider: InvoiceMailProvider | null
 status: InvoiceMailStatus
 providerMessageId: string | null
 submittedMessageId?: string
 recipient?: string
 subject?: string
 deliveryId?: string
 correlated: boolean
 exception?: InvoiceMailException
}
export function invoiceMail(credential: string, provider: InvoiceMailProvider): InvoiceMailSender
export function verifyInvoiceSender(credential: string, provider: InvoiceMailProvider, from: string): Promise<InvoiceSenderEvidence>
export function readInvoiceMail(credential: string, provider: InvoiceMailProvider, id: string, to: string, deliveryId: string, expectedSubject?: string): Promise<InvoiceMailEvidence>
