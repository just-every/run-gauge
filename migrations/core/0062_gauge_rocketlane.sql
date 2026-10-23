CREATE TABLE g_rocketlaneRecords(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX g_rocketlane_namespace ON g_rocketlaneRecords(json_extract(data,'$.namespace'));
-- A source-comparison receipt never grants native/provider cutover authority.
CREATE TABLE g_rocketlaneCutovers(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),request_key TEXT NOT NULL UNIQUE);
