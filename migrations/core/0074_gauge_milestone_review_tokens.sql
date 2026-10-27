-- Existing releases require a fresh owner release before recipient access resumes.
ALTER TABLE g_milestone_review_authority ADD COLUMN token_hash TEXT;
