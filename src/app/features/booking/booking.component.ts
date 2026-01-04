import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ServiceService } from '../../core/services/service.service';
import { StaffService } from '../../core/services/staff.service';
import { AppointmentService } from '../../core/services/appointment.service';
import { BusinessService } from '../../core/services/business.service';
import { Service, UserProfile, TimeSlot } from '../../core/models';
import { format, addDays, startOfDay, parseISO, setHours, setMinutes } from 'date-fns';

type BookingStep = 'service' | 'staff' | 'datetime' | 'confirm';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss'
})
export class BookingComponent implements OnInit {
  currentStep = signal<BookingStep>('service');

  // Data
  services = signal<Service[]>([]);
  staff = signal<UserProfile[]>([]);
  availableSlots = signal<TimeSlot[]>([]);
  availableDates = signal<Date[]>([]);
  bufferMinutes = signal(10);

  // Selections
  selectedService = signal<Service | null>(null);
  selectedStaff = signal<UserProfile | null>(null);
  selectedDate = signal<Date | null>(null);
  selectedTime = signal<string | null>(null);

  // UI State
  isLoading = signal(true);
  isLoadingSlots = signal(false);
  isBooking = signal(false);
  error = signal<string | null>(null);

  // Computed
  canProceed = computed(() => {
    const step = this.currentStep();
    if (step === 'service') return !!this.selectedService();
    if (step === 'staff') return !!this.selectedStaff();
    if (step === 'datetime') return !!this.selectedDate() && !!this.selectedTime();
    return true;
  });

  constructor(
    private router: Router,
    private authService: AuthService,
    private serviceService: ServiceService,
    private staffService: StaffService,
    private appointmentService: AppointmentService,
    private businessService: BusinessService
  ) {}

  async ngOnInit() {
    await this.loadInitialData();
  }

  async loadInitialData() {
    this.isLoading.set(true);
    const user = this.authService.user();

    if (user?.business_id) {
      // Load services
      const { data: servicesData } = await this.serviceService.getActiveServices(user.business_id);
      this.services.set(servicesData || []);

      // Load staff
      const { data: staffData } = await this.staffService.loadStaff(user.business_id);
      this.staff.set(staffData || []);

      // Load business settings
      const { data: businessData } = await this.businessService.loadBusiness(user.business_id);
      if (businessData) {
        this.bufferMinutes.set(businessData.buffer_minutes);
      }

      // Generate available dates (next 14 days)
      const dates: Date[] = [];
      for (let i = 0; i < 14; i++) {
        dates.push(addDays(startOfDay(new Date()), i));
      }
      this.availableDates.set(dates);
    }

    this.isLoading.set(false);
  }

  selectService(service: Service) {
    this.selectedService.set(service);
  }

  selectStaff(member: UserProfile) {
    this.selectedStaff.set(member);
  }

  async selectDate(date: Date) {
    this.selectedDate.set(date);
    this.selectedTime.set(null);
    await this.loadAvailableSlots();
  }

  selectTime(time: string) {
    this.selectedTime.set(time);
  }

  async loadAvailableSlots() {
    const staff = this.selectedStaff();
    const service = this.selectedService();
    const date = this.selectedDate();

    if (!staff || !service || !date) return;

    this.isLoadingSlots.set(true);

    const slots = await this.appointmentService.getAvailableSlots({
      staffId: staff.id,
      date: date,
      serviceDuration: service.duration_minutes,
      businessBufferMinutes: this.bufferMinutes()
    });

    this.availableSlots.set(slots);
    this.isLoadingSlots.set(false);
  }

  goToStep(step: BookingStep) {
    this.currentStep.set(step);
  }

  nextStep() {
    const step = this.currentStep();
    if (step === 'service') this.currentStep.set('staff');
    else if (step === 'staff') this.currentStep.set('datetime');
    else if (step === 'datetime') this.currentStep.set('confirm');
  }

  prevStep() {
    const step = this.currentStep();
    if (step === 'staff') this.currentStep.set('service');
    else if (step === 'datetime') this.currentStep.set('staff');
    else if (step === 'confirm') this.currentStep.set('datetime');
  }

  async confirmBooking() {
    const user = this.authService.user();
    const service = this.selectedService();
    const staff = this.selectedStaff();
    const date = this.selectedDate();
    const time = this.selectedTime();

    if (!user || !service || !staff || !date || !time) {
      this.error.set('Please complete all selections');
      return;
    }

    this.isBooking.set(true);
    this.error.set(null);

    try {
      // Parse time and create start/end timestamps
      const [hours, minutes] = time.split(':').map(Number);
      const startTime = setMinutes(setHours(date, hours), minutes);
      const endTime = new Date(startTime.getTime() + service.duration_minutes * 60000);

      const { error } = await this.appointmentService.createAppointment({
        business_id: user.business_id!,
        client_id: user.id,
        staff_id: staff.id,
        service_id: service.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'confirmed',
        notes: null
      });

      if (error) throw new Error(error);

      // Navigate to success or appointments page
      this.router.navigate(['/appointments']);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to book appointment');
    }

    this.isBooking.set(false);
  }

  // Formatting helpers
  formatDate(date: Date): string {
    return format(date, 'EEE, MMM d');
  }

  formatDateShort(date: Date): string {
    return format(date, 'd');
  }

  formatDayName(date: Date): string {
    return format(date, 'EEE');
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  isToday(date: Date): boolean {
    return format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  }
}
