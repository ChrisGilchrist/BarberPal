-- Drop the old pg_net trigger since we're using Database Webhooks instead
-- The Database Webhook automatically wraps the payload in { type, table, record, schema }

-- Drop the trigger
DROP TRIGGER IF EXISTS on_notification_insert ON notifications;

-- Drop the function
DROP FUNCTION IF EXISTS notify_push_on_notification_insert();

-- Note: The Database Webhook configured in Supabase Dashboard will handle
-- calling the send-push-notification edge function on INSERT to notifications table
