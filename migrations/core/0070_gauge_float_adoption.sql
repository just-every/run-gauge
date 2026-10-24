CREATE TABLE g_floatAdoptions(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_float_native_account ON g_floatAdoptions(json_extract(data,'$.namespace'));
