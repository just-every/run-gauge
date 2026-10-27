-- Installation-local recipient authority is deliberately absent from business archives.
CREATE TABLE g_client_portal_authority (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, engagement_id TEXT NOT NULL,
 client_id TEXT NOT NULL, recipient_id TEXT NOT NULL, contact TEXT NOT NULL,
 owner_id TEXT NOT NULL, expires_at INTEGER NOT NULL, share_money INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX g_client_portal_recipient ON g_client_portal_authority(recipient_id);
