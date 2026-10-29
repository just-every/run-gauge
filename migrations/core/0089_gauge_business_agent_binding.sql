-- Binding is chosen only by the native granting owner, never by a token email.
ALTER TABLE g_grants ADD COLUMN business_agent_id TEXT;
CREATE UNIQUE INDEX g_grants_business_agent ON g_grants(business_agent_id) WHERE business_agent_id IS NOT NULL;
