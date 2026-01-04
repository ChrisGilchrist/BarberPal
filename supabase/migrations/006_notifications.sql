-- BarberPal Push Notifications & In-App Notifications
-- Migration 006

-- ===========================================
-- 1. NOTIFICATIONS TABLE
-- ===========================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'appointment_scheduled',
    'appointment_confirmed',
    'appointment_cancelled',
    'appointment_updated',
    'appointment_reminder',
    'reschedule_requested',
    'reschedule_approved',
    'reschedule_declined',
    'booking_requested',
    'booking_approved',
    'booking_declined',
    'new_message',
    'announcement'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(type);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ===========================================
-- 2. UPDATE PUSH SUBSCRIPTIONS TABLE
-- ===========================================

-- Add device_info column for multi-device tracking
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS device_info JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Drop old unique constraint on user_id (allow multiple devices per user)
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;

-- Add unique constraint on endpoint instead (one subscription per device)
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

-- Add index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ===========================================
-- 3. UPDATE USERS TABLE
-- ===========================================

-- Add push notification preferences
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_hours INTEGER DEFAULT 24;

-- ===========================================
-- 4. UPDATE APPOINTMENTS TABLE
-- ===========================================

-- Add reminder tracking
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_sent ON appointments(reminder_sent);

-- ===========================================
-- 5. PUSH NOTIFICATION TRIGGER
-- ===========================================

-- Enable pg_net extension for HTTP requests (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to send push notification via edge function
CREATE OR REPLACE FUNCTION notify_push_on_notification_insert()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  edge_function_url TEXT;
BEGIN
  -- Build payload
  payload := jsonb_build_object(
    'id', NEW.id,
    'user_id', NEW.user_id,
    'type', NEW.type,
    'title', NEW.title,
    'message', NEW.message,
    'appointment_id', NEW.appointment_id,
    'sender_id', NEW.sender_id,
    'created_at', NEW.created_at
  );

  -- Get the edge function URL from environment or use default
  -- Note: Replace with your actual Supabase project URL
  edge_function_url := 'https://ebllhdgqgddmplodhatx.supabase.co/functions/v1/send-push-notification';

  -- Call edge function asynchronously
  PERFORM net.http_post(
    url := edge_function_url,
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
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for push notifications
DROP TRIGGER IF EXISTS on_notification_insert ON notifications;
CREATE TRIGGER on_notification_insert
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_notification_insert();

-- ===========================================
-- 6. HELPER FUNCTIONS
-- ===========================================

-- Function to create notification (for use in other triggers/functions)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_appointment_id UUID DEFAULT NULL,
  p_sender_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, appointment_id, sender_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_appointment_id, p_sender_id)
  RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
