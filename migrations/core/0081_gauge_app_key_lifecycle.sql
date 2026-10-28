-- Existing credentials expire closed; fresh issuance captures exact project authority.
ALTER TABLE g_app_keys ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE g_app_keys ADD COLUMN engagement_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE g_app_keys ADD COLUMN person_id TEXT;
ALTER TABLE g_app_keys ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE g_app_keys ADD COLUMN last_used_at INTEGER;
