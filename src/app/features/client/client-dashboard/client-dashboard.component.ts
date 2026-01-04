import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  service: {
    id: string;
    name: string;
    duration_minutes: number;
    price: number;
  };
  staff: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './client-dashboard.component.html',
  styleUrl: './client-dashboard.component.scss'
})
export class ClientDashboardComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  loading = signal(true);
  appointments = signal<Appointment[]>([]);
  pastExpanded = signal(false);

  profile$ = this.supabase.profile$;

  upcomingAppointment = computed(() => {
    const now = new Date();
    const terminalStatuses = ['cancelled', 'completed', 'no_show'];
    return this.appointments()
      .filter(a => new Date(a.start_time) >= now && !terminalStatuses.includes(a.status))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] || null;
  });

  pastAppointments = computed(() => {
    const now = new Date();
    const terminalStatuses = ['cancelled', 'completed', 'no_show'];
    return this.appointments()
      .filter(a => new Date(a.start_time) < now || terminalStatuses.includes(a.status))
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  });

  async ngOnInit() {
    await this.loadAppointments();
  }

  async loadAppointments() {
    this.loading.set(true);
    const userId = this.supabase.currentUser?.id;

    if (!userId) {
      this.loading.set(false);
      return;
    }

    try {
      const { data, error } = await this.supabase.client
        .from('appointments')
        .select(`
          id,
          start_time,
          end_time,
          status,
          notes,
          service:services (
            id,
            name,
            duration_minutes,
            price
          ),
          staff:users!appointments_staff_id_fkey (
            id,
            first_name,
            last_name,
            avatar_url
          )
        `)
        .eq('client_id', userId)
        .order('start_time', { ascending: false });

      if (error) throw error;

      // Transform the data to match our interface
      const transformed = (data || []).map(item => ({
        ...item,
        service: Array.isArray(item.service) ? item.service[0] : item.service,
        staff: Array.isArray(item.staff) ? item.staff[0] : item.staff
      })) as Appointment[];

      this.appointments.set(transformed);
    } catch (err) {
      console.error('Error loading appointments:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async cancelAppointment(appointmentId: string) {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      const { error } = await this.supabase.client
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId);

      if (error) throw error;
      await this.loadAppointments();
    } catch (err) {
      console.error('Error cancelling appointment:', err);
    }
  }

  rescheduleAppointment(appointmentId: string) {
    this.router.navigate(['/client/reschedule', appointmentId]);
  }

  togglePastAppointments() {
    this.pastExpanded.update(v => !v);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDayOfWeek(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { weekday: 'short' });
  }

  formatDayNumber(dateString: string): string {
    return new Date(dateString).getDate().toString();
  }

  formatMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  formatShortMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(price);
  }

  getInitials(firstName?: string, lastName?: string): string {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  }

  getStatusClass(status: string): string {
    return `badge--${status.replace('_', '-')}`;
  }

  formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'no_show': 'No Show'
    };
    return statusMap[status] || status;
  }
}
