import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Service, StaffService } from '../models';

@Injectable({
  providedIn: 'root'
})
export class ServiceService {
  private servicesSignal = signal<Service[]>([]);

  readonly services = this.servicesSignal.asReadonly();

  constructor(private supabase: SupabaseService) {}

  async loadServices(businessId: string) {
    try {
      const { data, error } = await this.supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId)
        .order('name');

      if (error) throw error;

      this.servicesSignal.set(data as Service[]);
      return { data: data as Service[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async getActiveServices(businessId: string) {
    try {
      const { data, error } = await this.supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return { data: data as Service[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async getService(id: string) {
    try {
      const { data, error } = await this.supabase
        .from('services')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return { data: data as Service, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async createService(service: Omit<Service, 'id' | 'created_at'>) {
    try {
      const { data, error } = await this.supabase
        .from('services')
        .insert(service)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      this.servicesSignal.update(services => [...services, data as Service]);

      return { data: data as Service, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async updateService(id: string, updates: Partial<Service>) {
    try {
      const { data, error } = await this.supabase
        .from('services')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      this.servicesSignal.update(services =>
        services.map(s => s.id === id ? data as Service : s)
      );

      return { data: data as Service, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async deleteService(id: string) {
    try {
      const { error } = await this.supabase
        .from('services')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update local state
      this.servicesSignal.update(services => services.filter(s => s.id !== id));

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async toggleServiceActive(id: string, isActive: boolean) {
    return this.updateService(id, { is_active: isActive });
  }

  // Staff-Service assignments
  async getStaffServices(staffId: string) {
    try {
      const { data, error } = await this.supabase
        .from('staff_services')
        .select(`
          service_id,
          services (*)
        `)
        .eq('staff_id', staffId);

      if (error) throw error;

      return { data: data.map((d: any) => d.services) as Service[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async getServiceStaff(serviceId: string) {
    try {
      const { data, error } = await this.supabase
        .from('staff_services')
        .select(`
          staff_id,
          users (*)
        `)
        .eq('service_id', serviceId);

      if (error) throw error;

      return { data: data.map((d: any) => d.users), error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async assignStaffToService(staffId: string, serviceId: string) {
    try {
      const { error } = await this.supabase
        .from('staff_services')
        .insert({ staff_id: staffId, service_id: serviceId });

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async removeStaffFromService(staffId: string, serviceId: string) {
    try {
      const { error } = await this.supabase
        .from('staff_services')
        .delete()
        .eq('staff_id', staffId)
        .eq('service_id', serviceId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async setStaffServices(staffId: string, serviceIds: string[]) {
    try {
      // Delete existing assignments
      await this.supabase
        .from('staff_services')
        .delete()
        .eq('staff_id', staffId);

      // Insert new assignments
      if (serviceIds.length > 0) {
        const { error } = await this.supabase
          .from('staff_services')
          .insert(serviceIds.map(serviceId => ({ staff_id: staffId, service_id: serviceId })));

        if (error) throw error;
      }

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
