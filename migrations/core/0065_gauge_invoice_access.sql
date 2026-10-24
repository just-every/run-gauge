CREATE TABLE g_invoiceAccess(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_invoiceViews(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
-- Recipient access is installation authority; retained documents and view facts are business history.
CREATE TABLE g_invoice_access_authority(access_id TEXT PRIMARY KEY,revision TEXT NOT NULL,recipient_id TEXT NOT NULL,owner_id TEXT NOT NULL);
