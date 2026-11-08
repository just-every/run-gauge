-- Business assumptions travel as history; they grant no execution authority.
CREATE TABLE g_cashAssumptions (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL,
 source_key TEXT GENERATED ALWAYS AS (json_extract(data,'$.sourceKey')) STORED NOT NULL,
 UNIQUE(engagement_id,source_key)
);
