import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Business, WorkingHours, TimeBlock, RecurringTimeBlock, DayOfWeek } from '../models';

@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  private currentBusiness = signal<Business | null>(null);

  readonly business = this.currentBusiness.asReadonly();

  constructor(private supabase: SupabaseService) {}

  async loadBusiness(businessId: string) {
    try {
      const { data, error } = await this.supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .single();

      if (error) throw error;

      this.currentBusiness.set(data);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async createBusiness(business: Omit<Business, 'id' | 'created_at'>) {
    try {
      const { data, error } = await this.supabase
        .from('businesses')
        .insert(business)
        .select()
        .single();

      if (error) throw error;

      this.currentBusiness.set(data);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async updateBusiness(businessId: string, updates: Partial<Business>) {
    try {
      const { data, error } = await this.supabase
        .from('businesses')
        .update(updates)
        .eq('id', businessId)
        .select()
        .single();

      if (error) throw error;

      this.currentBusiness.set(data);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Working Hours
  async getWorkingHours(userId: string) {
    try {
      const { data, error } = await this.supabase
        .from('working_hours')
        .select('*')
        .eq('user_id', userId)
        .order('day_of_week');

      if (error) throw error;

      return { data: data as WorkingHours[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async setWorkingHours(userId: string, workingHours: Omit<WorkingHours, 'id'>[]) {
    try {
      // Delete existing hours
      await this.supabase
        .from('working_hours')
        .delete()
        .eq('user_id', userId);

      // Insert new hours
      const { data, error } = await this.supabase
        .from('working_hours')
        .insert(workingHours.map(wh => ({ ...wh, user_id: userId })))
        .select();

      if (error) throw error;

      return { data: data as WorkingHours[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async updateWorkingHoursDay(id: string, updates: Partial<WorkingHours>) {
    try {
      const { data, error } = await this.supabase
        .from('working_hours')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return { data: data as WorkingHours, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Time Blocks (holidays, breaks)
  async getTimeBlocks(params: { userId?: string; businessId?: string; startDate?: string; endDate?: string }) {
    try {
      let query = this.supabase.from('time_blocks').select('*');

      if (params.userId) {
        query = query.eq('user_id', params.userId);
      }
      if (params.businessId) {
        query = query.eq('business_id', params.businessId);
      }
      if (params.startDate) {
        query = query.gte('start_datetime', params.startDate);
      }
      if (params.endDate) {
        query = query.lte('end_datetime', params.endDate);
      }

      const { data, error } = await query.order('start_datetime');

      if (error) throw error;

      return { data: data as TimeBlock[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async createTimeBlock(timeBlock: Omit<TimeBlock, 'id' | 'created_at'>) {
    try {
      const { data, error } = await this.supabase
        .from('time_blocks')
        .insert(timeBlock)
        .select()
        .single();

      if (error) throw error;

      return { data: data as TimeBlock, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async deleteTimeBlock(id: string) {
    try {
      const { error } = await this.supabase
        .from('time_blocks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Recurring Time Blocks (weekly repeating)
  async getRecurringTimeBlocks(params: { userId?: string; businessId?: string }) {
    try {
      let query = this.supabase.from('recurring_time_blocks').select('*');

      if (params.userId) {
        query = query.eq('user_id', params.userId);
      }
      if (params.businessId) {
        query = query.eq('business_id', params.businessId);
      }

      const { data, error } = await query.order('day_of_week').order('start_time');

      if (error) throw error;

      return { data: data as RecurringTimeBlock[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async createRecurringTimeBlock(block: Omit<RecurringTimeBlock, 'id' | 'created_at'>) {
    try {
      const { data, error } = await this.supabase
        .from('recurring_time_blocks')
        .insert(block)
        .select()
        .single();

      if (error) throw error;

      return { data: data as RecurringTimeBlock, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async deleteRecurringTimeBlock(id: string) {
    try {
      const { error } = await this.supabase
        .from('recurring_time_blocks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
