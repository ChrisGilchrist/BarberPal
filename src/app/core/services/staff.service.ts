import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { UserProfile, WorkingHours } from '../models';

@Injectable({
  providedIn: 'root'
})
export class StaffService {
  private staffSignal = signal<UserProfile[]>([]);

  readonly staff = this.staffSignal.asReadonly();

  constructor(private supabase: SupabaseService) {}

  async loadStaff(businessId: string) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('business_id', businessId)
        .in('role', ['owner', 'staff'])
        .order('first_name');

      if (error) throw error;

      this.staffSignal.set(data as UserProfile[]);
      return { data: data as UserProfile[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async getStaffMember(id: string) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return { data: data as UserProfile, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async addStaffMember(email: string, firstName: string, lastName: string, businessId: string) {
    try {
      // Note: This creates a placeholder entry. The actual user account
      // would need to be created via invitation flow in production
      const { data, error } = await this.supabase
        .from('users')
        .insert({
          first_name: firstName,
          last_name: lastName,
          role: 'staff',
          business_id: businessId
        })
        .select()
        .single();

      if (error) throw error;

      this.staffSignal.update(staff => [...staff, data as UserProfile]);

      return { data: data as UserProfile, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async updateStaffMember(id: string, updates: Partial<UserProfile>) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      this.staffSignal.update(staff =>
        staff.map(s => s.id === id ? data as UserProfile : s)
      );

      return { data: data as UserProfile, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async removeStaffMember(id: string) {
    try {
      const { error } = await this.supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.staffSignal.update(staff => staff.filter(s => s.id !== id));

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getStaffWithServices(businessId: string) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select(`
          *,
          staff_services (
            service_id,
            services (*)
          )
        `)
        .eq('business_id', businessId)
        .in('role', ['owner', 'staff'])
        .order('first_name');

      if (error) throw error;

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async getStaffWorkingHours(staffId: string): Promise<WorkingHours[]> {
    try {
      const { data, error } = await this.supabase
        .from('working_hours')
        .select('*')
        .eq('user_id', staffId)
        .order('day_of_week');

      if (error) throw error;

      return data as WorkingHours[];
    } catch (error) {
      console.error('Error fetching working hours:', error);
      return [];
    }
  }

  async updateStaffWorkingHours(staffId: string, hours: Partial<WorkingHours>[]): Promise<void> {
    try {
      // Delete existing hours for this staff member
      await this.supabase
        .from('working_hours')
        .delete()
        .eq('user_id', staffId);

      // Insert new hours
      const hoursWithUserId = hours.map(h => ({
        ...h,
        user_id: staffId
      }));

      const { error } = await this.supabase
        .from('working_hours')
        .insert(hoursWithUserId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating working hours:', error);
      throw error;
    }
  }

  async removeStaff(staffId: string): Promise<void> {
    try {
      // First delete working hours
      await this.supabase
        .from('working_hours')
        .delete()
        .eq('user_id', staffId);

      // Then update the user to remove from business
      const { error } = await this.supabase
        .from('users')
        .update({ business_id: null, role: 'client' })
        .eq('id', staffId);

      if (error) throw error;

      this.staffSignal.update(staff => staff.filter(s => s.id !== staffId));
    } catch (error) {
      console.error('Error removing staff:', error);
      throw error;
    }
  }
}
