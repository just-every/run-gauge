CREATE TABLE g_commercialProposals(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_commercial_proposal_version ON g_commercialProposals(json_extract(data,'$.rootId'),json_extract(data,'$.number'));
CREATE TABLE g_commercialEvents(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_commercial_proposal_decision ON g_commercialEvents(json_extract(data,'$.proposalId')) WHERE json_extract(data,'$.type') IN ('accepted','rejected');
CREATE UNIQUE INDEX g_commercial_proposal_delivery ON g_commercialEvents(json_extract(data,'$.proposalId')) WHERE json_extract(data,'$.type')='delivery';
-- Access is installation authority and never travels in a business archive.
CREATE TABLE g_commercial_proposal_authority(proposal_id TEXT PRIMARY KEY,revision TEXT NOT NULL,recipient_id TEXT NOT NULL,owner_id TEXT NOT NULL);
