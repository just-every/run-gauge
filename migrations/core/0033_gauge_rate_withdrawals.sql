CREATE TABLE g_rateWithdrawals (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_rate_withdrawal_once ON g_rateWithdrawals(json_extract(data,'$.rateId'));
CREATE TRIGGER g_immutable_rate_withdrawal BEFORE UPDATE ON g_rateWithdrawals BEGIN SELECT RAISE(ABORT,'immutable_rate_withdrawal'); END;
