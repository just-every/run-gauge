-- Native, user-recorded vendor costs. These records grant no provider authority.
CREATE TABLE g_vendorCommitments (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE g_vendorBills (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE g_vendor_files (
 id TEXT PRIMARY KEY,
 bill_id TEXT NOT NULL REFERENCES g_vendorBills(id),
 name TEXT NOT NULL,
 media_type TEXT NOT NULL,
 bytes BLOB NOT NULL,
 size INTEGER NOT NULL
);
CREATE TABLE g_vendor_matches (
 bill_id TEXT PRIMARY KEY REFERENCES g_vendorBills(id),
 commitment_id TEXT NOT NULL REFERENCES g_vendorCommitments(id),
 commitment_revision TEXT NOT NULL
);
