-- Read cost must not grow with history. These indexes let the hourly cron, the owner's pages and the keyed
-- utilization read touch only the rows they need: one custom-field history, one retainer's terms, one date window.
CREATE INDEX IF NOT EXISTS g_history_kind_record ON g_history(kind, record_id);
CREATE INDEX IF NOT EXISTS g_retainers_root ON g_retainers(json_extract(data,'$.rootId'));
CREATE INDEX IF NOT EXISTS g_time_work_date ON g_time(json_extract(data,'$.workDate'));
CREATE INDEX IF NOT EXISTS g_leave_to ON g_leave(json_extract(data,'$.to'));
CREATE INDEX IF NOT EXISTS g_staffing_to ON g_staffing(json_extract(data,'$.to'));
