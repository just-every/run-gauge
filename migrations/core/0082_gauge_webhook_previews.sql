-- Preview bindings are installation authority. Exact payload bytes are derived, never stored.
CREATE TABLE g_webhook_previews (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL, owner_id TEXT NOT NULL, owner_version INTEGER NOT NULL, connection_id TEXT NOT NULL,
 credential_version INTEGER NOT NULL, source_ref TEXT NOT NULL, event_type TEXT,
 payload_digest TEXT NOT NULL, expires_at INTEGER NOT NULL
);
