-- Recipient review is installation authority; delivery and decision history remain portable.
CREATE TABLE g_milestone_review_authority (
 review_id TEXT PRIMARY KEY,
 milestone_id TEXT NOT NULL,
 delivery_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
