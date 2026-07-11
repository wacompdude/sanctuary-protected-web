-- Grant table access to Supabase API roles.
-- Without these, signed-in users (authenticated role) get "permission denied"
-- while anonymous queries may still appear to work.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON churches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON incidents TO authenticated;
GRANT SELECT, INSERT ON incident_updates TO authenticated;
GRANT SELECT ON profiles TO authenticated;

-- Enums used by incidents tables
GRANT USAGE ON TYPE incident_type TO anon, authenticated;
GRANT USAGE ON TYPE incident_severity TO anon, authenticated;
GRANT USAGE ON TYPE incident_status TO anon, authenticated;
GRANT USAGE ON TYPE incident_update_type TO anon, authenticated;
