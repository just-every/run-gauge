-- SETUP-001: the owner-versioned agency profile (legal business, US billing address, EIN, fiscal year) and the
-- owner-approved, effective-dated exchange-rate table that gates every cross-currency consolidation.
CREATE TABLE g_agencyProfiles (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE g_fxRates (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TRIGGER g_immutable_fx_rate BEFORE UPDATE ON g_fxRates BEGIN SELECT RAISE(ABORT,'immutable_fx_rate'); END;
CREATE TRIGGER g_no_fx_rate_delete BEFORE DELETE ON g_fxRates BEGIN SELECT RAISE(ABORT,'immutable_fx_rate'); END;
