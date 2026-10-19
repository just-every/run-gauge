CREATE TABLE g_resourceRequests (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED NOT NULL REFERENCES g_engagements(id),
 status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED NOT NULL CHECK(status IN ('open','filled'))
);
CREATE UNIQUE INDEX g_resource_allocation ON g_staffing(json_extract(data,'$.resourceRequestId')) WHERE json_extract(data,'$.resourceRequestId') IS NOT NULL;
CREATE TRIGGER g_filled_resource_request BEFORE UPDATE ON g_resourceRequests WHEN OLD.status='filled' BEGIN SELECT RAISE(ABORT,'immutable_filled_request'); END;
