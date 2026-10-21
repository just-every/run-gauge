-- Legacy agent grants had no purpose or engagement scope: they cannot retain authority.
ALTER TABLE g_grants ADD COLUMN purpose TEXT;
ALTER TABLE g_grants ADD COLUMN engagement_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE g_grants ADD COLUMN granted_by TEXT;
UPDATE g_grants SET enabled=0,version=version+1 WHERE role='agent';
