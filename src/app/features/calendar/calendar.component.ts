import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppointmentService } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';
import { Appointment, AppointmentStatus, Service, UserProfile } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

type ViewMode = 'day' | 'week' | 'month';

interface CalendarEvent {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  clientInitials: string;
  staffId: string;
  staffName: string;
  status: AppointmentStatus;
  date: Date;
  startTime: string;
  endTime: string;
  service?: Service;
  notes?: string;
  originalAppointment: Appointment;
}

interface DayColumn {
  date: Date;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  events: CalendarEvent[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss'
})
export class CalendarComponent implements OnInit {
  private appointmentService = inject(AppointmentService);
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService);

  currentDate = signal(new Date());
  selectedDate = signal(new Date());
  viewMode = signal<ViewMode>('week');
  loading = signal(true);

  // Real appointment data
  appointments = signal<Appointment[]>([]);
  clients = signal<UserProfile[]>([]);
  services = signal<Service[]>([]);

  // Modal state
  showModal = signal(false);
  editingAppointmentId = signal<string | null>(null);
  modalDate = signal<string>('');
  modalClient = signal<string>('');
  modalService = signal<string>('');
  modalStartTime = signal('09:00');
  modalEndTime = signal('10:00');
  modalNotes = signal<string>('');
  modalStatus = signal<AppointmentStatus>('confirmed');
  saving = signal(false);
  deleting = signal(false);

  isEditing = computed(() => this.editingAppointmentId() !== null);

  timeSlots = Array.from({ length: 16 }, (_, i) => {
    const hour = i + 7; // 7 AM to 10 PM
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${ampm}`;
  });

  // Time options for dropdown (7 AM to 10 PM in 15-min increments)
  timeOptions = Array.from({ length: 61 }, (_, i) => {
    const totalMinutes = (7 * 60) + (i * 15);
    const hour = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }).filter(t => {
    const [h] = t.split(':').map(Number);
    return h <= 22;
  });

  endTimeOptions = computed(() => {
    const startTime = this.modalStartTime();
    const [startH, startM] = startTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;

    return this.timeOptions.filter(t => {
      const [h, m] = t.split(':').map(Number);
      const totalMinutes = h * 60 + m;
      return totalMinutes > startMinutes;
    });
  });

  calendarEvents = computed(() => {
    return this.appointments().map(a => ({
      id: a.id,
      title: a.service?.name || 'Appointment',
      clientId: a.client_id,
      clientName: a.client ? `${a.client.first_name} ${a.client.last_name}` : 'Client',
      clientInitials: a.client ? `${a.client.first_name?.[0] || ''}${a.client.last_name?.[0] || ''}` : '?',
      staffId: a.staff_id,
      staffName: a.staff ? `${a.staff.first_name} ${a.staff.last_name}` : 'Staff',
      status: a.status,
      date: new Date(a.start_time),
      startTime: this.formatTimeDisplay(new Date(a.start_time)),
      endTime: this.formatTimeDisplay(new Date(a.end_time)),
      service: a.service,
      notes: a.notes || undefined,
      originalAppointment: a
    }));
  });

  filteredEvents = computed(() => {
    return this.calendarEvents().filter(e =>
      e.status !== 'cancelled'
    );
  });

  weekStart = computed(() => {
    const date = new Date(this.currentDate());
    const day = date.getDay();
    const diff = day === 0 ? 6 : day - 1;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
  });

  weekDays = computed(() => {
    const start = this.weekStart();
    const days: DayColumn[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push({
        date,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        dayNumber: date.getDate(),
        isToday: date.getTime() === today.getTime(),
        events: this.getEventsForDate(date)
      });
    }
    return days;
  });

  dayViewData = computed(() => {
    const date = new Date(this.currentDate());
    date.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      date,
      dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
      dayNumber: date.getDate(),
      monthName: date.toLocaleDateString('en-US', { month: 'long' }),
      isToday: date.getTime() === today.getTime(),
      events: this.getEventsForDate(date)
    };
  });

  monthDays = computed(() => {
    const date = new Date(this.currentDate());
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dayOfWeek = firstDay.getDay();
    const startPadding = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean; events: CalendarEvent[] }[] = [];

    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false, isToday: false, events: this.getEventsForDate(d) });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, isToday: d.getTime() === today.getTime(), events: this.getEventsForDate(d) });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, isToday: false, events: this.getEventsForDate(d) });
    }

    return days;
  });

  upcomingAppointments = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    return this.filteredEvents()
      .filter(e => e.date >= today && e.date <= nextWeek && e.status !== 'completed')
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
  });

  miniCalendarDays = computed(() => {
    const date = new Date(this.currentDate());
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dayOfWeek = firstDay.getDay();
    const startPadding = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean; hasEvents: boolean }[] = [];

    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false, isToday: false, isSelected: false, hasEvents: this.hasEventsOnDate(d) });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, isToday: d.getTime() === today.getTime(), isSelected: this.isSameDay(d, this.selectedDate()), hasEvents: this.hasEventsOnDate(d) });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, isToday: false, isSelected: false, hasEvents: this.hasEventsOnDate(d) });
    }

    return days;
  });

  currentMonthYear = computed(() => this.currentDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

  navTitle = computed(() => {
    const mode = this.viewMode();
    const date = this.currentDate();

    if (mode === 'day') {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (mode === 'month') {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const start = this.weekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    if (startMonth === endMonth) {
      return `${start.getDate()} - ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
    }
    return `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
  });

  upcomingSummary = computed(() => {
    const count = this.upcomingAppointments().length;
    if (count === 0) return 'No upcoming appointments';
    return `${count} upcoming appointment${count > 1 ? 's' : ''}`;
  });

  // Drag & drop support
  private draggedEvent: CalendarEvent | null = null;
  dropPlaceholder = signal<{ date: Date; hour: number; height: number } | null>(null);

  // Mobile bottom sheet
  mobileSheetOpen = signal(false);

  toggleMobileSheet() {
    this.mobileSheetOpen.update(v => !v);
  }

  async ngOnInit() {
    if (window.innerWidth <= 768) {
      this.viewMode.set('day');
    }

    await Promise.all([
      this.loadAppointments(),
      this.loadClients(),
      this.loadServices()
    ]);
  }

  async loadAppointments() {
    const user = this.authService.user();
    if (!user?.business_id) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      // Load 3 months of data
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 2);

      const { data } = await this.appointmentService.getAppointmentsForCalendar(
        user.business_id,
        startDate,
        endDate
      );

      if (data) {
        this.appointments.set(data);
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async loadClients() {
    const user = this.authService.user();
    if (!user?.business_id) return;

    try {
      const { data } = await this.supabase
        .from('users')
        .select('*')
        .eq('business_id', user.business_id)
        .eq('role', 'client');

      if (data) {
        this.clients.set(data as UserProfile[]);
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  }

  async loadServices() {
    const user = this.authService.user();
    if (!user?.business_id) return;

    try {
      const { data } = await this.supabase
        .from('services')
        .select('*')
        .eq('business_id', user.business_id)
        .eq('is_active', true);

      if (data) {
        this.services.set(data as Service[]);
      }
    } catch (error) {
      console.error('Error loading services:', error);
    }
  }

  openModal(date?: Date, hour?: number) {
    const targetDate = date || new Date();
    this.editingAppointmentId.set(null);
    this.modalDate.set(this.formatDateForInput(targetDate));
    this.modalClient.set('');
    this.modalService.set('');
    this.modalStatus.set('confirmed');

    if (hour !== undefined) {
      const startTime = `${hour.toString().padStart(2, '0')}:00`;
      const endHour = hour + 1;
      const endTime = `${endHour.toString().padStart(2, '0')}:00`;
      this.modalStartTime.set(startTime);
      this.modalEndTime.set(endTime);
    } else {
      this.modalStartTime.set('09:00');
      this.modalEndTime.set('10:00');
    }

    this.modalNotes.set('');
    this.showModal.set(true);
  }

  onDoubleClickTimeSlot(date: Date, hourIndex: number) {
    const hour = hourIndex + 7;
    this.openModal(date, hour);
  }

  openEditModal(event: CalendarEvent) {
    const appointment = event.originalAppointment;

    this.editingAppointmentId.set(appointment.id);
    this.modalDate.set(this.formatDateForInput(new Date(appointment.start_time)));
    this.modalClient.set(appointment.client_id);
    this.modalService.set(appointment.service_id);
    this.modalStartTime.set(this.formatTimeForInput(new Date(appointment.start_time)));
    this.modalEndTime.set(this.formatTimeForInput(new Date(appointment.end_time)));
    this.modalNotes.set(appointment.notes || '');
    this.modalStatus.set(appointment.status);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingAppointmentId.set(null);
  }

  onServiceSelect(serviceId: string) {
    this.modalService.set(serviceId);
    const service = this.services().find(s => s.id === serviceId);
    if (service && !this.isEditing()) {
      const [startH, startM] = this.modalStartTime().split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = startMinutes + service.duration_minutes;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      this.modalEndTime.set(`${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`);
    }
  }

  async saveAppointment() {
    const user = this.authService.user();
    if (!user?.business_id || !this.modalClient() || !this.modalService()) return;

    this.saving.set(true);
    try {
      const startDateTime = this.combineDateTime(this.modalDate(), this.modalStartTime());
      const endDateTime = this.combineDateTime(this.modalDate(), this.modalEndTime());

      if (this.isEditing()) {
        await this.appointmentService.updateAppointment(this.editingAppointmentId()!, {
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          status: this.modalStatus(),
          notes: this.modalNotes() || null
        });
      } else {
        await this.appointmentService.createAppointment({
          business_id: user.business_id,
          client_id: this.modalClient(),
          staff_id: user.id,
          service_id: this.modalService(),
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          status: this.modalStatus(),
          notes: this.modalNotes() || null
        });
      }

      await this.loadAppointments();
      this.closeModal();
    } catch (error) {
      console.error('Error saving appointment:', error);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteAppointment() {
    const appointmentId = this.editingAppointmentId();
    if (!appointmentId) return;

    this.deleting.set(true);
    try {
      await this.appointmentService.deleteAppointment(appointmentId);
      await this.loadAppointments();
      this.closeModal();
    } catch (error) {
      console.error('Error deleting appointment:', error);
    } finally {
      this.deleting.set(false);
    }
  }

  // Drag and drop
  onDragStart(event: CalendarEvent, dragEvent: DragEvent) {
    this.draggedEvent = event;
    if (dragEvent.dataTransfer) {
      dragEvent.dataTransfer.effectAllowed = 'move';
      dragEvent.dataTransfer.setData('text/plain', event.id);
    }
  }

  onDragEnd() {
    this.draggedEvent = null;
    this.dropPlaceholder.set(null);
  }

  onDragOver(dragEvent: DragEvent, targetDate?: Date, targetHour?: number) {
    dragEvent.preventDefault();
    if (dragEvent.dataTransfer) {
      dragEvent.dataTransfer.dropEffect = 'move';
    }

    if (this.draggedEvent && targetDate && targetHour !== undefined) {
      const appointment = this.draggedEvent.originalAppointment;
      const originalStart = new Date(appointment.start_time);
      const originalEnd = new Date(appointment.end_time);
      const durationHours = (originalEnd.getTime() - originalStart.getTime()) / (1000 * 60 * 60);

      this.dropPlaceholder.set({
        date: targetDate,
        hour: targetHour,
        height: durationHours * 60
      });
    }
  }

  onDragLeave() {
    setTimeout(() => {
      if (!this.draggedEvent) {
        this.dropPlaceholder.set(null);
      }
    }, 50);
  }

  getPlaceholderStyle(day: { date: Date }): { top: string; height: string } | null {
    const placeholder = this.dropPlaceholder();
    if (!placeholder) return null;
    if (!this.isSameDay(placeholder.date, day.date)) return null;

    return {
      top: `${(placeholder.hour - 7) * 60}px`,
      height: `${placeholder.height}px`
    };
  }

  async onDrop(dragEvent: DragEvent, targetDate: Date, targetHour?: number) {
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    this.dropPlaceholder.set(null);

    if (!this.draggedEvent) return;

    const appointment = this.draggedEvent.originalAppointment;
    const originalStart = new Date(appointment.start_time);
    const originalEnd = new Date(appointment.end_time);
    const duration = originalEnd.getTime() - originalStart.getTime();

    let newStart: Date;
    if (targetHour !== undefined) {
      newStart = new Date(targetDate);
      newStart.setHours(targetHour, 0, 0, 0);
    } else {
      newStart = new Date(targetDate);
      newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
    }
    const newEnd = new Date(newStart.getTime() + duration);

    if (newStart.getTime() === originalStart.getTime()) {
      this.draggedEvent = null;
      return;
    }

    try {
      await this.appointmentService.updateAppointment(appointment.id, {
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString()
      });
      await this.loadAppointments();
    } catch (error) {
      console.error('Error moving appointment:', error);
    }

    this.draggedEvent = null;
  }

  // Helper methods
  private combineDateTime(dateStr: string, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTimeForInput(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private formatTimeDisplay(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  formatTimeOption(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  onStartTimeChange(newStartTime: string) {
    const service = this.services().find(s => s.id === this.modalService());
    if (service) {
      const [startH, startM] = newStartTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = startMinutes + service.duration_minutes;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      if (endH <= 22) {
        this.modalStartTime.set(newStartTime);
        this.modalEndTime.set(`${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`);
      } else {
        this.modalStartTime.set(newStartTime);
      }
    } else {
      this.modalStartTime.set(newStartTime);
    }
  }

  private getEventsForDate(date: Date): CalendarEvent[] {
    return this.filteredEvents().filter(e => this.isSameDay(e.date, date));
  }

  private hasEventsOnDate(date: Date): boolean {
    return this.calendarEvents().some(e => this.isSameDay(e.date, date));
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  getEventPosition(event: CalendarEvent): { top: string; height: string } {
    const startHour = this.parseTime(event.startTime);
    const endHour = this.parseTime(event.endTime);
    const top = (startHour - 7) * 60;
    const height = Math.max((endHour - startHour) * 60, 30);
    return { top: `${top}px`, height: `${height}px` };
  }

  getEventHorizontalPosition(event: CalendarEvent, dayEvents: CalendarEvent[]): { left: string; width: string } {
    const eventStart = this.parseTime(event.startTime);
    const eventEnd = this.parseTime(event.endTime);

    const overlapping = dayEvents.filter(e => {
      if (e.id === event.id) return true;
      const eStart = this.parseTime(e.startTime);
      const eEnd = this.parseTime(e.endTime);
      return (eventStart < eEnd && eventEnd > eStart);
    });

    if (overlapping.length <= 1) {
      return { left: '2px', width: 'calc(100% - 4px)' };
    }

    overlapping.sort((a, b) => {
      const aStart = this.parseTime(a.startTime);
      const bStart = this.parseTime(b.startTime);
      if (aStart !== bStart) return aStart - bStart;
      return a.id.localeCompare(b.id);
    });

    const index = overlapping.findIndex(e => e.id === event.id);
    const count = overlapping.length;
    const widthPercent = 100 / count;
    const leftPercent = index * widthPercent;

    return {
      left: `calc(${leftPercent}% + 1px)`,
      width: `calc(${widthPercent}% - 2px)`
    };
  }

  private parseTime(time: string): number {
    const [timePart, period] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours + (minutes / 60);
  }

  setView(mode: ViewMode) {
    this.viewMode.set(mode);
  }

  previous() {
    const date = new Date(this.currentDate());
    const mode = this.viewMode();
    if (mode === 'day') date.setDate(date.getDate() - 1);
    else if (mode === 'week') date.setDate(date.getDate() - 7);
    else date.setMonth(date.getMonth() - 1);
    this.currentDate.set(date);
  }

  next() {
    const date = new Date(this.currentDate());
    const mode = this.viewMode();
    if (mode === 'day') date.setDate(date.getDate() + 1);
    else if (mode === 'week') date.setDate(date.getDate() + 7);
    else date.setMonth(date.getMonth() + 1);
    this.currentDate.set(date);
  }

  goToToday() {
    this.currentDate.set(new Date());
    this.selectedDate.set(new Date());
  }

  previousMonth() {
    const date = new Date(this.currentDate());
    date.setMonth(date.getMonth() - 1);
    this.currentDate.set(date);
  }

  nextMonth() {
    const date = new Date(this.currentDate());
    date.setMonth(date.getMonth() + 1);
    this.currentDate.set(date);
  }

  selectDate(date: Date) {
    this.selectedDate.set(date);
    this.currentDate.set(date);
  }

  selectMonthDay(date: Date) {
    this.selectedDate.set(date);
    this.currentDate.set(date);
    this.viewMode.set('day');
  }

  formatSessionDate(date: Date): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (this.isSameDay(date, today)) return 'Today';
    if (this.isSameDay(date, tomorrow)) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  getStatusClass(status: AppointmentStatus): string {
    return `status-${status}`;
  }
}
