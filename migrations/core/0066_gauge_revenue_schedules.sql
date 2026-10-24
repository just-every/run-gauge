-- Operational inputs approved by people; these are not statutory books.
CREATE TABLE g_revenueSchedules(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id),UNIQUE(engagement_id));
CREATE TABLE g_revenueRecognitions(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),schedule_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.scheduleId')) STORED NOT NULL REFERENCES g_revenueSchedules(id),source_key TEXT GENERATED ALWAYS AS (json_extract(data,'$.sourceKey')) STORED NOT NULL,status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED NOT NULL);
CREATE UNIQUE INDEX g_revenue_source_once ON g_revenueRecognitions(source_key) WHERE status<>'withdrawn';
CREATE TRIGGER g_revenue_schedule_immutable BEFORE UPDATE ON g_revenueSchedules BEGIN SELECT RAISE(ABORT,'immutable_revenue_schedule'); END;
CREATE TRIGGER g_revenue_approved_immutable BEFORE UPDATE ON g_revenueRecognitions WHEN OLD.status='approved' BEGIN SELECT RAISE(ABORT,'immutable_revenue_recognition'); END;
