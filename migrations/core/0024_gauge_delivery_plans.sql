-- Baselines are append-only; source date edits retain ordinary revision history.
CREATE TABLE g_deliveryPlans (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
