-- Immutable unit prices and once-only employee reimbursement reservations.
CREATE TABLE g_expenseRates(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_expense_reimbursements(expense_id TEXT PRIMARY KEY,source_revision TEXT NOT NULL,handoff_id TEXT NOT NULL);
