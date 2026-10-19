-- CONNECT-020 slice: owner-created, read-only utilization keys. Only each key's SHA-256 is stored.
-- g_api_keys is installation authority: export leaves it out, so a restored installation holds no key.
CREATE TABLE g_api_keys (id TEXT PRIMARY KEY, label TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope='utilization:read'), hash TEXT NOT NULL UNIQUE CHECK(length(hash)=64), created_by TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_by TEXT, revoked_at INTEGER, last_used_at INTEGER);
-- Every create, revoke and keyed read; rows outlive their key and travel with the audit history.
CREATE TABLE g_api_key_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id TEXT NOT NULL, label TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('create','revoke','read')), actor TEXT NOT NULL, detail TEXT NOT NULL CHECK(json_valid(detail)), at INTEGER NOT NULL);
