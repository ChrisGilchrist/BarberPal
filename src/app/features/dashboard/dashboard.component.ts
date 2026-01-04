import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AppointmentService } from '../../core/services/appointment.service';
import { Appointment } from '../../core/models';
import { format } from 'date-fns';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  todaysAppointments = signal<Appointment[]>([]);
  upcomingAppointments = signal<Appointment[]>([]);
  isLoading = signal(true);

  constructor(
    public authService: AuthService,
    private appointmentService: AppointmentService
  ) {}

  async ngOnInit() {
    await this.loadDashboardData();
  }

  async loadDashboardData() {
    this.isLoading.set(true);

    const user = this.authService.user();
    if (!user) {
      this.isLoading.set(false);
      return;
    }

    try {
      if (this.authService.isClient()) {
        // Load upcoming appointments for client
        const { data } = await this.appointmentService.getUpcomingClientAppointments(user.id);
        this.upcomingAppointments.set(data || []);
      } else if (this.authService.isStaffOrOwner()) {
        // Load today's appointments for staff/owner
        const { data } = await this.appointmentService.getTodaysAppointments(user.id);
        this.todaysAppointments.set(data || []);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }

    this.isLoading.set(false);
  }

  formatTime(dateStr: string): string {
    return format(new Date(dateStr), 'h:mm a');
  }

  formatDate(dateStr: string): string {
    return format(new Date(dateStr), 'EEE, MMM d');
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'confirmed': return 'status-confirmed';
      case 'pending': return 'status-pending';
      case 'cancelled': return 'status-cancelled';
      default: return '';
    }
  }
}
