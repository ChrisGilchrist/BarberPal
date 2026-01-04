-- RESET DATABASE - Clears all tables and auth users
-- WARNING: This will delete ALL data!

-- Drop triggers first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;

-- Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop all tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS time_blocks CASCADE;
DROP TABLE IF EXISTS working_hours CASCADE;
DROP TABLE IF EXISTS staff_services CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;

-- Delete all auth users
DELETE FROM auth.users;

-- Confirm reset
SELECT 'Database reset complete!' as status;
