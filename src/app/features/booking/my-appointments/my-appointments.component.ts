import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AppointmentService } from '../../../core/services/appointment.service';
import { Appointment } from '../../../core/models';
import { format, isPast } from 'date-fns';

@Component({
  selector: 'app-my-appointments',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-appointments.component.html',
  styleUrl: './my-appointments.component.scss'
})
export class MyAppointmentsComponent implements OnInit {
  upcomingAppointments = signal<Appointment[]>([]);
  pastAppointments = signal<Appointment[]>([]);
  activeTab = signal<'upcoming' | 'past'>('upcoming');
  isLoading = signal(true);

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService
  ) {}

  async ngOnInit() {
    await this.loadAppointments();
  }

  async loadAppointments() {
    this.isLoading.set(true);
    const user = this.authService.user();

    if (user) {
      const { data } = await this.appointmentService.loadAppointments({
        clientId: user.id
      });

      if (data) {
        const now = new Date();
        this.upcomingAppointments.set(
          data.filter(apt => new Date(apt.start_time) >= now && apt.status !== 'cancelled')
        );
        this.pastAppointments.set(
          data.filter(apt => new Date(apt.start_time) < now || apt.status === 'cancelled')
        );
      }
    }

    this.isLoading.set(false);
  }

  setActiveTab(tab: 'upcoming' | 'past') {
    this.activeTab.set(tab);
  }

  async cancelAppointment(apt: Appointment) {
    if (confirm('Are you sure you want to cancel this appointment?')) {
      await this.appointmentService.cancelAppointment(apt.id);
      await this.loadAppointments();
    }
  }

  formatDate(dateStr: string): string {
    return format(new Date(dateStr), 'EEEE, MMMM d, yyyy');
  }

  formatTime(dateStr: string): string {
    return format(new Date(dateStr), 'h:mm a');
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'confirmed': return 'status-confirmed';
      case 'pending': return 'status-pending';
      case 'completed': return 'status-available';
      case 'cancelled': return 'status-cancelled';
      case 'no_show': return 'status-unavailable';
      default: return '';
    }
  }
}
