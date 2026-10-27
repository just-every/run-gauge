-- Existing unbounded credentials require fresh owner review and issuance.
ALTER TABLE g_app_keys ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE g_app_keys ADD COLUMN person_id TEXT;
ALTER TABLE g_app_keys ADD COLUMN project_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE g_app_keys ADD COLUMN last_used_at INTEGER;
