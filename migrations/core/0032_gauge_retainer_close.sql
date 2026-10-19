CREATE TABLE g_retainerCloses (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 period_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.periodId')) STORED UNIQUE
);
CREATE TABLE g_retainerAdjustments (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE UNIQUE INDEX g_retainer_late_once ON g_retainerAdjustments(json_extract(data,'$.sourceId'))
 WHERE json_extract(data,'$.kind')='late' AND json_extract(data,'$.status')!='cancelled';
