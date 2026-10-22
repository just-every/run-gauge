-- Historical source evidence remains distinct from native approval and billing.
CREATE TABLE g_kantataRecords(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX g_kantata_namespace ON g_kantataRecords(json_extract(data,'$.namespace'));
