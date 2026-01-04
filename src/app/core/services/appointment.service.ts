import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { Appointment, AppointmentStatus, TimeSlot, WorkingHours, TimeBlock } from '../models';
import { format, parseISO, addMinutes, setHours, setMinutes } from 'date-fns';

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private supabase = inject(SupabaseService);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);

  private appointmentsSignal = signal<Appointment[]>([]);

  readonly appointments = this.appointmentsSignal.asReadonly();

  async loadAppointments(params: {
    businessId?: string;
    staffId?: string;
    clientId?: string;
    startDate?: string;
    endDate?: string;
    status?: AppointmentStatus[];
  }) {
    try {
      let query = this.supabase
        .from('appointments')
        .select(`
          *,
          client:users!appointments_client_id_fkey (*),
          staff:users!appointments_staff_id_fkey (*),
          service:services (*)
        `);

      if (params.businessId) {
        query = query.eq('business_id', params.businessId);
      }
      if (params.staffId) {
        query = query.eq('staff_id', params.staffId);
      }
      if (params.clientId) {
        query = query.eq('client_id', params.clientId);
      }
      if (params.startDate) {
        query = query.gte('start_time', params.startDate);
      }
      if (params.endDate) {
        query = query.lte('start_time', params.endDate);
      }
      if (params.status && params.status.length > 0) {
        query = query.in('status', params.status);
      }

      const { data, error } = await query.order('start_time');

      if (error) throw error;

      this.appointmentsSignal.set(data as Appointment[]);
      return { data: data as Appointment[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async getAppointment(id: string) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select(`
          *,
          client:users!appointments_client_id_fkey (*),
          staff:users!appointments_staff_id_fkey (*),
          service:services (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      return { data: data as Appointment, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async createAppointment(appointment: Omit<Appointment, 'id' | 'created_at' | 'updated_at'>) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .insert(appointment)
        .select(`
          *,
          client:users!appointments_client_id_fkey (*),
          staff:users!appointments_staff_id_fkey (*),
          service:services (*)
        `)
        .single();

      if (error) throw error;

      const appt = data as Appointment;
      this.appointmentsSignal.update(appts => [...appts, appt]);

      // Send notification to client about the new appointment
      if (appt.client_id) {
        const serviceName = appt.service?.name || 'Appointment';
        const appointmentDate = format(parseISO(appt.start_time), 'EEEE, MMMM d');
        const appointmentTime = format(parseISO(appt.start_time), 'h:mm a');
        const staffName = appt.staff ? `${appt.staff.first_name}` : 'your barber';

        await this.notificationService.createNotification({
          userId: appt.client_id,
          type: 'appointment_scheduled',
          title: 'Appointment Scheduled',
          message: `Your ${serviceName} with ${staffName} is booked for ${appointmentDate} at ${appointmentTime}`,
          appointmentId: appt.id,
          senderId: this.authService.user()?.id,
        });
      }

      return { data: appt, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async updateAppointment(id: string, updates: Partial<Appointment>) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(`
          *,
          client:users!appointments_client_id_fkey (*),
          staff:users!appointments_staff_id_fkey (*),
          service:services (*)
        `)
        .single();

      if (error) throw error;

      this.appointmentsSignal.update(appts =>
        appts.map(a => a.id === id ? data as Appointment : a)
      );

      return { data: data as Appointment, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async updateStatus(id: string, status: AppointmentStatus) {
    return this.updateAppointment(id, { status });
  }

  async cancelAppointment(id: string) {
    // Get the appointment first to send notification
    const { data: appt } = await this.getAppointment(id);

    const result = await this.updateStatus(id, 'cancelled');

    // Send notification about cancellation
    if (result.data && appt) {
      const currentUserId = this.authService.user()?.id;
      const isBarberCancelling = currentUserId !== appt.client_id;
      const serviceName = appt.service?.name || 'Appointment';
      const appointmentDate = format(parseISO(appt.start_time), 'EEEE, MMMM d');
      const appointmentTime = format(parseISO(appt.start_time), 'h:mm a');

      if (isBarberCancelling && appt.client_id) {
        // Barber cancelled - notify client
        await this.notificationService.createNotification({
          userId: appt.client_id,
          type: 'appointment_cancelled',
          title: 'Appointment Cancelled',
          message: `Your ${serviceName} on ${appointmentDate} at ${appointmentTime} has been cancelled`,
          appointmentId: id,
          senderId: currentUserId,
        });
      } else if (!isBarberCancelling && appt.staff_id) {
        // Client cancelled - notify barber
        const clientName = appt.client ? `${appt.client.first_name} ${appt.client.last_name}` : 'A client';
        await this.notificationService.createNotification({
          userId: appt.staff_id,
          type: 'appointment_cancelled',
          title: 'Appointment Cancelled',
          message: `${clientName} cancelled their ${serviceName} on ${appointmentDate} at ${appointmentTime}`,
          appointmentId: id,
          senderId: currentUserId,
        });
      }
    }

    return result;
  }

  async completeAppointment(id: string) {
    return this.updateStatus(id, 'completed');
  }

  async markNoShow(id: string) {
    return this.updateStatus(id, 'no_show');
  }

  async deleteAppointment(id: string) {
    try {
      const { error } = await this.supabase
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.appointmentsSignal.update(appts => appts.filter(a => a.id !== id));

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Availability Logic
  async getAvailableSlots(params: {
    staffId: string;
    date: Date;
    serviceDuration: number;
    businessBufferMinutes: number;
  }): Promise<TimeSlot[]> {
    const { staffId, date, serviceDuration, businessBufferMinutes } = params;
    const dayOfWeek = date.getDay();
    const dateStr = format(date, 'yyyy-MM-dd');

    // Get staff working hours for this day
    const { data: workingHoursData } = await this.supabase
      .from('working_hours')
      .select('*')
      .eq('user_id', staffId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .single();

    if (!workingHoursData) {
      return []; // Staff doesn't work on this day
    }

    const workingHours = workingHoursData as WorkingHours;

    // Get existing appointments for this day
    const startOfDay = `${dateStr}T00:00:00`;
    const endOfDay = `${dateStr}T23:59:59`;

    const { data: appointmentsData } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('staff_id', staffId)
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay)
      .in('status', ['pending', 'confirmed']);

    const existingAppointments = (appointmentsData || []) as Appointment[];

    // Get time blocks (breaks, time off)
    const { data: timeBlocksData } = await this.supabase
      .from('time_blocks')
      .select('*')
      .eq('user_id', staffId)
      .gte('end_datetime', startOfDay)
      .lte('start_datetime', endOfDay);

    const timeBlocks = (timeBlocksData || []) as TimeBlock[];

    // Generate time slots
    const slots: TimeSlot[] = [];
    const [startHour, startMinute] = workingHours.start_time.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end_time.split(':').map(Number);

    let currentTime = setMinutes(setHours(date, startHour), startMinute);
    const endTime = setMinutes(setHours(date, endHour), endMinute);
    const slotDuration = serviceDuration + businessBufferMinutes;

    while (addMinutes(currentTime, serviceDuration) <= endTime) {
      const slotStart = currentTime;
      const slotEnd = addMinutes(currentTime, serviceDuration);
      const timeStr = format(currentTime, 'HH:mm');

      // Check if slot overlaps with existing appointments
      const hasConflict = existingAppointments.some(appt => {
        const apptStart = parseISO(appt.start_time);
        const apptEnd = parseISO(appt.end_time);
        return (
          (slotStart >= apptStart && slotStart < apptEnd) ||
          (slotEnd > apptStart && slotEnd <= apptEnd) ||
          (slotStart <= apptStart && slotEnd >= apptEnd)
        );
      });

      // Check if slot overlaps with time blocks
      const hasTimeBlock = timeBlocks.some(block => {
        const blockStart = parseISO(block.start_datetime);
        const blockEnd = parseISO(block.end_datetime);
        return (
          (slotStart >= blockStart && slotStart < blockEnd) ||
          (slotEnd > blockStart && slotEnd <= blockEnd) ||
          (slotStart <= blockStart && slotEnd >= blockEnd)
        );
      });

      slots.push({
        time: timeStr,
        available: !hasConflict && !hasTimeBlock,
        staffId
      });

      currentTime = addMinutes(currentTime, 30); // 30-minute slot intervals
    }

    return slots;
  }

  async getAvailableSlotsMultipleStaff(params: {
    staffIds: string[];
    date: Date;
    serviceDuration: number;
    businessBufferMinutes: number;
  }): Promise<Map<string, TimeSlot[]>> {
    const results = new Map<string, TimeSlot[]>();

    await Promise.all(
      params.staffIds.map(async staffId => {
        const slots = await this.getAvailableSlots({
          staffId,
          date: params.date,
          serviceDuration: params.serviceDuration,
          businessBufferMinutes: params.businessBufferMinutes
        });
        results.set(staffId, slots);
      })
    );

    return results;
  }

  // Get appointments for calendar view
  async getAppointmentsForCalendar(businessId: string, startDate: Date, endDate: Date) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select(`
          *,
          client:users!appointments_client_id_fkey (first_name, last_name),
          staff:users!appointments_staff_id_fkey (first_name, last_name),
          service:services (name, duration_minutes)
        `)
        .eq('business_id', businessId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time');

      if (error) throw error;

      return { data: data as Appointment[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Get upcoming appointments for a client
  async getUpcomingClientAppointments(clientId: string) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select(`
          *,
          staff:users!appointments_staff_id_fkey (first_name, last_name),
          service:services (name, duration_minutes, price)
        `)
        .eq('client_id', clientId)
        .gte('start_time', new Date().toISOString())
        .in('status', ['pending', 'confirmed'])
        .order('start_time')
        .limit(10);

      if (error) throw error;

      return { data: data as Appointment[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Get today's appointments for staff
  async getTodaysAppointments(staffId: string) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select(`
          *,
          client:users!appointments_client_id_fkey (first_name, last_name, phone),
          service:services (name, duration_minutes)
        `)
        .eq('staff_id', staffId)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .in('status', ['pending', 'confirmed'])
        .order('start_time');

      if (error) throw error;

      return { data: data as Appointment[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Get all appointments for a staff member
  async getStaffAppointments(staffId: string): Promise<Appointment[]> {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select(`
          *,
          client:users!appointments_client_id_fkey (first_name, last_name, phone),
          service:services (name, duration_minutes, price)
        `)
        .eq('staff_id', staffId)
        .order('start_time', { ascending: false })
        .limit(50);

      if (error) throw error;

      return data as Appointment[];
    } catch (error) {
      console.error('Error fetching staff appointments:', error);
      return [];
    }
  }
}
