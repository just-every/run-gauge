-- Preserve the currency actually held by existing installations. Empty installs
-- use USD; no amounts, approved artifacts or record revisions are rewritten.
CREATE TABLE g_agency (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 currency TEXT NOT NULL,
 timezone TEXT NOT NULL
);
INSERT INTO g_agency(singleton,currency,timezone)
SELECT 1,
 COALESCE((SELECT json_extract(data,'$.currency') FROM g_engagements WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1),
  (SELECT json_extract(data,'$.currency') FROM g_budgets WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1),
  (SELECT json_extract(data,'$.currency') FROM g_rates WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1),
  (SELECT json_extract(data,'$.currency') FROM g_expenses WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1),
  (SELECT json_extract(data,'$.currency') FROM g_packets WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1),
  (SELECT json_extract(data,'$.economics.currency') FROM g_time WHERE json_extract(data,'$.economics.currency') IS NOT NULL LIMIT 1),'USD'),
 COALESCE((SELECT json_extract(data,'$.timezone') FROM g_engagements LIMIT 1),
          (SELECT json_extract(data,'$.timezone') FROM g_people LIMIT 1),'America/Los_Angeles')
WHERE EXISTS(SELECT 1 FROM oa_first_run) OR EXISTS(SELECT json_extract(data,'$.currency') FROM g_engagements WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1) OR
 EXISTS(SELECT json_extract(data,'$.currency') FROM g_budgets WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1) OR
 EXISTS(SELECT json_extract(data,'$.currency') FROM g_rates WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1) OR
 EXISTS(SELECT json_extract(data,'$.currency') FROM g_expenses WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1) OR
 EXISTS(SELECT json_extract(data,'$.currency') FROM g_packets WHERE json_extract(data,'$.currency') IS NOT NULL LIMIT 1) OR
 EXISTS(SELECT json_extract(data,'$.economics.currency') FROM g_time WHERE json_extract(data,'$.economics.currency') IS NOT NULL LIMIT 1);
