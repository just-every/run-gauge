CREATE TABLE g_operationalCases(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_caseEvents(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX g_case_events_case ON g_caseEvents(json_extract(data,'$.caseId'));
CREATE UNIQUE INDEX g_case_attempt_job ON g_caseEvents(json_extract(data,'$.caseId'),json_extract(data,'$.jobId')) WHERE json_extract(data,'$.type')='attempt';
