import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Important notification types that trigger push notifications
const PUSH_NOTIFICATION_TYPES = [
  // Appointment-related (to client)
  'appointment_scheduled',
  'appointment_confirmed',
  'appointment_cancelled',
  'appointment_updated',
  'appointment_reminder',
  // Reschedule-related
  'reschedule_requested',
  'reschedule_approved',
  'reschedule_declined',
  // Booking approval workflow
  'booking_requested',
  'booking_approved',
  'booking_declined',
  // Messaging
  'new_message',
  // Announcements
  'announcement',
];

// VAPID keys from environment
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@barberpal.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== Push notification function called ===');
  console.log('Method:', req.method);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('Raw request body:', JSON.stringify(body));

    // Support both direct { record } and webhook format { type, table, record, ... }
    const record = body.record;

    if (!record) {
      console.error('No record in payload');
      return new Response(
        JSON.stringify({ error: 'No record in payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Received notification:', { id: record.id, type: record.type, userId: record.user_id });

    // Check if this is an important notification type
    if (!PUSH_NOTIFICATION_TYPES.includes(record.type)) {
      console.log('Skipping - not a push notification type:', record.type);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Not a push notification type' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', record.user_id);

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for user:', record.user_id);
      return new Response(
        JSON.stringify({ sent: 0, reason: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${subscriptions.length} subscription(s) for user`);

    // Get user role for URL routing
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', record.user_id)
      .single();

    const userRole = userData?.role || 'client';
    console.log('User role:', userRole);

    // Build push payload
    const payload = JSON.stringify({
      title: record.title,
      message: record.message,
      type: record.type,
      notificationId: record.id,
      appointmentId: record.appointment_id,
      url: getNotificationUrl(record.type, userRole)
    });

    // Send to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(sub => sendWebPush(sub, payload))
    );

    // Log results
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    console.log(`Push results: ${successCount} succeeded, ${failedCount} failed`);

    // Log detailed errors for debugging
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`Push failed for subscription ${i}:`, result.reason?.message || result.reason);
        console.error('Full error:', JSON.stringify(result.reason, Object.getOwnPropertyNames(result.reason)));
      }
    });

    // Clean up failed subscriptions (expired/unsubscribed)
    const failedEndpoints: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const reason = result.reason?.message || result.reason;
        // 404 or 410 means subscription is no longer valid
        if (reason?.includes('404') || reason?.includes('410') || reason?.includes('expired')) {
          failedEndpoints.push(subscriptions[i].endpoint);
        }
      }
    });

    if (failedEndpoints.length > 0) {
      console.log('Cleaning up expired subscriptions:', failedEndpoints.length);
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', failedEndpoints);
    }

    return new Response(
      JSON.stringify({ sent: successCount, failed: failedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Push notification error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Send a Web Push notification using the Web Push protocol
 */
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<void> {
  console.log('Sending push to endpoint:', subscription.endpoint.substring(0, 60) + '...');

  // Import web-push compatible functions
  const { createVapidAuthHeader, encryptPayload } = await import('./web-push-utils.ts');

  try {
    // Create VAPID authorization header
    console.log('Creating VAPID headers...');
    const vapidHeaders = await createVapidAuthHeader(
      subscription.endpoint,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
      VAPID_SUBJECT
    );
    console.log('VAPID headers created');

    // Encrypt the payload
    console.log('Encrypting payload...');
    const encryptedPayload = await encryptPayload(
      payload,
      subscription.p256dh,
      subscription.auth
    );
    console.log('Payload encrypted, size:', encryptedPayload.length);

    // Send the push notification
    console.log('Sending fetch request...');
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...vapidHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400', // 24 hours
      },
      body: encryptedPayload as unknown as BodyInit
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('Push response error body:', text);
      throw new Error(`Push failed: ${response.status} ${text}`);
    }

    console.log('Push sent successfully');
  } catch (error) {
    console.error('Error in sendWebPush:', error);
    throw error;
  }
}

/**
 * Get the appropriate URL for a notification type based on user role
 */
function getNotificationUrl(type: string, userRole: string): string {
  const isBarber = userRole === 'owner' || userRole === 'staff';
  const baseUrl = isBarber ? '/barber' : '/client';

  switch (type) {
    // Appointment notifications
    case 'appointment_scheduled':
    case 'appointment_confirmed':
    case 'appointment_cancelled':
    case 'appointment_updated':
    case 'appointment_reminder':
    case 'reschedule_requested':
    case 'reschedule_approved':
    case 'reschedule_declined':
      return isBarber ? `${baseUrl}/calendar` : `${baseUrl}/dashboard`;

    // Booking workflow notifications
    case 'booking_requested':
    case 'booking_approved':
    case 'booking_declined':
      return isBarber ? `${baseUrl}/calendar` : `${baseUrl}/dashboard`;

    // Message notifications
    case 'new_message':
      return `${baseUrl}/messages`;

    // Announcements go to dashboard
    case 'announcement':
      return `${baseUrl}/dashboard`;

    default:
      return `${baseUrl}/dashboard`;
  }
}
