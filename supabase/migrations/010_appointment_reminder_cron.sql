-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- IMPORTANT: Run this in the Supabase SQL Editor to set up the cron job.
-- Replace YOUR_SERVICE_ROLE_KEY with your actual service role key from:
-- Supabase Dashboard > Settings > API > service_role key

/*
SELECT cron.schedule(
  'send-appointment-reminders',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url:='https://bkhoqhqdmdsourvfvfdy.supabase.co/functions/v1/send-appointment-reminders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
*/

-- To check scheduled jobs: SELECT * FROM cron.job;
-- To check job runs: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- To unschedule: SELECT cron.unschedule('send-appointment-reminders');
