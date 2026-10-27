-- Native scheduler claims and retry/owned-exception history are business data.
-- Existing installation-only schedule consent remains required after restore.
CREATE TABLE g_retainerJobs(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
