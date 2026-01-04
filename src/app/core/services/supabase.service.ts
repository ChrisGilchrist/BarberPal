import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserProfile, UserRole } from '../models';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private userSubject = new BehaviorSubject<User | null>(null);
  private sessionSubject = new BehaviorSubject<Session | null>(null);
  private profileSubject = new BehaviorSubject<UserProfile | null>(null);
  private initializedSubject = new BehaviorSubject<boolean>(false);

  user$ = this.userSubject.asObservable();
  session$ = this.sessionSubject.asObservable();
  profile$ = this.profileSubject.asObservable();
  initialized$ = this.initializedSubject.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      }
    });

    // Listen for auth state changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      // Skip the INITIAL_SESSION event - we handle it in initializeSession()
      // This prevents race conditions during HMR where the listener fires before
      // the stored session is properly retrieved
      if (event === 'INITIAL_SESSION') {
        return;
      }

      this.sessionSubject.next(session);
      this.userSubject.next(session?.user ?? null);

      if (session?.user) {
        this.loadProfile(session.user.id);
      } else {
        this.profileSubject.next(null);
      }
    });

    // Check initial session
    this.initializeSession();
  }

  private async initializeSession() {
    const { data: { session } } = await this.supabase.auth.getSession();
    this.sessionSubject.next(session);
    this.userSubject.next(session?.user ?? null);

    if (session?.user) {
      await this.loadProfile(session.user.id);
    }

    this.initializedSubject.next(true);
  }

  async loadProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (data && !error) {
      // Get email from auth user
      const authUser = this.userSubject.value;
      const profile: UserProfile = {
        ...data,
        email: authUser?.email ?? ''
      };
      this.profileSubject.next(profile);
    } else if (error) {
      console.error('Error loading profile:', error);
      // Profile doesn't exist yet - this is fine for new users
      // The database trigger should create it
      this.profileSubject.next(null);
    }
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get currentSession(): Session | null {
    return this.sessionSubject.value;
  }

  get currentProfile(): UserProfile | null {
    return this.profileSubject.value;
  }

  get currentRole(): UserRole | null {
    return this.profileSubject.value?.role ?? null;
  }

  get isInitialized(): boolean {
    return this.initializedSubject.value;
  }

  get isOAuthUser(): boolean {
    const user = this.userSubject.value;
    if (!user) return false;
    // OAuth users have a provider other than 'email' in app_metadata
    const provider = user.app_metadata?.provider;
    return !!provider && provider !== 'email';
  }

  // Auth methods
  async signUp(email: string, password: string, role: UserRole, firstName: string, lastName: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          first_name: firstName,
          last_name: lastName
        }
      }
    });

    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    this.profileSubject.next(null);
  }

  async resetPassword(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) throw error;
  }

  async updatePassword(newPassword: string) {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async updateProfile(updates: Partial<UserProfile>) {
    const userId = this.currentUser?.id;
    if (!userId) throw new Error('No user logged in');

    const { data, error } = await this.supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    // Refresh profile
    const authUser = this.userSubject.value;
    this.profileSubject.next({
      ...data,
      email: authUser?.email ?? ''
    });
    return data;
  }

  // Database helpers
  from(table: string) {
    return this.supabase.from(table);
  }

  // Storage helpers
  storage(bucket: string) {
    return this.supabase.storage.from(bucket);
  }
}
