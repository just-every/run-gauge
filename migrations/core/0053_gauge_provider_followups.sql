-- Owner-reviewed workflow requests are business history. Their provider job's
-- installation-only authority remains necessary; restore cannot apply them.
CREATE TABLE g_providerFollowups(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
