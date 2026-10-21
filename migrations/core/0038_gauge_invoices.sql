-- Native pre-tax invoice issuance and finance-recorded bank receipts.
-- No sending, tax calculation or accounting/processor verification is implied.
CREATE TABLE g_invoice_sequence (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL CHECK(value>=0));
INSERT INTO g_invoice_sequence(id,value) VALUES(1,0);
CREATE TABLE g_invoices (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 packet_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.packetId')) STORED NOT NULL REFERENCES g_packets(id),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id),
 client_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.clientId')) STORED NOT NULL REFERENCES g_clients(id),
 number TEXT GENERATED ALWAYS AS (json_extract(data,'$.number')) STORED NOT NULL,
 currency TEXT GENERATED ALWAYS AS (json_extract(data,'$.currency')) STORED NOT NULL,
 total_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.totalMinor')) STORED NOT NULL CHECK(typeof(total_minor)='integer' AND total_minor>0)
);
CREATE UNIQUE INDEX g_invoice_packet_once ON g_invoices(packet_id);
CREATE UNIQUE INDEX g_invoice_number_once ON g_invoices(number);
CREATE TABLE g_payments (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 invoice_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.invoiceId')) STORED NOT NULL REFERENCES g_invoices(id),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id),
 currency TEXT GENERATED ALWAYS AS (json_extract(data,'$.currency')) STORED NOT NULL,
 amount_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.amountMinor')) STORED NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
 reference TEXT GENERATED ALWAYS AS (json_extract(data,'$.reference')) STORED NOT NULL
);
CREATE UNIQUE INDEX g_payment_receipt_once ON g_payments(invoice_id,reference);
CREATE TRIGGER g_immutable_invoice BEFORE UPDATE ON g_invoices BEGIN SELECT RAISE(ABORT,'immutable_invoice'); END;
CREATE TRIGGER g_no_invoice_delete BEFORE DELETE ON g_invoices BEGIN SELECT RAISE(ABORT,'immutable_invoice'); END;
CREATE TRIGGER g_immutable_payment BEFORE UPDATE ON g_payments BEGIN SELECT RAISE(ABORT,'immutable_payment'); END;
CREATE TRIGGER g_no_payment_delete BEFORE DELETE ON g_payments BEGIN SELECT RAISE(ABORT,'immutable_payment'); END;
CREATE TRIGGER g_payment_allocation BEFORE INSERT ON g_payments
WHEN NOT EXISTS(SELECT 1 FROM g_invoices i WHERE i.id=NEW.invoice_id AND i.engagement_id=NEW.engagement_id AND i.currency=NEW.currency AND json_extract(NEW.data,'$.date')>=json_extract(i.data,'$.issueDate') AND COALESCE((SELECT SUM(p.amount_minor) FROM g_payments p WHERE p.invoice_id=i.id),0)+NEW.amount_minor<=i.total_minor)
BEGIN SELECT RAISE(ABORT,'invalid_invoice_payment'); END;
-- Corrections to an issued document need a credit-note flow, not a new
-- preparation packet that leaves the immutable receivable unchanged.
CREATE TRIGGER g_issued_packet_correction BEFORE INSERT ON g_packets
WHEN NEW.status<>'cancelled' AND EXISTS(SELECT 1 FROM g_invoices WHERE packet_id=json_extract(NEW.data,'$.correctsPacketId'))
BEGIN SELECT RAISE(ABORT,'issued_invoice_requires_credit'); END;
CREATE TRIGGER g_issued_packet_correction_update BEFORE UPDATE ON g_packets
WHEN NEW.status<>'cancelled' AND EXISTS(SELECT 1 FROM g_invoices WHERE packet_id=json_extract(NEW.data,'$.correctsPacketId'))
BEGIN SELECT RAISE(ABORT,'issued_invoice_requires_credit'); END;
