-- Restore push notification trigger (matching PT Track setup)
-- This replaces the webhook approach with a proper pg_net trigger

-- Enable pg_net extension for HTTP requests from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to call the push notification edge function
CREATE OR REPLACE FUNCTION notify_push_on_notification_insert()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  function_url text;
BEGIN
  -- Build the payload with the new notification record (wrapped in 'record' like PT Track)
  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'appointment_id', NEW.appointment_id,
      'sender_id', NEW.sender_id
    )
  );

  -- Edge function URL for BarberPal
  function_url := 'https://ebllhdgqgddmplodhatx.supabase.co/functions/v1/send-push-notification';

  -- Make async HTTP request to the edge function
  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := payload
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Push notification trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop any existing triggers
DROP TRIGGER IF EXISTS on_notification_insert ON notifications;
DROP TRIGGER IF EXISTS trigger_push_notification_on_insert ON notifications;

-- Create trigger on notifications table
CREATE TRIGGER trigger_push_notification_on_insert
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_notification_insert();

COMMENT ON FUNCTION notify_push_on_notification_insert() IS 'Calls the send-push-notification edge function when a notification is created';
