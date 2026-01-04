import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ServiceService } from '../../../core/services/service.service';
import { Service } from '../../../core/models';

@Component({
  selector: 'app-service-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './service-list.component.html',
  styleUrl: './service-list.component.scss'
})
export class ServiceListComponent implements OnInit {
  services = signal<Service[]>([]);
  isLoading = signal(true);

  constructor(
    private authService: AuthService,
    private serviceService: ServiceService
  ) {}

  async ngOnInit() {
    await this.loadServices();
  }

  async loadServices() {
    this.isLoading.set(true);
    const user = this.authService.user();

    if (user?.business_id) {
      const { data } = await this.serviceService.loadServices(user.business_id);
      this.services.set(data || []);
    }

    this.isLoading.set(false);
  }

  async toggleActive(service: Service) {
    await this.serviceService.toggleServiceActive(service.id, !service.is_active);
    await this.loadServices();
  }

  async deleteService(service: Service) {
    if (confirm(`Are you sure you want to delete "${service.name}"?`)) {
      await this.serviceService.deleteService(service.id);
      await this.loadServices();
    }
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}
