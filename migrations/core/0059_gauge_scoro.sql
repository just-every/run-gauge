-- Source custody is separate from native approval and financial authority.
CREATE TABLE g_scoroRecords(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX g_scoro_namespace ON g_scoroRecords(json_extract(data,'$.namespace'));
