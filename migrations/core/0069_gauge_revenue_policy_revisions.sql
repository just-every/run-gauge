-- Policy references can change; recognition terms and approved journal facts cannot.
DROP TRIGGER g_revenue_schedule_immutable;
CREATE TRIGGER g_revenue_schedule_terms_immutable BEFORE UPDATE ON g_revenueSchedules
WHEN json_remove(NEW.data,'$.policy','$.accountant','$.reason','$.recordedBy','$.recordedAt')
 <> json_remove(OLD.data,'$.policy','$.accountant','$.reason','$.recordedBy','$.recordedAt')
BEGIN SELECT RAISE(ABORT,'immutable_revenue_schedule_terms'); END;
