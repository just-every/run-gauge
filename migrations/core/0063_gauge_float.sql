CREATE TABLE g_floatRecords(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX g_float_namespace ON g_floatRecords(json_extract(data,'$.namespace'));
