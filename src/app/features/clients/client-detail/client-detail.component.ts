import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClientService } from '../../../core/services/client.service';
import { UserProfile, Appointment } from '../../../core/models';
import { format } from 'date-fns';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss'
})
export class ClientDetailComponent implements OnInit {
  client = signal<UserProfile | null>(null);
  appointments = signal<Appointment[]>([]);
  stats = signal<any>(null);
  isLoading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private clientService: ClientService
  ) {}

  async ngOnInit() {
    const clientId = this.route.snapshot.paramMap.get('id');
    if (clientId) {
      await this.loadClient(clientId);
    }
  }

  async loadClient(id: string) {
    this.isLoading.set(true);

    const { data } = await this.clientService.getClientWithHistory(id);
    if (data) {
      this.client.set(data.client);
      this.appointments.set(data.appointments);
    }

    const { data: statsData } = await this.clientService.getClientStats(id);
    this.stats.set(statsData);

    this.isLoading.set(false);
  }

  formatDate(dateStr: string): string {
    return format(new Date(dateStr), 'MMM d, yyyy');
  }

  formatTime(dateStr: string): string {
    return format(new Date(dateStr), 'h:mm a');
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(price);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'confirmed': return 'status-confirmed';
      case 'completed': return 'status-available';
      case 'cancelled': return 'status-cancelled';
      case 'no_show': return 'status-unavailable';
      default: return 'status-pending';
    }
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
