import { type Row, sum } from './model'

// INVOICE-004: an issued invoice never changes. Its standing on a day comes from the immutable corrections issued
// through that day: an issued void removes it (its reissue is a separate, newly numbered invoice), and issued credit
// notes (credit, discount, write-off) reduce what it bills. Pending and withdrawn corrections change nothing.
export interface InvoiceStanding { invoice: Row; voided: Row | null; credits: Row[]; creditedMinor: number; netMinor: number }

export function invoiceStanding(data: Record<string, Row[]>, asOf: string): InvoiceStanding[] {
 const corrections = (data.invoiceCorrections ?? []).filter(c => c.value.status === 'issued' && c.value.date <= asOf)
 return (data.invoices ?? []).filter(i => i.value.issueDate <= asOf).map(invoice => {
  const mine = corrections.filter(c => c.value.invoiceId === invoice.id)
  const voided = mine.find(c => c.value.type === 'void') ?? null, credits = mine.filter(c => c.value.type !== 'void')
  const creditedMinor = sum(credits.map(c => c.value.amountMinor))
  return { invoice, voided, credits, creditedMinor, netMinor: voided ? 0 : invoice.value.totalMinor - creditedMinor }
 })
}

/** Invoices that still bill on the day: issued through it and not voided by then. */
export const liveInvoices = (data: Record<string, Row[]>, asOf: string) => invoiceStanding(data, asOf).filter(s => !s.voided)
