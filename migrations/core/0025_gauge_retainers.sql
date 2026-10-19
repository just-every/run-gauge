CREATE TABLE g_agencyCalendars (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_retainers (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_retainerPeriods (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 root_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.rootId')) STORED,
 period_start TEXT GENERATED ALWAYS AS (json_extract(data,'$.periodStart')) STORED,
 UNIQUE(root_id,period_start)
);
