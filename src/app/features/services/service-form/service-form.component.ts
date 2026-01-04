import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ServiceService } from '../../../core/services/service.service';
import { Service } from '../../../core/models';

@Component({
  selector: 'app-service-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './service-form.component.html',
  styleUrl: './service-form.component.scss'
})
export class ServiceFormComponent implements OnInit {
  isEditMode = false;
  serviceId: string | null = null;

  name = '';
  description = '';
  durationMinutes = 30;
  price = 0;
  isActive = true;

  isLoading = signal(false);
  isSaving = signal(false);
  error = signal<string | null>(null);

  durationOptions = [
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 45, label: '45 minutes' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1 hour 30 minutes' },
    { value: 120, label: '2 hours' },
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private serviceService: ServiceService
  ) {}

  ngOnInit() {
    this.serviceId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.serviceId;

    if (this.isEditMode && this.serviceId) {
      this.loadService(this.serviceId);
    }
  }

  async loadService(id: string) {
    this.isLoading.set(true);
    const { data, error } = await this.serviceService.getService(id);

    if (error || !data) {
      this.error.set('Service not found');
      this.isLoading.set(false);
      return;
    }

    this.name = data.name;
    this.description = data.description || '';
    this.durationMinutes = data.duration_minutes;
    this.price = data.price;
    this.isActive = data.is_active;
    this.isLoading.set(false);
  }

  async onSubmit() {
    if (!this.name) {
      this.error.set('Service name is required');
      return;
    }

    if (this.price < 0) {
      this.error.set('Price must be 0 or greater');
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    try {
      const user = this.authService.user();
      if (!user?.business_id) {
        throw new Error('No business found');
      }

      const serviceData = {
        business_id: user.business_id,
        name: this.name,
        description: this.description || null,
        duration_minutes: this.durationMinutes,
        price: this.price,
        is_active: this.isActive
      };

      if (this.isEditMode && this.serviceId) {
        const { error } = await this.serviceService.updateService(this.serviceId, serviceData);
        if (error) throw new Error(error);
      } else {
        const { error } = await this.serviceService.createService(serviceData);
        if (error) throw new Error(error);
      }

      this.router.navigate(['/services']);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save service');
    }

    this.isSaving.set(false);
  }
}
