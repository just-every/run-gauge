CREATE TABLE g_productiveRecords(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX g_productive_namespace ON g_productiveRecords(json_extract(data,'$.namespace'));
