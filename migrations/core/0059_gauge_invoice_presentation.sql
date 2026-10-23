-- Finance-versioned document defaults for the agency and each client.
CREATE TABLE g_invoiceSettings (id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_invoice_settings_scope ON g_invoiceSettings(COALESCE(json_extract(data,'$.clientId'),''));
