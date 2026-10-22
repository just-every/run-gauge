CREATE TABLE g_kantataAdoptions(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE UNIQUE INDEX g_kantata_active_adoption ON g_kantataAdoptions(json_extract(data,'$.namespace')) WHERE json_extract(data,'$.status')<>'undone';
