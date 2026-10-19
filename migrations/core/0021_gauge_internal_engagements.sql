-- Keep existing identities, revisions and JSON bytes while allowing genuinely
-- client-free internal work. Deferred foreign keys retain every dependent row.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE g_engagements_next (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 client_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.clientId')) STORED REFERENCES g_clients(id),
 lead_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.leadId')) STORED NOT NULL REFERENCES g_people(id),
 CHECK((COALESCE(json_extract(data,'$.type'),'client')='client' AND client_id IS NOT NULL)
    OR (COALESCE(json_extract(data,'$.type'),'client')='internal' AND client_id IS NULL))
);
INSERT INTO g_engagements_next(id,revision,data) SELECT id,revision,data FROM g_engagements;
DROP TABLE g_engagements;
ALTER TABLE g_engagements_next RENAME TO g_engagements;
-- SQLite's deferred DROP counter still refers to the old table. Check the
-- resulting relationships explicitly before clearing that counter.
INSERT INTO g_assert(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;
DELETE FROM g_assert;
PRAGMA defer_foreign_keys = OFF;
