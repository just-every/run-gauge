CREATE TABLE g_providerConnections(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_providerUses(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_providerJobs(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
-- Installation authority and encrypted material never travel in portable archives.
CREATE TABLE g_provider_installation_key(id INTEGER PRIMARY KEY CHECK(id=1),key TEXT NOT NULL);
CREATE TABLE g_provider_credentials(connection_id TEXT NOT NULL,version INTEGER NOT NULL,ciphertext TEXT NOT NULL,iv TEXT NOT NULL,PRIMARY KEY(connection_id,version));
CREATE TABLE g_provider_receipts(key TEXT PRIMARY KEY,actor TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL);
CREATE TABLE g_provider_job_authority(job_id TEXT PRIMARY KEY,operator_id TEXT NOT NULL);
