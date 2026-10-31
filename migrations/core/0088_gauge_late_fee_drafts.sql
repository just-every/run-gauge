-- Native late-fee proposals only. They are not invoices, payments or receivables.
CREATE TABLE g_lateFeeDrafts (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 invoice_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.invoiceId')) STORED NOT NULL REFERENCES g_invoices(id),
 period_end TEXT GENERATED ALWAYS AS (json_extract(data,'$.periodEnd')) STORED NOT NULL,
 amount_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.amountMinor')) STORED NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
 CHECK(json_extract(data,'$.status')='awaiting-finance-approval')
);
CREATE UNIQUE INDEX g_late_fee_invoice_period_once ON g_lateFeeDrafts(invoice_id,period_end);
CREATE TRIGGER g_late_fee_draft_immutable BEFORE UPDATE ON g_lateFeeDrafts BEGIN SELECT RAISE(ABORT,'immutable_late_fee_draft'); END;
CREATE TRIGGER g_late_fee_draft_no_delete BEFORE DELETE ON g_lateFeeDrafts BEGIN SELECT RAISE(ABORT,'immutable_late_fee_draft'); END;
