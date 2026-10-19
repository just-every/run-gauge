CREATE TABLE g_deliveryTemplates (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 root_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.rootId')) STORED,
 number INTEGER GENERATED ALWAYS AS (json_extract(data,'$.number')) STORED,
 UNIQUE(root_id,number)
);
