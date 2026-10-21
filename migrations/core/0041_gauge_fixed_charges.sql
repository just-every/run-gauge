-- INVOICE-002: percentage billing sources are separate from delivery milestones.
CREATE TABLE g_fixedCharges (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id),
 status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED NOT NULL CHECK(status IN ('draft','approved','withdrawn'))
);
CREATE INDEX g_fixed_charges_engagement_status ON g_fixedCharges(engagement_id,status);
CREATE TRIGGER g_approved_fixed_charge BEFORE UPDATE ON g_fixedCharges WHEN OLD.status='approved'
BEGIN SELECT RAISE(ABORT,'immutable_fixed_charge'); END;
CREATE TRIGGER g_no_approved_fixed_charge_delete BEFORE DELETE ON g_fixedCharges WHEN OLD.status='approved'
BEGIN SELECT RAISE(ABORT,'immutable_fixed_charge'); END;
