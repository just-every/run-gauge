-- A read-only accountant grant carries no finance write authority.
CREATE TABLE g_grants_next(operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),person_id TEXT,role TEXT NOT NULL CHECK(role IN ('staff','lead','finance','agent','accountant')),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),version INTEGER NOT NULL DEFAULT 1,purpose TEXT,engagement_ids TEXT NOT NULL DEFAULT '[]',granted_by TEXT,CHECK((role='agent')=(person_id IS NULL)));
INSERT INTO g_grants_next SELECT operator_id,person_id,role,enabled,version,purpose,engagement_ids,granted_by FROM g_grants;
DROP TABLE g_grants;
ALTER TABLE g_grants_next RENAME TO g_grants;
