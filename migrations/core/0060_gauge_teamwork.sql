CREATE TABLE g_teamworkRecords(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX g_teamwork_namespace ON g_teamworkRecords(json_extract(data,'$.namespace'));
