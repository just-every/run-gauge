-- Agent preparation. An agent grant names no person: it confers no staff, lead or
-- finance authority and may only prepare proposals. A person with the authority the
-- proposal needs approves or declines the exact revision; the effect is written in
-- the same transaction and the decision stays in the proposal and its history.
CREATE TABLE g_grants_next (operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id), person_id TEXT, role TEXT NOT NULL CHECK(role IN ('staff','lead','finance','agent')), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), version INTEGER NOT NULL DEFAULT 1, CHECK((role='agent')=(person_id IS NULL)));
INSERT INTO g_grants_next(operator_id,person_id,role,enabled,version) SELECT operator_id,person_id,role,enabled,version FROM g_grants;
DROP TABLE g_grants;
ALTER TABLE g_grants_next RENAME TO g_grants;
CREATE TABLE g_proposals (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id), kind TEXT GENERATED ALWAYS AS (json_extract(data,'$.kind')) STORED NOT NULL CHECK(kind IN ('time','staffing','billing','change-order')), status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED NOT NULL CHECK(status IN ('proposed','approved','declined','withdrawn')));
CREATE TRIGGER g_decided_proposal BEFORE UPDATE ON g_proposals WHEN OLD.status<>'proposed' BEGIN SELECT RAISE(ABORT,'immutable_proposal'); END;
