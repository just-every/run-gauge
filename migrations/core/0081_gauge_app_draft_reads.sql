-- Preserve existing authority exactly; draft reads require fresh scoped issuance.
CREATE TABLE g_app_keys_with_draft_reads (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, hash TEXT NOT NULL UNIQUE CHECK(length(hash)=64),
 operator_id TEXT NOT NULL, operator_version INTEGER NOT NULL, grant_version INTEGER NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('projects:read','projects:read time:write','projects:read time:read','projects:read time:read time:write')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER,
 expires_at INTEGER NOT NULL DEFAULT 0, person_id TEXT, project_ids TEXT NOT NULL DEFAULT '[]', last_used_at INTEGER
);
INSERT INTO g_app_keys_with_draft_reads
 SELECT id,label,hash,operator_id,operator_version,grant_version,scope,created_by,created_at,revoked_at,expires_at,person_id,project_ids,last_used_at FROM g_app_keys;
DROP TABLE g_app_keys;
ALTER TABLE g_app_keys_with_draft_reads RENAME TO g_app_keys;
