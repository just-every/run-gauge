-- Business schedules and immutable run receipts travel; execution authority does not.
CREATE TABLE g_retainerSchedules (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), root_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.rootId')) STORED NOT NULL UNIQUE REFERENCES g_retainers(id));
CREATE TABLE g_retainerCharges (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), period_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.periodId')) STORED NOT NULL UNIQUE REFERENCES g_retainerPeriods(id));
CREATE TABLE g_retainerRuns (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), period_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.periodId')) STORED NOT NULL UNIQUE REFERENCES g_retainerPeriods(id));
CREATE TABLE g_retainer_schedule_authority (schedule_id TEXT PRIMARY KEY REFERENCES g_retainerSchedules(id), revision TEXT NOT NULL, operator_id TEXT NOT NULL);
CREATE TRIGGER g_immutable_retainer_charge BEFORE UPDATE ON g_retainerCharges BEGIN SELECT RAISE(ABORT,'immutable_retainer_charge'); END;
CREATE TRIGGER g_no_retainer_charge_delete BEFORE DELETE ON g_retainerCharges BEGIN SELECT RAISE(ABORT,'immutable_retainer_charge'); END;
CREATE TRIGGER g_immutable_retainer_run BEFORE UPDATE ON g_retainerRuns BEGIN SELECT RAISE(ABORT,'immutable_retainer_run'); END;
CREATE TRIGGER g_no_retainer_run_delete BEFORE DELETE ON g_retainerRuns BEGIN SELECT RAISE(ABORT,'immutable_retainer_run'); END;
