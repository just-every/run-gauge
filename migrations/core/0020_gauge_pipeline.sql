CREATE TABLE g_opportunities (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 client_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.clientId')) STORED NOT NULL REFERENCES g_clients(id),
 owner_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.ownerId')) STORED NOT NULL REFERENCES g_people(id),
 engagement_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.engagementId')) STORED REFERENCES g_engagements(id)
);
CREATE UNIQUE INDEX g_opportunity_engagement ON g_opportunities(engagement_id) WHERE engagement_id IS NOT NULL;
