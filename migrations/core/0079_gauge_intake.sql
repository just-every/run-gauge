CREATE TABLE g_intakeRequests (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_intake_files (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES g_intakeRequests(id), submission_id TEXT NOT NULL, name TEXT NOT NULL, digest TEXT NOT NULL, bytes BLOB NOT NULL);
