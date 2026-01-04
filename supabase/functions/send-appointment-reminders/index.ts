import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Appointment {
  id: string;
  client_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
  reminder_sent: boolean;
  service: {
    name: string;
  };
  staff: {
    first_name: string;
    last_name: string;
  };
  client: {
    first_name: string;
    last_name: string;
    reminder_hours: number;
  };
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'tomorrow';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
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

    console.log('Running appointment reminder check...');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current time
    const now = new Date();

    // Get all confirmed appointments that haven't had reminders sent
    // We'll check each user's individual reminder_hours setting
    const { data: appointments, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        id,
        client_id,
        staff_id,
        start_time,
        end_time,
        status,
        reminder_sent,
        service:services(name),
        staff:users!appointments_staff_id_fkey(first_name, last_name),
        client:users!appointments_client_id_fkey(first_name, last_name, reminder_hours)
      `)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('start_time', now.toISOString())
      .order('start_time', { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error('Error fetching appointments:', fetchError);
      throw fetchError;
    }

    if (!appointments || appointments.length === 0) {
      console.log('No appointments need reminders');
      return new Response(
        JSON.stringify({ success: true, reminders_sent: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${appointments.length} potential appointments to check`);

    let remindersSent = 0;

    for (const apt of appointments as unknown as Appointment[]) {
      const appointmentTime = new Date(apt.start_time);
      const reminderHours = apt.client?.reminder_hours || 24;
      const reminderThreshold = new Date(appointmentTime);
      reminderThreshold.setHours(reminderThreshold.getHours() - reminderHours);

      // Check if we're within the reminder window
      if (now >= reminderThreshold) {
        console.log(`Sending reminder for appointment ${apt.id}`);

        const staffName = apt.staff
          ? `${apt.staff.first_name} ${apt.staff.last_name}`
          : 'your barber';
        const serviceName = apt.service?.name || 'appointment';
        const dateStr = formatDate(apt.start_time);
        const timeStr = formatTime(apt.start_time);

        // Create notification for the client
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: apt.client_id,
            type: 'appointment_reminder',
            title: 'Appointment Reminder',
            message: `Your ${serviceName} with ${staffName} is ${dateStr} at ${timeStr}`,
            appointment_id: apt.id,
          });

        if (notifError) {
          console.error('Error creating notification:', notifError);
          continue;
        }

        // Mark appointment as reminder sent
        const { error: updateError } = await supabase
          .from('appointments')
          .update({ reminder_sent: true })
          .eq('id', apt.id);

        if (updateError) {
          console.error('Error updating appointment:', updateError);
          continue;
        }

        remindersSent++;
        console.log(`Reminder sent for appointment ${apt.id}`);
      }
    }

    console.log(`Sent ${remindersSent} reminder(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        reminders_sent: remindersSent,
        checked: appointments.length,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-appointment-reminders:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
