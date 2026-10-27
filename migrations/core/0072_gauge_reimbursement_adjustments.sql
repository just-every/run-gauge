-- Append-only identities for signed reimbursement corrections.
CREATE TABLE g_reimbursement_adjustments(parent_id TEXT NOT NULL,source_id TEXT NOT NULL,handoff_id TEXT NOT NULL UNIQUE,PRIMARY KEY(parent_id,source_id));
