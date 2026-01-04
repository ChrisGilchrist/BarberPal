import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
}

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  service: Service;
  staff: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface TimeSlot {
  time: Date;
  available: boolean;
}

interface WorkingHours {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

@Component({
  selector: 'app-reschedule',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reschedule.component.html',
  styleUrl: './reschedule.component.scss'
})
export class RescheduleComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // State
  step = signal<1 | 2 | 3>(1); // 1=date, 2=time, 3=confirm
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  // Data
  appointmentId = signal<string | null>(null);
  appointment = signal<Appointment | null>(null);
  workingHours = signal<WorkingHours[]>([]);
  existingAppointments = signal<{ start_time: string; end_time: string }[]>([]);

  // Selection
  selectedDate = signal<Date | null>(null);
  selectedTime = signal<Date | null>(null);

  // Calendar
  currentMonth = signal(new Date());
  calendarDays = computed(() => this.generateCalendarDays());
  availableSlots = computed(() => this.generateTimeSlots());

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Appointment not found');
      this.loading.set(false);
      return;
    }

    this.appointmentId.set(id);
    await this.loadAppointment(id);
  }

  async loadAppointment(id: string) {
    this.loading.set(true);

    try {
      // Load the appointment with service and staff info
      const { data: apt, error: aptError } = await this.supabase.client
        .from('appointments')
        .select(`
          id,
          start_time,
          end_time,
          status,
          service:services (
            id,
            name,
            duration_minutes,
            price
          ),
          staff:users!appointments_staff_id_fkey (
            id,
            first_name,
            last_name
          )
        `)
        .eq('id', id)
        .single();

      if (aptError) throw aptError;

      // Transform the data
      const appointment = {
        ...apt,
        service: Array.isArray(apt.service) ? apt.service[0] : apt.service,
        staff: Array.isArray(apt.staff) ? apt.staff[0] : apt.staff
      } as Appointment;

      this.appointment.set(appointment);

      // Load working hours for the staff member
      const { data: hours } = await this.supabase.client
        .from('working_hours')
        .select('*')
        .eq('user_id', appointment.staff.id)
        .eq('is_active', true);

      this.workingHours.set(hours || []);
    } catch (err) {
      console.error('Error loading appointment:', err);
      this.error.set('Failed to load appointment');
    } finally {
      this.loading.set(false);
    }
  }

  async loadExistingAppointments(date: Date) {
    const apt = this.appointment();
    if (!apt) return;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const { data } = await this.supabase.client
        .from('appointments')
        .select('start_time, end_time')
        .eq('staff_id', apt.staff.id)
        .neq('id', apt.id) // Exclude current appointment
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .in('status', ['pending', 'confirmed']);

      this.existingAppointments.set(data || []);
    } catch (err) {
      console.error('Error loading appointments:', err);
    }
  }

  async selectDate(date: Date) {
    this.selectedDate.set(date);
    this.selectedTime.set(null);
    await this.loadExistingAppointments(date);
    this.step.set(2);
  }

  selectTime(time: Date) {
    this.selectedTime.set(time);
    this.step.set(3);
  }

  async confirmReschedule() {
    const apt = this.appointment();
    const dateTime = this.selectedTime();

    if (!apt || !dateTime) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      const endTime = new Date(dateTime);
      endTime.setMinutes(endTime.getMinutes() + apt.service.duration_minutes);

      const { error } = await this.supabase.client
        .from('appointments')
        .update({
          start_time: dateTime.toISOString(),
          end_time: endTime.toISOString(),
          status: 'pending' // Reset to pending after reschedule
        })
        .eq('id', apt.id);

      if (error) throw error;

      this.router.navigate(['/client/dashboard']);
    } catch (err: any) {
      console.error('Error rescheduling appointment:', err);
      this.error.set(err.message || 'Failed to reschedule appointment');
      this.saving.set(false);
    }
  }

  goBack() {
    if (this.step() === 2) {
      this.step.set(1);
      this.selectedDate.set(null);
      this.selectedTime.set(null);
    } else if (this.step() === 3) {
      this.step.set(2);
      this.selectedTime.set(null);
    } else {
      this.router.navigate(['/client/dashboard']);
    }
  }

  cancel() {
    this.router.navigate(['/client/dashboard']);
  }

  // Calendar helpers
  generateCalendarDays(): { date: Date; disabled: boolean; today: boolean }[] {
    const current = this.currentMonth();
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: { date: Date; disabled: boolean; today: boolean }[] = [];

    // Add padding for start of week
    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i++) {
      const date = new Date(year, month, -startPadding + i + 1);
      days.push({ date, disabled: true, today: false });
    }

    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      const isPast = date < today;
      const dayOfWeek = date.getDay();
      const hasWorkingHours = this.workingHours().some(h => h.day_of_week === dayOfWeek);

      days.push({
        date,
        disabled: isPast || !hasWorkingHours,
        today: date.getTime() === today.getTime()
      });
    }

    return days;
  }

  generateTimeSlots(): TimeSlot[] {
    const date = this.selectedDate();
    const apt = this.appointment();
    if (!date || !apt) return [];

    const dayOfWeek = date.getDay();
    const hours = this.workingHours().find(h => h.day_of_week === dayOfWeek);
    if (!hours) return [];

    const slots: TimeSlot[] = [];
    const [startHour, startMin] = hours.start_time.split(':').map(Number);
    const [endHour, endMin] = hours.end_time.split(':').map(Number);

    const slotDuration = 30; // 30 minute slots
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    for (let mins = startMinutes; mins <= endMinutes - apt.service.duration_minutes; mins += slotDuration) {
      const slotTime = new Date(date);
      slotTime.setHours(Math.floor(mins / 60), mins % 60, 0, 0);

      // Check if slot is in the past (for today)
      if (isToday && slotTime <= now) {
        continue;
      }

      // Check if slot conflicts with existing appointments
      const slotEnd = new Date(slotTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + apt.service.duration_minutes);

      const isAvailable = !this.existingAppointments().some(existingApt => {
        const aptStart = new Date(existingApt.start_time);
        const aptEnd = new Date(existingApt.end_time);
        return (slotTime < aptEnd && slotEnd > aptStart);
      });

      slots.push({ time: slotTime, available: isAvailable });
    }

    return slots;
  }

  previousMonth() {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextMonth() {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(price);
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  formatMonthYear(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  formatOriginalDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  formatOriginalTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  isSelectedDate(date: Date): boolean {
    const selected = this.selectedDate();
    return selected !== null && date.toDateString() === selected.toDateString();
  }
}
