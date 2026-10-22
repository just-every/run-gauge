CREATE TABLE g_providerSyncs(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
-- A restored cursor is readable history, never authority to contact a provider.
CREATE TABLE g_provider_sync_authority(sync_id TEXT PRIMARY KEY,operator_id TEXT NOT NULL);
