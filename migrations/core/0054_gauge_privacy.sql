-- Owner policies and bounded erasure receipts are business history, not authority.
CREATE TABLE g_retentionPolicies(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_privacyExits(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_privacy_exit_person ON g_privacyExits(json_extract(data,'$.personId'));
CREATE TABLE g_privacyErasures(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
