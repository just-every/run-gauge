CREATE TABLE g_estimates(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_estimate_version ON g_estimates(json_extract(data,'$.rootId'),json_extract(data,'$.number'));
CREATE TABLE g_estimateApprovals(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_estimate_approval ON g_estimateApprovals(json_extract(data,'$.estimateId'));
CREATE TABLE g_estimateConversions(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_estimate_opportunity_conversion ON g_estimateConversions(json_extract(data,'$.opportunityId'));
