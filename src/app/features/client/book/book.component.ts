import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
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
  selector: 'app-book',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './book.component.html',
  styleUrl: './book.component.scss'
})
export class BookComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private location = inject(Location);

  // State
  step = signal<1 | 2 | 3 | 4>(1);
  loading = signal(true);
  booking = signal(false);
  error = signal<string | null>(null);

  // Data
  services = signal<Service[]>([]);
  barberId = signal<string | null>(null);
  barberName = signal<string>('');
  workingHours = signal<WorkingHours[]>([]);
  existingAppointments = signal<{ start_time: string; end_time: string }[]>([]);

  // Selection
  selectedService = signal<Service | null>(null);
  selectedDate = signal<Date | null>(null);
  selectedTime = signal<Date | null>(null);

  // Calendar
  currentMonth = signal(new Date());
  calendarDays = computed(() => this.generateCalendarDays());
  availableSlots = computed(() => this.generateTimeSlots());

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    const profile = this.supabase.currentProfile;

    if (!profile?.favorite_staff_id) {
      this.error.set('No barber linked to your account');
      this.loading.set(false);
      return;
    }

    this.barberId.set(profile.favorite_staff_id);

    try {
      // Load barber info
      const { data: barber } = await this.supabase.client
        .from('users')
        .select('first_name, last_name, business_id')
        .eq('id', profile.favorite_staff_id)
        .single();

      if (barber) {
        this.barberName.set(`${barber.first_name} ${barber.last_name}`);

        // Load services for the business
        const { data: services } = await this.supabase.client
          .from('services')
          .select('*')
          .eq('business_id', barber.business_id)
          .eq('is_active', true)
          .order('name');

        this.services.set(services || []);

        // Load working hours
        const { data: hours } = await this.supabase.client
          .from('working_hours')
          .select('*')
          .eq('user_id', profile.favorite_staff_id)
          .eq('is_active', true);

        this.workingHours.set(hours || []);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      this.error.set('Failed to load booking information');
    } finally {
      this.loading.set(false);
    }
  }

  async loadExistingAppointments(date: Date) {
    const barberId = this.barberId();
    if (!barberId) return;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const { data } = await this.supabase.client
        .from('appointments')
        .select('start_time, end_time')
        .eq('staff_id', barberId)
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .in('status', ['pending', 'confirmed']);

      this.existingAppointments.set(data || []);
    } catch (err) {
      console.error('Error loading appointments:', err);
    }
  }

  selectService(service: Service) {
    this.selectedService.set(service);
    this.step.set(2);
  }

  async selectDate(date: Date) {
    this.selectedDate.set(date);
    this.selectedTime.set(null);
    await this.loadExistingAppointments(date);
    this.step.set(3); // Advance to time selection step
  }

  selectTime(time: Date) {
    this.selectedTime.set(time);
    this.step.set(4); // Advance to confirmation step
  }

  async confirmBooking() {
    const service = this.selectedService();
    const dateTime = this.selectedTime();
    const barberId = this.barberId();
    const profile = this.supabase.currentProfile;

    if (!service || !dateTime || !barberId || !profile) return;

    this.booking.set(true);
    this.error.set(null);

    try {
      const endTime = new Date(dateTime);
      endTime.setMinutes(endTime.getMinutes() + service.duration_minutes);

      const { error } = await this.supabase.client
        .from('appointments')
        .insert({
          business_id: profile.business_id,
          client_id: profile.id,
          staff_id: barberId,
          service_id: service.id,
          start_time: dateTime.toISOString(),
          end_time: endTime.toISOString(),
          status: 'pending'
        });

      if (error) throw error;

      this.router.navigate(['/client/dashboard']);
    } catch (err: any) {
      console.error('Error booking appointment:', err);
      this.error.set(err.message || 'Failed to book appointment');
      this.booking.set(false);
    }
  }

  goBack() {
    if (this.step() === 1) {
      this.location.back();
    } else if (this.step() === 2) {
      this.step.set(1);
      this.selectedService.set(null);
    } else if (this.step() === 3) {
      this.step.set(2);
      this.selectedDate.set(null);
      this.selectedTime.set(null);
    } else if (this.step() === 4) {
      this.step.set(3);
      this.selectedTime.set(null);
    }
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
    const service = this.selectedService();
    if (!date || !service) return [];

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

    for (let mins = startMinutes; mins <= endMinutes - service.duration_minutes; mins += slotDuration) {
      const slotTime = new Date(date);
      slotTime.setHours(Math.floor(mins / 60), mins % 60, 0, 0);

      // Check if slot is in the past (for today)
      if (isToday && slotTime <= now) {
        continue;
      }

      // Check if slot conflicts with existing appointments
      const slotEnd = new Date(slotTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + service.duration_minutes);

      const isAvailable = !this.existingAppointments().some(apt => {
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);
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

  isSelectedDate(date: Date): boolean {
    const selected = this.selectedDate();
    return selected !== null && date.toDateString() === selected.toDateString();
  }
}
