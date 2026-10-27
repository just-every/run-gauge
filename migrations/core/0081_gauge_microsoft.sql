-- Explicit tenant consent observations and exact mailbox selections. Credentials stay in provider custody.
CREATE TABLE g_graphTenants(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_graphSelections(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_graphThreads(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_graphEvidence(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
-- Consent authority never travels in a portable archive.
CREATE TABLE g_graph_authority(selection_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,credential_version INTEGER NOT NULL);
