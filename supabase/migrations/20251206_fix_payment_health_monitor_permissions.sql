-- Fix security warning for payment_health_monitor view
-- This view is for internal monitoring only and should not be exposed to public API

-- Revoke all permissions from public roles
REVOKE ALL ON payment_health_monitor FROM anon, authenticated;

-- Grant access only to service_role (for backend API usage)
GRANT SELECT ON payment_health_monitor TO service_role;

-- Optional: Grant to postgres/dashboard_user if needed for Supabase Dashboard
-- GRANT SELECT ON payment_health_monitor TO postgres;
-- GRANT SELECT ON payment_health_monitor TO dashboard_user;
