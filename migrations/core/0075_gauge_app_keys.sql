-- App credentials are installation authority and never enter portable archives.
CREATE TABLE g_app_keys (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, hash TEXT NOT NULL UNIQUE CHECK(length(hash)=64),
 operator_id TEXT NOT NULL, operator_version INTEGER NOT NULL, grant_version INTEGER NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('projects:read','projects:read time:write')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER
);
