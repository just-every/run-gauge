CREATE TABLE g_periodMatches (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),invoice_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.invoiceId')) STORED NOT NULL UNIQUE REFERENCES g_invoices(id),external_identity TEXT GENERATED ALWAYS AS (json_extract(data,'$.externalIdentity')) STORED NOT NULL UNIQUE);
CREATE TABLE g_periodCloseDrafts (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_periodCloses (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_periodReopenRequests (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_periodReopens (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),close_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.closeId')) STORED NOT NULL UNIQUE REFERENCES g_periodCloses(id));
CREATE TRIGGER g_immutable_agency_close BEFORE UPDATE ON g_periodCloses BEGIN SELECT RAISE(ABORT,'immutable_agency_close'); END;
CREATE TRIGGER g_no_agency_close_delete BEFORE DELETE ON g_periodCloses BEGIN SELECT RAISE(ABORT,'immutable_agency_close'); END;
CREATE TRIGGER g_immutable_agency_reopen BEFORE UPDATE ON g_periodReopens BEGIN SELECT RAISE(ABORT,'immutable_agency_reopen'); END;
