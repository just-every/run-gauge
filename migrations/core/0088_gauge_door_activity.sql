-- Native activity retains the preparer and sponsor without changing sealed audit history.
CREATE TABLE g_door_activity (
 audit_seq INTEGER PRIMARY KEY REFERENCES g_audit(seq),
 operation_id TEXT NOT NULL,
 attribution TEXT NOT NULL,
 approvers TEXT NOT NULL
);
