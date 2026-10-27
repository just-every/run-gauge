-- Installation authority is excluded from business archives.
CREATE TABLE g_scope_review_authority (
 review_id TEXT PRIMARY KEY,
 change_id TEXT NOT NULL UNIQUE,
 recipient_id TEXT NOT NULL,
 contact TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 token_hash TEXT NOT NULL,
 fingerprint TEXT NOT NULL
);
