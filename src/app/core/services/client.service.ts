import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { UserProfile } from '../models';

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  private clientsSignal = signal<UserProfile[]>([]);

  readonly clients = this.clientsSignal.asReadonly();

  constructor(private supabase: SupabaseService) {}

  async loadClients(businessId: string) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('business_id', businessId)
        .eq('role', 'client')
        .order('first_name');

      if (error) throw error;

      this.clientsSignal.set(data as UserProfile[]);
      return { data: data as UserProfile[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async searchClients(businessId: string, searchTerm: string) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('business_id', businessId)
        .eq('role', 'client')
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
        .order('first_name')
        .limit(20);

      if (error) throw error;

      return { data: data as UserProfile[], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async getClient(id: string) {
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

  async getClientWithHistory(id: string) {
    try {
      const { data: client, error: clientError } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (clientError) throw clientError;

      const { data: appointments, error: appointmentsError } = await this.supabase
        .from('appointments')
        .select(`
          *,
          staff:users!appointments_staff_id_fkey (first_name, last_name),
          service:services (name, price)
        `)
        .eq('client_id', id)
        .order('start_time', { ascending: false })
        .limit(50);

      if (appointmentsError) throw appointmentsError;

      return {
        data: {
          client: client as UserProfile,
          appointments: appointments
        },
        error: null
      };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async updateClient(id: string, updates: Partial<UserProfile>) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      this.clientsSignal.update(clients =>
        clients.map(c => c.id === id ? data as UserProfile : c)
      );

      return { data: data as UserProfile, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  async addClientNote(id: string, note: string) {
    const client = this.clientsSignal().find(c => c.id === id);
    const existingNotes = client?.notes || '';
    const timestamp = new Date().toLocaleDateString();
    const newNote = `[${timestamp}] ${note}\n${existingNotes}`;

    return this.updateClient(id, { notes: newNote });
  }

  async setFavoriteStaff(clientId: string, staffId: string | null) {
    return this.updateClient(clientId, { favorite_staff_id: staffId });
  }

  // Get client statistics
  async getClientStats(clientId: string) {
    try {
      const { data, error } = await this.supabase
        .from('appointments')
        .select('status, service:services(price)')
        .eq('client_id', clientId);

      if (error) throw error;

      const stats = {
        totalAppointments: data.length,
        completedAppointments: data.filter((a: any) => a.status === 'completed').length,
        cancelledAppointments: data.filter((a: any) => a.status === 'cancelled').length,
        noShows: data.filter((a: any) => a.status === 'no_show').length,
        totalSpent: data
          .filter((a: any) => a.status === 'completed')
          .reduce((sum: number, a: any) => sum + (a.service?.price || 0), 0)
      };

      return { data: stats, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
}
