-- No initial policy: installations remain unlocked until finance sets one.
CREATE TABLE g_timePolicies (
 id TEXT PRIMARY KEY CHECK(id='agency'),
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);

CREATE TABLE g_timeFavorites (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
