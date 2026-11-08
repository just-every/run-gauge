-- Client role ceilings never confer internal finance authority.
ALTER TABLE g_client_portal_authority ADD COLUMN client_role TEXT NOT NULL DEFAULT 'sponsor' CHECK(client_role IN ('sponsor','collaborator'));
ALTER TABLE g_client_portal_authority ADD COLUMN review_enabled INTEGER NOT NULL DEFAULT 1 CHECK(review_enabled IN (0,1));
