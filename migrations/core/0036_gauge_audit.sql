-- GOVERN-005 business audit: one append-only row per native record write, grant change, API key event,
-- packet export, agency setup and import effect, in commit order. hash seals each row into one SHA-256
-- chain (see src/gauge/audit.ts); it is filled when the next command or audit read seals pending rows.
CREATE TABLE g_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, role TEXT, person_id TEXT, request_key TEXT, action TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, previous_revision TEXT, revision TEXT, data TEXT NOT NULL CHECK(json_valid(data)), reference TEXT, hash TEXT CHECK(hash IS NULL OR length(hash)=64));
CREATE INDEX g_audit_record ON g_audit(kind, record_id, seq);
CREATE INDEX g_audit_pending ON g_audit(seq) WHERE hash IS NULL;
-- An import effect enters the audit once per direction (apply, undo), however many sweeps see it.
CREATE UNIQUE INDEX g_audit_reference ON g_audit(action, reference) WHERE reference IS NOT NULL;
