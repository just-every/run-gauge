-- INVOICE-004: linked credit notes (credit, discount, write-off) and void/reissue corrections.
-- An issued invoice never changes; each correction is its own immutable document once issued.
-- A correction above the owner's GOVERN-001 review limit waits as pending for another owner or finance person.
CREATE TABLE g_credit_sequence (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL CHECK(value>=0));
CREATE TABLE g_invoiceCorrections (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 invoice_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.invoiceId')) STORED NOT NULL REFERENCES g_invoices(id),
 kind TEXT GENERATED ALWAYS AS (json_extract(data,'$.type')) STORED NOT NULL CHECK(kind IN ('credit','discount','write-off','void')),
 status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED NOT NULL CHECK(status IN ('pending','issued','withdrawn')),
 currency TEXT GENERATED ALWAYS AS (json_extract(data,'$.currency')) STORED NOT NULL,
 amount_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.amountMinor')) STORED NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
 number TEXT GENERATED ALWAYS AS (json_extract(data,'$.number')) STORED
);
CREATE UNIQUE INDEX g_credit_number_once ON g_invoiceCorrections(number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX g_invoice_void_once ON g_invoiceCorrections(invoice_id) WHERE kind='void' AND status<>'withdrawn';
CREATE TRIGGER g_issued_correction_immutable BEFORE UPDATE ON g_invoiceCorrections WHEN OLD.status<>'pending' BEGIN SELECT RAISE(ABORT,'immutable_invoice_correction'); END;
CREATE TRIGGER g_no_correction_delete BEFORE DELETE ON g_invoiceCorrections BEGIN SELECT RAISE(ABORT,'immutable_invoice_correction'); END;
-- Issued credits never exceed what the live invoice still owes; a void needs an invoice with no receipts or credits.
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
-- Receipts now count issued credits and stop at a void.
DROP TRIGGER g_payment_allocation;
CREATE TRIGGER g_payment_allocation BEFORE INSERT ON g_payments
WHEN NOT EXISTS(SELECT 1 FROM g_invoices i WHERE i.id=NEW.invoice_id AND i.engagement_id=NEW.engagement_id AND i.currency=NEW.currency AND json_extract(NEW.data,'$.date')>=json_extract(i.data,'$.issueDate')
 AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections v WHERE v.invoice_id=i.id AND v.kind='void' AND v.status='issued')
 AND COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE p.invoice_id=i.id),0)+COALESCE((SELECT SUM(c.amount_minor) FROM g_invoiceCorrections c WHERE c.invoice_id=i.id AND c.kind<>'void' AND c.status='issued'),0)+NEW.amount_minor<=i.total_minor)
BEGIN SELECT RAISE(ABORT,'invalid_invoice_payment'); END;
-- A packet issues once; only an issued void lets one reissue of that exact invoice take the same packet.
DROP INDEX g_invoice_packet_once;
CREATE UNIQUE INDEX g_invoice_packet_once ON g_invoices(packet_id) WHERE json_extract(data,'$.reissueOf') IS NULL;
CREATE UNIQUE INDEX g_invoice_reissue_once ON g_invoices(json_extract(data,'$.reissueOf')) WHERE json_extract(data,'$.reissueOf') IS NOT NULL;
CREATE TRIGGER g_invoice_reissue_requires_void BEFORE INSERT ON g_invoices
WHEN json_extract(NEW.data,'$.reissueOf') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM g_invoiceCorrections v JOIN g_invoices o ON o.id=v.invoice_id WHERE v.invoice_id=json_extract(NEW.data,'$.reissueOf') AND v.kind='void' AND v.status='issued' AND o.packet_id=NEW.packet_id AND o.currency=NEW.currency AND NEW.total_minor<=o.total_minor)
BEGIN SELECT RAISE(ABORT,'reissue_requires_void'); END;
