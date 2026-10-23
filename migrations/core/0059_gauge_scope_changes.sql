-- SALES-005: immutable scope-change versions and the append-only review and client-decision events beside them.
CREATE TABLE g_scopeChanges (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_scopeEvents (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TRIGGER g_immutable_scope_change BEFORE UPDATE ON g_scopeChanges BEGIN SELECT RAISE(ABORT,'immutable_scope_change'); END;
CREATE TRIGGER g_no_scope_change_delete BEFORE DELETE ON g_scopeChanges BEGIN SELECT RAISE(ABORT,'immutable_scope_change'); END;
CREATE TRIGGER g_immutable_scope_event BEFORE UPDATE ON g_scopeEvents BEGIN SELECT RAISE(ABORT,'immutable_scope_event'); END;
CREATE TRIGGER g_no_scope_event_delete BEFORE DELETE ON g_scopeEvents BEGIN SELECT RAISE(ABORT,'immutable_scope_event'); END;
