-- Financial observations carry no source text, credential or execution authority.
CREATE TABLE g_analystSnapshots (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id)
);
CREATE TRIGGER g_analyst_snapshot_immutable BEFORE UPDATE ON g_analystSnapshots
BEGIN SELECT RAISE(ABORT,'immutable_analyst_snapshot'); END;
