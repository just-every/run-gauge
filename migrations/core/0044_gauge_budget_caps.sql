-- Approved time remains whole. Exact billing slices reserve only their in-cap quantity.
CREATE TABLE g_timeSlices (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),source_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.sourceId')) STORED NOT NULL REFERENCES g_time(id));
CREATE TABLE g_capWriteDowns (id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),source_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.sourceId')) STORED NOT NULL REFERENCES g_time(id));
CREATE TRIGGER g_immutable_time_slice BEFORE UPDATE ON g_timeSlices BEGIN SELECT RAISE(ABORT,'immutable_time_slice'); END;
CREATE TRIGGER g_no_time_slice_delete BEFORE DELETE ON g_timeSlices BEGIN SELECT RAISE(ABORT,'immutable_time_slice'); END;
CREATE TRIGGER g_sliced_time BEFORE UPDATE ON g_time WHEN EXISTS(SELECT 1 FROM g_timeSlices s JOIN g_billing_sources b ON b.kind='timeSlices' AND b.source_id=s.id WHERE s.source_id=OLD.id) OR EXISTS(SELECT 1 FROM g_capWriteDowns w WHERE w.source_id=OLD.id AND json_extract(w.data,'$.status')='approved') BEGIN SELECT RAISE(ABORT,'capped_billing_dependency'); END;
CREATE TRIGGER g_approved_cap_write_down BEFORE UPDATE ON g_capWriteDowns WHEN json_extract(OLD.data,'$.status')='approved' BEGIN SELECT RAISE(ABORT,'immutable_cap_write_down'); END;
