-- Exact captured scope, finite expiry, person binding and last use are already
-- installed by 0081_gauge_app_key_lifecycle.sql. Preserve its engagement_ids
-- and credential_version columns and all existing credential authority.
SELECT 1;
