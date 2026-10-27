-- Existing unsigned review authority is deliberately invalid until freshly issued.
ALTER TABLE g_change_review_authority ADD COLUMN owner_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE g_change_review_authority ADD COLUMN recipient_version INTEGER NOT NULL DEFAULT 0;
