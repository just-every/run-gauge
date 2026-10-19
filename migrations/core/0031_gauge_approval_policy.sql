CREATE TABLE g_approvalPolicies (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_grant_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, operator_id TEXT NOT NULL, person_id TEXT, role TEXT NOT NULL, enabled INTEGER NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL);
