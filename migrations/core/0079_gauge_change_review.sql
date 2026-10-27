-- Installation-only review authority is excluded from business archives.
CREATE TABLE g_change_review_authority (
 review_id TEXT PRIMARY KEY,
 change_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL,
 contact TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 token_hash TEXT NOT NULL
);
