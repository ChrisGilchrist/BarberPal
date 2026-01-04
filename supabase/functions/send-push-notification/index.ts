import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWebPush, type PushSubscription } from './web-push-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@barberpal.app';

// Notification types that should trigger push notifications
const PUSH_ENABLED_TYPES = [
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
  'announcement',
];

// URL routing based on notification type
function getNotificationUrl(type: string, userRole: string): string {
  const isBarber = userRole === 'owner' || userRole === 'staff';
  const baseUrl = isBarber ? '/barber' : '/client';

  switch (type) {
    case 'appointment_scheduled':
    case 'appointment_confirmed':
    case 'appointment_cancelled':
    case 'appointment_updated':
    case 'appointment_reminder':
    case 'reschedule_requested':
    case 'reschedule_approved':
    case 'reschedule_declined':
      return isBarber ? `${baseUrl}/calendar` : `${baseUrl}/dashboard`;

    case 'booking_requested':
    case 'booking_approved':
    case 'booking_declined':
      return isBarber ? `${baseUrl}/calendar` : `${baseUrl}/dashboard`;

    case 'new_message':
      return `${baseUrl}/messages`;

    case 'announcement':
      return `${baseUrl}/dashboard`;

    default:
      return `${baseUrl}/dashboard`;
  }
}

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const notification = await req.json();
    console.log('Received notification:', notification);

    // Validate notification type
    if (!PUSH_ENABLED_TYPES.includes(notification.type)) {
      console.log(`Notification type ${notification.type} not enabled for push`);
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', notification.user_id);

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for user:', notification.user_id);
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user role for URL routing
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', notification.user_id)
      .single();

    const userRole = userData?.role || 'client';

    // Build push payload
    const payload = JSON.stringify({
      title: notification.title,
      message: notification.message,
      type: notification.type,
      notificationId: notification.id,
      appointmentId: notification.appointment_id,
      url: getNotificationUrl(notification.type, userRole),
    });

    console.log('Sending push to', subscriptions.length, 'subscription(s)');

    // Send to all subscriptions
    let sentCount = 0;
    let failedCount = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const pushSubscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        const result = await sendWebPush(
          pushSubscription,
          payload,
          {
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
            subject: VAPID_SUBJECT,
          }
        );

        if (result.success) {
          sentCount++;
          console.log('Push sent successfully to:', sub.endpoint.substring(0, 50));
        } else if (result.status === 404 || result.status === 410) {
          // Subscription expired
          expiredEndpoints.push(sub.endpoint);
          failedCount++;
          console.log('Subscription expired:', sub.endpoint.substring(0, 50));
        } else {
          failedCount++;
          console.error('Push failed:', result.status, result.error);
        }
      } catch (error) {
        failedCount++;
        console.error('Error sending push:', error);
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints);

      if (deleteError) {
        console.error('Error deleting expired subscriptions:', deleteError);
      } else {
        console.log('Deleted', expiredEndpoints.length, 'expired subscription(s)');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failedCount,
        expired: expiredEndpoints.length,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
