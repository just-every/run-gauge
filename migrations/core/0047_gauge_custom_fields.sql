CREATE TABLE g_customFields(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_custom_field_source ON g_customFields(json_extract(data,'$.namespace'),json_extract(data,'$.sourceId')) WHERE json_extract(data,'$.sourceId') IS NOT NULL;
CREATE TABLE g_customImports(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_custom_import_digest ON g_customImports(json_extract(data,'$.digest'));
CREATE TABLE g_savedReports(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
