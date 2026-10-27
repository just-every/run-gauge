ALTER TABLE g_client_portal_authority ADD COLUMN share_budget INTEGER NOT NULL DEFAULT 0;
ALTER TABLE g_client_portal_authority ADD COLUMN share_burn INTEGER NOT NULL DEFAULT 0;
ALTER TABLE g_client_portal_authority ADD COLUMN share_remaining INTEGER NOT NULL DEFAULT 0;
ALTER TABLE g_client_portal_authority ADD COLUMN share_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE g_client_portal_authority ADD COLUMN share_fields INTEGER NOT NULL DEFAULT 0;
UPDATE g_client_portal_authority SET share_budget=share_money,share_burn=share_money,share_remaining=share_money,share_value=share_money,share_fields=share_money;
