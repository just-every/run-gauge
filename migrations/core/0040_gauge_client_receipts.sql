-- INVOICE-006: client receipts (money received, one unique external reference each), their exact allocations
-- to one or more of the client's invoices, and finance-recorded invoice disputes.
-- A receipt never changes. An allocation is an ordinary g_payments row that names its receipt; what is not
-- allocated is the receipt's unapplied balance. Nothing here is bank or processor verified.
CREATE TABLE g_clientReceipts (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 client_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.clientId')) STORED NOT NULL REFERENCES g_clients(id),
 currency TEXT GENERATED ALWAYS AS (json_extract(data,'$.currency')) STORED NOT NULL,
 amount_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.amountMinor')) STORED NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
 reference TEXT GENERATED ALWAYS AS (json_extract(data,'$.reference')) STORED NOT NULL
);
CREATE UNIQUE INDEX g_client_receipt_reference_once ON g_clientReceipts(reference);
CREATE TRIGGER g_immutable_client_receipt BEFORE UPDATE ON g_clientReceipts BEGIN SELECT RAISE(ABORT,'immutable_client_receipt'); END;
CREATE TRIGGER g_no_client_receipt_delete BEFORE DELETE ON g_clientReceipts BEGIN SELECT RAISE(ABORT,'immutable_client_receipt'); END;
-- An allocation names a receipt of the same client and currency, is dated on or after both the receipt and
-- the invoice, and the receipt's allocations never exceed its amount.
CREATE TRIGGER g_receipt_allocation BEFORE INSERT ON g_payments
WHEN json_extract(NEW.data,'$.receiptId') IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM g_clientReceipts r JOIN g_invoices i ON i.id=NEW.invoice_id
 WHERE r.id=json_extract(NEW.data,'$.receiptId') AND r.client_id=i.client_id AND r.currency=NEW.currency
 AND r.reference=NEW.reference AND json_extract(r.data,'$.date')<=json_extract(NEW.data,'$.date')
 AND COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE json_extract(p.data,'$.receiptId')=r.id),0)+NEW.amount_minor<=r.amount_minor)
BEGIN SELECT RAISE(ABORT,'invalid_receipt_allocation'); END;

CREATE TABLE g_invoiceDisputes (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 invoice_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.invoiceId')) STORED NOT NULL REFERENCES g_invoices(id),
 status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED NOT NULL CHECK(status IN ('open','resolved')),
 amount_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.amountMinor')) STORED NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0)
);
-- One open dispute per invoice; a resolved dispute never reopens.
CREATE UNIQUE INDEX g_invoice_dispute_open_once ON g_invoiceDisputes(invoice_id) WHERE status='open';
CREATE TRIGGER g_resolved_dispute_immutable BEFORE UPDATE ON g_invoiceDisputes WHEN OLD.status<>'open' BEGIN SELECT RAISE(ABORT,'immutable_invoice_dispute'); END;
CREATE TRIGGER g_no_dispute_delete BEFORE DELETE ON g_invoiceDisputes BEGIN SELECT RAISE(ABORT,'immutable_invoice_dispute'); END;
