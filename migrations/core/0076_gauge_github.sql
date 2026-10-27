-- GitHub repository selections, read-only PR and issue evidence, owner-reviewed milestone effects
-- and approved issue follow-ups. No credential, installation token or repository content is stored.
CREATE TABLE g_githubRepos(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_githubEvidence(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_githubEffects(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_githubFollowups(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
