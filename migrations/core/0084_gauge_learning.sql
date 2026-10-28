-- Immutable owner-selected backtests are business evidence, with no execution authority.
CREATE TABLE g_learningCohorts (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK (json_valid(data))
);
