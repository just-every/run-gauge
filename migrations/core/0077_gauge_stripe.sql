-- Stripe business evidence is portable; consent and external mutation claims are installation-only.
CREATE TABLE g_paymentLinks(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_processorPayments(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_stripe_intent_once ON g_processorPayments(json_extract(data,'$.connectionId'),json_extract(data,'$.paymentIntentId'));
CREATE TABLE g_processorEvents(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_stripe_event_once ON g_processorEvents(json_extract(data,'$.connectionId'),json_extract(data,'$.eventId')) WHERE json_extract(data,'$.eventId') IS NOT NULL;
CREATE TABLE g_stripeAccounts(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_stripe_account_connection ON g_stripeAccounts(json_extract(data,'$.connectionId'));
CREATE TABLE g_stripe_authority(link_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,connection_id TEXT NOT NULL,credential_version INTEGER NOT NULL);
CREATE TABLE g_stripe_claims(key TEXT PRIMARY KEY,actor TEXT NOT NULL,digest TEXT NOT NULL,kind TEXT NOT NULL,record_id TEXT NOT NULL,at INTEGER NOT NULL);
-- Allow dated Stripe reversal entries. Existing receipts and generated columns retain their exact bytes.
DROP TRIGGER g_immutable_payment;
DROP TRIGGER g_no_payment_delete;
DROP TRIGGER g_payment_allocation;
DROP TRIGGER g_receipt_allocation;
DROP TRIGGER g_correction_issue;
DROP TRIGGER g_correction_approve;
CREATE TABLE g_payments_stripe (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 invoice_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.invoiceId')) STORED NOT NULL REFERENCES g_invoices(id),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id),
 currency TEXT GENERATED ALWAYS AS (json_extract(data,'$.currency')) STORED NOT NULL,
 amount_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.amountMinor')) STORED NOT NULL CHECK(typeof(amount_minor)='integer' AND (amount_minor>0 OR (amount_minor<=0 AND json_extract(data,'$.source')='stripe' AND json_extract(data,'$.processorPaymentId') IS NOT NULL))),
 reference TEXT GENERATED ALWAYS AS (json_extract(data,'$.reference')) STORED NOT NULL
);
INSERT INTO g_payments_stripe(id,revision,data) SELECT id,revision,data FROM g_payments;
DROP TABLE g_payments;
ALTER TABLE g_payments_stripe RENAME TO g_payments;
CREATE UNIQUE INDEX g_payment_receipt_once ON g_payments(invoice_id,reference);
CREATE INDEX g_stripe_allocation_entries ON g_payments(json_extract(data,'$.processorPaymentId')) WHERE json_extract(data,'$.source')='stripe';
CREATE TRIGGER g_immutable_payment BEFORE UPDATE ON g_payments BEGIN SELECT RAISE(ABORT,'immutable_payment'); END;
CREATE TRIGGER g_no_payment_delete BEFORE DELETE ON g_payments BEGIN SELECT RAISE(ABORT,'immutable_payment'); END;
CREATE TRIGGER g_stripe_allocation_insert BEFORE INSERT ON g_payments
WHEN json_extract(NEW.data,'$.source')='stripe' AND NOT EXISTS(
 SELECT 1 FROM g_processorPayments p WHERE p.id=json_extract(NEW.data,'$.processorPaymentId')
 AND json_extract(p.data,'$.invoiceId')=NEW.invoice_id AND json_extract(p.data,'$.currency')=NEW.currency
 AND json_extract(p.data,'$.allocatedMinor')=COALESCE((SELECT SUM(prior.amount_minor) FROM g_payments prior WHERE json_extract(prior.data,'$.processorPaymentId')=p.id),0)+NEW.amount_minor)
BEGIN SELECT RAISE(ABORT,'invalid_stripe_allocation'); END;
CREATE TRIGGER g_correction_issue BEFORE INSERT ON g_invoiceCorrections WHEN NEW.status='issued' AND NOT EXISTS(SELECT 1 FROM g_invoices i WHERE i.id=NEW.invoice_id AND i.currency=NEW.currency
 AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections v WHERE v.invoice_id=i.id AND v.kind='void' AND v.status='issued')
 AND CASE WHEN NEW.kind='void' THEN NEW.amount_minor=i.total_minor AND NOT EXISTS(SELECT 1 FROM g_payments p WHERE p.invoice_id=i.id) AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections c WHERE c.invoice_id=i.id AND c.kind<>'void' AND c.status='issued')
  ELSE COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE p.invoice_id=i.id),0)+COALESCE((SELECT SUM(c.amount_minor) FROM g_invoiceCorrections c WHERE c.invoice_id=i.id AND c.kind<>'void' AND c.status='issued'),0)+NEW.amount_minor<=i.total_minor END)
BEGIN SELECT RAISE(ABORT,'invalid_invoice_correction'); END;
CREATE TRIGGER g_correction_approve BEFORE UPDATE ON g_invoiceCorrections WHEN NEW.status='issued' AND NOT EXISTS(SELECT 1 FROM g_invoices i WHERE i.id=NEW.invoice_id AND i.currency=NEW.currency
 AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections v WHERE v.invoice_id=i.id AND v.kind='void' AND v.status='issued')
 AND CASE WHEN NEW.kind='void' THEN NEW.amount_minor=i.total_minor AND NOT EXISTS(SELECT 1 FROM g_payments p WHERE p.invoice_id=i.id) AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections c WHERE c.invoice_id=i.id AND c.kind<>'void' AND c.status='issued')
  ELSE COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE p.invoice_id=i.id),0)+COALESCE((SELECT SUM(c.amount_minor) FROM g_invoiceCorrections c WHERE c.invoice_id=i.id AND c.kind<>'void' AND c.status='issued'),0)+NEW.amount_minor<=i.total_minor END)
BEGIN SELECT RAISE(ABORT,'invalid_invoice_correction'); END;
CREATE TRIGGER g_payment_allocation BEFORE INSERT ON g_payments
WHEN NOT EXISTS(SELECT 1 FROM g_invoices i WHERE i.id=NEW.invoice_id AND i.engagement_id=NEW.engagement_id AND i.currency=NEW.currency AND json_extract(NEW.data,'$.date')>=json_extract(i.data,'$.issueDate')
 AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections v WHERE v.invoice_id=i.id AND v.kind='void' AND v.status='issued')
 AND COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE p.invoice_id=i.id),0)+NEW.amount_minor>=0
 AND COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE p.invoice_id=i.id),0)+COALESCE((SELECT SUM(c.amount_minor) FROM g_invoiceCorrections c WHERE c.invoice_id=i.id AND c.kind<>'void' AND c.status='issued'),0)+NEW.amount_minor<=i.total_minor)
BEGIN SELECT RAISE(ABORT,'invalid_invoice_payment'); END;
CREATE TRIGGER g_receipt_allocation BEFORE INSERT ON g_payments
WHEN json_extract(NEW.data,'$.receiptId') IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM g_clientReceipts r JOIN g_invoices i ON i.id=NEW.invoice_id
 WHERE r.id=json_extract(NEW.data,'$.receiptId') AND r.client_id=i.client_id AND r.currency=NEW.currency
 AND r.reference=NEW.reference AND json_extract(r.data,'$.date')<=json_extract(NEW.data,'$.date')
 AND COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE json_extract(p.data,'$.receiptId')=r.id),0)+NEW.amount_minor<=r.amount_minor)
BEGIN SELECT RAISE(ABORT,'invalid_receipt_allocation'); END;
